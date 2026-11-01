import type { Problem } from '../analysis';
import type { CurbLevel } from '../curbs';
import type { CornerShape } from '../shape';
import type { Slide } from '../slides';

/** A curb to use, with how much of the car goes on it; 'used' when the reference knows only the side. */
export type CurbCall = CurbLevel | 'used';

/**
 * A helping cue for a corner whose mistake keeps coming: wait ("warten" instead of "eins"), early-now ("jetzt"
 * a little earlier), force (the braking announcement with the pressure), gear (the gear after "jetzt"),
 * target (the target speed at turn-in), throttle ("Gas!" at the reference's full-throttle point).
 */
export type AssistKind = 'wait' | 'early-now' | 'force' | 'gear' | 'target' | 'throttle' | 'trail' | 'release';

/** Language pack id, e.g. "de", "en", "fr". */
export type Language = string;
export type Direction = 'left' | 'right';
export type SteerStrength = 'slight' | 'medium' | 'sharp';
/** 'full' or a share in percent (10..90). */
export type BrakeForce = 'full' | number;

/** The gears a corner is driven in: down to entry, then (a chicane's second part) further down to mid, out in exit. */
export interface CornerGears {
  entry: number;
  mid?: number;
  exit: number;
}

/** A language pack file (language-packs/<id>.json). Data only: texts with {placeholders}. */
export interface LanguagePack {
  format: 'gt-toolz-language-pack';
  version: 1;
  /**
   * Version of the texts: raised when texts are added or changed. Recorded voice packs note the version they
   * were recorded against, so the app can tell when there are new texts to record. Default 1.
   */
  textsVersion?: number;
  id: Language;
  /** Shown in the language selection, in the language itself ("Deutsch"). */
  name: string;
  /** BCP 47 tag for picking a matching voice ("de-DE"). */
  locale: string;
  texts: Record<string, string | string[]>;
  /**
   * Words the speech engine reads wrongly, with a spelling that sounds right ("Curb": "Körb"; it read
   * "Kurb"). Only for speech: the app shows the original word.
   */
  pronounce?: Record<string, string>;
}

/** Everything the coach speaks, built from a language pack. */
export interface Phrases {
  id: Language;
  name: string;
  locale: string;

  count(n: number): string;
  /** Number words 0..20 and the decimal word: how numbers in a text are matched against recordings. */
  numberWords: readonly string[];
  decimalWord: string;
  now: string;
  gear(gear: number): string;
  brakeIntro(force: BrakeForce): string;
  turn(direction: Direction, strength: SteerStrength): string;

  problem(problem: Problem): string;
  problemTiny(problem: Problem): string;
  and: string;

  feedbackLong(number: number, what: string): string;
  feedbackShort(number: number, what: string): string;
  feedbackTiny(number: number, what: string): string;
  feedbackIntro(number: number): string;
  feedbackResolved(number: number): string;

  /**
   * Help before cheekiness (docs/dev/coach-and-texts.md): how to fix a mistake that keeps coming, with the reference's
   * numbers ("Ziel: 120 Kilometer pro Stunde im Scheitel"); tipTiny: a few words.
   */
  tip(problem: Problem, refApexKmh: number): string;
  tipTiny(problem: Problem): string;
  /** The feedback once a tip is given: the mistake again and the tip. */
  helpLong(number: number, what: string, tip: string): string;
  helpShort(number: number, tip: string): string;
  /** Said with the tip when a helping cue starts ("Ich sage dir, wann Gas kommt."). */
  helpAssistNote(assist: AssistKind): string;
  /** Said with the feedback of a big problem corner whose calls go on through the corner (gears, brake, throttle). */
  feedbackGuide: string;
  /** The mistake came again, but clearly smaller. */
  helpBetter(what: string): string;
  /** A focus exercise on one corner: only it gets feedback for a few laps. */
  focusStart(zone: string, laps: number): string;
  focusEnd: string;
  /** The corner works now: the exercise ends early. */
  focusDone(zone: string): string;
  /** Helping cues: "warten" before "jetzt", "Gas!" at the throttle point, the target speed at turn-in. */
  assistWait: string;
  assistThrottle: string;
  assistTarget(kmh: number): string;
  /** Trail braking helping cues: at turn-in ("Langsam lösen") and where the reference lets go ("Bremse los"). */
  assistTrail: string;
  assistRelease: string;
  /** The corner plan's trail braking part: a sentence, or a pace note. */
  planTrail: string;
  noteTrail: string;

  turnLabel(turn: number): string;
  brakingZoneLabel(index: number): string;
  /** A corner without braking and without a name ("Schnelle Kurve 2"). */
  fastCornerLabel(index: number): string;

  briefingIntro(track: string, zones: number): string;
  briefingIntroProblems(track: string, problemZones: number, zones: number): string;
  briefingNoProblems(track: string): string;
  briefingZoneName(index: number, label: string): string;
  /** With a shape, it says the shape instead of only the direction. */
  briefingZone(parts: { name: string; direction: Direction; shape?: CornerShape; force: BrakeForce; speed: number; gears: CornerGears }): string;
  briefingFeedbackName(number: number): string;
  briefingLastTime(what: string): string;
  briefingCleanLastTime: string;
  /** Trail braking in the briefing: once what it is, then per corner how much brake at turn-in. */
  briefingTrailIntro: string;
  briefingTrail(percent: number): string;
  briefingEnd: string;

  /** The corner's shape as a sentence ("Haarnadel rechts."); a chicane by the direction it starts with. */
  cornerShape(shape: CornerShape, direction: Direction): string;
  /** A corner of a chain after the one the plan is for: "Dann mittlere Linkskurve." (the direction alone without a shape). */
  thenShape(shape: CornerShape | undefined, direction: Direction): string;
  /**
   * Corner plan after the announcement: gear in and out and the curbs to use ("Rein im ersten Gang, Curb innen
   * halb."), with a downshift after the apex in between ("Dann runter in den zweiten."). short: gears only. Gears
   * as ordinal words (never "1.", see language pack docs).
   */
  cornerPlan(gears: CornerGears, curbIn: CurbCall | undefined, curbOut: CurbCall | undefined, variant: 'full' | 'short'): string;
  /**
   * The same as pace notes, short words in one line (docs/dev/coach-and-texts.md): "Haarnadel rechts, Gang zwei, Curb halb,
   * Curb außen voll." Every part is optional.
   */
  cornerNotes(parts: { shape?: CornerShape; direction: Direction; gears?: CornerGears; curbIn?: CurbCall; curbOut?: CurbCall }): string;
  /**
   * A corner without braking as a pace note: "Rechts voll, Curb halb." / "Auf 125 liften, links." (feathering too).
   * chained: right after the previous corner ("Dann auf 125 liften, links.").
   */
  fastNote(note: { kind: 'flat' | 'lift' | 'feather'; direction: Direction; kmh: number; curbIn?: CurbCall; curbOut?: CurbCall; chained: boolean }): string;
  /**
   * Right after a corner (the user's idea, 2026-10-20): how much slower the car came out of it, and what to try:
   * "Du warst 12 Kilometer pro Stunde zu langsam nach der Rechtskurve. Probiere: Aufs Jetzt warten."
   */
  afterCorner(kmh: number, corner: Direction | 'chicane', tip: string): string;

  /**
   * Cheeky style: a remark about a mistake made again in the same corner. level 1 = cheeky,
   * 2 = annoyed, 3 = the coach loses it. times: how often in a row. Undefined if the pack has none.
   */
  remark(level: 1 | 2 | 3, problem: Problem['kind'], zone: string, times: number): string | undefined;
  /** Cheeky style: a corner that went wrong several times is finally clean. */
  relief(zone: string): string | undefined;
  /**
   * Cheeky style, absolute escalation: the coach quits ("Ich hör auf …"), a stand-in with another voice
   * introduces itself, and later the coach comes back (early: the stand-in quit too, with its own line).
   */
  coachQuit(): string | undefined;
  standInIntro(): string | undefined;
  standInQuit(): string | undefined;
  coachComeback(early: boolean): string | undefined;

  /** The text as the speech engine should read it (the pack's pronunciations applied, whole words only). */
  spoken(text: string): string;
  /** A sentence addressed to the driver by name ("Alex, Sektor zwei. …"). */
  address(name: string, text: string): string;

  // --- Race crew (only in races) ---
  crewRaceStart: string;
  /**
   * A sector against the same sector of the own best lap (negative: faster; undefined: none yet) and, when
   * the reference fits the track, against the ghost (positive: the ghost is ahead). Empty if neither.
   */
  crewSector(sector: number, deltaMs: number | undefined, ghostMs?: number): string;
  /** The line: the lap time, against the own best lap ('new': new best; undefined: nothing yet) and the ghost. */
  crewLap(lap: number, timeMs: number, best: number | 'new' | undefined, ghostMs?: number): string;
  /** Time trial and practice: a sector against the ghost (positive: the ghost is ahead). */
  sectorGhost(sector: number, gapMs: number): string;
  /** Position in the race and places gained (positive) or lost since the last report. */
  crewPosition(position: number, cars: number, change: number): string;
  crewFuel(info: { lapsLeft: number; perLap: number; toFinish: boolean; pitLap?: number | 'now' }): string;
  crewTyres(info: { lossS: number; pitNow: boolean; withFuel: boolean }): string;
  /** Tyre state now and then: cold, at temperature, hot. */
  crewTyreState(state: 'cold' | 'warm' | 'hot'): string;
  /** Tyre temperature rising or falling fast (mean of all four, °C). */
  crewTyreTrend(direction: 'rising' | 'falling', degrees: number): string;
  /** wheel: 0 front left, 1 front right, 2 rear left, 3 rear right. */
  crewTyreHot(wheel: 0 | 1 | 2 | 3, degrees: number): string;
  /** Laps to go after a lap (2 or more; the last lap has its own call). */
  crewLapsLeft(laps: number): string;
  crewLastLap: string;
  crewFinish: string;
  /** Cheeky style: trips into the grass or gravel, level 1 to 3. times: excursions so far. */
  crewOffTrack(level: 1 | 2 | 3, times: number): string | undefined;
  /**
   * Level 4 in races: the race engineer quits, the team boss introduces itself on the radio, the boss has had
   * enough too, the engineer is back (early: after the boss quit).
   */
  crewQuit(): string | undefined;
  bossIntro(): string | undefined;
  bossQuit(): string | undefined;
  crewComeback(early: boolean): string | undefined;

  /** Calibration: brake at "jetzt" on a straight; each try is confirmed or rejected, then the result. */
  calibrationStart: string;
  calibrationTry(left: number): string;
  calibrationEarly: string;
  calibrationLate: string;
  calibrationDone(seconds: number): string;

  /** Difference to the target time after a lap (positive: slower). */
  lapDelta(deltaMs: number): string;

  debriefIntro(count: number): string;
  debriefZone(name: string, what: string, lossS: number): string;
  debriefNone: string;
  debriefEnd: string;
  /** A cheeky extra mistake numbered after the listed ones (cheeky style, many mistakes). */
  debriefBonus(number: number): string | undefined;
  /** Tells the driver about the debrief (stop, pull the handbrake). */
  debriefHint(count: number): string;

  /**
   * A slide or spin with its cause (docs/dev/coach-and-texts.md): "Dreher. Zu viel Gas bei eingeschlagener Lenkung." A swing to the
   * other side gets its own sentence.
   */
  slide(slide: Pick<Slide, 'kind' | 'cause' | 'offSurface' | 'pendulum'>): string;
  /** How to avoid it (not in races); none after a contact (unless it swung over afterwards). */
  slideTip(slide: Pick<Slide, 'cause' | 'pendulum'>): string | undefined;

  unknownTrack: string;
  /** With the reference's car and player, when known ("Jaguar F-type Gruppe 3, gefahren von Max."). */
  referenceLoaded(track: string, reference?: { car?: string; driver?: string }): string;
  referenceLearned(track: string, reference?: { car?: string; driver?: string }): string;
  /** Another saved reference fits the track being driven (docs/dev/telemetry.md). */
  referenceSwitched(track: string, reference?: { car?: string; driver?: string }): string;
  /** No saved reference fits: the coach rides along quietly and takes the fastest of the driver's laps. */
  learnOwn(laps: number): string;
  playReplay: string;
  otherCar: string;
  /** A different car than the reference's, naming the reference's car. */
  otherCarNamed(car: string): string;
  /** A car name as it is spoken (no model year, "Gr.3" written out). */
  carSpoken(name: string): string;
}
