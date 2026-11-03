// The race crew (docs/user/crew.md, docs/dev/modules.md): in races on its own voice with the radio filter
// (positions, sectors, tyres and fuel, laps to go, cheeky remarks on excursions), the tyre calls outside races, and at
// the end of its patience the team boss on the stand-in's voice for a few laps. It reads the telemetry, speaks through
// the shell's speech floor and opens its voices through the shell's voices, where it puts the one speaking on the
// radio (the coach makes its race corner calls on it).

import { EventEmitter } from 'node:events';
import type { Phrases, ReferenceLap } from '@gt-toolz/coach';
import {
  GhostWatch,
  type ActivityBody,
  type ClipVoice,
  type CrewStatus,
  type ReferenceEvent,
  type RunnerSettings,
  type ShellVoices,
  type SpeechFloor,
  type TelemetryFeed,
  type VoiceSettings,
  type VoiceStatus,
} from '@gt-toolz/runtime';
import { Flags, RaceRunning, type SessionMode, type TelemetryFrame } from '@gt-toolz/telemetry';
import type { CrewModuleSettings } from '../src/api';
import { RaceCrew, type CrewOptions } from '../src/crew';
import { TyreWatch } from '../src/tyres';

/** The crew's reports are stale after this. */
const CREW_STRATEGY_MAX_AGE_MS = 40_000;
/** A quit line that found no quiet moment in this time is dropped; the other voice takes over anyway. */
const QUIT_MAX_AGE_MS = 20_000;
/** A take-over line waits this long for a quiet moment. */
const ANNOUNCEMENT_MAX_AGE_MS = 25_000;

/** What the crew reads: its own settings (with the talk level applied) and the app's (how it sounds, the personality). */
export type CrewSessionSettings = CrewModuleSettings & VoiceSettings & Pick<RunnerSettings, 'style' | 'crewPatience' | 'radio'>;

export interface CrewSessionOptions {
  telemetry: TelemetryFeed;
  floor: SpeechFloor;
  voices: ShellVoices;
  settings(): CrewSessionSettings;
  log(line: string): void;
  activity(body: ActivityBody): void;
}

interface CrewEvents {
  /** The crew's status or its voice's changed. */
  changed: [];
}

export class CrewSession extends EventEmitter<CrewEvents> {
  /** What the crew says, in the language it speaks. */
  phrases!: Phrases;
  private crew: RaceCrew | undefined;
  /** Tyre temperatures outside races (quali, time trial, free run), with the lap count for the per-lap check. */
  private practiceTyres: { watch: TyreWatch; lapCount: number } | undefined;
  /** In races: whether the reference fits the track, for the crew's ghost comparison. */
  private ghostWatch: GhostWatch | undefined;
  /** The voice on the radio: the race engineer's, or the boss's while he has it. */
  private crewVoice: ClipVoice | undefined;
  private crewVoiceGeneration = 0;
  private crewVoiceStatus: VoiceStatus | undefined;
  /**
   * Races, level 4 (docs/user/crew.md): the voice waiting on the radio, the team boss's while the race engineer talks,
   * the engineer's while the boss does.
   */
  private crewStandby: ClipVoice | undefined;
  private crewStandbyGeneration = 0;
  private crewStandbyPreparing = false;
  private boss = false;
  private bossLapsLeft = 0;
  private crewSwitching = false;
  /** The crew's lap when last looked at, for the boss's laps. */
  private crewLapSeen = 0;
  private announcementCount = 0;
  /** Whether a race runs (GT7 reports its lobby and its qualifying like a race over a time), and the lap counter. */
  private readonly raceRunning = new RaceRunning();
  private racing = false;
  private lastLapCount: number | undefined;
  private readonly subscriptions: (() => void)[] = [];

  constructor(private readonly options: CrewSessionOptions) {
    super();
  }

  private get settings(): CrewSessionSettings {
    return this.options.settings();
  }

  /** The race in progress (its crew), if any. */
  get race(): RaceCrew | undefined {
    return this.crew;
  }

  get voice(): ClipVoice | undefined {
    return this.crewVoice;
  }

  /** The team boss has the radio. */
  get bossActive(): boolean {
    return this.boss;
  }

  get voiceStatus(): VoiceStatus | undefined {
    return this.crewVoiceStatus;
  }

  get status(): CrewStatus {
    return this.crew?.status ?? { active: false, sectors: [], lap: 0, laps: 0, mood: 0, excursions: 0 };
  }

  /** Every voice reads the crew's language pack's pronunciations. */
  readonly speak = (text: string): string => this.phrases?.spoken(text) ?? text;

  /** A race runs: GT7 reports one, and not just its lobby or qualifying (RaceRunning). */
  private get inRace(): boolean {
    return this.options.telemetry.mode === 'race' && this.racing;
  }

  // --- Lifecycle ---

  /** The crew's language, its voice prepared, and from now on every frame. */
  start(): void {
    const { telemetry, voices } = this.options;
    this.phrases = voices.phrases(voices.languageOf(this.settings, 'crew'));
    this.listen(telemetry, 'frame', (frame: TelemetryFrame) => this.frame(frame));
    this.listen(telemetry, 'mode', (mode: SessionMode) => this.modeChanged(mode));
    this.listen(telemetry, 'reference', ({ reference }: ReferenceEvent) => reference && this.referenceChanged(reference));
    this.listen(voices, 'recordings', (id: string) => this.refreshRecordings(id));
    void this.prepareVoice();
  }

  /** Switched off or the app closes: off the radio, quiet, every voice closed. */
  stop(): void {
    for (const off of this.subscriptions.splice(0)) off();
    this.closeVoices();
    if (this.crew?.status.active) {
      this.crew.stop();
      this.emit('changed');
    }
    this.crew = undefined;
    this.practiceTyres = undefined;
  }

  /** Every voice closed (voice packages are removed): no engine may run meanwhile. */
  releaseVoices(): void {
    this.closeVoices();
  }

  /** Voice packages were installed or removed: another voice may be the crew's now, or it needs one again. */
  voicesChanged(): void {
    if (!this.crewVoice || this.options.voices.resolve(this.settings, 'crew') !== this.crewVoiceStatus?.id) void this.prepareVoice();
  }

  settingsChanged(s: CrewSessionSettings, old: CrewSessionSettings): void {
    const voices = this.options.voices;
    // The user's own texts in the crew's language: its voice says them as it would a new language.
    const languageChanged = voices.languageOf(s, 'crew') !== voices.languageOf(old, 'crew') || voices.ownTextsChanged(s, old, 'crew');
    if (languageChanged) {
      this.phrases = voices.phrases(voices.languageOf(s, 'crew'));
      this.crew?.setPhrases(this.phrases);
      this.practiceTyres?.watch.setPhrases(this.phrases);
      this.options.log(`LANGUAGE  crew speaks ${this.phrases.name} (${this.phrases.id})`);
    }
    // The crew's own voice is chosen apart from the coach's: a new coach voice may change it.
    const voiceChanged =
      languageChanged ||
      s.radio !== old.radio ||
      voices.resolve(s, 'coach') !== voices.resolve(old, 'coach') ||
      voices.languageOf(s, 'coach') !== voices.languageOf(old, 'coach') ||
      voices.resolve(s, 'crew') !== voices.resolve(old, 'crew') ||
      roleStyleChanged(s, old, 'crew') ||
      roleStyleChanged(s, old, 'coach');
    if (voiceChanged) void this.prepareVoice();
    else {
      // The name's pauses: its voices put the sentences with the name together anew.
      if (s.namePauseBefore !== old.namePauseBefore || s.namePauseAfter !== old.namePauseAfter || s.nameSlower !== old.nameSlower) {
        for (const voice of [this.crewVoice, this.crewStandby]) void voice?.setAddress(voices.addressPauses());
      }
      // The talk level decides whether the radio takes the corner calls.
      if (s.crewTalk !== old.crewTalk) this.onAir();
    }
    this.crew?.setOptions(this.crewOptions());
  }

  // --- Frames and the race ---

  /**
   * Every frame: the race starts the crew, it reports, and outside races the tyre calls. Nothing while calibrating.
   * Every race starts afresh (the user's Manufacturers Cup, 2026-10-31: the crew started in the lobby, went on through
   * the qualifying and into the race with the qualifying's laps, and called positions while players joined).
   */
  private frame(frame: TelemetryFrame): void {
    if (this.options.telemetry.suspended) return;
    const still = (frame.flags & (Flags.Paused | Flags.Loading)) !== 0;
    this.racing = this.raceRunning.update(frame);
    // Back on the grid during a race (a restart: lap 0 of 5 again).
    const restart = !still && this.racing && !!this.lastLapCount && this.lastLapCount > 0 && frame.lapCount === 0;
    if (!still) this.lastLapCount = frame.lapCount;
    if (this.crew?.status.active && (!this.inRace || restart)) this.endRace();
    // Also when the crew is switched on during a race.
    if (!still && this.inRace && !this.crew?.status.active) this.startCrew(frame);
    this.updateCrew(frame);
    this.updatePracticeTyres(frame);
  }

  /** Not a race any more. */
  private modeChanged(mode: SessionMode): void {
    if (mode === 'race' || !this.crew?.status.active) return;
    this.endRace();
  }

  /** The race is over, or only its lobby is left: the race engineer is back on the radio for the next race. */
  private endRace(): void {
    this.endBoss(true);
    this.crew?.stop();
    this.emit('changed');
  }

  /** The reference changed: the crew's ghost comparison starts afresh with it. */
  private referenceChanged(ref: ReferenceLap): void {
    this.crew?.setGhost(this.crew.status.active ? (this.ghostWatch = new GhostWatch(ref)) : undefined);
    this.crew?.stop();
  }

  private crewOptions(): CrewOptions {
    const s = this.settings;
    // Talk level 'little': no remarks from the crew either.
    return { pitLossSeconds: s.pitLossSeconds, strategy: s.crewStrategy, cheeky: s.style === 'cheeky' && s.crewTalk !== 'little', patience: s.crewPatience, sectors: s.crewSectors, talk: s.crewTalk };
  }

  private startCrew(frame: TelemetryFrame): void {
    this.endBoss(true);
    this.crewLapSeen = 0;
    this.crew = new RaceCrew(this.phrases, this.crewOptions());
    // The ghost on top, once the car is seen driving on the reference's line.
    const reference = this.options.telemetry.reference;
    this.ghostWatch = reference ? new GhostWatch(reference) : undefined;
    this.crew.setGhost(this.ghostWatch);
    this.options.log(`CREW      race: ${frame.lapsInRace} laps, position ${frame.racePosition} of ${frame.carsInRace}`);
    this.crew.start(frame);
    this.emit('changed');
  }

  private updateCrew(frame: TelemetryFrame): void {
    const crew = this.crew;
    if (!crew?.status.active) return;
    const before = crew.status.excursions;
    if (this.options.telemetry.driving) this.ghostWatch?.observe(frame);
    const remarks = crew.frame(frame, Date.now());
    if (remarks.length) {
      this.say(remarks, CREW_STRATEGY_MAX_AGE_MS);
      this.emit('changed');
    }
    if (crew.status.excursions !== before) this.emit('changed');
    this.crewEscalation(crew);
  }

  /**
   * Tyre temperatures outside races (docs/user/crew.md; the user, 2026-10-22: since a GT7 update they matter in quali
   * too): on the radio, when the tyres are up to temperature, when they get hot, fast changes, a tyre that ran hot
   * over a lap. Between the coach's calls. Also in a lobby's qualifying, which GT7 reports like a race.
   */
  private updatePracticeTyres(frame: TelemetryFrame): void {
    const mode = this.options.telemetry.mode;
    if (!this.settings.practiceTyres || !(mode === 'practice' || (mode === 'race' && !this.racing))) {
      this.practiceTyres = undefined;
      return;
    }
    if (!(frame.flags & Flags.CarOnTrack) || frame.flags & (Flags.Paused | Flags.Loading)) return;
    const tyres = (this.practiceTyres ??= { watch: new TyreWatch(this.phrases, false), lapCount: frame.lapCount });
    const messages = tyres.watch.frame(frame, Date.now(), true);
    if (frame.lapCount > tyres.lapCount) {
      const { hot } = tyres.watch.lap(frame.lapCount - 1, true);
      if (hot) messages.push(hot);
    }
    tyres.lapCount = frame.lapCount;
    if (messages.length) this.say(messages, CREW_STRATEGY_MAX_AGE_MS);
  }

  // --- On the radio ---

  /** Messages for the radio, each at the next quiet moment. */
  private say(messages: string[], maxAgeMs: number, important = false): void {
    for (const message of messages) {
      const text = this.options.voices.address(message, important || message === this.phrases.crewFinish, this.phrases);
      this.options.log(`CREW      "${text}"`);
      this.options.activity({ kind: 'crew', text });
      void this.announce(text, maxAgeMs);
    }
  }

  /** Renders a sentence on the radio's voice and lets it wait for a quiet moment. done: once it was said (or dropped, or failed). */
  private async announce(text: string, maxAgeMs: number, done?: () => void): Promise<void> {
    const voice = this.crewVoice;
    if (!voice) return done?.();
    const clip = `radio-${this.announcementCount++ % 6}`;
    try {
      const seconds = await voice.prepare(clip, text);
      if (voice !== this.crewVoice) return done?.();
      this.options.floor.announce({ text, seconds, until: Date.now() + maxAgeMs, speaker: voice, haptic: 'message', done, play: () => voice.play(clip) });
    } catch (err) {
      this.options.log(`ERROR     announcement: ${(err as Error).message}`);
      done?.();
    }
  }

  /** The voice speaking now goes on the shell's radio (none: off the air), with the language it speaks. */
  private onAir(): void {
    const voice = this.crewVoice;
    this.options.voices.setRadio(voice && { voice, phrases: this.phrases, takesCalls: this.settings.crewTalk !== 'little' });
  }

  // --- Races, level 4: the race engineer quits, the team boss takes the radio for a few laps ---

  /** Cheeky style with the boss on, and a boss who sounds different from the race engineer. */
  private canBossTakeOver(): boolean {
    const s = this.settings;
    const voices = this.options.voices;
    return s.style === 'cheeky' && s.bossTakesOver && (voices.resolve(s, 'boss') !== voices.resolve(s, 'crew') || voices.packId(s, 'boss') !== voices.packId(s, 'crew'));
  }

  /** The race engineer loses it (the boss gets ready in the background), quits, and comes back after the boss's laps. */
  private crewEscalation(crew: RaceCrew): void {
    const laps = crew.status.lap - this.crewLapSeen;
    if (laps > 0) {
      this.crewLapSeen = crew.status.lap;
      this.bossLapsLeft -= laps;
      if (this.boss && !this.crewSwitching && this.bossLapsLeft <= 0) {
        // The boss's laps are over: the race engineer is back.
        this.crewSwitching = true;
        this.crewTakeOver(false);
        return;
      }
    }
    if (!this.canBossTakeOver()) return;
    if (crew.status.mood === 3) void this.prepareBoss();
    if (!crew.wantsToQuit || this.crewSwitching) return;
    if (!this.crewStandby) {
      void this.prepareBoss();
      return;
    }
    const early = this.boss;
    const line = early ? this.phrases.bossQuit() : this.phrases.crewQuit();
    if (!line) return;
    this.crewSwitching = true;
    const text = this.options.voices.address(line, true, this.phrases);
    this.options.log(`QUIT      ${early ? 'team boss' : 'race engineer'}: "${text}"`);
    this.options.activity({ kind: 'crew', text });
    void this.announce(text, QUIT_MAX_AGE_MS, () => this.crewTakeOver(early));
  }

  /** The waiting voice takes the radio: the boss introduces himself, or the engineer is back (early: the boss quit). */
  private crewTakeOver(early: boolean): void {
    if (!this.crewSwitching) return;
    this.crewSwitching = false;
    if (!this.swapCrewVoices()) return;
    const crew = this.crew;
    let line: string | undefined;
    if (this.boss) {
      this.bossLapsLeft = this.settings.bossLaps;
      crew?.setBoss(true, 0);
      line = this.phrases.bossIntro();
    } else {
      // Back after the boss's laps a little cheeky; early (the boss quit) still fed up.
      crew?.setBoss(false, early ? crew.lostItAnnoyance : 2);
      line = this.phrases.crewComeback(early);
    }
    this.emit('changed');
    if (!line) return;
    const text = this.options.voices.address(line, true, this.phrases);
    this.options.log(`TAKEOVER  ${this.boss ? 'team boss' : 'race engineer'}: "${text}"`);
    this.options.activity({ kind: 'crew', text });
    void this.announce(text, ANNOUNCEMENT_MAX_AGE_MS);
  }

  /** Swaps the crew's voice with the waiting one. False if one of them is missing. */
  private swapCrewVoices(): boolean {
    const current = this.crewVoice;
    const next = this.crewStandby;
    if (!current || !next) return false;
    this.crewVoice = next;
    this.crewStandby = current;
    this.boss = !this.boss;
    // Waiting sentences in the voice that just left would sound wrong now; the corner calls were rendered with it.
    this.options.floor.drop(current);
    this.onAir();
    return true;
  }

  /** The boss's voice, rendered in the background while the race engineer keeps talking. */
  private async prepareBoss(): Promise<void> {
    if (this.crewStandby || this.crewStandbyPreparing || this.boss || !this.crewVoice) return;
    const generation = ++this.crewStandbyGeneration;
    this.crewStandbyPreparing = true;
    const voices = this.options.voices;
    const id = voices.resolve(this.settings, 'boss');
    const packId = voices.packId(this.settings, 'boss');
    let voice: ClipVoice;
    try {
      voice = await voices.open({
        id,
        locale: this.phrases.locale,
        clips: {},
        role: 'standin',
        spoken: this.speak,
        channel: 'crew',
        effect: this.settings.radio ? 'radio' : undefined,
        recordings: packId ? voices.pack(packId) : undefined,
      });
    } catch (err) {
      if (generation !== this.crewStandbyGeneration) return;
      this.crewStandbyPreparing = false;
      this.options.log(`ERROR     team boss voice ${id || 'default'}: ${(err as Error).message}`);
      return;
    }
    if (generation !== this.crewStandbyGeneration) {
      voice.close();
      return;
    }
    this.crewStandbyPreparing = false;
    this.crewStandby = voice;
    this.options.log(`TEAM BOSS voice ${voice.voiceName} ready`);
  }

  /**
   * Forgets the team boss (race over, a new race, the crew's voice changed). swapBack: the race engineer takes the
   * radio again first, without a word; otherwise the caller closes the crew's voice itself.
   */
  private endBoss(swapBack: boolean): void {
    if (swapBack && this.boss) this.swapCrewVoices();
    this.boss = false;
    this.crewSwitching = false;
    this.crewStandbyGeneration++;
    this.crewStandbyPreparing = false;
    this.crewStandby?.close();
    this.crewStandby = undefined;
  }

  // --- The crew's voice ---

  async prepareVoice(): Promise<void> {
    // The boss is prepared anew against the new voice; the corner calls rendered with the old one go with it.
    this.closeVoices();
    const generation = this.crewVoiceGeneration;
    const voices = this.options.voices;
    await voices.ensureListed();
    if (generation !== this.crewVoiceGeneration) return;
    const id = voices.resolve(this.settings, 'crew');
    this.crewVoiceStatus = { id, name: voices.label(id), state: 'preparing' };
    this.emit('changed');
    const open = (voiceId: string) =>
      voices.open({
        id: voiceId,
        locale: this.phrases.locale,
        clips: {},
        role: 'crew',
        spoken: this.speak,
        channel: 'crew',
        effect: this.settings.radio ? 'radio' : undefined,
        recordings: voices.recordings(this.settings, 'crew'),
      });
    let voice: ClipVoice;
    let error: string | undefined;
    try {
      voice = await open(id);
    } catch (err) {
      error = (err as Error).message;
      this.options.log(`ERROR     crew voice ${id || 'default'}: ${error}`);
      try {
        voice = await open('');
      } catch (fallbackErr) {
        if (generation === this.crewVoiceGeneration) {
          this.crewVoiceStatus = { id, name: id, state: 'error', error: (fallbackErr as Error).message };
          this.emit('changed');
        }
        return;
      }
    }
    if (generation !== this.crewVoiceGeneration) {
      voice.close();
      return;
    }
    this.crewVoice = voice;
    this.crewVoiceStatus = { id, name: voice.voiceName, engine: voice.engine, state: 'ready', error };
    this.options.log(`CREW      voice ${voice.voiceName}${voice.recordingPack ? ' with recordings' : ''}${this.settings.radio ? ' with radio filter' : ''}`);
    this.onAir();
    this.emit('changed');
  }

  /** Off the radio, the boss forgotten, the crew's voice closed (a voice being prepared is not taken any more). */
  private closeVoices(): void {
    this.endBoss(false);
    this.crewVoiceGeneration++;
    const voice = this.crewVoice;
    this.crewVoice = undefined;
    this.onAir();
    if (!voice) return;
    this.options.floor.drop(voice);
    voice.close();
  }

  /** A pack's recordings changed: the crew's voices using it take them. */
  private refreshRecordings(id: string): void {
    for (const voice of [this.crewVoice, this.crewStandby]) {
      if (voice?.recordingPack === id) void voice.setRecordings(this.options.voices.pack(id));
    }
  }

  private listen(emitter: EventEmitter, event: string, listener: (...args: never[]) => void): void {
    const handler = listener as (...args: unknown[]) => void;
    emitter.on(event, handler);
    this.subscriptions.push(() => emitter.off(event, handler));
  }
}

/** Speed, pitch, pauses or recordings of a role's voice changed: its clips must be prepared again. */
function roleStyleChanged(s: VoiceSettings, old: VoiceSettings, role: 'coach' | 'crew'): boolean {
  return JSON.stringify(s.voices[role]) !== JSON.stringify(old.voices[role]) || s.nameNotRecorded !== old.nameNotRecorded || s.driverName !== old.driverName;
}
