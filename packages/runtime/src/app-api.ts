// Contract between the desktop app's main process and its UI (window.gtt): the shell's part and, until they have moved
// into their folders, the modules still inside the runner (docs/dev/modules.md). The modules that moved bring their own
// (modules/<id>/src/api.ts). Types (and a few constants) only, importing only the shared types of the shell's contract
// (packages/core/src/api.ts): the Angular UI compiles this file with its own TypeScript version.

import type { ModuleState, Unsubscribe } from '@gt-toolz/core/api';

export type { ModuleState, Unsubscribe };

/**
 * The product name, in one place (window title, installer, UI). Renaming it: docs/dev/architecture.md, section
 * "Name".
 */
export const PRODUCT_NAME = 'GT Toolz';
/** Who makes it, next to the name: title bar, window title, welcome, about. Never in folder or process names. */
export const PRODUCT_BYLINE = 'by Maldö';

// --- Connection ---

export type PacketType = 'A' | 'B' | '~' | 'C';
export type Stage = 'ps5' | 'gt7' | 'live' | 'error';

export interface ConnectionStatus {
  stage: Stage;
  /** The PlayStation, once found. */
  console?: { name: string; address: string; app?: string };
  packetType: PacketType;
  /** Seconds until the next search, while counting down. */
  retryIn?: number;
  /** For stage 'error'. */
  error?: 'port-in-use';
}

// --- Settings ---

export type BriefingSetting = 'auto' | 'all' | 'problems' | 'off';
/** Which corners the crew calls in races: every one, or only problem corners (feedback or a mistake last time). */
export type RaceCallsScope = 'all' | 'mistakes';
/**
 * How the corner plan is said: sentences ("Rein im zweiten Gang, Curb innen halb."), or pace notes in short words
 * ("Haarnadel rechts, Gang zwei, Curb halb."), docs/dev/coach-and-texts.md.
 */
export type PlanStyle = 'sentences' | 'notes';
/** always: the name in every spoken sentence; sometimes: in greetings and big moments, else now and then. */
export type Addressing = 'always' | 'sometimes';
/** neutral: only facts. cheeky: remarks when the same mistake comes again, escalating up to losing it. */
export type CoachStyle = 'neutral' | 'cheeky';

/**
 * How much a role says (the user, 2026-10-25: "Ansagen begrenzen"). 'much': everything the single settings allow;
 * 'normal': without the chattiest calls; 'little': the essentials only. Braking calls always stay.
 */
export type TalkLevel = 'much' | 'normal' | 'little';
/** How fast the cheeky coach gets annoyed. */
export type Patience = 'high' | 'normal' | 'low';
/** 0 relaxed, 1 amused, 2 annoyed, 3 lost it, 4 quit: a stand-in with another voice coaches. */
export type CoachMood = 0 | 1 | 2 | 3 | 4;

export interface CrewSector {
  sector: number;
  /** This lap's sector time, once driven. */
  timeMs?: number;
  /** Last lap's sector time. */
  lastMs?: number;
  /** Against the same sector of the own best lap (negative: faster). */
  deltaMs?: number;
  /** Against the ghost at the sector end (positive: the ghost is ahead), when the reference fits the track. */
  ghostMs?: number;
}

/** Race crew state (only in races). */
export interface CrewStatus {
  active: boolean;
  lap: number;
  laps: number;
  position?: number;
  cars?: number;
  sectors: CrewSector[];
  fuel?: { level: number; capacity: number; perLap: number; lapsLeft: number; pitLap?: number; toFinish: boolean };
  /** Temperatures (°C, lap average: front left, front right, rear left, rear right) and the estimated wear. */
  tyres?: { temps?: [number, number, number, number]; lossS?: number; perLapS?: number; pitNow?: boolean };
  /** Cheeky style: how annoyed the crew is about trips into the grass. */
  mood: CoachMood;
  excursions: number;
}
/** 'all' = every problem corner, a number = the N corners with the biggest time loss per lap. */
export type FeedbackSetting = 'all' | 'off' | number;

/**
 * Who speaks. Every role has its own voice: the coach (braking points, feedback, briefing), the race crew
 * and the stand-in who takes over when the cheeky coach quits.
 */
export type VoiceRole = 'coach' | 'crew' | 'standin';
export const VOICE_ROLES: readonly VoiceRole[] = ['coach', 'crew', 'standin'];

export interface RoleVoice {
  /**
   * Voice per language: "piper:de_DE-ramona-low", "vits:css10-de" or a Windows voice name.
   * Missing or empty: the default voice for the language.
   */
  byLanguage: Record<string, string>;
  /**
   * The user's own recordings per language (a recorded voice pack's id). Sentences the pack can say
   * completely come from the recordings; the voice above speaks all others. Missing: the voice only.
   */
  recordings: Record<string, string>;
  /** -10 (slow) .. 10 (fast), 0 = normal. */
  rate: number;
  /** Percent above normal pitch (-30 .. 50). */
  pitch: number;
  /**
   * Pause after a comma and after a sentence, in seconds. Every part of a text is spoken on its own and
   * joined with these (the engines' own pauses vary a lot and were too short).
   */
  commaPause: number;
  sentencePause: number;
}

export interface RunnerSettings {
  /** Which defaults the saved settings have seen (settings.ts migrateSettings): older files get changed defaults once. */
  settingsVersion: number;
  /** App language ("de", "en"); coach and crew speak it unless set below. */
  language: string;
  /** Language the coach (and the stand-in) speaks; '' = the app language. */
  coachLanguage: string;
  /** Language the race crew speaks; '' = the app language. */
  crewLanguage: string;
  /** The driver's name; coach and crew address them by it ('' = no name). Written as it should be spoken. */
  driverName: string;
  addressing: Addressing;
  /** Seconds of silence before the name and between the name and the sentence ("<pause> Maldö: <pause pause> …"). */
  namePauseBefore: number;
  namePauseAfter: number;
  /** How much slower the voice says the name than the rest (Piper and sherpa-onnx voices; 1 = as fast). */
  nameSlower: number;
  /** A recorded voice pack without the driver's name: leave the name out, or the voice speaks those sentences. */
  nameNotRecorded: NameNotRecorded;
  voices: Record<VoiceRole, RoleVoice>;
  countdownSeconds: number;
  /** Silence after each countdown number: when there is time, and when it is tight (docs/dev/coach-and-texts.md). */
  countPause: number;
  countPauseShort: number;
  /** Audio path delay (Bluetooth etc.), added to every cue. */
  latencySeconds: number;
  /** The lead time came from a calibration (until then the app keeps reminding the driver). */
  latencyCalibrated: boolean;
  tone: boolean;
  intro: boolean;
  /**
   * Corner calls in races, by the crew over the radio (the coach is quiet in races): the braking calls from the
   * track's reference, with the mistake before a problem corner. On by default for the biggest problem corners
   * ('mistakes', the user, 2026-10-24); 'all' calls every corner.
   */
  raceCalls: boolean;
  raceCallsScope: RaceCallsScope;
  /** Corner plan after the announcement: gear in and out ("Rein im ersten Gang ..."). */
  plan: boolean;
  /**
   * Curbs in the corner plan where the reference used them, with how much of the car went on them ("Curb innen
   * halb", "Curb außen voll").
   */
  curbs: boolean;
  /** The corner's shape right after the announcement ("Haarnadel rechts", "Schikane, rechts links"), docs/dev/coach-and-texts.md. */
  cornerShape: boolean;
  planStyle: PlanStyle;
  /** Pace notes for the corners without braking ("Rechts voll.", "Auf 125 liften, links."), docs/dev/coach-and-texts.md. */
  fastCorners: boolean;
  /**
   * Corner chains (docs/dev/coach-and-texts.md): a braking zone right after another is named in the first one's plan ("Dann mittlere
   * Linkskurve."), and gets no explanations of its own; explanations never fall into a corner without braking.
   */
  chainCalls: boolean;
  /** Trail braking in the corner plan ("Bremse in die Kurve hinein lösen.") where the reference brakes into the corner (docs/dev/coach-and-texts.md). */
  trailCalls: boolean;
  /**
   * The countdown runs to the first action and names it: "jetzt, bremsen", or where the reference turns in before it
   * brakes, "jetzt, rechts, stark" and then "bremsen" at the braking point. Off: "jetzt" at the braking point only.
   */
  actionAfterNow: boolean;
  /** The entry gear once more, right after "jetzt". */
  gearAfterNow: boolean;
  turnIn: boolean;
  feedback: FeedbackSetting;
  /**
   * Big problem corners called through the corner (stream feedback 2026-10-23): a feedback corner that cost at
   * least half a second gets the gears, the brake, the apex speed when that was off, and "Gas!" in the corner.
   */
  guideCorners: boolean;
  /** Also say a feedback right after the corner where the mistake happened. */
  immediateFeedback: boolean;
  waitForFirstLap: boolean;
  /** Calls while GT7 plays a replay (off: the coach is quiet; docs/dev/telemetry.md). */
  replayCalls: boolean;
  /** Streamer mode: the app hides IPs, paths, other players' and device names; the voice leaves out other players' names. */
  streamerMode: boolean;
  briefing: BriefingSetting;
  /** After every lap: the difference to the target time. */
  lapDelta: boolean;
  /** Time trial and practice: sectors per lap against the ghost (the reference lap); 0 = off. */
  ghostSectors: number;
  /**
   * Help before cheekiness (docs/dev/coach-and-texts.md): a mistake that keeps coming in a corner first gets a tip, then a
   * helping cue, then a focus exercise; only after that does it count against the coach's patience.
   */
  helpFirst: boolean;
  /** Helping cues ("warten", "Gas!", the gear, the target speed) for a corner whose mistake keeps coming. */
  helpAssists: boolean;
  /** Laps of a focus exercise on one corner, one run of it per lap (0 = none). */
  focusLaps: number;
  style: CoachStyle;
  /** How fast the cheeky coach gets annoyed. */
  patience: Patience;
  /** How fast the cheeky crew gets annoyed. */
  crewPatience: Patience;
  /** Cheeky style, absolute escalation: the coach quits ("Ich hör auf …") and a stand-in with another voice takes over. */
  coachQuits: boolean;
  /** Laps the stand-in coaches before the coach comes back. */
  standInLaps: number;
  /** The coach (module "coach", docs/dev/modules.md): braking calls, corner plans, feedback, briefing and debrief. */
  coach: boolean;
  /** Radio filter on the crew's voice. */
  radio: boolean;
  /** The debrief, started in the app: the coach goes through this many biggest mistakes (0 = off). */
  debriefZones: number;
  /**
   * The debrief also starts with the handbrake: stopped in a time trial or free run after driving there. Off by
   * default (the user, 2026-10-28: "nur manuell"; GT7 pulls the handbrake itself while a daily race loads).
   */
  debriefHandbrake: boolean;
  /** Cheeky style, many mistakes: a cheeky extra mistake after the list ("… GT7 installiert."). */
  debriefBonus: boolean;
  /**
   * Slides and spins (docs/dev/coach-and-texts.md): once the car is under control again, the coach says what started it and how to
   * avoid it (the user, 2026-10-28: the alpha testers miss why it happened).
   */
  slides: boolean;
  /** In races too: only the cause of a spin, no tip (on the crew's radio when the crew is on). */
  slidesInRace: boolean;
  mute: boolean;
  /** How much the coach says: on top of the single settings (they stay as the user set them). */
  coachTalk: TalkLevel;
  /** Volume of everything the app says, in percent (the user, 2026-10-25: one control, coach and crew on their own too). */
  volume: number;
  /** The coach's share of it, in percent; the stand-in follows the coach. */
  coachVolume: number;
  /** The race crew's share (the team boss on the radio too), in percent. */
  crewVolume: number;
  /** The detailed session log: every call, crew message and help step too (default: the standard log). Both are anonymous. */
  detailedLog: boolean;
  /**
   * Look for a newer version on GitHub at start (official installed builds only; the app's only internet connection
   * besides voice downloads). Asked once in the news window, ticked there; updateAsked: that question was answered.
   */
  updateCheck: boolean;
  updateAsked: boolean;
  /** The version whose news window was shown (each version's news once). */
  newsSeen: string;
  /**
   * The user's own texts per language, over the language pack's: text key → own text (docs/dev/coach-and-texts.md "Own
   * texts"; the user, 2026-10-31: "wie man das nennen soll, kann dann der Nutzer entscheiden").
   */
  texts: Record<string, Record<string, OwnText>>;
}

// --- Own texts ---

/** A text in the user's words, and the language pack's text it replaced. */
export interface OwnText {
  /** A list for texts said one at a time (the cheeky lines) and for word lists (the countdown). */
  text: string | string[];
  /** The pack's text when the user wrote this one: an update that changes it is shown. */
  base: string | string[];
}

/** Areas of the texts (packages/coach/src/i18n/own-texts.ts). */
export type TextGroup = 'basics' | 'notes' | 'plan' | 'feedback' | 'help' | 'slides' | 'briefing' | 'lap' | 'cheeky' | 'crew' | 'session' | 'calibration' | 'recordings';
/** A text, a list of texts (one is picked when spoken), or a fixed number of words (countdown, number words). */
export type TextKind = 'text' | 'list' | 'words';

/** Why an own text cannot be used; abbreviation and dropped are only hints. */
export type TextProblem =
  | { kind: 'unknown-key' }
  | { kind: 'empty' }
  | { kind: 'too-long'; max: number }
  | { kind: 'too-many'; max: number }
  | { kind: 'placeholder'; names: string[] }
  | { kind: 'count'; count: number }
  | { kind: 'abbreviation'; word: string }
  | { kind: 'dropped'; names: string[] };

export interface TextEntry {
  key: string;
  group: TextGroup;
  kind: TextKind;
  /** The language pack's text; the user's own are in the settings (`texts`). */
  standard: string | string[];
  /** The placeholders the text can have. */
  placeholders: string[];
  /** Example values that differ for this text: the gears as ordinal words, the driver's name. */
  samples?: Record<string, string>;
  /** Who says it, for hearing it with that voice. */
  speaker: 'coach' | 'crew';
}

export interface TextCatalog {
  /** The language pack's id. */
  language: string;
  /** The areas in the order to show them. */
  groups: TextGroup[];
  /** The short calls, shown first (text keys, in order). */
  quick: string[];
  /** An example value for every placeholder, in the language ("170", "rechts"). */
  samples: Record<string, string>;
  entries: TextEntry[];
}

// --- References ---

export interface ReferenceSummary {
  /** File name without .json; stable id for the app. */
  id: string;
  file: string;
  track?: string;
  trackId?: string;
  reversed?: boolean;
  carCode: number;
  carCategory?: string;
  /** The car's name ("Jaguar F-type Gr.3"): from the bundled list, or entered by the user for a newer car. */
  carName?: string;
  /** The bundled car list knows the car (else the user can name it). */
  carListed: boolean;
  lapTimeMs: number;
  lapTime: string;
  /** Player whose lap it is (entered by the user). */
  driver?: string;
  /** Time to beat: set by the user, else the lap's own time. */
  targetTimeMs: number;
  targetTime: string;
  /** The user set the target time (it differs from the lap's own time). */
  customTarget: boolean;
  lengthMeters: number;
  zones: number;
  createdAt: string;
  /** Braking zones with a remembered result. */
  remembered: number;
  /** Learned from a ghost replay or from one's own driving; older references do not say. */
  origin?: 'replay' | 'live';
  /** What it is (docs/dev/telemetry.md): the app's guess until modeConfirmed; older references do not say. */
  mode?: ReferenceMode;
  bop?: boolean;
  /** The user's own name for it. */
  label?: string;
  modeConfirmed: boolean;
}

// --- Voices ---

export type VoiceEngine = 'onecore' | 'sapi' | 'macos' | 'piper' | 'sherpa';

export interface VoiceChoice {
  /** Windows voice name, or "piper:…" / "vits:…". */
  id: string;
  engine: VoiceEngine;
  /** BCP 47 ("de-DE"). */
  language: string;
  gender?: string;
  /** Optional voices need their package; Windows voices are always installed. */
  installed: boolean;
  packageId?: string;
  /** Display name when the id is not readable ("Jan"). */
  label?: string;
}

export interface VoicePackageInfo {
  id: string;
  kind: 'engine' | 'model' | 'voice';
  engine: 'piper' | 'sherpa';
  name: string;
  license: string;
  source: string;
  language?: string;
  gender?: string;
  dataset?: string;
  requires?: string;
  /** Voice ids the package provides. */
  voices: string[];
  /** Languages of those voices ("de-DE", "en-US"). */
  languages: string[];
  sizeBytes: number;
  installed: boolean;
  /** Preselected in the first-start dialog for this app language. */
  preselected: boolean;
}

export interface InstallProgress {
  packageId: string;
  phase: 'download' | 'extract' | 'installed';
  /** Bytes downloaded over all packages of this install, and the total. */
  receivedBytes: number;
  totalBytes: number;
}

export type InstallState =
  | { state: 'idle' }
  | { state: 'installing'; ids: string[]; progress?: InstallProgress }
  | { state: 'done'; ids: string[] }
  | { state: 'cancelled' }
  | { state: 'error'; message: string };

// --- Recorded voices: the user's own recordings, one pack per language ---

/** Where a text is listed on the recording page. */
export type RecordingSection = 'cues' | 'name' | 'lap' | 'numbers' | 'remarks' | 'corners' | 'crew' | 'more' | 'other';
export const RECORDING_SECTIONS: readonly RecordingSection[] = ['cues', 'name', 'lap', 'numbers', 'remarks', 'corners', 'crew', 'more', 'other'];

/** leave-out: the recorded sentence without the name. voice: the voice speaks the whole sentence with the name. */
export type NameNotRecorded = 'leave-out' | 'voice';

export interface RecordingPackInfo {
  id: string;
  name: string;
  /** The one language the pack speaks ("de"). */
  language: string;
  /** The language pack's texts version the recordings were made against (newer texts may be missing). */
  textsVersion: number;
  /** Who speaks (free text, optional). */
  speaker: string;
  created: string;
  updated: string;
  recordings: number;
  /** Length of all recordings. */
  seconds: number;
  /** Imported from someone else's file. */
  imported: boolean;
  /** What the person who exported it confirmed (imported packs). */
  consent?: string;
}

export interface RecordingEntry {
  /** The words the recording is found by. */
  key: string;
  /** What to say, as written (punctuation shows the intonation). */
  text: string;
  section: RecordingSection;
  recorded: boolean;
  seconds?: number;
}

export interface RecordingCatalog {
  pack: RecordingPackInfo;
  entries: RecordingEntry[];
  /** The app's texts version for the pack's language: higher than the pack's means new texts to record. */
  textsVersion: number;
}

// --- Live coach ---

export type SessionMode = 'race' | 'practice' | 'replay' | 'menu';
/** note: the pace note of a corner without braking. */
export type CueKind = 'tone' | 'feedback' | 'intro' | 'plan' | 'count' | 'now' | 'brake' | 'brake-point' | 'gear' | 'turn-in' | 'assist' | 'note';
/** How much of the car goes on a curb: one wheel, half (one side), the whole car. */
export type CurbLevelKind = 'touch' | 'half' | 'full';

/** How far the help for a corner's mistake has come (docs/dev/coach-and-texts.md). */
export type HelpStep = 'feedback' | 'tip' | 'assist' | 'focus' | 'exhausted';
export type VoiceState = 'preparing' | 'ready' | 'error';

export interface VoiceStatus {
  id: string;
  name: string;
  engine?: VoiceEngine;
  state: VoiceState;
  /** Clips prepared so far, while preparing. */
  done?: number;
  total?: number;
  /** Set when the chosen voice failed (the Windows default speaks instead) or no voice works at all. */
  error?: string;
}

export type CornerShapeKind = 'hairpin' | 'tight' | 'medium' | 'fast' | 'chicane';

export interface ZoneState {
  index: number;
  label: string;
  /** Turn number on the track map, if known. */
  turn?: number;
  name?: string;
  brakeSpeedKmh: number;
  apexSpeedKmh: number;
  brakeGear: number;
  apexGear: number;
  /** Lowest gear up to the apex, and a lower one after it (a chicane's second part). */
  entryGear: number;
  midGear?: number;
  exitGear: number;
  /** The reference used the inside curb towards the apex / the outside curb on the exit. */
  curbIn?: boolean;
  curbOut?: boolean;
  /** How much of the car was on it (references that know the wheels). */
  curbInLevel?: CurbLevelKind;
  curbOutLevel?: CurbLevelKind;
  /** 'full' or percent. */
  force: 'full' | number;
  /** Trail braking: the reference's brake at turn-in in percent (rounded to 10) where it brakes into the corner. */
  trail?: number;
  direction: 'left' | 'right';
  /** How the corner looks from the reference's line; a chicane starts towards shapeDirection. */
  shape?: CornerShapeKind;
  shapeDirection?: 'left' | 'right';
  feedbackNumber?: number;
  /** The mistake that keeps coming here and how far the help has come (this session only). */
  help?: { step: HelpStep; problem: string; times: number };
  last?: { lossS: number; problems: string; at: string; thisSession: boolean; metrics?: ZoneMetrics };
}

/** What was measured in a braking zone, next to the reference (this session only). */
export interface ZoneMetrics {
  /** Positive: braked later than the reference. Missing: no braking. */
  brakeDeltaM?: number;
  apexKmh: number;
  refApexKmh: number;
  /** Lowest gear in the corner (without blips), the driver's and the reference's. */
  gear: number;
  refGear: number;
  /** Positive: on the throttle later than the reference. */
  throttleDeltaM?: number;
  brakePercent: number;
  refBrakePercent: number;
  /** Brake at the reference's turn-in point, percent; the reference's where it trail-brakes. */
  turnInBrakePercent?: number;
  refTurnInBrakePercent?: number;
}

export interface FeedbackState {
  number: number;
  zone: number;
  zoneLabel: string;
  problems: string;
}

/**
 * Calibration: on a straight at full throttle the coach counts down like at a braking point; the driver
 * brakes at "jetzt". The time from "jetzt" to the brake (earbud delay plus reaction) is the lead time the
 * cues need.
 */
export interface CalibrationStatus {
  /** waiting: for full throttle on a straight; countdown: running; brake: "jetzt" was said; done: result ready. */
  state: 'waiting' | 'countdown' | 'brake' | 'done';
  /** Seconds from "jetzt" to the brake, one per valid try. */
  samples: number[];
  needed: number;
  /** The last try did not count. */
  rejected?: 'early' | 'late';
  /** Suggested lead time in seconds (the median of the tries), once enough are in. */
  result?: number;
}

export interface RunnerStatus {
  running: boolean;
  language: string;
  /** Voices of the roles in use (the stand-in's once it is prepared). */
  voices: Partial<Record<VoiceRole, VoiceStatus>>;
  muted: boolean;
  connection: ConnectionStatus;
  mode?: SessionMode;
  coach: 'learning' | 'coaching';
  reference?: ReferenceSummary;
  /** ownLaps: complete laps of one's own driving; the fastest clean one of ownLapsNeeded becomes the reference. */
  learning?: { frames: number; replay: boolean; lapsSeen: number; ownLaps: number; ownLapsNeeded: number };
  lap: number;
  /** False on the out lap (coaching starts at the first start/finish crossing). */
  started: boolean;
  offReference: boolean;
  /** The car being driven differs from the reference's. */
  otherCar: boolean;
  /** The car being driven (from the telemetry), once packets come; name undefined for a car newer than the list. */
  car?: { code: number; name?: string; category?: string };
  zones: ZoneState[];
  feedback: FeedbackState[];
  /** The briefing, started in the app: available when not driving, waiting while driving. */
  briefing: 'off' | 'waiting' | 'available' | 'playing';
  /** How the coach feels about repeated mistakes (rises with every repeat, falls when they are fixed). */
  mood: CoachMood;
  /** Focus exercise running: only this corner gets feedback, for the laps left. */
  focus?: { zone: number; zoneLabel: string; lapsLeft: number };
  crew: CrewStatus;
  /** Running or finished calibration (until it is started again or stopped). */
  calibration?: CalibrationStatus;
  /** The debrief, started in the app (or with the handbrake): available when not driving, waiting while driving. */
  debrief: 'off' | 'waiting' | 'available' | 'playing';
  /** The last timed lap and its difference to the target time (positive: slower). */
  lastLap?: { lap: number; timeMs: number; time: string; deltaMs: number };
  /** Telemetry recording file, if recording. */
  recording?: string;
  logFile?: string;
}

export interface CueEvent {
  at: number;
  zone: number;
  zoneLabel: string;
  kind: CueKind;
  text: string;
}

/** What started a slide or spin (as SlideCause in packages/coach/src/slides.ts). */
export type SlideCause =
  | 'grass-throttle'
  | 'grass-brake'
  | 'grass'
  | 'curb-throttle'
  | 'throttle'
  | 'brake'
  | 'brake-straight'
  | 'lift'
  | 'contact'
  | 'unknown';

export type ActivityBody =
  | { kind: 'corner'; zone: number; zoneLabel: string; lossS: number; problems: string; brakeDeltaM?: number; apexKmh: number; refApexKmh: number }
  | { kind: 'feedback-new' | 'feedback-updated'; number: number; zone: number; zoneLabel: string; problems: string }
  | { kind: 'feedback-resolved'; number: number; zone: number; zoneLabel: string }
  | { kind: 'lap'; lap: number }
  | { kind: 'lap-time'; lap: number; time: string; deltaMs: number }
  | { kind: 'debrief-started' | 'debrief-finished' | 'debrief-stopped' }
  /** What the race crew said. */
  | { kind: 'crew'; text: string }
  /** Cheeky style: a remark (level 1 to 3), relief (level 0) or a quit and take-over (level 4). */
  | { kind: 'remark'; text: string; level: CoachMood; zone: number; zoneLabel: string }
  /** Help before cheekiness: praise for progress, a focus exercise starting or ending. */
  | { kind: 'help'; event: 'better' | 'focus-started' | 'focus-ended' | 'focus-done'; text: string; zone: number; zoneLabel: string }
  | { kind: 'coaching-started' }
  | { kind: 'mode'; mode: SessionMode }
  | { kind: 'off-reference'; offsetM: number }
  | { kind: 'back-on-reference' }
  | { kind: 'other-car'; carCode: number; car?: string; refCar?: string }
  | { kind: 'reference-loaded' | 'reference-learned'; track?: string; lapTime: string }
  | { kind: 'briefing-started' | 'briefing-finished' | 'briefing-stopped' }
  /** A slide or spin and what started it (docs/dev/coach-and-texts.md); text: what happened and why, without the tip. */
  | { kind: 'slide'; slide: 'spin' | 'slide'; cause: SlideCause; maxDeg: number; text: string; zone?: number; zoneLabel?: string }
  | { kind: 'voice-error'; message: string };

export type Activity = ActivityBody & { id: number; at: number };

/** The modules (docs/dev/modules.md), in the order of the navigation. The telemetry is always on: every other one reads it. */
export const MODULE_IDS = ['telemetry', 'coach', 'crew', 'overlays', 'haptics'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];
/** The modules still inside the runner: their switches are settings until they move into their folders (docs/dev/modules.md). */
export const RUNNER_MODULE_IDS = ['coach'] as const;
export type RunnerModuleId = (typeof RUNNER_MODULE_IDS)[number];

export function isRunnerModule(id: string): id is RunnerModuleId {
  return (RUNNER_MODULE_IDS as readonly string[]).includes(id);
}

/** Whether a module still inside the runner is on. */
export function moduleEnabled(settings: RunnerSettings, id: RunnerModuleId): boolean {
  switch (id) {
    case 'coach':
      return settings.coach;
  }
}

/** The settings change that switches a module on or off. */
export function moduleSwitch(id: RunnerModuleId, on: boolean): Partial<RunnerSettings> {
  switch (id) {
    case 'coach':
      return { coach: on };
  }
}

/**
 * A PS5 address the app accepts (security audit 2026-10-24): a home network (10/8, 172.16/12, 192.168/16), a direct
 * cable (link-local 169.254/16) or this PC (127/8, the test PS5); never an address on the internet.
 */
export function isLanAddress(ip: string): boolean {
  // No leading zeros: "192.168.1.08" is no address for Node, it would go to a DNS lookup (release check 2026-10-28).
  if (!/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(ip)) return false;
  const [a = 0, b = 0] = ip.split('.').map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

export interface LiveSample {
  at: number;
  speedKmh: number;
  gear: number;
  /** 0..1 */
  throttle: number;
  brake: number;
  paused: boolean;
  onTrack: boolean;
  currentLapMs?: number;
  lastLapMs?: number;
  bestLapMs?: number;
}

// --- App ---

/** The system the app runs on: the texts say "PC" or "Mac" and give the steps for that system. */
export type Platform = 'windows' | 'mac' | 'linux';

/** For the confirmation of "Reset data" (Settings → Diagnostics). */
export interface DataSummary {
  /** False in development with the repository's folders (they hold the developer's data). */
  available: boolean;
  references: number;
  /** Session logs and telemetry recordings. */
  sessions: number;
  /** The user's own voice packs. */
  recordedPacks: number;
  /** Downloaded engines and voices. */
  voicesBytes: number;
  totalBytes: number;
}

export interface AppInfo {
  name: string;
  version: string;
  electron: string;
  chrome: string;
  node: string;
  dev: boolean;
  platform: Platform;
}

/** A newer release, as the update window shows it. */
export interface UpdateRelease {
  version: string;
  /** The release's title and its notes (Markdown, from the changelog). */
  name: string;
  notes: string;
  prerelease: boolean;
  publishedAt?: string;
  /** The installer for this system and its size. */
  file: string;
  size: number;
}

/**
 * The update's state. available: an official installed build (dev and builds from source never look). checking,
 * none (up to date), found (release), downloading (progress 0..1), installing (Windows: the installer runs, the app
 * closes), opened (macOS, Linux: the disk image or package is open for the user), error.
 */
export interface UpdateStatus {
  available: boolean;
  state: 'idle' | 'checking' | 'none' | 'found' | 'downloading' | 'installing' | 'opened' | 'error';
  release?: UpdateRelease;
  progress?: number;
  error?: string;
  /** When the last look ended (ms since 1970). */
  checkedAt?: number;
}

export interface AppConfig {
  settings: RunnerSettings;
  guideDone: boolean;
  /** Every module by its id: on or off. */
  modules: Record<ModuleId, ModuleState>;
}

export interface LanguageInfo {
  id: string;
  name: string;
  locale: string;
}

export interface LicenseEntry {
  name: string;
  version?: string;
  license: string;
  usedFor: string;
  url?: string;
  /** Ships with the app, is included data, an optional download, or a credit (knowledge we used, no code). */
  shipped: 'bundled' | 'download' | 'data' | 'credit';
  notice?: string;
  text?: string;
}

export type SampleGroup = 'corner' | 'feedback' | 'help' | 'slides' | 'lap' | 'briefing' | 'debrief' | 'cheeky' | 'crew' | 'session';

/** One thing the driver can hear, for the sound check page. */
export interface SampleInfo {
  id: string;
  group: SampleGroup;
  /** What is said ("" for the tone); for a sequence, its parts joined. */
  text: string;
  /** Several parts, timed like on track (a whole braking zone). */
  sequence?: boolean;
}

/** What the preload script exposes as window.gtt (with one namespace per module that moved, window.gtt.<id>). */
export interface GttApi {
  info(): Promise<AppInfo>;
  getConfig(): Promise<AppConfig>;
  setSettings(settings: Partial<RunnerSettings>): Promise<RunnerSettings>;
  /** Switches a module on or off: it starts or stops at once (the telemetry cannot be switched off). */
  setModuleEnabled(id: ModuleId, enabled: boolean): Promise<Record<ModuleId, ModuleState>>;
  onModules(listener: (modules: Record<ModuleId, ModuleState>) => void): Unsubscribe;
  setGuideDone(done: boolean): Promise<void>;
  languages(): Promise<LanguageInfo[]>;

  getStatus(): Promise<RunnerStatus>;
  onStatus(listener: (status: RunnerStatus) => void): Unsubscribe;
  onActivity(listener: (activity: Activity) => void): Unsubscribe;
  onCue(listener: (cue: CueEvent) => void): Unsubscribe;
  onLive(listener: (sample: LiveSample) => void): Unsubscribe;
  /** Plays the attention tone and a sample countdown with the current voice. */
  testAudio(): Promise<void>;
  /** Calibration of the cue lead time; coaching pauses while it runs. */
  startCalibration(): Promise<void>;
  stopCalibration(): Promise<void>;
  /** Sound check: everything the coach can say, with the current voice, style and reference. */
  samples(): Promise<SampleInfo[]>;
  /** Resolves when the sample has been played (or was stopped). */
  /** The track briefing (standing, in a menu or paused); driving ends it. */
  startBriefing(): Promise<void>;
  stopBriefing(): Promise<void>;
  /** The debrief, the biggest mistakes (standing, in a menu or paused); driving ends it. */
  startDebrief(): Promise<void>;
  stopDebrief(): Promise<void>;
  playSample(id: string): Promise<void>;
  stopSample(): Promise<void>;

  /** The coach's memory of a reference (its last results per braking zone); the references are the telemetry's (window.gtt.telemetry). */
  forgetHistory(id: string): Promise<void>;

  listVoices(): Promise<VoiceChoice[]>;
  /** Speaks a sample with a voice, using the role's speed and pitch. */
  previewVoice(id: string, role: VoiceRole): Promise<void>;

  /** Every spoken text of a language: the language pack's and the user's own (saved through the settings: `texts`). */
  texts(language: string): Promise<TextCatalog>;
  /** What keeps an own text from being used, and hints; nothing is saved. */
  checkText(key: string, value: string | string[], language: string): Promise<TextProblem[]>;
  /** Speaks a text with the voice of who says it, in that language (with the role's recordings). */
  previewText(text: string, language: string, speaker: 'coach' | 'crew'): Promise<void>;
  voicePackages(): Promise<VoicePackageInfo[]>;
  /** Downloads only these packages (and what they need), after the user confirmed them. */
  installVoicePackages(ids: string[]): Promise<void>;
  cancelVoiceInstall(): Promise<void>;
  removeVoicePackages(ids: string[]): Promise<void>;
  onVoiceInstall(listener: (state: InstallState) => void): Unsubscribe;

  /** The user's recorded voice packs (each speaks one language). */
  recordingPacks(): Promise<RecordingPackInfo[]>;
  createRecordingPack(details: { name: string; language: string; speaker: string }): Promise<RecordingPackInfo>;
  /** Name and speaker; the language stays. */
  updateRecordingPack(id: string, details: { name?: string; speaker?: string }): Promise<RecordingPackInfo>;
  deleteRecordingPack(id: string): Promise<void>;
  /** Everything worth recording in the pack's language, with what is recorded already. */
  recordingCatalog(id: string): Promise<RecordingCatalog>;
  /** Stores a take (16-bit WAV) for a text; a new take of the same words replaces the old one. */
  saveRecording(id: string, text: string, section: RecordingSection, wav: Uint8Array): Promise<RecordingEntry>;
  deleteRecording(id: string, key: string): Promise<void>;
  /** The stored take, as WAV, to listen to. */
  recordingAudio(id: string, key: string): Promise<Uint8Array>;
  /** Speaks sample sentences with the pack and the coach's voice for its language. */
  previewRecordingPack(id: string): Promise<void>;
  /** Asks where to save the file; only after the user confirmed the consent statement. False: cancelled. */
  exportRecordingPack(id: string, consent: true): Promise<boolean>;
  /** Asks for a file and imports it as a new pack, after the user read the notice. Null: cancelled. */
  importRecordingPack(confirmed: true): Promise<RecordingPackInfo | null>;

  licenses(): Promise<LicenseEntry[]>;
  /** Opens the license list of Chromium (part of Electron) from the app folder. */
  openChromiumLicenses(): Promise<void>;
  /** Links the app knows (empty while not set up yet); opened in the browser only when the user clicks. */
  links(): Promise<Partial<Record<LinkId, string>>>;
  openLink(id: LinkId): Promise<void>;
  openFolder(kind: FolderId): Promise<void>;
  /**
   * Saves this session's log for a GitHub issue (anonymous, with app version and system) where the user picks, and
   * shows it in its folder. file: the file name (not the path, which names the user); undefined: no log or cancelled.
   */
  exportLog(): Promise<{ file?: string; empty?: boolean }>;
  /**
   * Updates (apps/desktop/src/updates.ts): the state, a look for a newer release (at start after the user agreed, or
   * from the update button), and the update the user chose: download, check, then the installer.
   */
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<UpdateStatus>;
  onUpdate(listener: (status: UpdateStatus) => void): Unsubscribe;
  /** What "Reset data" would delete (counts and sizes, no paths). */
  dataSummary(): Promise<DataSummary>;
  /** Deletes all of the app's data at the next start and restarts now (keepVoices: the downloaded voices stay). */
  resetData(keepVoices: boolean): Promise<void>;
}

export interface ReferenceDetails {
  driver?: string;
  /** Name for a car the bundled list does not know yet ('' = remove). */
  carName?: string;
  targetTimeMs?: number | null;
  /** What the reference is (docs/dev/telemetry.md); modeConfirmed: the user said so (else it is the app's guess). */
  mode?: ReferenceMode;
  bop?: boolean;
  /** The user's own name for it ('' = remove). */
  label?: string;
  modeConfirmed?: boolean;
}

/**
 * What a reference lap is, said by the user after learning (docs/dev/telemetry.md; GT7 sends neither the mode nor BoP):
 * a Daily Race (Sport mode), an online lobby, a single player time trial, or a single player race or free run.
 */
export type ReferenceMode = 'daily' | 'lobby' | 'timeTrial' | 'custom';
export const REFERENCE_MODES: readonly ReferenceMode[] = ['daily', 'lobby', 'timeTrial', 'custom'];

/** BoP in a mode: Daily Races always have it; elsewhere what was set, by default on in lobbies and off alone. */
export function modeBop(mode: ReferenceMode, bop: boolean | undefined): boolean {
  return mode === 'daily' ? true : (bop ?? mode === 'lobby');
}

/** Web pages the app may open (in the browser, on a click): donations, Maldö's channels, the project. */
export type LinkId = 'patreon' | 'paypal' | 'twitch' | 'youtube' | 'facebook' | 'x' | 'instagram' | 'issues' | 'releases' | 'source';
export type FolderId = 'references' | 'logs' | 'voices' | 'recordings';
