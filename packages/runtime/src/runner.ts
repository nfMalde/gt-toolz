// The coach as a long-running service: connection, voice, learning, coaching, memory and briefing.
// Used by the desktop app (main process) and by the console coach (tools/capture).

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HapticCue, HapticDetail } from '@gt-toolz/core/api';
import { carName, Flags, formatLapTime, OWN_LAPS, type TelemetryFrame } from '@gt-toolz/telemetry';
import {
  brakeForce,
  buildBriefing,
  buildDebrief,
  chainedAfter,
  chainFollowers,
  checkOwnText,
  CoachSession,
  cornerLabel,
  countStep,
  describeProblems,
  cornerGears,
  lowestGear,
  detectMode,
  fastCornerLabel,
  feedbackTexts,
  emptyHistory,
  FALLBACK_PACK,
  QUICK_TEXTS,
  rememberResult,
  SlideWatcher,
  TEXT_GROUPS,
  TEXT_KEYS,
  textGroup,
  textKind,
  textSamples,
  turnDirection,
  usesOrdinals,
  validateLanguagePack,
  type CoachEvent,
  type CoachHistory,
  type Corner,
  type CornerHelp,
  type CornerMemory,
  type CornerResult,
  type FastCorner,
  type FeedbackItem,
  type NoteAudio,
  type Phrases,
  type PlanAudio,
  type PlanVariant,
  type Problem,
  type ReferenceLap,
  type Slide,
} from '@gt-toolz/coach';
import type {
  Activity,
  ActivityBody,
  CoachMood,
  CrewStatus,
  CueEvent,
  LanguageInfo,
  LiveSample,
  RecordingCatalog,
  ReferenceSummary,
  RunnerStatus,
  SampleInfo,
  SessionMode,
  TextCatalog,
  TextEntry,
  TextProblem,
  VoiceChoice,
  VoiceRole,
  VoiceStatus,
  Patience,
  ZoneState,
} from './app-api';
import {
  assistTargetClip,
  clipFor,
  coachClips,
  cornerPlanClips,
  cornerPlanText,
  cueText,
  curbCall,
  fastNoteText,
  feedbackClip,
  noteClip,
  planClip,
  referenceClips,
} from './clips';
import { writeFileAtomic } from './atomic-file';
import { hapticForClip } from './haptics';
import { historyFileFor, referenceCarName, summarizeReference } from './references';
import { anonymize, openSessionLog, type LogPrivacy, type SessionLog } from './session-log';
import { coachSettingsFrom, normalizeSettings, ownTexts, withTalk, type ClipDurations, type RunnerSettings } from './settings';
import { withFinalMark, type AudioOutput, type ClipVoice } from './voice';
import { recordingCatalog, type VoicePackStore } from './voice-pack';
import { removeRetiredPackages } from './voice-packages';
import { ShellVoices } from './shell-voices';
import { ANNOUNCE_MARGIN_S, SpeechFloor } from './speech-floor';
import type { ReferenceEvent, TelemetryFeed } from './telemetry-feed';

export interface RunnerDirs {
  /** Learned references and their memory files. */
  references: string;
  /** Session logs and telemetry recordings. */
  sessions: string;
  /** Rendered voice clips. */
  voiceCache: string;
  /** Optional voice packages. */
  voices: string;
  /** Additional language packs (*.json). */
  languagePacks?: string;
  /** The user's recorded voice packs; default: next to the voice cache. */
  voicePacks?: string;
}

export interface RunnerOptions {
  settings: RunnerSettings;
  dirs: RunnerDirs;
  /** The telemetry: frames, mode, driving, the car and the reference (modules/telemetry). */
  telemetry: TelemetryFeed;
  /** Also print the log to the console. */
  echo?: boolean;
  /** Where the voices play (the app's own player); default: the system's player (console tools). */
  audio?: AudioOutput;
  /** The shell's voices, shared with the crew; without them (console tools) the runner opens its own. */
  voices?: ShellVoices;
}

interface RunnerEvents {
  status: [RunnerStatus];
  activity: [Activity];
  cue: [CueEvent];
  /** A cue to feel now (accessibility): the shell hands it to the vibration while that is on (docs/user/haptics.md). */
  feel: [HapticCue, HapticDetail | undefined];
  live: [LiveSample];
  log: [string];
  'reference-learned': [ReferenceSummary];
  /** Picked for the track being driven (docs/dev/telemetry.md); undefined: none fits, the driver's own lap is learned. */
  'reference-changed': [ReferenceSummary | undefined];
}

/** Car stopped with the handbrake pulled this long starts the debrief. */
const DEBRIEF_HOLD_MS = 1500;
/** Below this speed (m/s) the car counts as stopped. */
const STOPPED_SPEED = 0.5;
/** GT7's official lap time is preferred; it comes with the packets around the line (also slightly before). */
const LAP_TIME_WAIT_MS = 1000;
/** GT7 values this close (in time) to the own line crossing belong to the same lap. */
const LAP_TIME_WINDOW_MS = 2500;
/** GT7's lap time further away from the own measurement than this belongs to something else (restart). */
const LAP_TIME_TOLERANCE_MS = 2000;
/** An announcement that found no quiet moment in this time is dropped: it would be stale. */
const ANNOUNCEMENT_MAX_AGE_MS = 25_000;
/**
 * After the coach's voice is ready, the other languages' clips are rendered into the cache, so switching
 * the language is instant (a neural voice needs up to a few seconds per clip).
 */
const PREWARM_DELAY_MS = 10_000;
/** Cheeky style: at most one remark in this time, and only while it is still about the corner just driven. */
const REMARK_GAP_MS = 25_000;
/** A pace note may start this much before the clip playing ends (the coach's own estimate of it differs a little). */
const NOTE_OVERLAP_MS = 150;
/** A sector against the ghost waits this long for a quiet moment (after a dense section: on the next straight). */
const SECTOR_MAX_AGE_MS = 40_000;
/** "Feedback … erledigt" and the car warning wait this long for a quiet moment. */
const RESOLVED_MAX_AGE_MS = 20_000;
const CAR_WARNING_MAX_AGE_MS = 60_000;
const REMARK_MAX_AGE_MS = 12_000;
/**
 * Mood at which the cheeky coach gets annoyed (level 2), loses it (level 3) and quits (a stand-in with
 * another voice takes over), by patience.
 */
const PATIENCE: Record<Patience, [annoyed: number, lostIt: number, quits: number]> = { high: [6, 14, 20], normal: [4, 9, 13], low: [2, 5, 8] };
/** A quit line that found no quiet moment in this time is dropped; the other voice takes over anyway. */
const QUIT_MAX_AGE_MS = 20_000;
/** The coach comes back from the break amused, not relaxed. */
const COMEBACK_MOOD = 1;
/** A corner finally done right after repeated mistakes calms the coach down by this much. */
const RELIEF_MOOD = 2;
/** The crew's reports are stale after this. */
const CREW_STRATEGY_MAX_AGE_MS = 40_000;
/**
 * Slides and spins (docs/dev/coach-and-texts.md): from this slip angle (degrees) the coach says what started it, and the corner's run
 * is left out (its numbers say nothing then); smaller ones only go into the log. In races only spins.
 */
const SLIDE_SAY_DEG = 45;
/** At most one slide said in this time (spinning in the gravel again and again is one story) ... */
const SLIDE_SAY_GAP_MS = 20_000;
/** ... and it is stale when no quiet moment came in this time. */
const SLIDE_MAX_AGE_MS = 10_000;
/** Slower than this (m/s, 60 km/h) once it is over: cause and tip come right away; else the tip waits this long for a quiet moment. */
const SLIDE_SAY_NOW_SPEED = 16.7;
const SLIDE_TIP_MAX_AGE_MS = 40_000;
/**
 * Calibration: a countdown starts after this long at full throttle above this speed, at least this long
 * after the last try. A brake more than EARLY before "jetzt" or LATE after it does not count. The result is
 * the median of this many tries.
 */
const CALIBRATION_SPEED_KMH = 80;
const CALIBRATION_STEADY_MS = 1500;
const CALIBRATION_GAP_MS = 4000;
const CALIBRATION_EARLY_S = 0.5;
const CALIBRATION_LATE_S = 1.5;
const CALIBRATION_TRIES = 5;
/** Brake pedal from this much counts as braking (0..1). */
const CALIBRATION_BRAKE = 0.3;
/** New takes for a pack in use: its voices put their clips together this long after the last one. */
const RECORDINGS_REFRESH_MS = 800;
const STATUS_INTERVAL_MS = 100;

/** Speed, pitch, pauses or recordings of a role's voice changed: its clips must be prepared again. */
function voiceStyleChanged(s: RunnerSettings, old: RunnerSettings, role: VoiceRole): boolean {
  const a = s.voices[role];
  const b = old.voices[role];
  return a.rate !== b.rate || a.pitch !== b.pitch || a.commaPause !== b.commaPause || a.sentencePause !== b.sentencePause || JSON.stringify(a.recordings) !== JSON.stringify(b.recordings);
}

export class CoachRunner extends EventEmitter<RunnerEvents> {
  /** The settings as coach and crew work with them: the user's, with the talk levels applied (withTalk). */
  private settings: RunnerSettings;
  /** The user's settings as set: what the app shows and saves. */
  private userSettings: RunnerSettings;
  private readonly dirs: RunnerDirs;
  private readonly audio: AudioOutput | undefined;
  private readonly echo: boolean;
  /** The shell's voices: which voice speaks a role, the recordings, the name in front of a sentence, the volumes. */
  private readonly voices: ShellVoices;
  private recordingsTimer: NodeJS.Timeout | undefined;
  private readonly changedPacks = new Set<string>();
  private packWarnings: string[] = [];
  /** What the coach and the stand-in say. */
  private phrases!: Phrases;
  private clips: Record<string, string> = {};

  private session: SessionLog | undefined;
  /** The telemetry: frames, mode, driving, the car and the reference (modules/telemetry, docs/dev/modules.md). */
  private readonly telemetry: TelemetryFeed;
  /** Players of the references used in this session: hidden in the log. */
  private readonly playersSeen = new Set<string>();

  private voice: ClipVoice | undefined;
  private voiceGeneration = 0;
  private durations: ClipDurations = { tone: 0.25, intro: 1.2, now: 0.4, gear: 0.5, turnIn: 1.1, count: 0.6 };
  /** Coach and crew speak one at a time; a sentence waits for a quiet moment (docs/dev/modules.md). */
  private readonly floor = new SpeechFloor({
    // Without the coach talking (no reference, or quiet in a race) every moment is a quiet one.
    quietSeconds: () => (this.coach && !this.coachQuiet ? this.coach.quietSeconds() : Infinity),
    held: () => !!this.briefing || !!this.debrief,
    muted: () => this.settings.mute,
    feel: (cue) => this.feel(cue),
    log: (line) => this.log(line),
    logToFile: (line) => this.session?.logToFile(line),
    // The coach's pace notes wait for what is said (frames carry the same clock).
    busy: (until) => this.coach?.holdUntil(until),
  });
  /** A mistake's feedback right after its corner: until when it speaks, and the corner (the user: it has priority). */
  private feedbackSpeaking: { until: number; cornerIndex: number } | undefined;

  private coach: CoachSession | undefined;

  private history: CoachHistory = emptyHistory();
  private historyFile: string | undefined;
  private historySaveTimer: NodeJS.Timeout | undefined;
  private zoneResults = new Map<number, ZoneState['last']>();
  /** The mistakes of each corner's last run this session (for the help shown in the app). */
  private latestProblems = new Map<number, Problem[]>();

  private lastCornerResultAt = 0;
  /** The briefing is started in the app (the user, 2026-10-20); driving ends it. */
  private briefing: { cancelled: boolean } | undefined;
  /** Slides and spins: the watcher, whether the current one's corner run was left out, when the last one was said. */
  private readonly slides = new SlideWatcher();
  private slideDropped = false;
  private slideSaidAt = 0;
  private sayNowCount = 0;

  /** The line was crossed; waiting a moment for GT7's lap time. */
  private pendingLap: { lap: number; ownMs: number; at: number } | undefined;
  /** In races with corner calls the crew speaks the coach's cues: its voice, its language, its clip lengths. */
  private raceCaller: { voice: ClipVoice; phrases: Phrases; clips: Record<string, string>; durations: ClipDurations } | undefined;
  private raceCallerPreparing = false;
  private raceCallerGeneration = 0;
  /**
   * GT7's lap times around the line: the official last lap time (not sent in every mode, e.g. not in
   * Daily Race time trials) and the running lap timer's last value before it starts again (packet C).
   */
  private gt7LapTime: { ms: number; at: number } | undefined;
  private gt7TimerLapTime: { ms: number; at: number } | undefined;
  private lastGt7LapMs: number | undefined;
  private lastCurrentLapMs: number | undefined;
  /** The clips sentences waiting for a quiet moment are rendered into, in turn. */
  private announcementCount = 0;
  /** The telemetry suspended while calibrating (no mode, driving, learning or picking meanwhile). */
  private resumeTelemetry: (() => void) | undefined;
  /** Calibration in progress: when full throttle began, the countdown's timers, when "jetzt" was played. */
  private calibration: { steadySince: number; timers: NodeJS.Timeout[]; nowAt: number; lastTryAt: number } | undefined;
  private handbrakeSince = 0;
  /** A debrief needs the handbrake released and pulled again. */
  private debriefArmed = true;
  /** handbrake: started with the handbrake (releasing it ends it), else in the app. */
  private debrief: { cancelled: boolean; handbrake: boolean } | undefined;
  /**
   * Driven in this time trial or free run (since the mode last changed): the handbrake debrief only comes after that.
   * GT7 pulls the handbrake itself while a daily race loads and after a race (the user, 2026-10-28).
   */
  private drivenInPractice = false;
  private debriefHintSaid = false;

  /** Rises with every repeated mistake, falls with fixed corners and laps without repeats. */
  private mood = 0;
  /** Per corner: the mistakes of its last run and how many runs in a row shared one. */
  private streaks = new Map<number, { kinds: Set<string>; times: number }>();
  private repeatsThisLap = 0;
  private lastRemarkAt = 0;
  /** The corner the coach just made a remark about: its feedback is not repeated right after it. */
  private remarkCorner: number | undefined;
  /**
   * Absolute escalation: the voice waiting to take over. The stand-in while the coach talks (prepared in the
   * background once the coach loses it, so the change has no silent gap), the coach while the stand-in talks.
   */
  private standby: ClipVoice | undefined;
  private standbyGeneration = 0;
  private standbyPreparing = false;
  /** The stand-in coaches right now; laps until the coach comes back. */
  private standInActive = false;
  private standInLapsLeft = 0;
  /** A quit line is waiting to be played; the voices change right after it. */
  private switchingVoice = false;

  private status: RunnerStatus;
  private statusTimer: NodeJS.Timeout | undefined;
  private activityId = 0;

  constructor(options: RunnerOptions) {
    super();
    this.userSettings = normalizeSettings(options.settings);
    this.settings = withTalk(this.userSettings);
    this.dirs = options.dirs;
    this.echo = options.echo ?? false;
    this.audio = options.audio;
    this.voices = options.voices ?? new ShellVoices({ dirs: options.dirs, audio: options.audio, settings: () => this.settings });
    this.status = {
      running: false,
      language: this.settings.language,
      voices: { coach: { id: '', name: '', state: 'preparing' } },
      muted: this.settings.mute,
      connection: { stage: 'ps5', packetType: 'C' },
      coach: 'learning',
      lap: 0,
      started: false,
      offReference: false,
      otherCar: false,
      zones: [],
      feedback: [],
      briefing: 'off',
      debrief: 'off',
      mood: 0,
      crew: { active: false, sectors: [], lap: 0, laps: 0, mood: 0, excursions: 0 },
    };
    const telemetry = (this.telemetry = options.telemetry);
    Object.assign(this.status, telemetry.status);
    telemetry.on('status', () => {
      Object.assign(this.status, telemetry.status);
      this.emitStatus();
    });
    telemetry.on('frame', (frame) => this.onFrame(frame));
    telemetry.on('live', (sample) => this.emit('live', sample));
    telemetry.on('connected', () => this.connected());
    telemetry.on('mode', (mode) => this.modeChanged(mode));
    telemetry.on('driving', (driving) => this.drivingChanged(driving));
    telemetry.on('reference', (event) => this.referenceChanged(event));
    telemetry.on('learn-own', () => this.say(this.personal(this.phrases.learnOwn(OWN_LAPS), true)));
    // Another voice on the crew's radio (the crew module): the corner calls rendered with the old one are prepared anew.
    this.voices.on('radio', () => this.stopRaceCaller());
  }

  // The telemetry's state, read where the coach needs it.
  private get reference(): ReferenceLap | undefined {
    return this.telemetry.reference;
  }

  private get referenceFile(): string | undefined {
    return this.telemetry.referenceFile;
  }

  /** The game repeats the last packet (results screen) for a moment already. */
  private get frozen(): boolean {
    return this.telemetry.frozen;
  }

  private get driving(): boolean {
    return this.telemetry.driving;
  }

  /** The speech floor: the crew speaks through it too (docs/dev/modules.md). */
  get speechFloor(): SpeechFloor {
    return this.floor;
  }

  /** The crew module's part of the status the app shows; none: the crew is off. */
  crewStatus(crew: CrewStatus | undefined, voice: VoiceStatus | undefined): void {
    this.status.crew = crew ?? { active: false, sectors: [], lap: 0, laps: 0, mood: 0, excursions: 0 };
    this.status.voices = { ...this.status.voices, crew: voice };
    this.emitStatus();
  }

  /** The user's recorded voice packs. */
  get voicePacks(): VoicePackStore {
    return this.voices.packs;
  }

  get currentStatus(): RunnerStatus {
    return this.status;
  }

  /** The user's settings (without the talk levels applied). */
  get currentSettings(): RunnerSettings {
    return this.userSettings;
  }

  // --- Lifecycle ---

  async start(): Promise<void> {
    this.loadLanguagePacks();
    this.phrases = this.voices.phrases(this.voices.languageOf(this.settings, 'coach'));
    this.clips = this.buildClips();
    this.session = openSessionLog(this.dirs.sessions, 'coach', {
      echo: this.echo,
      privacy: () => this.logPrivacy(),
      detailed: () => this.settings.detailedLog,
    });
    this.status.logFile = `${this.session.baseName}.log`;
    this.status.running = true;
    this.log(`LANGUAGE  coach ${this.phrases.id}, crew ${this.voices.languageOf(this.settings, 'crew')}, app ${this.settings.language}, packs: ${this.voices.languages.list().map((p) => p.id).join(', ')}`);
    for (const warning of this.packWarnings) this.log(`WARNING   language pack ${warning}`);
    // Voices that left the catalogue (Kokoro, 2026-10-24) are taken off the disk once.
    removeRetiredPackages(this.dirs.voices, (line) => this.log(`VOICES    ${line}`));
    // The telemetry starts after this (its first reference finds the coach ready): the shell starts it.
    void this.prepareVoice();
  }

  async stop(): Promise<void> {
    this.log('STOPPED');
    this.status.running = false;
    clearTimeout(this.statusTimer);
    clearTimeout(this.recordingsTimer);
    this.cancelBriefing();
    this.cancelDebrief();
    this.saveHistoryNow();
    this.voiceGeneration++;
    this.endStandIn(false);
    this.voice?.close();
    this.voice = undefined;
    await this.session?.close();
    this.session = undefined;
  }

  /** Voices open for a moment (a preview), closed too when the voice packages change. */
  private readonly transientVoices = new Set<ClipVoice>();

  /** Applies new settings; only what changed is restarted (voice, connection, recording). */
  async updateSettings(next: RunnerSettings): Promise<void> {
    const old = this.settings;
    this.userSettings = normalizeSettings(next);
    this.settings = withTalk(this.userSettings);
    const s = this.settings;
    this.status.muted = s.mute;
    // Volume: the open channels take it at once, nothing is rendered again.
    if (s.volume !== old.volume || s.coachVolume !== old.coachVolume || s.crewVolume !== old.crewVolume) {
      this.voices.applyVolumes();
    }
    if (s.mute && !old.mute) this.voice?.stop();

    this.status.language = s.language;
    // Coach (with the stand-in) and crew speak their own language; the app language unless set.
    const languageChanged = this.voices.languageOf(s, 'coach') !== this.voices.languageOf(old, 'coach');
    const crewLanguageChanged = this.voices.languageOf(s, 'crew') !== this.voices.languageOf(old, 'crew');
    // The user's own texts in the language spoken: said as a new language would be.
    const ownTextsChanged = !languageChanged && this.voices.ownTextsChanged(s, old, 'coach');
    const crewTextsChanged = this.voices.ownTextsChanged(s, old, 'crew');
    if (languageChanged || ownTextsChanged) {
      this.phrases = this.voices.phrases(this.voices.languageOf(s, 'coach'));
      this.clips = this.buildClips();
      if (languageChanged) this.log(`LANGUAGE  coach speaks ${this.phrases.name} (${this.phrases.id})`);
      else this.log(`TEXTS     own texts in ${this.phrases.id}: ${Object.keys(s.texts[this.phrases.id] ?? {}).length}`);
      // Feedback texts and corner labels are in the old language (or words): start a fresh session.
      if (this.reference && this.referenceFile) this.coachWith(this.reference, this.referenceFile, false);
    }
    const planChanged =
      s.plan !== old.plan || s.curbs !== old.curbs || s.cornerShape !== old.cornerShape || s.planStyle !== old.planStyle || s.fastCorners !== old.fastCorners ||
      s.trailCalls !== old.trailCalls ||
      s.chainCalls !== old.chainCalls;
    // The crew's corner calls are prepared anew (with the new plan or language) on the next frame.
    if (planChanged || crewLanguageChanged || crewTextsChanged || s.raceCalls !== old.raceCalls) this.stopRaceCaller();
    // Recordings leave out a name they lack, or not: voices with a pack put their clips together anew.
    if (s.driverName !== old.driverName || s.nameNotRecorded !== old.nameNotRecorded) this.refreshRecordings();
    const addressChanged = s.namePauseBefore !== old.namePauseBefore || s.namePauseAfter !== old.namePauseAfter || s.nameSlower !== old.nameSlower;
    if (s.driverName !== old.driverName || addressChanged) this.refreshAddress();
    const voiceChanged =
      languageChanged ||
      ownTextsChanged ||
      this.voices.resolve(s, 'coach') !== this.voices.resolve(old, 'coach') ||
      voiceStyleChanged(s, old, 'coach');
    if (voiceChanged) void this.prepareVoice();
    else {
      this.coach?.updateSettings(coachSettingsFrom(s, this.coachDurations()));
      if (planChanged) void this.preparePlans();
    }
    // The stand-in: no longer wanted, or another voice. The coach takes over again, the stand-in is prepared anew.
    const standInChanged =
      s.style !== old.style ||
      s.coachQuits !== old.coachQuits ||
      this.voices.resolve(s, 'standin') !== this.voices.resolve(old, 'standin') ||
      voiceStyleChanged(s, old, 'standin');
    if (!voiceChanged && standInChanged) this.endStandIn(true);
    if (s.ghostSectors !== old.ghostSectors) this.coach?.setSectors(s.ghostSectors);

    if (s.briefing === 'off' || !s.coach) this.cancelBriefing();
    if (s.debriefZones <= 0 || !s.coach || (!s.debriefHandbrake && this.debrief?.handbrake)) this.cancelDebrief();
    if (s.coach !== old.coach) {
      this.log(`MODULE    coach ${s.coach ? 'on' : 'off'}`);
      // Off: quiet at once, the stand-in hands back. On again: a fresh session, the coach missed the lap meanwhile.
      if (!s.coach) {
        this.endStandIn(true);
        this.voice?.stop();
        this.floor.drop(this.voice, true);
      } else this.restartCoaching();
    }
    this.updateMood();
    this.updateSpeechStatus();
    this.emitStatus();
  }

  /** Voices offered in the app (Windows voices, optional voices with their install state). */
  async listVoices(): Promise<VoiceChoice[]> {
    return this.voices.list();
  }

  /** Voice packages were installed or removed: the voice list changes, maybe the voice to use as well. */
  async voicesChanged(): Promise<void> {
    const before = this.coachVoice.id;
    await this.listVoices();
    if (this.voices.resolve(this.settings, 'coach') !== before) void this.prepareVoice();
  }

  /** Runs a task while no voice engine is running (removing voice packages: Windows locks files in use). */
  async withVoiceReleased(task: () => void | Promise<void>): Promise<void> {
    this.voiceGeneration++;
    this.endStandIn(false);
    // Every voice that may hold an engine's files (release check 2026-10-28: a voice left open made the removal
    // delete only part of the engine, which then still counted as installed). The crew closes its own (modules.ts).
    for (const voice of this.transientVoices) voice.close();
    this.transientVoices.clear();
    this.voice?.close();
    this.voice = undefined;
    // Give the engine processes a moment to exit and release their files (a busy Piper is killed after 2 s).
    await sleep(2500);
    try {
      await task();
    } finally {
      await this.listVoices();
      void this.prepareVoice();
    }
  }

  languageList(): LanguageInfo[] {
    return this.voices.languageList();
  }

  // --- Calibration: how long after "jetzt" the driver brakes (earbud delay plus reaction) ---

  /** Starts measuring. The voice plays even when the coach is muted: the calibration needs it. */
  async startCalibration(): Promise<void> {
    await this.stopCalibration();
    this.resumeTelemetry = this.telemetry.suspend('calibration');
    this.calibration = { steadySince: 0, timers: [], nowAt: 0, lastTryAt: 0 };
    this.status.calibration = { state: 'waiting', samples: [], needed: CALIBRATION_TRIES };
    this.floor.clear();
    this.voice?.stop();
    this.log('CALIBRATE started');
    this.calibrationSay(this.phrases.calibrationStart);
    this.emitStatus();
  }

  /** Stops (or closes a finished) calibration; coaching starts afresh. */
  async stopCalibration(): Promise<void> {
    const running = !!this.calibration;
    for (const timer of this.calibration?.timers ?? []) clearTimeout(timer);
    this.calibration = undefined;
    this.resumeTelemetry?.();
    this.resumeTelemetry = undefined;
    if (running) this.restartCoaching();
    if (this.status.calibration) {
      this.status.calibration = undefined;
      this.emitStatus();
    }
  }

  private calibrationSay(text: string): void {
    this.log(`CALIBRATE "${text}"`);
    this.feel('message');
    this.voice?.say(text);
  }

  private calibrate(frame: TelemetryFrame, at: number): void {
    const c = this.calibration!;
    const status = this.status.calibration!;
    const driving = (frame.flags & Flags.Paused) === 0 && (frame.flags & Flags.CarOnTrack) !== 0;
    // Throttle and brake come as 0..1 (readFrame); dividing by 255 again kept the countdown from ever starting.
    const brake = frame.brake;
    if (status.state === 'waiting') {
      const steady = driving && frame.speed * 3.6 >= CALIBRATION_SPEED_KMH && frame.throttle >= 0.6 && brake < 0.05;
      if (!steady || at - c.lastTryAt < CALIBRATION_GAP_MS) {
        c.steadySince = 0;
        return;
      }
      c.steadySince ||= at;
      if (at - c.steadySince >= CALIBRATION_STEADY_MS) this.calibrationCountdown();
      return;
    }
    if (status.state !== 'countdown' && status.state !== 'brake') return;
    // Paused or slowed down without braking: this try is void, no verdict.
    if (!driving || (frame.speed * 3.6 < CALIBRATION_SPEED_KMH / 2 && brake < CALIBRATION_BRAKE)) return this.calibrationTry(undefined);
    const delay = (at - c.nowAt) / 1000;
    if (brake >= CALIBRATION_BRAKE) {
      if (delay < -CALIBRATION_EARLY_S) return this.calibrationTry(undefined, 'early');
      return this.calibrationTry(delay);
    }
    if (status.state === 'brake' && delay > CALIBRATION_LATE_S) this.calibrationTry(undefined, 'late');
  }

  /** The normal countdown (as set in the settings), timed like at a braking point but without lead time. */
  private calibrationCountdown(): void {
    const c = this.calibration!;
    const status = this.status.calibration!;
    const count = this.settings.countdownSeconds;
    const start = Date.now();
    const first = this.durations.tone + 0.3;
    const steps: [string, number][] = [['tone', 0]];
    const step = this.countdownStep;
    for (let n = count; n >= 1; n--) steps.push([`count-${n}`, first + (count - n) * step]);
    steps.push(['now', first + count * step]);
    c.nowAt = start + (first + count * step) * 1000;
    for (const [clip, seconds] of steps) {
      c.timers.push(
        setTimeout(() => {
          if (this.calibration !== c) return;
          this.feelClip(clip);
          this.voice?.play(clip);
          if (clip !== 'now') return;
          c.nowAt = Date.now();
          status.state = 'brake';
          this.emitStatus();
        }, seconds * 1000),
      );
    }
    status.state = 'countdown';
    status.rejected = undefined;
    this.emitStatus();
  }

  /** One try is over: counted (delay), rejected, or void; after enough tries the median is the result. */
  private calibrationTry(delay: number | undefined, rejected?: 'early' | 'late'): void {
    const c = this.calibration!;
    const status = this.status.calibration!;
    for (const timer of c.timers) clearTimeout(timer);
    c.timers = [];
    c.lastTryAt = Date.now();
    c.steadySince = 0;
    status.rejected = rejected;
    status.state = 'waiting';
    if (rejected) {
      this.log(`CALIBRATE try rejected (${rejected})`);
      this.calibrationSay(rejected === 'early' ? this.phrases.calibrationEarly : this.phrases.calibrationLate);
    }
    if (delay !== undefined) {
      status.samples = [...status.samples, Math.round(delay * 100) / 100];
      this.log(`CALIBRATE try ${status.samples.length}: ${delay.toFixed(2)} s after "jetzt"`);
      const left = status.needed - status.samples.length;
      if (left > 0) this.calibrationSay(this.phrases.calibrationTry(left));
    }
    if (status.samples.length >= status.needed) {
      const sorted = [...status.samples].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      // In 0.05 s steps like the setting; braking before "jetzt" on average means no lead time.
      status.result = Math.round(Math.max(0, Math.min(1, median)) * 20) / 20;
      status.state = 'done';
      this.log(`CALIBRATE done: tries ${status.samples.join(', ')} s, lead time ${status.result.toFixed(2)} s`);
      this.calibrationSay(this.phrases.calibrationDone(status.result));
      this.calibration = undefined;
      this.restartCoaching();
    }
    this.emitStatus();
  }

  /** After a calibration: a fresh session, the coach lost track of the lap meanwhile. */
  private restartCoaching(): void {
    if (this.reference && this.referenceFile) this.coachWith(this.reference, this.referenceFile, false);
  }

  // --- Audio test and voice preview ---

  /** Tone, "Gleich voll bremsen", "drei, zwei, eins, jetzt", "Gang 3", spaced like on track. */
  async testAudio(): Promise<void> {
    const voice = this.voice;
    if (!voice) return;
    const steps: [string, number][] = [
      ['tone', 0],
      ['intro-full', this.durations.tone + 0.15],
      ['count-3', 0],
      ['count-2', 0],
      ['count-1', 0],
      ['now', 0],
      ['gear-3', 0],
    ];
    let at = 0;
    const start = Date.now();
    steps[2]![1] = this.durations.intro + 0.3;
    for (let i = 0; i < steps.length; i++) {
      const [clip, gap] = steps[i]!;
      at += i === 0 ? 0 : i <= 2 ? gap : i <= 5 ? 1 : this.durations.now + 0.05;
      await sleep(Math.max(0, start + at * 1000 - Date.now()));
      this.feelClip(clip);
      voice.play(clip);
    }
    this.floor.occupy(1000);
  }

  // --- Sound check: everything the driver can hear, one by one ---

  private sampleCache: (SampleInfo & { play: (token: { cancelled: boolean }) => Promise<void> })[] = [];
  private sampleToken: { cancelled: boolean } | undefined;
  private sampleCount = 0;

  /** The catalog with fresh texts (cheeky remarks are picked anew every time). */
  samples(): SampleInfo[] {
    this.sampleCache = this.buildSamples();
    return this.sampleCache.map(({ id, group, text, sequence }) => ({ id, group, text, sequence }));
  }

  async playSample(id: string): Promise<void> {
    const voice = this.voice;
    const sample = (this.sampleCache.length ? this.sampleCache : (this.sampleCache = this.buildSamples())).find((s) => s.id === id);
    if (!voice || !sample) return;
    this.stopSample();
    const token = { cancelled: false };
    this.sampleToken = token;
    await sample.play(token);
    if (this.sampleToken === token) this.sampleToken = undefined;
  }

  stopSample(): void {
    if (this.sampleToken) this.sampleToken.cancelled = true;
    this.sampleToken = undefined;
    this.voice?.stop();
  }

  private buildSamples(): (SampleInfo & { play: (token: { cancelled: boolean }) => Promise<void> })[] {
    const p = this.phrases;
    const voice = this.voice;
    const wait = async (seconds: number, token: { cancelled: boolean }) => {
      const until = Date.now() + seconds * 1000;
      while (Date.now() < until && !token.cancelled) await sleep(50);
    };
    /** Plays prepared clips at the given seconds after the start (timed like on track). */
    const timeline = (steps: [clip: string, at: number][]) => async (token: { cancelled: boolean }) => {
      if (!voice) return;
      const start = Date.now();
      for (const [clip, at] of steps) {
        await wait(Math.max(0, at - (Date.now() - start) / 1000), token);
        if (token.cancelled) return;
        voice.play(clip);
      }
      const last = steps.at(-1);
      if (last) await wait(voice.durations.get(last[0]) ?? 1, token);
    };
    const sayIt = (text: string) => async (token: { cancelled: boolean }) => {
      if (!voice) return;
      const clip = `sample-${this.sampleCount++ % 6}`;
      const seconds = await voice.prepare(clip, text);
      if (token.cancelled) return;
      voice.play(clip);
      await wait(seconds + 0.2, token);
    };
    const length = (clip: string) => voice?.durations.get(clip) ?? 1;
    const step = this.countdownStep;

    // The active reference's first braking zone, else a made-up one.
    const corner = this.reference?.corners.find((c) => c.curbIn || c.curbOut) ?? this.reference?.corners[0];
    const zone = corner ? this.zoneLabel(corner.index) : 'La Source';
    const gears = corner ? cornerGears(corner) : { entry: 1, exit: 2 };
    // Curbs with how much of the car goes on them; without a reference, half the car inside and the whole car outside.
    const curbIn = corner ? curbCall(corner.curbIn, corner.curbInLevel) : 'half';
    const curbOut = corner ? curbCall(corner.curbOut, corner.curbOutLevel) : 'full';
    const force = corner ? brakeForce(corner) : 'full';
    const direction = corner ? turnDirection(corner) : 'right';
    const track = this.reference?.track?.name ?? p.unknownTrack;
    // The active reference's car and player; without them, an example.
    // Streamer mode: no other player's name (the stream would hear it).
    const about = {
      car: (this.reference && referenceCarName(this.reference)) ?? 'Porsche 911 RSR (991) \'17',
      driver: this.settings.streamerMode ? undefined : this.reference ? this.reference.driver : 'Max',
    };
    // The shape of the active reference's corner; without one, La Source's.
    const shape = corner?.shape ?? 'hairpin';
    const shapeDirection = corner?.shapeDirection ?? direction;
    const shapeText = p.cornerShape(shape, shapeDirection);
    const withShape = (plan: string) => (this.settings.cornerShape ? `${shapeText} ${plan}` : plan);
    // In the chosen style: sentences, or pace notes in short words.
    // Trail braking in the full plan where the reference brakes into the corner (the made-up La Source does).
    const trail = (variant: 'full' | 'short') => this.settings.trailCalls && variant === 'full' && (corner ? corner.trailBrake !== undefined : true);
    const planOf = (variant: 'full' | 'short') =>
      this.settings.planStyle === 'notes'
        ? `${p.cornerNotes({
            shape: this.settings.cornerShape ? shape : undefined,
            direction: shapeDirection,
            gears,
            curbIn: variant === 'full' ? curbIn : undefined,
            curbOut: variant === 'full' ? curbOut : undefined,
          })}${trail(variant) ? ` ${p.noteTrail}` : ''}`
        : withShape(`${trail(variant) ? `${p.planTrail} ` : ''}${p.cornerPlan(gears, curbIn, curbOut, variant)}`);
    const planFull = planOf('full');
    const planShort = planOf('short');
    // Corners without braking: the reference's own, else examples (Blanchimont flat, a lift right after a corner).
    const fastOf = (kind: 'flat' | 'lift') => this.reference?.fastCorners?.find((f) => f.kind === kind);
    const flat = fastOf('flat');
    const lift = fastOf('lift');
    const flatNote = flat ? fastNoteText(flat, p, this.settings) : p.fastNote({ kind: 'flat', direction: 'left', kmh: 245, curbIn: 'half', chained: false });
    const liftNote = lift ? fastNoteText(lift, p, this.settings) : p.fastNote({ kind: 'lift', direction: 'right', kmh: 125, curbOut: 'full', chained: true });
    const problems = describeProblems([{ kind: 'brake-early', meters: 20 }, { kind: 'slow-apex', kmh: 13 }], p);
    const tinyProblem = p.problemTiny({ kind: 'brake-early', meters: 20 });

    // Help before cheekiness: the feedback with a tip (and what the helping cue does), the cues, praise, a focus exercise.
    const helpProblem = { kind: 'brake-early', meters: 20 } as const;
    const helpTip = p.tip(helpProblem, corner?.apexSpeedKmh ?? 120);
    const helpLong = p.helpLong(1, describeProblems([helpProblem], p), helpTip);
    const helpAssisted = `${helpLong} ${p.helpAssistNote('wait')}`;
    const helpBetter = p.helpBetter(describeProblems([{ kind: 'brake-early', meters: 10 }], p));
    // Right after the corner: how much slower out of it, and what to try.
    const afterCorner = p.afterCorner(12, corner?.shape === 'chicane' ? 'chicane' : shapeDirection, p.tipTiny(helpProblem));

    // The whole braking zone: tone, announcement, plan, countdown, "jetzt", turn-in.
    const intro = `intro-${force}`;
    const sequence = async (token: { cancelled: boolean }) => {
      if (!voice) return;
      const planClipName = 'sample-plan';
      const planSeconds = await voice.prepare(planClipName, planFull);
      if (token.cancelled) return;
      let at = 0;
      const steps: [string, number][] = [['tone', at]];
      at += length('tone') + 0.15;
      steps.push([intro, at]);
      at += length(intro) + 0.3;
      steps.push([planClipName, at]);
      at += planSeconds + 0.35;
      steps.push(['count-3', at], ['count-2', at + step], ['count-1', at + 2 * step], ['now', at + 3 * step]);
      const now = at + 3 * step;
      if (this.settings.gearAfterNow) steps.push([`gear-${gears.entry}`, now + length('now') + 0.05]);
      steps.push([`turn-${direction}-sharp`, now + length('now') + (this.settings.gearAfterNow ? length(`gear-${gears.entry}`) + 0.4 : 0.6)]);
      await timeline(steps)(token);
    };

    // The crew talks on the radio (its own voice with the filter); without the crew, on the coach's.
    const crewVoice = this.voices.radio?.voice ?? voice;
    const sayCrew = (text: string) => async (token: { cancelled: boolean }) => {
      if (!crewVoice) return;
      const clip = `sample-crew-${this.sampleCount++ % 6}`;
      const seconds = await crewVoice.prepare(clip, text);
      if (token.cancelled) return;
      crewVoice.play(clip);
      await wait(seconds + 0.2, token);
    };
    const cp = this.voices.radio?.phrases ?? this.voices.phrases(this.voices.languageOf(this.settings, 'crew'));
    const crewSamples: [string, string][] = [
      ['crew-start', cp.crewRaceStart],
      ['crew-sector', cp.crewSector(1, -400, 1_200)],
      ['crew-lap', `${cp.crewLap(3, 96_100, 'new')} ${cp.crewPosition(4, 15, 2)}`],
      ['crew-lap-slower', `${cp.crewLap(4, 98_200, 2_100)} ${cp.crewPosition(4, 15, 0)}`],
      ['crew-position', cp.crewPosition(3, 15, 1)],
      ['crew-laps', cp.crewLapsLeft(3)],
      ['crew-fuel', cp.crewFuel({ lapsLeft: 4.6, perLap: 2.4, toFinish: false, pitLap: 7 })],
      ['crew-fuel-finish', cp.crewFuel({ lapsLeft: 9.2, perLap: 2.4, toFinish: true })],
      ['crew-tyres', cp.crewTyres({ lossS: 0.8, pitNow: true, withFuel: false })],
      ['crew-tyres-fuel', cp.crewTyres({ lossS: 0.6, pitNow: false, withFuel: true })],
      ['crew-hot', cp.crewTyreHot(0, 108)],
      ['crew-tyres-cold', cp.crewTyreState('cold')],
      ['crew-tyres-warm', cp.crewTyreState('warm')],
      ['crew-tyres-hot', cp.crewTyreState('hot')],
      ['crew-tyres-rising', cp.crewTyreTrend('rising', 96)],
      ['crew-tyres-falling', cp.crewTyreTrend('falling', 58)],
      ['crew-last', cp.crewLastLap],
      ['crew-finish', cp.crewFinish],
      ['crew-off-1', cp.crewOffTrack(1, 2) ?? ''],
      ['crew-off-2', cp.crewOffTrack(2, 4) ?? ''],
      ['crew-off-3', cp.crewOffTrack(3, 7) ?? ''],
      // Level 4: the race engineer quits (the team boss follows with his own voice), and is back later.
      ['crew-quit', cp.crewQuit() ?? ''],
      ['crew-comeback', cp.crewComeback(false) ?? ''],
    ];

    // The sound check always uses the name, so it can be heard.
    const me = (text: string) => (this.settings.driverName && text ? p.address(this.settings.driverName, text) : text);
    for (const sample of crewSamples) sample[1] = this.settings.driverName && sample[1] ? cp.address(this.settings.driverName, sample[1]) : sample[1];
    const bossLine = cp.bossIntro() ?? '';
    const bossIntro = this.settings.driverName && bossLine ? cp.address(this.settings.driverName, bossLine) : bossLine;
    // The team boss on his own voice (the stand-in's, in the crew's language), over the radio like the crew.
    const sayBoss = (text: string) => async (token: { cancelled: boolean }) => {
      const packId = this.voices.packId(this.settings, 'boss');
      const temporary = await this.voices.open({
        id: this.voices.resolve(this.settings, 'boss'),
        locale: cp.locale,
        clips: { line: text },
        role: 'standin',
        spoken: (line: string) => cp.spoken(line),
        channel: 'crew',
        effect: this.settings.radio ? 'radio' : undefined,
        recordings: packId ? this.voices.pack(packId) : undefined,
      });
      try {
        if (token.cancelled) return;
        temporary.play('line');
        await wait((temporary.durations.get('line') ?? 3) + 0.2, token);
      } finally {
        temporary.close();
      }
    };

    const remark = (level: 1 | 2 | 3, kind: 'brake-early' | 'slow-apex' | 'late-throttle', times: number) => me(p.remark(level, kind, zone, times) ?? '');
    // The cause right after it, the tip in the next quiet moment: here one after the other.
    const slideSample = (slide: Parameters<Phrases['slide']>[0]) => `${me(p.slide(slide))} ${p.slideTip(slide) ?? ''}`.trim();
    const raceSlide = cp.slide({ kind: 'spin', cause: 'brake-straight', pendulum: false });
    const slideSamples: [string, string][] = [
      ['slide-throttle', slideSample({ kind: 'spin', cause: 'throttle', pendulum: false })],
      ['slide-grass', slideSample({ kind: 'spin', cause: 'grass-throttle', offSurface: 'G', pendulum: false })],
      ['slide-brake', slideSample({ kind: 'slide', cause: 'brake', pendulum: false })],
      ['slide-pendulum', slideSample({ kind: 'spin', cause: 'curb-throttle', pendulum: true })],
      ['slide-race', this.settings.driverName ? cp.address(this.settings.driverName, raceSlide) : raceSlide],
    ];
    const relief = me(p.relief(zone) ?? '');
    const r1 = remark(1, 'brake-early', 2);
    const r2 = remark(2, 'slow-apex', 3);
    const r3 = remark(3, 'late-throttle', 5);

    // Absolute escalation: the coach quits, the stand-in (its own voice) takes over, the coach comes back.
    const quit = me(p.coachQuit() ?? '');
    const standIn = me(p.standInIntro() ?? '');
    const standInQuit = me(p.standInQuit() ?? '');
    const comeback = me(p.coachComeback(false) ?? '');
    // The cheeky extra mistake after the debrief's list, numbered after it.
    const debriefBonus = p.debriefBonus((this.settings.debriefZones || 4) + 1) ?? '';
    const sayStandIn = (text: string) => async (token: { cancelled: boolean }) => {
      const prepared = this.standInActive ? this.voice : this.standby;
      if (prepared) {
        const clip = `sample-standin-${this.sampleCount++ % 6}`;
        const seconds = await prepared.prepare(clip, text);
        if (token.cancelled) return;
        prepared.play(clip);
        await wait(seconds + 0.2, token);
        return;
      }
      const temporary = await this.voices.open({
        id: this.voices.resolve(this.settings, 'standin'),
        locale: p.locale,
        clips: { line: text },
        role: 'standin',
        spoken: this.speak,
        channel: 'coach',
        recordings: this.voices.recordings(this.settings, 'standin'),
      });
      try {
        if (token.cancelled) return;
        temporary.play('line');
        await wait((temporary.durations.get('line') ?? 3) + 0.2, token);
      } finally {
        temporary.close();
      }
    };
    const escalation = async (token: { cancelled: boolean }) => {
      await sayIt(quit)(token);
      if (!token.cancelled) await sayStandIn(standIn)(token);
    };

    return [
      { id: 'zone', group: 'corner', sequence: true, text: [p.brakeIntro(force), planFull, `${p.count(3)}, ${p.count(2)}, ${p.count(1)}, ${p.now}`, p.turn(direction, 'sharp')].join(' · '), play: sequence },
      { id: 'tone', group: 'corner', text: '', play: timeline([['tone', 0]]) },
      { id: 'intro-full', group: 'corner', text: p.brakeIntro('full'), play: timeline([['intro-full', 0]]) },
      { id: 'intro-40', group: 'corner', text: p.brakeIntro(40), play: timeline([['intro-40', 0]]) },
      { id: 'shape', group: 'corner', text: shapeText, play: sayIt(shapeText) },
      { id: 'plan-full', group: 'corner', text: planFull, play: sayIt(planFull) },
      { id: 'plan-short', group: 'corner', text: planShort, play: sayIt(planShort) },
      { id: 'countdown', group: 'corner', text: `${p.count(3)}, ${p.count(2)}, ${p.count(1)}, ${p.now}`, play: timeline([['count-3', 0], ['count-2', step], ['count-1', 2 * step], ['now', 3 * step]]) },
      { id: 'gear', group: 'corner', text: p.gear(gears.entry), play: timeline([[`gear-${gears.entry}`, 0]]) },
      { id: 'turn', group: 'corner', text: p.turn(direction, 'sharp'), play: timeline([[`turn-${direction}-sharp`, 0]]) },
      { id: 'note-flat', group: 'corner', text: flatNote, play: sayIt(flatNote) },
      { id: 'note-lift', group: 'corner', text: liftNote, play: sayIt(liftNote) },

      { id: 'feedback-long', group: 'feedback', text: me(p.feedbackLong(1, problems)), play: sayIt(me(p.feedbackLong(1, problems))) },
      { id: 'feedback-short', group: 'feedback', text: me(p.feedbackShort(1, problems)), play: sayIt(me(p.feedbackShort(1, problems))) },
      { id: 'feedback-tiny', group: 'feedback', text: p.feedbackTiny(1, tinyProblem), play: sayIt(p.feedbackTiny(1, tinyProblem)) },
      { id: 'feedback-after', group: 'feedback', text: me(afterCorner), play: sayIt(me(afterCorner)) },
      { id: 'feedback-intro', group: 'feedback', text: p.feedbackIntro(1), play: sayIt(p.feedbackIntro(1)) },
      { id: 'feedback-resolved', group: 'feedback', text: me(p.feedbackResolved(1)), play: sayIt(me(p.feedbackResolved(1))) },

      // Slides and spins (docs/dev/coach-and-texts.md): what started it and how to avoid it; in races the crew says only the cause.
      ...slideSamples.map(([id, text]) => ({ id, group: 'slides' as const, text, play: id === 'slide-race' ? sayCrew(text) : sayIt(text) })),

      { id: 'help-tip', group: 'help', text: me(helpLong), play: sayIt(me(helpLong)) },
      { id: 'help-tip-short', group: 'help', text: me(p.helpShort(1, helpTip)), play: sayIt(me(p.helpShort(1, helpTip))) },
      { id: 'help-tip-tiny', group: 'help', text: p.tipTiny(helpProblem), play: sayIt(p.tipTiny(helpProblem)) },
      { id: 'help-assist', group: 'help', text: me(helpAssisted), play: sayIt(me(helpAssisted)) },
      {
        id: 'help-wait',
        group: 'help',
        text: `${p.count(3)}, ${p.count(2)}, ${p.assistWait}, ${p.now}`,
        play: timeline([['count-3', 0], ['count-2', step], ['assist-wait', 2 * step], ['now', 3 * step]]),
      },
      { id: 'help-target', group: 'help', text: p.assistTarget(corner?.apexSpeedKmh ?? 120), play: sayIt(p.assistTarget(corner?.apexSpeedKmh ?? 120)) },
      { id: 'help-throttle', group: 'help', text: p.assistThrottle, play: timeline([['assist-throttle', 0]]) },
      { id: 'help-trail', group: 'help', text: p.assistTrail, play: timeline([['assist-trail', 0]]) },
      { id: 'help-release', group: 'help', text: p.assistRelease, play: timeline([['assist-release', 0]]) },
      ...(() => {
        // A big problem corner, called through the corner (docs/dev/coach-and-texts.md): the note, then from "eins" to "Gas!".
        const afterNow = step + length('now') + 0.05;
        const calls: [string, number][] = [['count-1', 0], ['now', step], [`gear-${gears.entry}`, afterNow], ['assist-trail', afterNow + 1]];
        const words = [p.count(1), p.now, p.gear(gears.entry), p.assistTrail];
        if (gears.exit !== gears.entry) {
          calls.push([`gear-${gears.exit}`, afterNow + 2.2]);
          words.push(p.gear(gears.exit));
        }
        calls.push(['assist-throttle', afterNow + 3]);
        words.push(p.assistThrottle);
        const note = me(p.feedbackGuide);
        const play = async (token: { cancelled: boolean }) => {
          await sayIt(note)(token);
          if (!token.cancelled) await timeline(calls)(token);
        };
        return [{ id: 'help-guide', group: 'help' as const, text: `${note} … ${words.join(', ')}`, play }];
      })(),
      { id: 'help-better', group: 'help', text: me(helpBetter), play: sayIt(me(helpBetter)) },
      { id: 'help-focus-start', group: 'help', text: me(p.focusStart(zone, 2)), play: sayIt(me(p.focusStart(zone, 2))) },
      { id: 'help-focus-done', group: 'help', text: me(p.focusDone(zone)), play: sayIt(me(p.focusDone(zone))) },
      { id: 'help-focus-end', group: 'help', text: me(p.focusEnd), play: sayIt(me(p.focusEnd)) },

      { id: 'lap-faster', group: 'lap', text: me(p.lapDelta(-1700)), play: sayIt(me(p.lapDelta(-1700))) },
      { id: 'lap-slower', group: 'lap', text: me(p.lapDelta(2300)), play: sayIt(me(p.lapDelta(2300))) },
      { id: 'lap-target', group: 'lap', text: me(p.lapDelta(20)), play: sayIt(me(p.lapDelta(20))) },
      { id: 'ghost-sector', group: 'lap', text: p.sectorGhost(1, 800), play: sayIt(p.sectorGhost(1, 800)) },

      ...(() => {
        const zoneText = `${p.briefingZone({ name: p.briefingZoneName(corner?.index ?? 1, zone), direction: corner?.shapeDirection ?? direction, shape: corner?.shape ?? 'hairpin', force, speed: Math.round((corner?.brakeSpeedKmh ?? 200) / 10) * 10, gears })} ${p.briefingLastTime(problems)}`;
        return [{ id: 'briefing-zone', group: 'briefing' as const, text: zoneText, play: sayIt(zoneText) }];
      })(),
      { id: 'briefing-end', group: 'briefing', text: p.briefingEnd, play: sayIt(p.briefingEnd) },
      { id: 'debrief-hint', group: 'briefing', text: p.debriefHint(this.settings.debriefZones || 4), play: sayIt(p.debriefHint(this.settings.debriefZones || 4)) },

      { id: 'debrief-intro', group: 'debrief', text: me(p.debriefIntro(this.settings.debriefZones || 4)), play: sayIt(me(p.debriefIntro(this.settings.debriefZones || 4))) },
      { id: 'debrief-zone', group: 'debrief', text: p.debriefZone(p.briefingZoneName(corner?.index ?? 1, zone), problems, 1.4), play: sayIt(p.debriefZone(p.briefingZoneName(corner?.index ?? 1, zone), problems, 1.4)) },
      { id: 'debrief-bonus', group: 'debrief', text: debriefBonus, play: sayIt(debriefBonus) },
      { id: 'debrief-end', group: 'debrief', text: p.debriefEnd, play: sayIt(p.debriefEnd) },

      { id: 'cheeky-1', group: 'cheeky', text: r1, play: sayIt(r1) },
      { id: 'cheeky-2', group: 'cheeky', text: r2, play: sayIt(r2) },
      { id: 'cheeky-3', group: 'cheeky', text: r3, play: sayIt(r3) },
      { id: 'cheeky-relief', group: 'cheeky', text: relief, play: sayIt(relief) },
      { id: 'cheeky-escalation', group: 'cheeky', sequence: true, text: quit && standIn ? `${quit} · ${standIn}` : '', play: escalation },
      { id: 'cheeky-quit', group: 'cheeky', text: quit, play: sayIt(quit) },
      { id: 'cheeky-standin', group: 'cheeky', text: standIn, play: sayStandIn(standIn) },
      { id: 'cheeky-standin-quit', group: 'cheeky', text: standInQuit, play: sayStandIn(standInQuit) },
      { id: 'cheeky-comeback', group: 'cheeky', text: comeback, play: sayIt(comeback) },

      ...crewSamples.map(([id, text]) => ({ id, group: 'crew' as const, text, play: sayCrew(text) })),
      { id: 'crew-boss', group: 'crew', text: bossIntro, play: sayBoss(bossIntro) },

      { id: 'reference-loaded', group: 'session', text: me(p.referenceLoaded(track, about)), play: sayIt(me(p.referenceLoaded(track, about))) },
      { id: 'reference-learned', group: 'session', text: me(p.referenceLearned(track, about)), play: sayIt(me(p.referenceLearned(track, about))) },
      { id: 'play-replay', group: 'session', text: me(p.playReplay), play: sayIt(me(p.playReplay)) },
      { id: 'other-car', group: 'session', text: p.otherCarNamed(about.car), play: sayIt(p.otherCarNamed(about.car)) },
    ].filter((s) => s.text !== '' || s.id === 'tone') as (SampleInfo & { play: (token: { cancelled: boolean }) => Promise<void> })[];
  }

  /** Speaks a sample with a voice and the role's speed and pitch, without changing any voice in use. */
  async previewVoice(id: string, role: VoiceRole): Promise<void> {
    const choices = this.voices.listed ?? (await this.voices.list());
    const choice = choices.find((v) => v.id === id && v.installed);
    if (!choice) throw new Error(`Voice "${id}" is not available`);
    const phrases = this.voices.phrases(choice.language.split('-')[0]!);
    const sample = `${phrases.brakeIntro('full')}. ${phrases.count(3)}, ${phrases.count(2)}, ${phrases.count(1)}, ${phrases.now}. ${phrases.gear(3)}.`;
    const voice = await this.voices.open({
      id,
      locale: phrases.locale,
      clips: { sample },
      role,
      spoken: this.speak,
      channel: role === 'crew' ? 'crew' : 'coach',
    });
    this.transientVoices.add(voice);
    this.voice?.stop();
    voice.play('sample');
    await sleep(((voice.durations.get('sample') ?? 3) + 0.5) * 1000);
    this.transientVoices.delete(voice);
    voice.close();
  }

  // --- Own texts (docs/dev/coach-and-texts.md "Own texts") ---

  /** Every spoken text of a language as the pack has it, and example values to show them with. */
  textCatalog(language: string): TextCatalog {
    const pack = this.voices.languages.get(language);
    const samples = textSamples(pack, FALLBACK_PACK);
    const entries = Object.keys(TEXT_KEYS).map((key): TextEntry => {
      const group = textGroup(key);
      return {
        key,
        group,
        kind: textKind(key),
        standard: pack.texts[key] ?? FALLBACK_PACK.texts[key] ?? '',
        placeholders: [...TEXT_KEYS[key]!],
        ...(usesOrdinals(key) ? { samples: samples.ordinals } : key === 'address' ? { samples: { name: this.settings.driverName || samples.values.driver! } } : {}),
        speaker: group === 'crew' ? 'crew' : 'coach',
      };
    });
    return { language: pack.id, groups: [...TEXT_GROUPS], quick: [...QUICK_TEXTS], samples: samples.values, entries };
  }

  /** What keeps an own text from being used, and hints; nothing is saved. */
  checkText(key: string, value: unknown, language: string): TextProblem[] {
    const pack = this.voices.languages.get(language);
    return checkOwnText(key, value, pack.texts[key] ?? FALLBACK_PACK.texts[key]).problems;
  }

  /** Speaks a text with the voice of who says it in that language, with its speed, pitch and recordings. */
  async previewText(text: string, language: string, speaker: 'coach' | 'crew'): Promise<void> {
    await this.voices.ensureListed();
    const phrases = this.voices.phrases(language);
    const settings = { ...this.settings, [speaker === 'crew' ? 'crewLanguage' : 'coachLanguage']: phrases.id };
    const recordings = this.voices.recordings(settings, speaker);
    const voice = await this.voices.open({
      id: this.voices.resolve(settings, speaker),
      locale: phrases.locale,
      clips: { sample: withFinalMark(text) },
      role: speaker,
      spoken: (t) => phrases.spoken(t),
      channel: speaker,
      ...(speaker === 'crew' && settings.radio ? { effect: 'radio' as const } : {}),
      ...(recordings ? { recordings } : {}),
    });
    this.transientVoices.add(voice);
    this.voice?.stop();
    voice.play('sample');
    await sleep(((voice.durations.get('sample') ?? 3) + 0.5) * 1000);
    this.transientVoices.delete(voice);
    voice.close();
  }

  // --- Recorded voices: the user's own recordings ---

  /** Everything worth recording in a pack's language, with what is recorded already. */
  recordingCatalog(id: string): RecordingCatalog {
    const pack = this.voicePacks.get(id);
    if (!pack) throw new Error('pack-unknown');
    const languagePack = this.voices.languages.list().find((p) => p.id === pack.language);
    if (!languagePack) throw new Error('pack-language-unknown');
    // The active track's corner names: remarks say them ("La Source läuft nicht weg").
    const corners = [...new Set((this.reference?.corners ?? []).map((c) => c.name).filter((name): name is string => !!name))];
    // With the user's own texts: those are what is said.
    const said = { ...languagePack, texts: { ...languagePack.texts, ...ownTexts(this.settings, languagePack.id) } };
    const entries = recordingCatalog(
      { pack: said, phrases: this.voices.phrases(pack.language), driverName: this.settings.driverName, corners },
      this.voicePacks.recordings(id),
    );
    return { pack, entries, textsVersion: languagePack.textsVersion ?? 1 };
  }

  /** A pack's recordings changed (or it was deleted): the voices using it put their clips together anew. */
  recordingsChanged(id: string): void {
    this.changedPacks.add(id);
    // Takes come quickly one after another while recording: once after the last one is enough.
    clearTimeout(this.recordingsTimer);
    this.recordingsTimer = setTimeout(() => {
      const ids = [...this.changedPacks];
      this.changedPacks.clear();
      for (const pack of ids) {
        this.refreshRecordings(pack);
        this.voices.recordingsChanged(pack);
      }
    }, RECORDINGS_REFRESH_MS);
  }

  /** Speaks sample sentences with a pack and the coach's voice for the pack's language (it says what the pack lacks). */
  async previewRecordingPack(id: string): Promise<void> {
    const pack = this.voicePacks.get(id);
    if (!pack) throw new Error('pack-unknown');
    const phrases = this.voices.phrases(pack.language);
    const settings = { ...this.settings, coachLanguage: pack.language };
    const name = settings.driverName;
    const sample = [name ? phrases.address(name, phrases.lapDelta(-1700)) : phrases.lapDelta(-1700), phrases.lapDelta(2300), phrases.brakeIntro('full')]
      .map(withFinalMark)
      .join(' ');
    if (!this.voices.listed) await this.voices.list();
    const voice = await this.voices.open({
      id: this.voices.resolve(settings, 'coach'),
      locale: phrases.locale,
      clips: { sample },
      role: 'coach',
      spoken: (text: string) => phrases.spoken(text),
      channel: 'coach',
      recordings: this.voices.pack(id, settings),
    });
    this.voice?.stop();
    voice.play('sample');
    await sleep(((voice.durations.get('sample') ?? 3) + 0.5) * 1000);
    voice.close();
  }

  /** The voices using a pack (without id: all voices with one) take its current recordings. */
  private refreshRecordings(id?: string): void {
    for (const voice of [this.voice, this.standby]) {
      const pack = voice?.recordingPack;
      if (!voice || !pack || (id && pack !== id)) continue;
      void voice.setRecordings(this.voices.pack(pack)).then(() => {
        if (voice === this.voice) this.takeDurations(voice);
      });
    }
  }

  // --- Voice ---

  private get coachVoice(): VoiceStatus {
    return this.status.voices.coach!;
  }

  private set coachVoice(status: VoiceStatus) {
    this.status.voices = { ...this.status.voices, coach: status };
  }

  /** Every voice reads the current language pack's pronunciations ("Curb" as "Körb"). */
  private readonly speak = (text: string): string => this.phrases?.spoken(text) ?? text;

  /** The name or its pauses changed: every voice puts the sentences with the name together anew. */
  private refreshAddress(): void {
    for (const voice of [this.voice, this.standby]) {
      void voice?.setAddress(this.voices.addressPauses()).then(() => {
        if (voice === this.voice) this.takeDurations(voice);
      });
    }
  }

  /** The prepared clips: the timing-critical words in the coach's language. */
  private buildClips(): Record<string, string> {
    return coachClips(this.phrases);
  }

  /** The driver's name in front of a sentence, in the coach's phrases unless others are given (ShellVoices.address). */
  private personal(text: string, important = false, phrases = this.phrases): string {
    return this.voices.address(text, important, phrases);
  }

  private async prepareVoice(): Promise<void> {
    const generation = ++this.voiceGeneration;
    this.endStandIn(false);
    this.voice?.close();
    this.voice = undefined;
    await this.voices.ensureListed();
    if (generation !== this.voiceGeneration) return;

    const id = this.voices.resolve(this.settings, 'coach');
    this.coachVoice = { id, name: this.voices.label(id), state: 'preparing', done: 0, total: Object.keys(this.clips).length };
    this.emitStatus();
    const open = (voiceId: string) =>
      this.voices.open({
        id: voiceId,
        locale: this.phrases.locale,
        clips: this.clips,
        role: 'coach',
        spoken: this.speak,
        channel: 'coach',
        recordings: this.voices.recordings(this.settings, 'coach'),
        onProgress: (done, total) => {
          if (generation !== this.voiceGeneration) return;
          this.coachVoice = { ...this.coachVoice, done, total };
          this.emitStatus();
        },
      });

    let voice: ClipVoice;
    try {
      voice = await open(id);
    } catch (err) {
      if (generation !== this.voiceGeneration) return;
      const message = (err as Error).message;
      this.log(`ERROR     voice ${id || 'default'}: ${message}`);
      this.activity({ kind: 'voice-error', message });
      if (!id) {
        this.coachVoice = { ...this.coachVoice, state: 'error', error: message };
        this.emitStatus();
        return;
      }
      // An optional voice failed: fall back to the Windows default so the coach still talks.
      try {
        voice = await open('');
      } catch (fallbackErr) {
        this.coachVoice = { ...this.coachVoice, state: 'error', error: (fallbackErr as Error).message };
        this.emitStatus();
        return;
      }
      this.coachVoice = { ...this.coachVoice, error: message };
    }
    if (generation !== this.voiceGeneration) {
      voice.close();
      return;
    }

    this.voice = voice;
    this.coachVoice = { ...this.coachVoice, name: voice.voiceName, engine: voice.engine, state: 'ready', done: undefined, total: undefined };
    this.useVoice(voice);
    const pack = voice.recordingPack ? this.voicePacks.get(voice.recordingPack) : undefined;
    // The pack by id: its name is often the speaker's own (logs stay anonymous).
    this.log(`VOICE     ${voice.voiceName}${pack ? ` with recordings ${pack.id.slice(0, 8)} (${pack.recordings})` : ''}, ${Object.keys(this.clips).length + 1} clips ready, intro up to ${this.durations.intro.toFixed(2)} s`);
    this.emitStatus();
    void this.prewarmLanguages(generation);
  }

  /**
   * Renders the coach's clips (cues, the reference's corner plans) for every other language
   * into the clip cache, one language after another. Clips already in the cache cost nothing, so this only
   * works once per voice setup. Stops when the voice or the session changes.
   */
  private async prewarmLanguages(generation: number): Promise<void> {
    await sleep(PREWARM_DELAY_MS);
    for (const pack of this.voices.languages.list()) {
      if (generation !== this.voiceGeneration || !this.status.running) return;
      if (pack.id === this.voices.languageOf(this.settings, 'coach')) continue;
      const settings = { ...this.settings, coachLanguage: pack.id };
      const phrases = this.voices.phrases(pack.id);
      const clips = { ...coachClips(phrases), ...(this.reference ? referenceClips(this.reference, phrases, settings) : {}) };
      const id = this.voices.resolve(settings, 'coach');
      const started = Date.now();
      try {
        const voice = await this.voices.open({
          id,
          locale: phrases.locale,
          clips,
          role: 'coach',
          spoken: (text: string) => phrases.spoken(text),
          channel: 'silent',
          recordings: this.voices.recordings(settings, 'coach'),
        });
        voice.close();
        this.session?.logToFile(`PREWARM ${pack.id}: ${Object.keys(clips).length} clips of ${id || 'Windows'} in the cache (${((Date.now() - started) / 1000).toFixed(0)} s)`);
      } catch (err) {
        this.session?.logToFile(`PREWARM   ${pack.id}: ${(err as Error).message}`);
      }
    }
  }

  /** Takes a voice's clip lengths for the cue timing; feedback and plan clips are rendered with it. */
  private useVoice(voice: ClipVoice): void {
    this.takeDurations(voice);
    // Feedback and plan clips were rendered with the previous voice.
    for (const feedback of this.coach?.activeFeedback ?? []) void this.prepareFeedback(feedback, false);
    void this.preparePlans();
  }

  /** The cue timing follows the clips' lengths (a recorded "jetzt" is longer or shorter than the voice's). */
  /** From one countdown number to the next with the long pause, as at a braking point with time to spare (docs/dev/coach-and-texts.md). */
  private get countdownStep(): number {
    return countStep({ countSeconds: this.durations.count, countPause: this.settings.countPause });
  }

  private takeDurations(voice: ClipVoice): void {
    this.durations = this.durationsFrom(voice, Object.keys(this.clips));
    this.coach?.updateSettings(coachSettingsFrom(this.settings, this.coachDurations()));
  }

  private durationsFrom(voice: ClipVoice, clips: string[]): ClipDurations {
    const duration = (clip: string) => voice.durations.get(clip) ?? 0;
    const longest = (prefix: string) => Math.max(...clips.filter((k) => k.startsWith(prefix)).map(duration));
    return {
      tone: duration('tone'),
      intro: longest('intro-'),
      now: duration('now'),
      gear: longest('gear-'),
      turnIn: longest('turn-'),
      count: longest('count-'),
    };
  }

  private play(clip: string): void {
    // Felt even when the voice is muted or missing: for a driver who cannot hear, this is the cue.
    this.feelClip(clip);
    // In races with corner calls the crew speaks the cues.
    const voice = this.raceCaller?.voice ?? this.voice;
    if (!voice) return;
    this.floor.occupy((voice.durations.get(clip) ?? 0) * 1000);
    if (!this.settings.mute) voice.play(clip);
  }

  private say(text: string): void {
    this.log(`SAY       "${text}"`);
    this.feel('message');
    if (!this.voice) return;
    // Rough length until the clip is rendered; sentences are ~0.07 s per character.
    this.floor.occupy(text.length * 70);
    if (!this.settings.mute) this.voice.say(text);
  }

  /** Accessibility: a cue to feel, at the moment it would be heard (also while muted). */
  private feel(cue: HapticCue, detail?: HapticDetail): void {
    this.emit('feel', cue, detail);
  }

  private feelClip(clip: string): void {
    const haptic = hapticForClip(clip, this.settings.tone);
    if (haptic) this.feel(haptic.cue, haptic);
  }

  // --- Connection ---

  /** GT7 sends (again): what the coach has, or what it needs. */
  private connected(): void {
    if (this.reference) this.say(this.personal(this.phrases.referenceLoaded(this.reference.track?.name ?? this.phrases.unknownTrack, this.aboutReference()), true));
    else this.say(this.personal(this.phrases.playReplay, true));
  }

  /** Every frame, once the telemetry has worked out its mode, driving and the car. */
  private onFrame(frame: TelemetryFrame): void {
    // While calibrating there is no coaching (no braking calls of its own); the telemetry learns nothing meanwhile.
    if (this.calibration) {
      this.calibrate(frame, frame.time);
      return;
    }
    if (this.driving && this.status.mode === 'practice') this.drivenInPractice = true;
    this.watchRace(frame);
    this.watchSlides(frame);
    // A reference for another track or class says nothing (its line can cross the track by chance); switched off
    // (module "coach"), the reference stays and nothing is said.
    if (this.coach && !this.telemetry.referenceLost && this.settings.coach) this.coachFrame(this.coach, frame);
    if (!(frame.flags & Flags.Paused)) this.floor.next();
  }

  /** The session's mode changed (the telemetry tells): after a race the race engineer is back for the next one. */
  private modeChanged(mode: SessionMode): void {
    this.drivenInPractice = false;
    this.activity({ kind: 'mode', mode });
    this.emitStatus();
  }

  /** Driving ends a briefing or debrief (the cues need the voice). */
  private drivingChanged(driving: boolean): void {
    if (driving && this.briefing) {
      this.cancelBriefing();
      this.log('BRIEFING  stopped, driving');
      this.activity({ kind: 'briefing-stopped' });
    }
    if (driving && this.debrief) {
      this.cancelDebrief();
      this.log('DEBRIEF   stopped, driving');
      this.activity({ kind: 'debrief-stopped' });
    }
    this.updateSpeechStatus();
  }

  /** The telemetry changed the reference: the coach starts afresh with it, or waits until one is learned. */
  private referenceChanged({ reference, file, why }: ReferenceEvent): void {
    // The memory of the one before goes next to its file first.
    this.saveHistoryNow();
    if (!reference || !file) {
      this.coach = undefined;
      this.status.zones = [];
      this.status.feedback = [];
      this.status.lap = 0;
      this.status.started = false;
      this.status.briefing = 'off';
      if (why === 'none-fits') this.emit('reference-changed', undefined);
      this.emitStatus();
      return;
    }
    // Picked while driving, mid-lap: the coach starts at once (the silent out lap is for leaving the pits).
    this.coachWith(reference, file, why === 'chosen', why === 'picked');
    const track = reference.track?.name ?? this.phrases.unknownTrack;
    if (why === 'learned') {
      this.activity({ kind: 'reference-learned', track: reference.track?.name, lapTime: this.status.reference!.lapTime });
      this.emit('reference-learned', this.status.reference!);
      this.say(this.personal(this.phrases.referenceLearned(track, this.aboutReference()), true));
    }
    if (why === 'picked') {
      this.emit('reference-changed', this.status.reference!);
      this.say(this.personal(this.phrases.referenceSwitched(track, this.aboutReference()), true));
    }
  }

  private coachFrame(coach: CoachSession, frame: TelemetryFrame): void {
    this.watchGt7LapTime(frame);
    for (const event of coach.update(frame)) this.handle(event);
    this.checkLapTime();
    // The debrief is about the solo reference: not in races (from the first race frame on).
    if (!this.inRace && detectMode(frame) !== 'race') this.checkDebrief(frame);
    if (this.status.lap !== coach.currentLap || this.status.started !== coach.isStarted) {
      this.status.lap = coach.currentLap;
      this.status.started = coach.isStarted;
      this.emitStatus();
    }
  }

  /**
   * Race or not, from GT7's data and without the reference: the crew is on the radio in races, the coach
   * is quiet there (unless asked for calls). Debounced like the coach: restarts briefly look like a replay.
   */
  private watchRace(frame: TelemetryFrame): void {
    if (frame.flags & (Flags.Paused | Flags.Loading)) return;
    // Corner calls on the crew's radio: its clips are prepared once the race starts, and handed back after it.
    const caller = this.inRace && !!this.voices.radio?.takesCalls && this.settings.coach && this.settings.raceCalls && !!this.coach;
    if (caller && !this.raceCaller) void this.startRaceCaller();
    else if (!caller && (this.raceCaller || this.raceCallerPreparing)) this.stopRaceCaller();
  }

  /**
   * Slides and spins (docs/dev/coach-and-texts.md; the user, 2026-10-28: the alpha testers miss why it happened): once the car is under
   * control again, the coach says what started it and how to avoid it; in races the crew says only the cause of a spin.
   */
  private watchSlides(frame: TelemetryFrame): void {
    // Practice and races; replays and menus have no CarOnTrack (the watcher skips them).
    const slide = this.slides.update(frame);
    const current = this.slides.current;
    if (current && current.maxDeg >= SLIDE_SAY_DEG && !this.slideDropped) {
      this.slideDropped = true;
      const corner = this.coach?.dropRun();
      if (corner) this.log(`CORNER    zone ${String(corner.index).padStart(2)} ${this.zoneLabel(corner.index)}: left out, the rear came`);
    }
    if (!slide) return;
    this.slideDropped = false;
    this.reportSlide(slide, frame.speed);
  }

  private reportSlide(slide: Slide, speed: number): void {
    const race = this.inRace;
    const radio = race ? this.voices.radio : undefined;
    const crew = !!radio;
    const phrases = radio?.phrases ?? this.phrases;
    const wanted =
      this.settings.slides && (crew || this.settings.coach) && (race ? this.settings.slidesInRace && slide.kind === 'spin' : slide.maxDeg >= SLIDE_SAY_DEG);
    const recent = Date.now() - this.slideSaidAt < SLIDE_SAY_GAP_MS;
    const cause = phrases.slide(slide);
    const text = this.personal(cause, false, phrases);
    // Races are no training: the cause, no tip.
    const tip = race ? undefined : phrases.slideTip(slide);
    const zone = this.zoneAt(slide);
    const steer = slide.steerDeg === undefined ? '' : `, steering ${Math.abs(slide.steerDeg)}° ${slide.steerDeg >= 0 ? 'left' : 'right'}`;
    this.log(
      `SLIDE     ${slide.kind} ${slide.maxDeg}° at ${slide.speedKmh} km/h, gear ${slide.gear}, throttle ${slide.throttle} %, brake ${slide.brake} %${steer},` +
        ` rear wheels ${slide.rearSpin >= 0 ? '+' : ''}${slide.rearSpin.toFixed(2)}/${slide.rearLock.toFixed(2)}${slide.surface ? `, surface ${slide.surface}` : ''}` +
        `${zone ? `, zone ${zone.index} ${zone.label}` : ''} → ${slide.cause}${slide.pendulum ? ', swung over' : ''}` +
        `${wanted ? (recent ? ' | not said, one was just said' : ` | "${text}"${tip ? ` "${tip}"` : ''}`) : ''}`,
    );
    this.activity({ kind: 'slide', slide: slide.kind, cause: slide.cause, maxDeg: slide.maxDeg, text: cause, zone: zone?.index, zoneLabel: zone?.label });
    if (!wanted || recent) return;
    this.slideSaidAt = Date.now();
    const role = crew ? 'crew' : 'coach';
    // Slow again after it (a spin, or a slide that took the speed): there is time to listen, cause and tip come right
    // away. The coach's quiet moments are counted at the reference's pace, so while the car stands they never come;
    // a countdown that does come cuts it off (a new clip stops the one playing).
    if (speed < SLIDE_SAY_NOW_SPEED) return void this.sayRightAway(tip ? `${text} ${tip}` : text, role);
    // Still fast (caught): the cause in the next quiet moment, the longer tip in one after that.
    void this.announce(text, SLIDE_MAX_AGE_MS, role);
    if (tip) void this.announce(tip, SLIDE_TIP_MAX_AGE_MS, role);
  }

  /** Says something now (a slide's cause): the next corner's announcements give way to it, as to a feedback after its corner. */
  private async sayRightAway(text: string, role: 'coach' | 'crew'): Promise<void> {
    const voice = role === 'crew' ? (this.voices.radio?.voice ?? this.voice) : this.voice;
    if (!voice) return;
    const clip = `now-${this.sayNowCount++ % 2}`;
    let seconds: number;
    try {
      seconds = await voice.prepare(clip, text);
    } catch (err) {
      this.log(`ERROR     ${(err as Error).message}`);
      return;
    }
    if (voice !== this.voice && voice !== this.voices.radio?.voice) return;
    this.log(`CUE       now      "${text}" (right away)`);
    this.floor.occupy(seconds * 1000);
    this.feedbackSpeaking = { until: Date.now() + (seconds + 0.2) * 1000, cornerIndex: -1 };
    this.feel('message');
    if (!this.settings.mute) voice.play(clip);
  }

  /** The braking zone a slide began in, if a reference is loaded and the car was on its line. */
  private zoneAt(slide: Slide): { index: number; label: string } | undefined {
    const corner = this.coach?.cornerAt(slide.x, slide.z);
    return corner && { index: corner.index, label: this.zoneLabel(corner.index) };
  }

  /** The crew takes the coach's cues: the cue words and corner plans in its language, rendered with the radio's voice. */
  private async startRaceCaller(): Promise<void> {
    const radio = this.voices.radio;
    const coach = this.coach;
    const reference = this.reference;
    if (!radio || !coach || !reference || this.raceCallerPreparing) return;
    this.raceCallerPreparing = true;
    const generation = ++this.raceCallerGeneration;
    const { voice, phrases } = radio;
    const clips = coachClips(phrases);
    const plans = new Map<number, PlanAudio>();
    const notes = new Map<number, NoteAudio>();
    try {
      for (const [name, text] of Object.entries(clips)) await voice.prepare(name, text);
      await this.renderPlans(voice, phrases, () => generation === this.raceCallerGeneration, {
        plan: (index, audio) => plans.set(index, audio),
        note: (index, audio) => notes.set(index, audio),
      });
    } catch (err) {
      this.log(`ERROR     crew corner calls: ${(err as Error).message}`);
      if (generation === this.raceCallerGeneration) this.raceCallerPreparing = false;
      return;
    }
    if (generation !== this.raceCallerGeneration) return;
    this.raceCallerPreparing = false;
    if (voice !== this.voices.radio?.voice || coach !== this.coach || !this.inRace) return;
    const durations = this.durationsFrom(voice, Object.keys(clips));
    this.raceCaller = { voice, phrases, clips, durations };
    coach.updateSettings(coachSettingsFrom(this.settings, durations));
    for (const [index, audio] of plans) coach.setPlanAudio(index, audio);
    for (const [index, audio] of notes) coach.setNoteAudio(index, audio);
    for (const feedback of coach.activeFeedback) void this.prepareFeedback(feedback, false);
    this.log(`CREW      calls the corners (${this.settings.raceCallsScope === 'all' ? 'every corner' : 'the biggest problem corners'})`);
  }

  /** After the race (or when switched off) the coach's voice and timing again. */
  private stopRaceCaller(): void {
    this.raceCallerGeneration++;
    this.raceCallerPreparing = false;
    if (!this.raceCaller) return;
    this.raceCaller = undefined;
    this.coach?.updateSettings(coachSettingsFrom(this.settings, this.durations));
    void this.preparePlans();
    for (const feedback of this.coach?.activeFeedback ?? []) void this.prepareFeedback(feedback, false);
    this.log('CREW      hands the corner calls back to the coach');
  }

  /** The coach's timing follows the voice that speaks the cues. */
  private coachDurations(): ClipDurations {
    return this.raceCaller?.durations ?? this.durations;
  }

  private get inRace(): boolean {
    return this.telemetry.mode === 'race';
  }

  /**
   * In races the coach is quiet unless the crew calls the corners (then the coach's cues go over the radio); switched off
   * always; and with a reference for another track or class it gets no frames (onFrame), so it cannot cue: asked for a
   * quiet moment then, it answered from stale frames and every sentence was dropped (the crew's radio, 2026-11-03).
   */
  private get coachQuiet(): boolean {
    return !this.settings.coach || this.telemetry.referenceLost || (this.inRace && !this.settings.raceCalls);
  }

  // --- Coaching ---

  /**
   * The coach with this reference from now on, a fresh session (the telemetry chose it). startNow: from here on,
   * without the silent out lap (picked while driving, docs/dev/telemetry.md).
   */
  private coachWith(ref: ReferenceLap, file: string, announce: boolean, startNow = false): void {
    if (ref.driver) this.playersSeen.add(ref.driver);
    this.stopRaceCaller();
    this.cancelBriefing();
    this.cancelDebrief();
    this.pendingLap = undefined;
    this.endStandIn(true);
    this.floor.clear();
    this.status.lastLap = undefined;
    this.mood = 0;
    this.streaks.clear();
    this.repeatsThisLap = 0;
    this.updateMood();
    const coachSettings = coachSettingsFrom(this.settings, this.durations);
    this.coach = new CoachSession(ref, startNow ? { ...coachSettings, waitForFirstLap: false } : coachSettings, this.phrases);
    this.coach.setSectors(this.settings.ghostSectors);
    this.loadHistory(file);
    // The race calls know the problem corners from earlier sessions before this one drives them.
    this.coach.setEarlierResults(this.history.corners);
    this.zoneResults.clear();
    this.latestProblems.clear();
    const summary = summarizeReference(ref, file);
    this.status.lap = 0;
    this.status.started = false;
    this.status.offReference = false;
    this.status.feedback = [];
    this.updateZones();
    this.updateSpeechStatus();
    this.log(
      `REFERENCE ${summary.track ?? 'unknown track'}, ${summary.carName ?? `car ${ref.carCode}`}${ref.carCategory ? ` (${ref.carCategory})` : ''}, ${summary.lapTime}` +
        `${ref.driver ? ` by ${ref.driver}` : ''}, ${ref.corners.length} braking zones`,
    );
    this.log(`ZONES     ${ref.corners.map((c) => `${c.index} ${cornerLabel(c, this.phrases)}`).join(' | ')}`);
    const fast = ref.fastCorners ?? [];
    if (fast.length) {
      const describe = (f: FastCorner) => `${fastCornerLabel(f, this.phrases)} ${f.kind === 'flat' ? 'flat' : `${f.kind === 'feather' ? 'feather' : 'lift'} to ${Math.round(f.minSpeedKmh)} km/h`}`;
      this.log(`FAST      ${fast.length} without braking: ${fast.map(describe).join(' | ')}`);
    }
    this.activity({ kind: 'reference-loaded', track: summary.track, lapTime: summary.lapTime });
    void this.preparePlans();
    if (announce && this.telemetry.live) {
      this.say(this.personal(this.phrases.referenceLoaded(ref.track?.name ?? this.phrases.unknownTrack, this.aboutReference()), true));
    }
    this.emitStatus();
  }

  private zoneLabel(index: number): string {
    const corner = this.reference?.corners.find((c) => c.index === index);
    return corner ? cornerLabel(corner, this.phrases) : String(index);
  }

  private updateZones(): void {
    const ref = this.reference;
    if (!ref) return;
    const feedbackByZone = new Map((this.coach?.activeFeedback ?? []).map((f) => [f.cornerIndex, f.number]));
    this.status.zones = ref.corners.map((c) => {
      const remembered = this.history.corners[String(c.index)];
      return {
        index: c.index,
        label: cornerLabel(c, this.phrases),
        turn: c.turn,
        name: c.name,
        brakeSpeedKmh: c.brakeSpeedKmh,
        apexSpeedKmh: c.apexSpeedKmh,
        brakeGear: c.brakeGear,
        apexGear: c.apexGear,
        entryGear: c.entryGear,
        midGear: c.midGear,
        exitGear: c.exitGear,
        curbIn: c.curbIn,
        curbOut: c.curbOut,
        curbInLevel: c.curbInLevel,
        curbOutLevel: c.curbOutLevel,
        force: brakeForce(c),
        trail: c.trailBrake !== undefined ? Math.round(c.trailBrake * 10) * 10 : undefined,
        direction: turnDirection(c),
        shape: c.shape,
        shapeDirection: c.shapeDirection,
        feedbackNumber: feedbackByZone.get(c.index),
        help: this.zoneHelp(c.index),
        last:
          this.zoneResults.get(c.index) ??
          (remembered
            ? { lossS: remembered.timeLossS, problems: describeProblems(remembered.problems, this.phrases), at: remembered.at, thisSession: false }
            : undefined),
      };
    });
    this.status.feedback = (this.coach?.activeFeedback ?? [])
      .map((f) => ({ number: f.number, zone: f.cornerIndex, zoneLabel: this.zoneLabel(f.cornerIndex), problems: describeProblems(f.problems, this.phrases) }))
      .sort((a, b) => a.number - b.number);
    const focus = this.coach?.focusExercise;
    this.status.focus = focus && { zone: focus.cornerIndex, zoneLabel: this.zoneLabel(focus.cornerIndex), lapsLeft: focus.lapsLeft };
  }

  /** The help for a corner's mistake that keeps coming, for the app (from the second time on). */
  private zoneHelp(cornerIndex: number): ZoneState['help'] {
    const help = this.coach?.helpFor(cornerIndex);
    if (!help || help.times < 2 || !this.settings.helpFirst) return undefined;
    const problem = this.latestProblems.get(cornerIndex)?.find((p) => p.kind === help.kind);
    return { step: help.step, problem: problem ? describeProblems([problem], this.phrases) : '', times: help.times };
  }

  private handle(event: CoachEvent): void {
    switch (event.type) {
      case 'cue': {
        const { cue } = event;
        const caller = this.raceCaller;
        const text =
          cue.kind === 'plan'
            ? this.planText(cue.corner, cue.plan ?? 'full', caller?.phrases)
            : cueText(cue, caller?.phrases ?? this.phrases, caller?.clips ?? this.clips);
        const label = this.zoneLabel(cue.corner.index);
        // A mistake's feedback still speaking: the next corner's announcements (tone, intro, plan) give way. The
        // countdown and "jetzt" never do; they have to come on time.
        const speaking = this.feedbackSpeaking;
        const announcement = cue.kind === 'tone' || cue.kind === 'intro' || cue.kind === 'plan';
        if (announcement && speaking && Date.now() < speaking.until && speaking.cornerIndex !== cue.corner.index) {
          this.log(`CUE       zone ${String(cue.corner.index).padStart(2)} ${label}: ${cue.kind.padEnd(8)} left out, feedback still speaking`);
          break;
        }
        this.log(`CUE       zone ${String(cue.corner.index).padStart(2)} ${label}: ${cue.kind.padEnd(8)} "${text}" ${cue.secondsToPoint.toFixed(2)} s before`);
        this.play(clipFor(cue));
        this.emit('cue', { at: Date.now(), zone: cue.corner.index, zoneLabel: label, kind: cue.kind, text });
        break;
      }
      case 'note': {
        // A corner without braking: its pace note, in the voice that speaks the cues.
        const caller = this.raceCaller;
        const corner = event.note;
        const label = this.fastLabel(corner);
        const text = fastNoteText(corner, caller?.phrases ?? this.phrases, this.settings, event.variant);
        // The lowest priority: anything still speaking (the feedback right after a corner, an announcement) goes first.
        if (Date.now() < this.floor.busyUntil - NOTE_OVERLAP_MS) {
          this.log(`NOTE      ${label}: left out, still speaking`);
          break;
        }
        this.log(`NOTE      ${label}: "${text}" ${event.secondsToPoint.toFixed(2)} s before`);
        this.play(noteClip(corner.index, event.variant));
        this.emit('cue', { at: Date.now(), zone: 0, zoneLabel: label, kind: 'note', text });
        break;
      }
      case 'corner-result': {
        const r = event.result;
        const brake = r.brakeDeltaM === undefined ? 'no brake' : `brake ${r.brakeDeltaM >= 0 ? '+' : ''}${r.brakeDeltaM.toFixed(0)} m`;
        rememberResult(this.history, r);
        this.saveHistorySoon();
        this.lastCornerResultAt = Date.now();
        const problems = describeProblems(r.problems, this.phrases);
        this.zoneResults.set(r.corner.index, {
          lossS: r.timeLossS,
          problems,
          at: new Date().toISOString(),
          thisSession: true,
          metrics: {
            brakeDeltaM: r.brakeDeltaM,
            apexKmh: r.apexSpeedKmh,
            refApexKmh: r.corner.apexSpeedKmh,
            gear: r.lowGear,
            refGear: lowestGear(r.corner),
            throttleDeltaM: r.throttleDeltaM,
            brakePercent: Math.round(r.peakBrake * 100),
            refBrakePercent: Math.round(r.corner.peakBrake * 100),
            turnInBrakePercent: r.brakeAtTurnIn !== undefined ? Math.round(r.brakeAtTurnIn * 100) : undefined,
            refTurnInBrakePercent: r.corner.trailBrake !== undefined ? Math.round(r.corner.trailBrake * 100) : undefined,
          },
        });
        this.log(
          `CORNER    zone ${String(r.corner.index).padStart(2)} ${this.zoneLabel(r.corner.index)}: ${r.timeLossS >= 0 ? '+' : ''}${r.timeLossS.toFixed(2)} s | ${brake},` +
            ` apex ${r.apexSpeedKmh.toFixed(0)} km/h (ref ${r.corner.apexSpeedKmh.toFixed(0)}), gear ${r.lowGear} (ref ${lowestGear(r.corner)})` +
            `${r.problems.length ? ` | ${problems}` : ''}`,
        );
        this.activity({
          kind: 'corner',
          zone: r.corner.index,
          zoneLabel: this.zoneLabel(r.corner.index),
          lossS: r.timeLossS,
          problems,
          brakeDeltaM: r.brakeDeltaM,
          apexKmh: r.apexSpeedKmh,
          refApexKmh: r.corner.apexSpeedKmh,
        });
        this.latestProblems.set(r.corner.index, r.problems);
        if (event.help) this.log(`HELP      zone ${String(r.corner.index).padStart(2)} ${this.zoneLabel(r.corner.index)}: ${event.help.kind} ${event.help.times}x, step ${event.help.step}${event.help.improved ? ', better' : ''}`);
        // Races are no training: no helping cues, no remarks and no mood about mistakes there.
        if (this.inRace) this.remarkCorner = undefined;
        else {
          this.prepareAssist(r.corner, event.help);
          this.trackRepeats(r, event.help);
        }
        this.updateZones();
        this.emitStatus();
        break;
      }
      case 'focus-started': {
        const label = this.zoneLabel(event.cornerIndex);
        const text = this.personal(this.phrases.focusStart(label, event.laps), true);
        this.log(`FOCUS     ${label} for ${event.laps} laps: "${text}"`);
        // The exercise takes the quiet moment after the corner (its feedback comes before the corner next lap).
        this.remarkCorner = event.cornerIndex;
        this.activity({ kind: 'help', event: 'focus-started', text, zone: event.cornerIndex, zoneLabel: label });
        void this.announce(text, REMARK_MAX_AGE_MS);
        this.updateZones();
        this.emitStatus();
        break;
      }
      case 'focus-ended': {
        const label = this.zoneLabel(event.cornerIndex);
        const text = this.personal(event.done ? this.phrases.focusDone(label) : this.phrases.focusEnd, event.done);
        this.log(`FOCUS     ${label} ${event.done ? 'done' : 'over'}: "${text}"`);
        if (event.done) {
          this.mood = Math.max(0, this.mood - RELIEF_MOOD);
          this.updateMood();
        }
        this.activity({ kind: 'help', event: event.done ? 'focus-done' : 'focus-ended', text, zone: event.cornerIndex, zoneLabel: label });
        void this.announce(text, REMARK_MAX_AGE_MS);
        this.updateZones();
        this.emitStatus();
        break;
      }
      case 'feedback-new':
      case 'feedback-updated': {
        const f = event.feedback;
        const problems = describeProblems(f.problems, this.phrases);
        this.log(`FEEDBACK  ${f.number} ${event.type === 'feedback-new' ? 'new' : 'updated'} for zone ${f.cornerIndex} ${this.zoneLabel(f.cornerIndex)}: ${problems}`);
        const focus = this.coach?.focusExercise;
        const focusElsewhere = !!focus && focus.cornerIndex !== f.cornerIndex;
        void this.prepareFeedback(f, event.justDriven && this.settings.immediateFeedback && this.remarkCorner !== f.cornerIndex && !focusElsewhere);
        this.activity({ kind: event.type, number: f.number, zone: f.cornerIndex, zoneLabel: this.zoneLabel(f.cornerIndex), problems });
        this.updateZones();
        this.emitStatus();
        break;
      }
      case 'feedback-resolved': {
        const f = event.feedback;
        this.log(`FEEDBACK  ${f.number} resolved (zone ${f.cornerIndex} ${this.zoneLabel(f.cornerIndex)})`);
        // In races the crew says it (it called the corner).
        if (this.raceCaller) this.sayOnRadio(this.raceCaller.phrases.feedbackResolved(f.number));
        // In the next quiet moment, not over the countdown of a corner close by.
        else void this.announce(this.personal(this.phrases.feedbackResolved(f.number)), RESOLVED_MAX_AGE_MS);
        this.activity({ kind: 'feedback-resolved', number: f.number, zone: f.cornerIndex, zoneLabel: this.zoneLabel(f.cornerIndex) });
        this.updateZones();
        this.emitStatus();
        break;
      }
      case 'new-lap':
        this.log(`LAP       ${event.lap}`);
        this.activity({ kind: 'lap', lap: event.lap });
        // A lap without repeated mistakes calms the coach down a little.
        if (event.lap > 1 && this.repeatsThisLap === 0 && this.mood > 0) {
          this.mood--;
          this.updateMood();
        }
        if (this.standInActive && !this.switchingVoice && --this.standInLapsLeft <= 0) {
          this.switchingVoice = true;
          this.takeOver(false);
        }
        this.repeatsThisLap = 0;
        if (this.status.focus) {
          this.updateZones();
          this.emitStatus();
        }
        // The lap that just ended; GT7's own time comes with the next packets.
        if (event.lapTimeMs !== undefined) {
          this.pendingLap = { lap: event.lap - 1, ownMs: event.lapTimeMs, at: Date.now() };
        }
        break;
      case 'coaching-started':
        this.log('START     first lap begins, coaching starts');
        this.activity({ kind: 'coaching-started' });
        break;
      case 'mode':
        // The runner tracks the mode itself (watchRace), also without a reference.
        break;
      case 'sector': {
        // Time trial and practice: the sector against the ghost (in races the crew reports).
        if (this.inRace) break;
        const gapMs = event.elapsedMs - event.refElapsedMs;
        const text = this.phrases.sectorGhost(event.sector, gapMs);
        this.log(`SECTOR    ${event.sector}/${event.sectors}: ${gapMs >= 0 ? '+' : ''}${(gapMs / 1000).toFixed(2)} s to the ghost "${text}"`);
        void this.announce(text, SECTOR_MAX_AGE_MS);
        break;
      }
      case 'off-reference':
        this.log(`OFF       ${event.offsetM.toFixed(0)} m away from the reference line, coach paused`);
        this.status.offReference = true;
        this.activity({ kind: 'off-reference', offsetM: event.offsetM });
        this.emitStatus();
        break;
      case 'back-on-reference':
        this.log('ON        back on the reference line');
        this.status.offReference = false;
        this.activity({ kind: 'back-on-reference' });
        this.emitStatus();
        break;
      case 'other-car': {
        const refCar = this.reference && referenceCarName(this.reference);
        const car = carName(event.carCode);
        this.log(`WARNING   car ${car ?? event.carCode} differs from the reference car ${refCar ?? this.reference?.carCode}`);
        this.status.otherCar = true;
        void this.announce(this.personal(refCar ? this.phrases.otherCarNamed(refCar) : this.phrases.otherCar), CAR_WARNING_MAX_AGE_MS);
        this.activity({ kind: 'other-car', carCode: event.carCode, car, refCar });
        this.emitStatus();
        break;
      }
    }
  }

  /** The reference's car and player for the spoken announcement. */
  private aboutReference(): { car?: string; driver?: string } | undefined {
    // "gefahren von Maldö" is not said to Maldö, and in streamer mode no other player's name either.
    const driver = this.reference?.driver === this.settings.driverName || this.settings.streamerMode ? undefined : this.reference?.driver;
    return this.reference && { car: referenceCarName(this.reference), driver };
  }

  /** The corner plan as spoken, in the chosen style (curbs only if the setting is on). */
  private planText(corner: Corner, variant: PlanVariant, phrases = this.phrases): string {
    return cornerPlanText(corner, variant, phrases, this.settings, this.reference ? chainedAfter(this.reference, corner) : [], this.reference ? chainFollowers(this.reference, corner) : []);
  }

  /**
   * Renders the reference's corner plans (full, short, and the shape alone for tight sections) and the pace notes
   * of its corners without braking, and reports each one's spoken length as soon as it is ready. Stops when
   * still() says the voice or the session changed meanwhile.
   */
  private async renderPlans(
    voice: ClipVoice,
    phrases: Phrases,
    still: () => boolean,
    ready: { plan?: (cornerIndex: number, audio: PlanAudio) => void; note?: (fastCornerIndex: number, audio: NoteAudio) => void } = {},
  ): Promise<void> {
    const reference = this.reference;
    if (!reference) return;
    for (const corner of reference.corners) {
      const clips = cornerPlanClips(corner, phrases, this.settings, chainedAfter(reference, corner), chainFollowers(reference, corner));
      if (clips.full === undefined || clips.short === undefined) break;
      const fullSeconds = await voice.prepare(planClip(corner.index, 'full'), clips.full);
      const shortSeconds = await voice.prepare(planClip(corner.index, 'short'), clips.short);
      const shapeSeconds = clips.shape !== undefined ? await voice.prepare(planClip(corner.index, 'shape'), clips.shape) : undefined;
      if (!still()) return;
      ready.plan?.(corner.index, { fullSeconds, shortSeconds, shapeSeconds });
    }
    if (!this.settings.fastCorners) return;
    for (const corner of reference.fastCorners ?? []) {
      const fullSeconds = await voice.prepare(noteClip(corner.index, 'full'), fastNoteText(corner, phrases, this.settings, 'full'));
      const shortSeconds = await voice.prepare(noteClip(corner.index, 'short'), fastNoteText(corner, phrases, this.settings, 'short'));
      if (!still()) return;
      ready.note?.(corner.index, { fullSeconds, shortSeconds });
    }
  }

  /** Renders every corner's plan and pace note with the coach's voice and tells the coach how long they are. */
  private async preparePlans(): Promise<void> {
    const voice = this.voice;
    const coach = this.coach;
    const reference = this.reference;
    if (!voice || !coach || !reference) return;
    try {
      await this.renderPlans(voice, this.phrases, () => voice === this.voice && coach === this.coach, {
        plan: (index, audio) => coach.setPlanAudio(index, audio),
        note: (index, audio) => coach.setNoteAudio(index, audio),
      });
      if (voice === this.voice && coach === this.coach) {
        this.session?.logToFile(`PLAN      clips ready for ${reference.corners.length} braking zones and ${reference.fastCorners?.length ?? 0} corners without braking`);
      }
    } catch (err) {
      this.log(`ERROR     corner plan audio: ${(err as Error).message}`);
    }
  }

  private fastLabel(corner: FastCorner): string {
    return fastCornerLabel(corner, this.phrases);
  }

  /**
   * Renders a feedback's clips and tells the coach how long they are.
   * sayNow: also say it right away (short or tiny version, whichever fits before the next cue).
   */
  private async prepareFeedback(feedback: FeedbackItem, sayNow: boolean): Promise<void> {
    // In races with corner calls the crew says it, in its language (only the mistake: no tips in races).
    const caller = this.raceCaller;
    const voice = caller?.voice ?? this.voice;
    const coach = this.coach;
    if (!voice || !coach) return;
    // In races only the mistake: no km/h with a tip right after the corner either.
    const texts = caller ? feedbackTexts(feedback.number, feedback.problems, caller.phrases) : feedback.texts;
    const personal = (text: string) => this.personal(text, false, caller?.phrases);
    let seconds: number[];
    try {
      seconds = await Promise.all([
        voice.prepare(feedbackClip(feedback, 'long'), personal(texts.long)),
        voice.prepare(feedbackClip(feedback, 'short'), personal(texts.short)),
        voice.prepare(feedbackClip(feedback, 'tiny'), texts.tiny),
        voice.prepare(feedbackClip(feedback, 'intro'), texts.intro),
        ...(texts.after ? [voice.prepare(feedbackClip(feedback, 'after'), personal(texts.after))] : []),
      ]);
    } catch (err) {
      this.log(`ERROR     feedback ${feedback.number} audio: ${(err as Error).message}`);
      return;
    }
    // The voice or the session may have changed meanwhile.
    if (voice !== (this.raceCaller?.voice ?? this.voice) || coach !== this.coach) return;
    const [longSeconds, shortSeconds, tinySeconds, introSeconds, afterSeconds] = seconds as [number, number, number, number, number | undefined];
    coach.setFeedbackAudio(feedback.cornerIndex, { version: feedback.version, longSeconds, shortSeconds, tinySeconds, introSeconds, afterSeconds });
    this.session?.logToFile(
      `FEEDBACK  ${feedback.number} audio ready: long ${longSeconds.toFixed(1)} s, short ${shortSeconds.toFixed(1)} s, tiny ${tinySeconds.toFixed(1)} s` +
        `${afterSeconds !== undefined ? `, after ${afterSeconds.toFixed(1)} s` : ''}`,
    );
    if (!sayNow) return;
    // The feedback goes before the pace notes of corners without braking (they give way to it).
    const quiet = coach.quietSeconds(false);
    // Out of the corner clearly slower: by how much, and what to try (the user's idea, 2026-10-20); else the mistake.
    const fits = (s: number | undefined) => s !== undefined && quiet >= s + ANNOUNCE_MARGIN_S;
    const variant = fits(afterSeconds) ? 'after' : fits(shortSeconds) ? 'short' : fits(tinySeconds) ? 'tiny' : undefined;
    if (variant) {
      this.log(`CUE       now      "${texts[variant]}" (right after the corner, ${quiet.toFixed(1)} s until the next cue)`);
      this.play(feedbackClip(feedback, variant));
      this.feedbackSpeaking = { until: Date.now() + ((voice.durations.get(feedbackClip(feedback, variant)) ?? 0) + 0.2) * 1000, cornerIndex: feedback.cornerIndex };
    } else {
      this.session?.logToFile(`FEEDBACK  ${feedback.number} not said right away: only ${quiet.toFixed(1)} s until the next cue`);
    }
  }

  // --- Memory: last result per braking zone, kept next to the reference file ---

  private loadHistory(referenceFile: string): void {
    this.historyFile = historyFileFor(referenceFile);
    try {
      this.history = validHistory(JSON.parse(fs.readFileSync(this.historyFile, 'utf8')));
      this.log(`HISTORY   ${Object.keys(this.history.corners).length} braking zones remembered from earlier sessions`);
    } catch {
      this.history = emptyHistory();
    }
  }

  /** The reference in use, by id (its file name): its memory is the coach's. */
  get activeReferenceId(): string | undefined {
    return this.referenceFile && path.basename(this.referenceFile, '.json');
  }

  /** The memory was deleted from outside (app): start from scratch. */
  forgetHistory(): void {
    clearTimeout(this.historySaveTimer);
    this.history = emptyHistory();
    this.coach?.setEarlierResults({});
    this.zoneResults.clear();
    this.updateZones();
    this.emitStatus();
  }

  private saveHistorySoon(): void {
    if (!this.historyFile) return;
    clearTimeout(this.historySaveTimer);
    const file = this.historyFile;
    const history = this.history;
    this.historySaveTimer = setTimeout(() => this.writeHistory(file, history), 2000);
  }

  private saveHistoryNow(): void {
    clearTimeout(this.historySaveTimer);
    if (this.historyFile && Object.keys(this.history.corners).length) this.writeHistory(this.historyFile, this.history);
  }

  /** Never for a reference deleted meanwhile; a failed write costs the memory of this run, not the session. */
  private writeHistory(file: string, history: CoachHistory): void {
    if (!fs.existsSync(file.replace(/\.history\.json$/i, '.json'))) return;
    try {
      writeFileAtomic(file, JSON.stringify(history, null, 1));
    } catch (err) {
      this.log(`ERROR     memory not saved: ${(err as Error).message}`);
    }
  }

  // --- Briefing: started in the app when the driver wants it; driving ends it (the cues need the voice) ---

  private updateSpeechStatus(): void {
    const coaching = this.settings.coach && !!this.coach && !!this.reference;
    const briefing: RunnerStatus['briefing'] =
      this.settings.briefing === 'off' || !coaching ? 'off' : this.briefing ? 'playing' : this.driving ? 'waiting' : 'available';
    const debrief: RunnerStatus['debrief'] =
      this.settings.debriefZones <= 0 || !coaching ? 'off' : this.debrief ? 'playing' : this.driving ? 'waiting' : 'available';
    if (briefing !== this.status.briefing || debrief !== this.status.debrief) {
      this.status.briefing = briefing;
      this.status.debrief = debrief;
      this.emitStatus();
    }
  }

  private cancelBriefing(): void {
    if (!this.briefing) return;
    this.briefing.cancelled = true;
    this.briefing = undefined;
    this.voice?.stop();
    this.updateSpeechStatus();
  }

  /** The briefing from the app: standing, in a menu, on the preparation screen or paused. */
  startBriefing(): void {
    if (this.status.briefing !== 'available') return;
    if (this.debrief) {
      this.cancelDebrief();
      this.activity({ kind: 'debrief-stopped' });
    }
    void this.runBriefing();
  }

  stopBriefing(): void {
    if (!this.briefing) return;
    this.cancelBriefing();
    this.log('BRIEFING  stopped in the app');
    this.activity({ kind: 'briefing-stopped' });
  }

  private async runBriefing(): Promise<void> {
    const reference = this.reference;
    const coach = this.coach;
    const voice = this.voice;
    if (!reference || !coach || !voice) return;
    const token = { cancelled: false };
    this.briefing = token;
    this.updateSpeechStatus();
    const scope = this.settings.briefing === 'all' || this.settings.briefing === 'problems' ? this.settings.briefing : 'auto';
    const sentences = buildBriefing(reference, this.history, coach.activeFeedback, this.phrases, scope);
    sentences[0] = this.personal(sentences[0]!, true);
    // The tip to stop and pull the handbrake: only when that starts the debrief (else its button is next to the briefing's).
    const withHint = this.settings.debriefZones > 0 && this.settings.debriefHandbrake && !this.debriefHintSaid;
    if (withHint) sentences.push(this.phrases.debriefHint(this.settings.debriefZones));
    this.log(`BRIEFING  started, ${sentences.length} parts`);
    this.activity({ kind: 'briefing-started' });
    const done = await this.speakSequence(voice, sentences, token, 'BRIEFING', (i) => {
      if (withHint && i === sentences.length - 1) this.debriefHintSaid = true;
    });
    if (!done && !token.cancelled) {
      // Failed (voice error): nothing is playing any more.
      this.briefing = undefined;
      this.updateSpeechStatus();
      return;
    }
    if (done) {
      this.log('BRIEFING  finished');
      this.activity({ kind: 'briefing-finished' });
      this.briefing = undefined;
      this.updateSpeechStatus();
    }
  }

  /**
   * Speaks sentences one after another (rendered just in time) until done or cancelled.
   * onPart runs when a part has been spoken. Returns true if every part was spoken.
   */
  private async speakSequence(
    voice: ClipVoice,
    sentences: string[],
    token: { cancelled: boolean },
    label: string,
    onPart: (index: number) => void = () => {},
  ): Promise<boolean> {
    try {
      for (let i = 0; i < sentences.length; i++) {
        const clip = `${label.toLowerCase()}-${i}`;
        const seconds = await voice.prepare(clip, sentences[i]!);
        if (token.cancelled) return false;
        this.log(`${label.padEnd(9)} "${sentences[i]}"`);
        if (i === 0) this.feel('message');
        if (!this.settings.mute) voice.play(clip);
        this.floor.occupy(seconds * 1000);
        const until = Date.now() + (seconds + 0.6) * 1000;
        while (Date.now() < until && !token.cancelled) await sleep(100);
        if (token.cancelled) return false;
        onPart(i);
      }
      return true;
    } catch (err) {
      this.log(`ERROR     ${label.toLowerCase()}: ${(err as Error).message}`);
      return false;
    }
  }

  // --- Debrief: the biggest mistakes, started in the app (the user, 2026-10-28: "nur manuell"), or with the handbrake ---

  private cancelDebrief(): void {
    if (!this.debrief) return;
    this.debrief.cancelled = true;
    this.debrief = undefined;
    this.voice?.stop();
    this.updateSpeechStatus();
  }

  /** The debrief from the app: standing, in a menu or paused. */
  startDebrief(): void {
    if (this.status.debrief !== 'available') return;
    if (this.briefing) {
      this.cancelBriefing();
      this.activity({ kind: 'briefing-stopped' });
    }
    void this.runDebrief(false);
  }

  stopDebrief(): void {
    if (!this.debrief) return;
    this.cancelDebrief();
    this.log('DEBRIEF   stopped in the app');
    this.activity({ kind: 'debrief-stopped' });
  }

  /**
   * The handbrake (if switched on): stopped with it pulled, in a time trial or free run after driving there. Never
   * while a race loads, in a race or after it (GT7 pulls the handbrake itself there).
   */
  private checkDebrief(frame: TelemetryFrame): void {
    if (!this.settings.debriefHandbrake || !this.coach || !this.reference || this.settings.debriefZones <= 0) return;
    const holding =
      (frame.flags & Flags.CarOnTrack) !== 0 && (frame.flags & Flags.Handbrake) !== 0 && !(frame.flags & Flags.Paused) && frame.speed < STOPPED_SPEED;
    if (!holding) {
      this.handbrakeSince = 0;
      this.debriefArmed = true;
      if (this.debrief?.handbrake) {
        this.cancelDebrief();
        this.log('DEBRIEF   stopped, handbrake released');
        this.activity({ kind: 'debrief-stopped' });
      }
      return;
    }
    if (!this.handbrakeSince) this.handbrakeSince = Date.now();
    if (this.status.mode !== 'practice' || !this.drivenInPractice) return;
    if (this.debrief || this.briefing || !this.debriefArmed || Date.now() - this.handbrakeSince < DEBRIEF_HOLD_MS) return;
    this.debriefArmed = false;
    void this.runDebrief(true);
  }

  private async runDebrief(handbrake: boolean): Promise<void> {
    const reference = this.reference;
    const voice = this.voice;
    if (!reference || !voice) return;
    const token = { cancelled: false, handbrake };
    this.debrief = token;
    this.updateSpeechStatus();
    const bonus = this.settings.style === 'cheeky' && this.settings.debriefBonus;
    const sentences = buildDebrief(reference, this.history, this.phrases, this.settings.debriefZones, bonus, handbrake);
    sentences[0] = this.personal(sentences[0]!, true);
    this.log(`DEBRIEF   started ${handbrake ? 'with the handbrake' : 'in the app'}, ${sentences.length} parts`);
    this.activity({ kind: 'debrief-started' });
    const done = await this.speakSequence(voice, sentences, token, 'DEBRIEF');
    if (token.cancelled) return;
    if (done) {
      this.log('DEBRIEF   finished');
      this.activity({ kind: 'debrief-finished' });
    }
    this.debrief = undefined;
    this.updateSpeechStatus();
  }

  // --- Lap time: GT7's time if it comes, else the own measurement; the difference is announced ---

  private watchGt7LapTime(frame: TelemetryFrame): void {
    const now = Date.now();
    // The first frame only shows what was there before (an older lap).
    if (this.lastGt7LapMs !== undefined && frame.lastLapMs > 0 && frame.lastLapMs !== this.lastGt7LapMs) this.gt7LapTime = { ms: frame.lastLapMs, at: now };
    this.lastGt7LapMs = frame.lastLapMs;
    const current = frame.currentLapMs;
    if (current === undefined) return;
    if (this.lastCurrentLapMs !== undefined && current < this.lastCurrentLapMs - 1000) this.gt7TimerLapTime = { ms: this.lastCurrentLapMs, at: now };
    this.lastCurrentLapMs = current;
  }

  /** Lap time: GT7's official one, else GT7's lap timer, else the own measurement (about 0.2 s less exact). */
  private checkLapTime(): void {
    const pending = this.pendingLap;
    if (!pending) return;
    const belongs = (value: { ms: number; at: number } | undefined) =>
      value && Math.abs(value.at - pending.at) <= LAP_TIME_WINDOW_MS && Math.abs(value.ms - pending.ownMs) <= LAP_TIME_TOLERANCE_MS ? value : undefined;
    const official = belongs(this.gt7LapTime);
    if (!official && Date.now() - pending.at < LAP_TIME_WAIT_MS) return;
    this.pendingLap = undefined;
    const timer = belongs(this.gt7TimerLapTime);
    if (official) this.lapTimed(pending.lap, official.ms, 'GT7');
    else if (timer) this.lapTimed(pending.lap, timer.ms, 'GT7 timer');
    else this.lapTimed(pending.lap, pending.ownMs, 'own');
  }

  private lapTimed(lap: number, timeMs: number, source: string): void {
    const ref = this.reference;
    // The target time belongs to the solo reference: in races the crew reports the lap.
    if (!ref || this.inRace) return;
    const target = ref.targetTimeMs ?? ref.lapTimeMs;
    const deltaMs = timeMs - target;
    const time = formatLapTime(timeMs);
    this.status.lastLap = { lap, timeMs, time, deltaMs };
    this.log(`LAPTIME   lap ${lap}: ${time} (${source}), ${deltaMs >= 0 ? '+' : ''}${(deltaMs / 1000).toFixed(3)} s to the target ${formatLapTime(target)}`);
    this.activity({ kind: 'lap-time', lap, time, deltaMs });
    this.emitStatus();
    if (this.settings.lapDelta) void this.announce(this.personal(this.phrases.lapDelta(deltaMs)), ANNOUNCEMENT_MAX_AGE_MS, 'coach', undefined, deltaMs <= 0 ? 'faster' : 'slower');
  }

  // --- Coach style: remarks on repeated mistakes, escalating; relief when they are fixed ---

  private trackRepeats(r: CornerResult, help?: CornerHelp): void {
    const index = r.corner.index;
    this.remarkCorner = undefined;
    const label = this.zoneLabel(index);
    const previous = this.streaks.get(index);
    const repeated = previous ? r.problems.find((p) => previous.kinds.has(p.kind)) : undefined;
    const cheeky = this.settings.style === 'cheeky';

    if (repeated) {
      const times = previous!.times + 1;
      this.streaks.set(index, { kinds: new Set(r.problems.map((p) => p.kind)), times });
      // Help before cheekiness (docs/dev/coach-and-texts.md): progress gets praise; while the coach still helps (tip,
      // helping cue, focus exercise), or works on another corner with the driver, a repeat costs no patience.
      if (help?.improved && this.settings.helpFirst) return this.praise(r, help, label);
      if (this.helping(index, help)) return;
      this.mood++;
      this.repeatsThisLap++;
      this.updateMood();
      if (!cheeky || Date.now() - this.lastRemarkAt < REMARK_GAP_MS) return;
      if (this.quit(index, label)) return;
      const level = Math.max(1, this.moodLevel()) as 1 | 2 | 3;
      const remark = this.phrases.remark(level, repeated.kind, label, times);
      if (!remark) return;
      const text = this.personal(remark, level === 3);
      this.lastRemarkAt = Date.now();
      // The driver knows the mistake by now: the remark takes the quiet moment after the corner.
      this.remarkCorner = index;
      this.log(`REMARK    level ${level}, ${times} times ${repeated.kind} in ${label}: "${text}"`);
      this.activity({ kind: 'remark', text, level, zone: index, zoneLabel: label });
      void this.announce(text, REMARK_MAX_AGE_MS);
      return;
    }
    if (r.problems.length) {
      this.streaks.set(index, { kinds: new Set(r.problems.map((p) => p.kind)), times: 1 });
      return;
    }
    // Clean: if this corner went wrong several times in a row, that is worth a word.
    this.streaks.delete(index);
    if (!previous || previous.times < 2) return;
    this.mood = Math.max(0, this.mood - RELIEF_MOOD);
    this.updateMood();
    const reliefText = cheeky ? this.phrases.relief(label) : undefined;
    if (!reliefText) return;
    const text = this.personal(reliefText, true);
    this.log(`REMARK    relief in ${label}: "${text}"`);
    this.activity({ kind: 'remark', text, level: 0, zone: index, zoneLabel: label });
    void this.announce(text, REMARK_MAX_AGE_MS);
  }

  /** The coach still helps with this corner's mistake, or a focus exercise runs on another corner. */
  private helping(cornerIndex: number, help?: CornerHelp): boolean {
    if (!this.settings.helpFirst) return false;
    const focus = this.coach?.focusExercise;
    if (focus && focus.cornerIndex !== cornerIndex) return true;
    return !!help && help.step !== 'exhausted';
  }

  /** The mistake came again, but clearly smaller: a word of praise, and the coach calms down a little. */
  private praise(r: CornerResult, help: CornerHelp, label: string): void {
    this.mood = Math.max(0, this.mood - 1);
    this.updateMood();
    const problem = r.problems.find((p) => p.kind === help.kind);
    if (!problem || Date.now() - this.lastRemarkAt < REMARK_GAP_MS) return;
    const text = this.personal(this.phrases.helpBetter(describeProblems([problem], this.phrases)));
    this.lastRemarkAt = Date.now();
    // Said instead of the feedback right after the corner.
    this.remarkCorner = r.corner.index;
    this.log(`HELP      better in ${label}: "${text}"`);
    this.activity({ kind: 'help', event: 'better', text, zone: r.corner.index, zoneLabel: label });
    void this.announce(text, REMARK_MAX_AGE_MS);
  }

  /**
   * The target speed for a corner's helping cue is a clip of its own ("Scheitel 120"): rendered as soon as the
   * help has a tip, so it is ready when the cue comes one run later.
   */
  private prepareAssist(corner: Corner, help?: CornerHelp): void {
    const voice = this.voice;
    if (!voice || !help || help.step === 'feedback' || !this.settings.helpFirst || !this.settings.helpAssists) return;
    if (help.kind !== 'slow-apex' && help.kind !== 'fast-apex') return;
    const clip = assistTargetClip(corner.index);
    if (voice.durations.has(clip)) return;
    voice.prepare(clip, this.phrases.assistTarget(corner.apexSpeedKmh)).catch((err: Error) => this.log(`ERROR     helping cue audio: ${err.message}`));
  }

  /** The level of the voice coaching right now (a stand-in starts relaxed). */
  private moodLevel(): 0 | 1 | 2 | 3 {
    const [annoyed, lostIt] = PATIENCE[this.settings.patience];
    return this.mood === 0 ? 0 : this.mood < annoyed ? 1 : this.mood < lostIt ? 2 : 3;
  }

  private updateMood(): void {
    const level = this.moodLevel();
    // Lost it: the stand-in gets ready, so it can take over without a silent gap.
    if (level === 3 && this.canQuit()) void this.prepareStandIn();
    const mood: CoachMood = this.standInActive ? 4 : level;
    if (mood !== this.status.mood) {
      this.status.mood = mood;
      this.emitStatus();
    }
  }

  // --- Absolute escalation: the coach quits, a stand-in with another voice takes over for a few laps ---

  /** Cheeky style with quitting on, and a stand-in that sounds different (another voice or other recordings). */
  private canQuit(): boolean {
    const s = this.settings;
    return s.style === 'cheeky' && s.coachQuits && (this.voices.resolve(s, 'standin') !== this.voices.resolve(s, 'coach') || this.voices.packId(s, 'standin') !== this.voices.packId(s, 'coach'));
  }

  /** Renders the stand-in's cue clips and corner plans in the background, while the coach keeps talking. */
  private async prepareStandIn(): Promise<void> {
    if (this.standby || this.standbyPreparing || this.standInActive || !this.voice) return;
    const generation = ++this.standbyGeneration;
    this.standbyPreparing = true;
    const id = this.voices.resolve(this.settings, 'standin');
    this.status.voices = { ...this.status.voices, standin: { id, name: this.voices.label(id), state: 'preparing' } };
    this.emitStatus();
    let voice: ClipVoice | undefined;
    try {
      voice = await this.voices.open({
        id,
        locale: this.phrases.locale,
        clips: this.clips,
        role: 'standin',
        spoken: this.speak,
        channel: 'coach',
        recordings: this.voices.recordings(this.settings, 'standin'),
      });
      // The corner plans and pace notes too: the stand-in takes over every cue.
      const reference = this.reference;
      if (reference) {
        for (const [clip, text] of Object.entries(referenceClips(reference, this.phrases, this.settings))) {
          if (generation !== this.standbyGeneration) break;
          await voice.prepare(clip, text);
        }
      }
    } catch (err) {
      voice?.close();
      if (generation !== this.standbyGeneration) return;
      this.standbyPreparing = false;
      const message = (err as Error).message;
      this.log(`ERROR     stand-in voice ${id || 'default'}: ${message}`);
      this.status.voices = { ...this.status.voices, standin: { id, name: id, state: 'error', error: message } };
      this.emitStatus();
      return;
    }
    if (generation !== this.standbyGeneration) {
      voice.close();
      return;
    }
    this.standbyPreparing = false;
    this.standby = voice;
    this.status.voices = { ...this.status.voices, standin: { id, name: voice.voiceName, engine: voice.engine, state: 'ready' } };
    this.log(`STAND-IN  voice ${voice.voiceName} ready`);
    this.emitStatus();
  }

  /**
   * The last straw: the voice coaching right now quits with a line, then the other one takes over. False if
   * it is not time yet, or the stand-in is still being prepared (then a normal remark comes).
   */
  private quit(zone: number, zoneLabel: string): boolean {
    if (this.mood < PATIENCE[this.settings.patience][2] || this.switchingVoice || !this.canQuit()) return false;
    if (!this.standby) {
      void this.prepareStandIn();
      return false;
    }
    const early = this.standInActive;
    const line = early ? this.phrases.standInQuit() : this.phrases.coachQuit();
    if (!line) return false;
    const text = this.personal(line, true);
    this.switchingVoice = true;
    this.lastRemarkAt = Date.now();
    this.remarkCorner = zone;
    this.log(`QUIT      ${early ? 'stand-in' : 'coach'}: "${text}"`);
    this.activity({ kind: 'remark', text, level: 4, zone, zoneLabel });
    void this.announce(text, QUIT_MAX_AGE_MS, 'coach', () => this.takeOver(early));
    return true;
  }

  /**
   * The waiting voice takes over all cues and says so: the stand-in introduces itself, or the coach is back
   * (early: the stand-in quit too).
   */
  private takeOver(early: boolean): void {
    if (!this.switchingVoice) return;
    this.switchingVoice = false;
    if (!this.swapVoices()) return;
    let line: string | undefined;
    if (this.standInActive) {
      this.mood = 0;
      this.standInLapsLeft = this.settings.standInLaps;
      line = this.phrases.standInIntro();
    } else {
      this.mood = COMEBACK_MOOD;
      line = this.phrases.coachComeback(early);
    }
    this.updateMood();
    this.emitStatus();
    if (!line) return;
    const text = this.personal(line, true);
    this.log(`TAKEOVER  ${this.standInActive ? 'stand-in' : 'coach'}: "${text}"`);
    this.activity({ kind: 'remark', text, level: this.standInActive ? 4 : 0, zone: 0, zoneLabel: '' });
    void this.announce(text, ANNOUNCEMENT_MAX_AGE_MS);
  }

  /** Swaps the coaching voice with the waiting one. False if one of them is missing. */
  private swapVoices(): boolean {
    const current = this.voice;
    const next = this.standby;
    if (!current || !next) return false;
    this.voice = next;
    this.standby = current;
    this.standInActive = !this.standInActive;
    // Waiting sentences in the voice that just left would sound wrong now.
    this.floor.drop(current);
    this.useVoice(next);
    return true;
  }

  /**
   * Forgets the stand-in (new session, settings changed, voice changed). swapBack: the coach takes over again
   * first, without a word; otherwise the caller closes the coaching voice itself.
   */
  private endStandIn(swapBack: boolean): void {
    if (swapBack && this.standInActive) this.swapVoices();
    this.standInActive = false;
    this.switchingVoice = false;
    this.standbyGeneration++;
    this.standbyPreparing = false;
    this.standby?.close();
    this.standby = undefined;
    if (this.status?.voices.standin) this.status.voices = { ...this.status.voices, standin: undefined };
    if (this.status && this.status.mood === 4) this.updateMood();
  }

  /** Renders a sentence now and plays it at the next quiet moment (never over a cue). */
  /** done: called once the sentence has been spoken (or dropped, or failed). */
  /** haptic: what the driver feels when it is said. */
  private async announce(text: string, maxAgeMs = ANNOUNCEMENT_MAX_AGE_MS, role: 'coach' | 'crew' = 'coach', done?: () => void, haptic: HapticCue = 'message'): Promise<void> {
    const voice = role === 'crew' ? (this.voices.radio?.voice ?? this.voice) : this.voice;
    if (!voice) return done?.();
    const clip = `announce-${this.announcementCount++ % 6}`;
    try {
      const seconds = await voice.prepare(clip, text);
      if (voice !== this.voice && voice !== this.voices.radio?.voice) return done?.();
      this.floor.announce({ text, seconds, until: Date.now() + maxAgeMs, speaker: voice, haptic, done, play: () => voice.play(clip) });
    } catch (err) {
      this.log(`ERROR     announcement: ${(err as Error).message}`);
      done?.();
    }
  }

  /** The race calls' word for a corner that is fixed now, on the radio like the crew's reports. */
  private sayOnRadio(message: string): void {
    const text = this.voices.address(message, false, this.voices.radio?.phrases ?? this.phrases);
    this.log(`CREW      "${text}"`);
    this.activity({ kind: 'crew', text });
    void this.announce(text, CREW_STRATEGY_MAX_AGE_MS, 'crew');
  }

  // --- Language packs ---

  private loadLanguagePacks(): void {
    const dir = this.dirs.languagePacks;
    this.packWarnings = [];
    if (!dir || !fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const { pack, warnings } = validateLanguagePack(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
        if (pack) this.voices.languages.add(pack);
        for (const w of warnings) this.packWarnings.push(`${file}: ${w}`);
      } catch (err) {
        this.packWarnings.push(`${file}: ${(err as Error).message}`);
      }
    }
  }

  // --- Output ---

  /**
   * What the log hides (docs/dev/security.md): the driver's name, the players of this session's references, the
   * PlayStation's name and the app's folders and the home folder; IP addresses and e-mail addresses go anyway.
   */
  private logPrivacy(): LogPrivacy {
    const consoleName = this.telemetry.consoleName;
    return {
      names: [
        { value: this.settings.driverName, as: '<driver>' },
        ...[...this.playersSeen, this.reference?.driver ?? ''].map((value) => ({ value, as: '<player>' })),
        { value: consoleName && consoleName !== 'PlayStation' ? consoleName : '', as: '<console>' },
      ],
      paths: [
        { value: this.dirs.references, as: '<references>' },
        { value: this.dirs.sessions, as: '<sessions>' },
        { value: this.dirs.voices, as: '<voices>' },
        { value: this.dirs.voiceCache, as: '<voice-cache>' },
        { value: this.dirs.voicePacks ?? '', as: '<voice-packs>' },
        { value: this.dirs.languagePacks ?? '', as: '<language-packs>' },
        { value: os.homedir(), as: '<home>' },
      ],
    };
  }

  /**
   * This session's log for a GitHub issue: written anonymously already, cleaned once more here with what is known
   * now (a name set after a line was written). Undefined while no session runs.
   */
  anonymousLog(): string | undefined {
    if (!this.session) return undefined;
    const file = `${this.session.baseName}.log`;
    if (!fs.existsSync(file)) return undefined;
    const privacy = this.logPrivacy();
    return fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => anonymize(line, privacy))
      .join('\n');
  }

  /** Writes to the session log (and the console, if echo is on). */
  log(line: string): void {
    if (this.session) this.session.log(line);
    else if (this.echo) console.log(line);
    this.emit('log', line);
  }

  /** One entry in the timeline (one for every module). */
  activity(body: ActivityBody): void {
    this.emit('activity', { ...body, id: ++this.activityId, at: Date.now() });
  }

  /** Coalesced: at most every STATUS_INTERVAL_MS. */
  private emitStatus(): void {
    if (this.statusTimer) return;
    this.statusTimer = setTimeout(() => {
      this.statusTimer = undefined;
      this.emit('status', this.status);
    }, STATUS_INTERVAL_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The coach's memory as written by the app: a hand-edited or broken file loses its odd entries, it never reaches the
 * briefing as something else (release check 2026-10-28).
 */
function validHistory(raw: unknown): CoachHistory {
  const history = emptyHistory();
  const corners = raw && typeof raw === 'object' ? (raw as { corners?: unknown }).corners : undefined;
  if (!corners || typeof corners !== 'object' || Array.isArray(corners)) return history;
  const isProblem = (value: unknown): value is Problem =>
    !!value &&
    typeof value === 'object' &&
    Object.entries(value).every(([key, field]) => (key === 'kind' ? typeof field === 'string' : typeof field === 'number' && Number.isFinite(field)));
  for (const [key, memory] of Object.entries(corners as Record<string, Partial<CornerMemory>>)) {
    if (!/^\d{1,4}$/.test(key) || !memory || typeof memory !== 'object' || !Array.isArray(memory.problems)) continue;
    if (typeof memory.timeLossS !== 'number' || !Number.isFinite(memory.timeLossS) || typeof memory.at !== 'string') continue;
    history.corners[key] = { problems: memory.problems.filter(isProblem), timeLossS: memory.timeLossS, at: memory.at };
  }
  return history;
}
