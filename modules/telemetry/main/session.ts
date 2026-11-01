// The telemetry in the main process (docs/dev/modules.md, module "telemetry"): the connection to the PS5, every frame
// read once, the session's mode, whether the driver is driving, the car, recording the telemetry, and the reference:
// the one in use, learning a new one (a ghost replay's lap or the fastest of the driver's own laps) and picking a
// saved one that fits the track being driven (docs/dev/telemetry.md). Coach and crew read it as a feed (TelemetryFeed).

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { buildReference, type ReferenceLap } from '@gt-toolz/coach';
import {
  applyDetails,
  CaptureRecorder,
  classOf,
  fileStamp,
  fitsMode,
  GhostWatch,
  Gt7Connection,
  markReferenceUsed,
  modeBop,
  readReference,
  ReferencePicker,
  sameClass,
  summarizeReference,
  writeFileAtomic,
  type CarClass,
  type DriveMode,
  type ReferenceDetails,
  type TelemetryEvents,
  type TelemetryFeed,
  type TelemetrySettings,
  type TelemetryStatus,
} from '@gt-toolz/runtime';
import {
  carName,
  detectMode,
  Flags,
  formatLapTime,
  lapToLearn,
  OWN_LAPS,
  readFrame,
  splitLaps,
  type SessionMode,
  type TelemetryFrame,
  type TelemetryPacket,
} from '@gt-toolz/telemetry';

/** The app's live values, 10 times a second. */
const LIVE_INTERVAL_MS = 100;
/** A new mode counts once it holds this long (as in the coach). */
const MODE_STABLE_MS = 3000;
/** Less movement than this between two frames at speed is a repeated packet (results screen) ... */
const FROZEN_M = 0.001;
/** ... and after this long the game is in a menu. */
const FROZEN_MS = 1000;
/** Faster than this (m/s) on track counts as driving. */
const DRIVING_MS = 2;
/** Learning keeps this much telemetry (60 Hz): three own laps of a long track. */
const MAX_LEARN_FRAMES = 60 * 60 * 30;
/** The active reference is lost (another track) when the car was on its line this little ... */
const REFERENCE_LOST_SHARE = 0.2;
/** ... over this much driving (a trip into the gravel is no other track). */
const REFERENCE_LOST_MS = 20_000;
/** No saved reference fits after this much driving: the driver's own lap is learned. */
const NONE_FITS_MS = 30_000;

export interface TelemetrySessionOptions {
  dirs: { references: string; sessions: string };
  settings(): TelemetrySettings;
  log(line: string): void;
}

export class TelemetrySession extends EventEmitter<TelemetryEvents> implements TelemetryFeed {
  readonly status: TelemetryStatus = { connection: { stage: 'ps5', packetType: 'C' }, coach: 'learning', otherCar: false };
  private connection: Gt7Connection | undefined;
  private recorder: CaptureRecorder | undefined;
  private running = false;
  private lastLiveAt = 0;
  /** Who suspended it (the calibration). */
  private readonly suspendedBy = new Set<string>();

  /** Results screens repeat the last packet: since when the car shows speed but does not move. */
  private frozenSince: number | undefined;
  private lastWatchedFrame: TelemetryFrame | undefined;
  /** The candidate mode and since when it holds. */
  private modeCandidate: SessionMode | undefined;
  private modeCandidateSince = 0;
  private isDriving = false;

  private ref: ReferenceLap | undefined;
  private file: string | undefined;
  private learnFrames: TelemetryFrame[] = [];
  private lastLapCount: number | undefined;
  private lapsSeen = 0;
  /** Whether the active reference fits the track being driven (picking the reference, docs/dev/telemetry.md). */
  private referenceWatch: GhostWatch | undefined;
  /** Looking for a saved reference that fits: the active one does not, or there is none. */
  private picker: ReferencePicker | undefined;
  /** The driver asked to learn a new reference: no saved one is picked meanwhile. */
  private learnRequested = false;
  /** The active reference does not fit (another track or class): the coach is quiet until another one is picked. */
  private lost = false;
  /** "Ich fahre drei Runden mit" was said for this learning. */
  private learnOwnSaid = false;
  /** Details for the next learned reference (player, target time), entered when learning started. */
  private learnDetails: ReferenceDetails = {};

  constructor(private readonly options: TelemetrySessionOptions) {
    super();
  }

  private get settings(): TelemetrySettings {
    return this.options.settings();
  }

  get mode(): SessionMode | undefined {
    return this.status.mode;
  }

  get frozen(): boolean {
    return this.frozenSince !== undefined && (this.lastWatchedFrame?.time ?? 0) - this.frozenSince >= FROZEN_MS;
  }

  get driving(): boolean {
    return this.isDriving;
  }

  get live(): boolean {
    return this.connection?.currentStage === 'live';
  }

  get reference(): ReferenceLap | undefined {
    return this.ref;
  }

  get referenceFile(): string | undefined {
    return this.file;
  }

  get referenceLost(): boolean {
    return this.lost;
  }

  get consoleName(): string | undefined {
    return this.connection?.status.console?.name;
  }

  private get inRace(): boolean {
    return this.status.mode === 'race';
  }

  // --- Lifecycle ---

  /** The reference the last session ended with (or learning), recording if wanted, then the connection. */
  async start(file?: string): Promise<void> {
    this.running = true;
    if (this.settings.record) this.startRecording();
    if (file) {
      try {
        this.use(readReference(file), file);
      } catch (err) {
        this.log(`ERROR     reference ${file}: ${(err as Error).message}`);
      }
    }
    if (!this.ref) this.startLearning();
    this.emit('status');
    this.emit('reference', { reference: this.ref, file: this.file, why: 'start' });
    await this.startConnection();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.connection?.stop();
    this.connection = undefined;
    await this.recorder?.close();
    this.recorder = undefined;
  }

  async settingsChanged(next: Pick<TelemetrySettings, 'ip' | 'record'>, before: Pick<TelemetrySettings, 'ip' | 'record'>): Promise<void> {
    if (next.record !== before.record) {
      if (next.record) this.startRecording();
      else await this.stopRecording();
    }
    if (next.ip !== before.ip && this.running) await this.restartConnection();
  }

  get suspended(): boolean {
    return this.suspendedBy.size > 0;
  }

  suspend(owner: string): () => void {
    this.suspendedBy.add(owner);
    return () => void this.suspendedBy.delete(owner);
  }

  // --- The reference: chosen in the app ---

  /** A reference from the app, or none: learn a new one (learn: its player and target time). */
  choose(file: string | undefined, learn: ReferenceDetails = {}): void {
    if (!file) {
      this.learnDetails = learn;
      this.ref = undefined;
      this.file = undefined;
      this.startLearning();
      // Asked for: no saved reference is picked until the new one is learned.
      this.learnRequested = true;
      this.emit('status');
      this.emit('reference', { why: 'learn' });
      return;
    }
    const ref = readReference(file);
    this.use(ref, file);
    this.emit('status');
    this.emit('reference', { reference: ref, file, why: 'chosen' });
  }

  /** Player or target time of a reference changed on disk: the one in use takes them over. */
  detailsChanged(file: string, details: ReferenceDetails): void {
    if (!this.ref || file !== this.file) return;
    applyDetails(this.ref, details);
    this.status.reference = summarizeReference(this.ref, file);
    this.emit('status');
  }

  // --- Connection ---

  private async startConnection(): Promise<void> {
    const connection = new Gt7Connection({
      ip: this.settings.ip || undefined,
      packetType: 'C',
      // The coach only needs position, speed, brake and gear live, which every packet type has.
      fallbackTypes: ['B', 'A'],
      log: (line) => this.log(line),
      onStatus: (status) => {
        if (this.connection !== connection) return;
        this.status.connection = status;
        this.emit('status');
      },
      onConnected: () => this.emit('connected'),
      onPacket: (packet) => this.onPacket(packet),
    });
    this.connection = connection;
    this.status.connection = connection.status;
    this.emit('status');
    void connection.start().catch((err: Error) => this.log(`ERROR     connection: ${err.message}`));
  }

  private async restartConnection(): Promise<void> {
    const old = this.connection;
    this.connection = undefined;
    await old?.stop();
    await this.startConnection();
  }

  private onPacket(packet: TelemetryPacket): void {
    this.recorder?.write(packet);
    this.handleFrame(readFrame(packet.data, packet.receivedAt));
  }

  /**
   * A frame read from a packet (tests hand frames in directly): the mode, driving and the car first, then the frame
   * goes out, then the reference is looked after (picking one that fits, learning one). While suspended only the
   * car is followed.
   */
  handleFrame(frame: TelemetryFrame): void {
    this.emitLive(frame);
    const suspended = this.suspendedBy.size > 0;
    if (!suspended) {
      this.watchMode(frame);
      this.watchDriving(frame);
    }
    this.checkCar(frame);
    this.emit('frame', frame);
    if (suspended) return;
    this.autoReference(frame);
    // A reference is a solo lap: none is learned from a race (traffic, other conditions), nor from the
    // preparation screen's video or a results screen.
    if (!this.ref && !this.inRace && !this.frozen && detectMode(frame) !== 'menu') this.learn(frame);
  }

  private emitLive(frame: TelemetryFrame): void {
    if (frame.time - this.lastLiveAt < LIVE_INTERVAL_MS) return;
    this.lastLiveAt = frame.time;
    this.emit('live', {
      at: frame.time,
      speedKmh: frame.speed * 3.6,
      gear: frame.gear,
      throttle: frame.throttle,
      brake: frame.brake,
      paused: (frame.flags & Flags.Paused) !== 0,
      onTrack: (frame.flags & Flags.CarOnTrack) !== 0,
      currentLapMs: frame.currentLapMs,
      lastLapMs: frame.lastLapMs > 0 ? frame.lastLapMs : undefined,
      bestLapMs: frame.bestLapMs > 0 ? frame.bestLapMs : undefined,
    });
  }

  /** Race or not, from GT7's data and without the reference. Debounced: restarts briefly look like a replay. */
  private watchMode(frame: TelemetryFrame): void {
    if (frame.flags & (Flags.Paused | Flags.Loading)) return;
    // Results screens repeat the last packet: speed, but no movement. That is a menu, not driving.
    const last = this.lastWatchedFrame;
    this.lastWatchedFrame = frame;
    const moved = last ? Math.hypot(frame.x - last.x, frame.y - last.y, frame.z - last.z) : 1;
    if (frame.speed < 1 || moved > FROZEN_M) this.frozenSince = undefined;
    else this.frozenSince ??= frame.time;
    const mode = this.frozen ? 'menu' : detectMode(frame);
    if (mode !== this.modeCandidate) {
      this.modeCandidate = mode;
      this.modeCandidateSince = frame.time;
    }
    if (mode !== this.status.mode && frame.time - this.modeCandidateSince >= MODE_STABLE_MS) {
      this.status.mode = mode;
      this.log(`MODE      ${mode}`);
      this.emit('status');
      this.emit('mode', mode);
    }
  }

  /** Driving: on track, moving, not paused. */
  private watchDriving(frame: TelemetryFrame): void {
    const paused = (frame.flags & (Flags.Paused | Flags.Loading)) !== 0;
    const driving = !paused && !this.frozen && (frame.flags & Flags.CarOnTrack) !== 0 && frame.speed > DRIVING_MS;
    if (driving === this.isDriving) return;
    this.isDriving = driving;
    this.emit('driving', driving);
  }

  /** The car being driven, shown next to the reference's; the warning goes once the driver switches back. */
  private checkCar(frame: TelemetryFrame): void {
    if (frame.carCode <= 0) return;
    const car = this.status.car;
    // Only while driving solo: in races the reference does not count, in menus the car is the preparation
    // screen's video.
    const other = !!this.ref && !this.inRace && this.status.mode !== 'menu' && frame.carCode !== this.ref.carCode;
    if (car?.code === frame.carCode && (car.category || !frame.carCategory) && this.status.otherCar === other) return;
    if (car?.code !== frame.carCode) this.log(`CAR       ${carName(frame.carCode) ?? 'unknown car'} (code ${frame.carCode})`);
    this.status.car = { code: frame.carCode, name: carName(frame.carCode), category: frame.carCategory || car?.category };
    this.status.otherCar = other;
    this.emit('status');
  }

  // --- Recording ---

  private startRecording(): void {
    if (this.recorder) return;
    const file = path.join(this.options.dirs.sessions, `${fileStamp()}_coach.gtcap`);
    this.recorder = new CaptureRecorder(file);
    this.status.recording = file;
    this.log(`RECORD    ${file}`);
    this.emit('status');
  }

  private async stopRecording(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = undefined;
    this.status.recording = undefined;
    this.emit('status');
    await recorder?.close();
  }

  // --- The reference in use ---

  /** Coaches with this reference from now on (the telemetry's part: watched whether it fits, shown). */
  private use(ref: ReferenceLap, file: string): void {
    this.ref = ref;
    this.file = file;
    // Of several saved references that fit, the automatic choice takes the one used last.
    markReferenceUsed(this.options.dirs.references, path.basename(file, '.json'));
    // Whether it fits the track being driven is watched from now on (picking the reference).
    this.referenceWatch = new GhostWatch(ref);
    this.picker = undefined;
    this.learnRequested = false;
    this.lost = false;
    this.status.coach = 'coaching';
    this.status.learning = undefined;
    this.status.reference = summarizeReference(ref, file);
    this.status.otherCar = !!this.status.car && this.status.car.code !== ref.carCode;
  }

  // --- Learning ---

  private startLearning(): void {
    this.learnFrames = [];
    this.lastLapCount = undefined;
    this.lapsSeen = 0;
    this.referenceWatch = undefined;
    this.picker = undefined;
    this.learnRequested = false;
    this.lost = false;
    this.learnOwnSaid = false;
    this.status.coach = 'learning';
    this.status.reference = undefined;
    this.status.learning = { frames: 0, replay: false, lapsSeen: 0, ownLaps: 0, ownLapsNeeded: OWN_LAPS };
    this.log(`LEARN     no reference: a ghost replay's lap is learned, or the fastest of ${OWN_LAPS} own laps`);
  }

  private learn(frame: TelemetryFrame): void {
    this.learnFrames.push(frame);
    if (this.learnFrames.length > MAX_LEARN_FRAMES) this.learnFrames.splice(0, this.learnFrames.length - MAX_LEARN_FRAMES);
    const learning = this.status.learning!;
    learning.frames = this.learnFrames.length;
    learning.replay = (frame.flags & Flags.CarOnTrack) === 0 && frame.speed > 1;
    if (this.learnFrames.length % 30 === 0) this.emit('status');
    // Only re-check when a lap boundary passed.
    if (frame.lapCount === this.lastLapCount) return;
    if (this.lastLapCount !== undefined) learning.lapsSeen = ++this.lapsSeen;
    this.lastLapCount = frame.lapCount;
    const laps = splitLaps(this.learnFrames);
    learning.ownLaps = laps.filter((l) => l.live).length;
    // A ghost replay's lap, or the fastest clean one of the driver's first laps (the user, 2026-10-21).
    const lap = lapToLearn(laps);
    if (!lap) {
      if (learning.ownLaps) this.log(`LEARN     own lap ${learning.ownLaps} of ${OWN_LAPS} complete`);
      this.emit('status');
      return;
    }

    const name = `${fileStamp()}_lap${lap.lapNumber}`;
    const ref = buildReference(lap, name);
    // The app's guess of what it is, until the user says so (docs/dev/telemetry.md): a replay is a Daily Race ghost from the
    // leaderboard; own laps are what the Cockpit's switch says.
    const guess = lap.live ? this.driveMode() : { mode: 'daily' as const, bop: true };
    ref.mode = guess.mode;
    ref.bop = guess.bop;
    ref.modeConfirmed = false;
    // GT7 sends no names: an own lap is the driver's, a ghost's player the user enters (learn dialog or afterwards).
    if (lap.live && this.settings.driverName) ref.driver = this.settings.driverName;
    applyDetails(ref, this.learnDetails);
    this.learnDetails = {};
    const file = path.join(this.options.dirs.references, `${name}.json`);
    writeFileAtomic(file, JSON.stringify(ref));
    this.log(`LEARNED   ${lap.live ? `own lap ${lap.lapNumber} (the fastest clean one of ${learning.ownLaps})` : `replay lap ${lap.lapNumber}`}, ${formatLapTime(lap.lapTimeMs)}, saved ${file}`);
    this.learnFrames = [];
    this.use(ref, file);
    this.emit('status');
    this.emit('reference', { reference: ref, file, why: 'learned' });
  }

  // --- Picking a reference that fits ---

  /**
   * The reference for the track being driven (docs/dev/telemetry.md; the user, 2026-10-21): while driving on track outside
   * races, the active reference has to fit, its line and the car's class. If it does not (another track, another
   * class) or there is none, the saved references of the class are watched and the fastest one that fits is
   * taken. If none does, the coach rides along quietly and the driver's own lap is learned (the fastest of OWN_LAPS).
   */
  private autoReference(frame: TelemetryFrame): void {
    // In races too (stream feedback 2026-10-25: online races with a reference of another track): a saved reference
    // that fits is taken, only learning one waits for practice.
    if (!this.settings.autoReference || this.learnRequested || this.frozen) return;
    if (frame.flags & (Flags.Paused | Flags.Loading) || !(frame.flags & Flags.CarOnTrack) || frame.speed < DRIVING_MS) return;
    if (frame.carCode <= 0) return;
    const car: CarClass = { code: frame.carCode, category: frame.carCategory || this.status.car?.category || undefined };
    const drive = this.driveMode();
    let reason = 'no reference';
    if (this.ref) {
      this.referenceWatch ??= new GhostWatch(this.ref);
      this.referenceWatch.observe(frame);
      const lost = this.referenceWatch.judgedMs >= REFERENCE_LOST_MS && this.referenceWatch.onShare <= REFERENCE_LOST_SHARE;
      const otherClass = !sameClass(classOf(this.ref), car);
      // A reference for another mode or BoP than the driver drives (the Cockpit's switch, docs/dev/telemetry.md).
      const otherMode = !fitsMode(this.ref, drive);
      // Back on its line (and its class and mode): it fits again.
      if (!otherClass && !otherMode && (this.referenceWatch.fits || (!lost && !this.lost))) {
        if (this.lost) this.log('AUTO      back on the reference line');
        this.lost = false;
        this.picker = undefined;
        return;
      }
      // Lost (or another class or mode): quiet, and look for one that fits until it fits again.
      this.lost = true;
      reason = otherClass
        ? `the reference is for ${this.ref.carCategory ?? `car ${this.ref.carCode}`}`
        : otherMode
          ? `the reference is for ${this.ref.mode}${modeBop(this.ref.mode!, this.ref.bop) ? ' with BoP' : ''}`
          : 'off the reference line';
    }
    if (!this.picker || !sameClass(this.picker.car, car) || this.picker.drive.mode !== drive.mode || this.picker.drive.bop !== drive.bop) {
      this.picker = new ReferencePicker(this.options.dirs.references, car, drive, this.file);
      this.log(`AUTO      ${reason}: watching ${this.picker.count} saved reference(s) for ${car.category ?? `car ${car.code}`}, ${drive.mode}${drive.bop ? ' with BoP' : ''}`);
    }
    this.picker.observe(frame);
    const picked = this.picker.pick();
    if (picked) {
      this.switchReference(picked.reference, picked.summary.file);
      return;
    }
    // Without any saved reference of the class there is nothing to wait for.
    if (this.picker.count > 0 && this.picker.watchedMs < NONE_FITS_MS) return;
    // No learning in races (docs/dev/telemetry.md): the coach stays quiet with a reference that does not fit.
    if (this.inRace) return;
    // None fits: learn the driver's own lap (the active reference is for another track or class).
    if (this.ref) {
      this.log(`AUTO      no saved reference fits the track and ${car.category ?? `car ${car.code}`}: learning your own lap`);
      this.ref = undefined;
      this.file = undefined;
      this.startLearning();
      this.emit('status');
      this.emit('reference', { why: 'none-fits' });
    }
    if (!this.learnOwnSaid && this.status.learning) {
      this.learnOwnSaid = true;
      this.emit('learn-own');
    }
  }

  /** What the driver drives right now: the Cockpit's switch (a Daily Race always with BoP). */
  private driveMode(): DriveMode {
    const mode = this.settings.driveMode;
    return { mode, bop: modeBop(mode, this.settings.driveBop) };
  }

  /** Another saved reference fits the track being driven: coach with it from now on. */
  private switchReference(ref: ReferenceLap, file: string): void {
    this.learnFrames = [];
    this.status.learning = undefined;
    this.log(`AUTO      ${ref.track?.name ?? 'unknown track'}, ${ref.carCategory ?? `car ${ref.carCode}`}: ${path.basename(file)} fits (${formatLapTime(ref.lapTimeMs)})`);
    this.use(ref, file);
    this.emit('status');
    this.emit('reference', { reference: ref, file, why: 'picked' });
  }

  private log(line: string): void {
    this.options.log(line);
  }
}
