import { detectMode, Flags, RaceEnd, TrackLocator, type SessionMode, type TelemetryFrame } from '@gt-toolz/telemetry';
import { analyzeCorner, cornerSegments, type CornerResult, type CornerSegment, type Problem, type RunSample } from './analysis';
import { chainedAfter, fastCornerPoint, isFollower, type FastCorner } from './fast';
import { builtInPhrases, describeProblems, type AssistKind, type BrakeForce, type Direction, type Phrases, type SteerStrength } from './i18n';
import { cornerGears, type Corner, type ReferenceLap } from './reference';

// The coach's users read the mode from here as before (it moved to the telemetry library for the modules).
export { detectMode, type SessionMode } from '@gt-toolz/telemetry';

export interface CoachSettings {
  /** How many numbers before the braking point: 3 = "drei, zwei, eins, jetzt". 0 = only "jetzt". */
  countdownSeconds: number;
  /**
   * Silence after each number (the user, 2026-10-22: "1 s wäre gut oder 0.8 s"): the long pause when tone,
   * announcement, full plan and countdown fit since the previous corner, else the short one.
   */
  countPause: number;
  countPauseShort: number;
  /** Spoken length of the longest number. */
  countSeconds: number;
  /** Attention tone before everything else. */
  announceTone: boolean;
  toneSeconds: number;
  /** "Gleich voll bremsen" / "Gleich 40 Prozent" before the countdown. */
  announceIntro: boolean;
  /**
   * Corner plan right after the announcement: gear in and out, and which curbs to use
   * ("Rein im ersten Gang, Curb innen mitnehmen. Raus im zweiten Gang, Curb außen voll.").
   */
  announcePlan: boolean;
  /**
   * Corner calls in races: 'off' = quiet (the reference is a solo lap), 'mistakes' = the biggest problem corners
   * (raceProblemCorners, by time loss in this session, else remembered from earlier ones; stream feedback
   * 2026-10-23), 'all' = every corner. The runner lets the crew speak them.
   */
  raceCalls: 'off' | 'all' | 'mistakes';
  /** How many problem corners the crew calls in races with 'mistakes'. */
  raceProblemCorners: number;
  /** Spoken length of the longest intro, so it ends before the countdown starts. */
  introSeconds: number;
  /** Spoken length of "jetzt"; the gear follows right after it. */
  nowSeconds: number;
  /** Spoken length of the gear word; a turn-in cue during it is dropped (the gear matters more). */
  gearSeconds: number;
  /** Spoken length of the turn-in phrase ("rechts, stark"). */
  turnInSeconds: number;
  /** Spoken length of the direction alone ("rechts"), the turn-in where the phrase does not fit. */
  turnInShortSeconds: number;
  /** Clearly beside the reference at turn-in: on the next approach, where to line up ("Von weiter links einlenken."). */
  announceLine: boolean;
  /** Spoken length of that, the longest of them. */
  lineSeconds: number;
  /**
   * The countdown runs to the first action and names it (the user, 2026-11-03): "jetzt, bremsen", and where the
   * reference turns in before it brakes, "jetzt, rechts, stark" and then "bremsen" at the braking point. Off: "jetzt" at
   * the braking point only.
   */
  announceAction: boolean;
  /** Spoken length of the word "bremsen". */
  brakeSeconds: number;
  /** Spoken length of the pressure said in its place in a lightly braked corner ("20 Prozent"), the longest of them. */
  brakeLightSeconds: number;
  /** Target gear right after "jetzt" also where the plan said it earlier; where nothing could say it, it comes anyway (with announceShifts). */
  announceGear: boolean;
  /**
   * The gears where the reference shifts in the corner (the user, 2026-11-03: the app shows them, the coach kept
   * quiet): down into the entry gear when that comes later than the braking point (at the apex of a hairpin),
   * further down after the apex (a chicane's second part), up into the exit gear.
   */
  announceShifts: boolean;
  announceTurnIn: boolean;
  /** Seconds between the turn-in announcement and the turn-in point. */
  turnInLeadSeconds: number;
  /** Audio path delay (Bluetooth etc.) that is added to every cue. */
  outputLatencySeconds: number;
  /** Name problem corners "Feedback 1, 2, ..." and talk about them on the next approach. */
  feedback: boolean;
  /**
   * Stay silent on the out lap: cues and corner analysis start with the first start/finish crossing.
   * Most sessions begin before the line (pit exit, time trial start).
   */
  waitForFirstLap: boolean;
  /**
   * Calls while GT7 plays a replay (the user, 2026-10-22: after learning, the replay started again and the coach
   * talked as if driving). Off by default; on, a ghost replay can be watched with its calls.
   */
  replayCalls: boolean;
  /**
   * Live feedback per lap: the N corners with the biggest time loss (default 2), or 'all' = every problem corner.
   * N larger than the number of corners is the same as 'all'.
   */
  feedbackPerLap: 'all' | number;
  /** A corner needs to cost at least this much time to get a feedback. */
  feedbackMinLossSeconds: number;
  /**
   * Big problem corners called through the corner (stream feedback 2026-10-23: "go into detail, during the
   * corner, when throttle, when to shift"): a feedback corner (in races a called problem corner) that cost at
   * least guideMinLossSeconds gets the gears where the reference shifts, the brake ("langsam lösen", "Bremse
   * los!"), the apex speed when that was off, and "Gas!".
   */
  guideCorners: boolean;
  guideMinLossSeconds: number;
  /**
   * Help before cheekiness (docs/dev/coach-and-texts.md): a mistake that keeps coming in a corner gets a tip, then a helping
   * cue, then a focus exercise; only after that does the cheeky coach lose patience. Off: as before.
   */
  helpFirst: boolean;
  /** Helping cues ("warten", "Gas!", the gear, the target speed) for a corner whose mistake keeps coming. */
  helpAssists: boolean;
  /** Laps of a focus exercise on one corner, one run of it per lap (0 = none). */
  focusLaps: number;
  /** Pace notes for the corners without braking ("Rechts voll.", "Auf 125 liften, links."), docs/dev/coach-and-texts.md. */
  fastCorners: boolean;
  /** Corner chains (docs/dev/coach-and-texts.md): followers only get the short call, explanations wait until the corners without braking are past. */
  chainCalls: boolean;
  /** Seconds between the end of such a note and the lift or the turn. */
  noteLeadSeconds: number;
}

export const DEFAULT_COACH_SETTINGS: CoachSettings = {
  countdownSeconds: 2,
  countPause: 1,
  countPauseShort: 0.8,
  countSeconds: 0.6,
  announceTone: true,
  toneSeconds: 0.25,
  announceIntro: true,
  announcePlan: true,
  // Races are no solo laps: the reference means little there, the crew talks (the user, 2026-10-20). The
  // runner's default calls the biggest problem corners (the user, 2026-10-24).
  raceCalls: 'off',
  raceProblemCorners: 2,
  introSeconds: 1.2,
  nowSeconds: 0.4,
  gearSeconds: 0.5,
  turnInSeconds: 1.1,
  turnInShortSeconds: 0.5,
  announceLine: true,
  lineSeconds: 1.5,
  announceAction: true,
  brakeSeconds: 0.5,
  brakeLightSeconds: 0.9,
  announceGear: false,
  announceShifts: true,
  announceTurnIn: true,
  turnInLeadSeconds: 0.8,
  outputLatencySeconds: 0.2,
  feedback: true,
  waitForFirstLap: true,
  replayCalls: false,
  // At most two (stream feedback 2026-10-23: seven feedbacks on seven braking zones were too many).
  feedbackPerLap: 2,
  feedbackMinLossSeconds: 0.1,
  guideCorners: true,
  // On stream (Montreal) the two worst zones cost about 1.3 s a lap, the others 0.1 to 0.9 s.
  guideMinLossSeconds: 0.5,
  helpFirst: true,
  helpAssists: true,
  focusLaps: 2,
  fastCorners: true,
  chainCalls: true,
  noteLeadSeconds: 1.5,
};

/**
 * tone:     attention tone
 * feedback: "Achtung, wir nähern uns der Ecke für Feedback 1. Das hast du falsch gemacht: ..." (long or short)
 * intro:    "Gleich voll bremsen" / "Gleich 40 Prozent" / "Feedback 1 gleich"
 * count:    "drei", "zwei", "eins"
 * now:      "jetzt" at the braking point
 * gear:     "Gang 2"
 * turn-in:  "rechts, stark", when that does not fit "rechts"
 * line:     "Von weiter links einlenken.", clearly beside the reference at turn-in last time
 * assist:   a helping cue for a corner whose mistake keeps coming ("warten", "Gas!", "Scheitel 120")
 */
export type FeedbackVariant = 'long' | 'short' | 'tiny';

/** brake: the word right after "jetzt"; brake-point: the word alone at the braking point, after a turn-in that came first. */
export type CueKind = 'tone' | 'feedback' | 'intro' | 'plan' | 'count' | 'now' | 'brake' | 'brake-point' | 'gear' | 'turn-in' | 'line' | 'assist';

/**
 * How far the help for a mistake that keeps coming in a corner has gone: the feedback, a tip how to fix it,
 * a helping cue, a focus exercise; exhausted: the help is through (the cheeky coach may lose patience).
 */
export type HelpStep = 'feedback' | 'tip' | 'assist' | 'focus' | 'exhausted';

/** The help for one corner after its last run. */
export interface CornerHelp {
  cornerIndex: number;
  /** The mistake being worked on. */
  kind: Problem['kind'];
  /** Runs in a row with it. */
  times: number;
  step: HelpStep;
  /** Its size on the last run (meters, km/h, percent points, gears). */
  size: number;
  /** The last run had it again, but clearly smaller: progress, no next step. */
  improved: boolean;
}

/**
 * full: gears and curbs; short: gears only (when there is little time before the countdown); shape: only the corner's
 * shape; call: only the pressure and the gears in and out, where the plan with the gears does not fit (docs/dev/coach-and-texts.md).
 */
export type PlanVariant = 'full' | 'short' | 'shape' | 'call';

/** A pace note of a corner without braking: full with the curbs, short without (for tight sections). */
export type NoteVariant = 'full' | 'short';

/** Spoken lengths of a pace note's clips, reported back by the audio side once rendered. */
export interface NoteAudio {
  fullSeconds: number;
  shortSeconds: number;
}

/** Spoken lengths of a corner's plan clips, reported back by the audio side once rendered. */
export interface PlanAudio {
  fullSeconds: number;
  shortSeconds: number;
  /** Only the shape; set when the plan says shape and gears. */
  shapeSeconds?: number;
  /** Only the pressure and the gears in and out ("In 2 aus 3"); set when the plan says gears. */
  callSeconds?: number;
}

export interface FeedbackItem {
  /** 1, 2, 3, ... stays the same for the whole session. */
  number: number;
  cornerIndex: number;
  problems: Problem[];
  /** Increases whenever the texts change. */
  version: number;
  /**
   * after: for right after the corner, when the car came out of it clearly slower than the reference ("Du warst
   * 12 Kilometer pro Stunde zu langsam nach der Rechtskurve. Probiere: …").
   */
  texts: { long: string; short: string; tiny: string; intro: string; after?: string };
}

/** Spoken lengths of a feedback's clips, reported back by the audio side once rendered. */
export interface FeedbackAudio {
  version: number;
  longSeconds: number;
  shortSeconds: number;
  tinySeconds: number;
  introSeconds: number;
  afterSeconds?: number;
}

/** Where to line up for a corner: further to this side, over the curb there. */
export interface LineCall {
  side: Direction;
  curb: boolean;
}

export interface Cue {
  kind: CueKind;
  corner: Corner;
  count?: number;
  gear?: number;
  /** A turn-in as the direction alone. */
  short?: boolean;
  line?: LineCall;
  /** For feedback and feedback intros. */
  feedback?: FeedbackItem;
  variant?: FeedbackVariant;
  plan?: PlanVariant;
  assist?: AssistKind;
  /** Predicted seconds until the cue's point when it fired. */
  secondsToPoint: number;
}

export type CoachEvent =
  | { type: 'cue'; cue: Cue }
  /** A corner without braking: its pace note (docs/dev/coach-and-texts.md); secondsToPoint: until the lift or the turn. */
  | { type: 'note'; note: FastCorner; variant: NoteVariant; secondsToPoint: number }
  | { type: 'off-reference'; offsetM: number }
  | { type: 'back-on-reference' }
  | { type: 'other-car'; carCode: number }
  /** lapTimeMs: own measurement without pauses; missing for the first crossing and after a restart or replay jump. */
  | { type: 'new-lap'; lap: number; lapTimeMs?: number }
  /** Race, practice (time trial, free run, Sport Mode practice), replay or menu; sent on every change. */
  | { type: 'mode'; mode: SessionMode }
  /**
   * A sector of a timed lap against the reference (time trial and practice, not in races; not at the line: the
   * lap difference says that). Times since the lap start without pauses; refElapsedMs: the reference's there.
   */
  | { type: 'sector'; lap: number; sector: number; sectors: number; elapsedMs: number; refElapsedMs: number }
  /** First start/finish crossing: from here on there are cues and feedback (see waitForFirstLap). */
  | { type: 'coaching-started' }
  /** help: the help for the corner after this run, if it has a mistake being worked on (docs/dev/coach-and-texts.md). */
  | { type: 'corner-result'; result: CornerResult; help?: CornerHelp }
  /** A focus exercise: for some laps only this corner gets feedback. done: it ended because the corner works now. */
  | { type: 'focus-started'; cornerIndex: number; laps: number }
  | { type: 'focus-ended'; cornerIndex: number; done: boolean }
  /** justDriven: the feedback is about the corner the driver just left (can be said right away). */
  | { type: 'feedback-new'; feedback: FeedbackItem; justDriven: boolean }
  | { type: 'feedback-updated'; feedback: FeedbackItem; justDriven: boolean }
  | { type: 'feedback-resolved'; feedback: FeedbackItem; result: CornerResult };

/** Live distance from the reference line beyond which the coach stays silent. */
const OFF_REFERENCE_M = 30;
const MIN_SPEED = 5;
/** Countdown, gear and turn-in cues that would come later than this are dropped. */
const MAX_LATE_TIMED = 0.25;
/** Tone, feedback and intro may come a little later. */
const MAX_LATE_ANNOUNCEMENT = 0.6;
/** The turn-in is timed, but better a moment late than not at all (the user, 2026-11-03: it should always come). */
const MAX_LATE_TURN_IN = 1;
/** Consecutive positions further apart than this are a teleport (restart, replay jump). */
const TELEPORT_M = 50;
/** Less movement than this between two frames at speed: a repeated packet (results screen), not driving. */
const FROZEN_M = 0.001;
const INTRO_GAP = 0.3;
/** Pause between the corner plan and the countdown. */
const PLAN_GAP = 0.35;
const FEEDBACK_GAP = 0.4;
const TONE_GAP = 0.15;
/** A corner's cue plan is fixed this many seconds before its braking point. */
const PLAN_HORIZON_SECONDS = 30;
/** Time the previous corner's last cue needs to be spoken before a feedback may start. */
const PREVIOUS_CUE_MARGIN = 1;
/** A session mode must hold this long before it is reported. */
const MODE_STABLE_MS = 3000;
/** A corner that is clean this many times in a row has its help (and helping cue) taken away. */
const HELP_CLEAN_RUNS = 2;
const HELP_STEPS: readonly HelpStep[] = ['feedback', 'tip', 'assist', 'focus', 'exhausted'];
/** Progress: a mistake at least this much smaller (and at least 30 % smaller) counts as clearly better. */
const PROGRESS_MIN: Record<Problem['kind'], number> = {
  'no-brake': Infinity,
  'brake-early': 5,
  'brake-late': 5,
  'late-throttle': 5,
  'slow-apex': 3,
  'fast-apex': 3,
  'brake-weak': 10,
  'brake-hard': 10,
  'wrong-gear': 1,
  'no-trail': 10,
  'trail-long': 5,
};
const PROGRESS_SHARE = 0.3;
/** "jetzt" comes at most this much earlier for a driver who keeps braking late. */
const EARLY_NOW_MAX_S = 0.3;
/** "Gas!" this long before the reference's full-throttle point. */
const THROTTLE_LEAD_S = 0.3;
/** A gear in the corner (further down after the apex, up into the exit gear) this long before the reference shifts. */
const GEAR_LEAD_S = 0.4;
/** The entry gear is called where the reference shifts into it when that comes this long after the braking point. */
const ENTRY_SHIFT_LATE_S = 1.0;
/** A word that follows "jetzt" right away starts this long after it. */
const AFTER_NOW_GAP_S = 0.05;
/** A turn-in that waits for "jetzt" (or the gear after it) starts this long after them ... */
const TURN_IN_AFTER_GAP_S = 0.1;
/** ... and has to end this long before the next corner's braking point (its tone and "jetzt" need the room). */
const NEXT_CORNER_LEAD_S = 1.0;
/** The direction alone only has to end before "jetzt" of the next corner. */
const NEXT_CORNER_LEAD_SHORT_S = 0;
/** A turn-in before the braking point may end this long after it: "bremsen" then waits for it. */
const TURN_FIRST_SLACK_S = 0.1;
/** The short call says the gear: it may start this soon after the previous corner's last cue, sooner than the other announcements. */
const CALL_AFTER_PREVIOUS_S = 0.5;
/** A gear nothing else could say may still come this long after the corner's exit. */
const GEAR_AFTER_EXIT_S = 1;
/** A pace note that would end less than this before its lift or turn is left out. */
const NOTE_MIN_LEAD_S = 0.6;
/** Pause between a pace note and the next cue. */
const NOTE_GAP = 0.3;
/** From one number to the next (and from the last one to "jetzt"): the number, then the pause after it. */
export function countStep(settings: Pick<CoachSettings, 'countSeconds' | 'countPause'>, pause = settings.countPause): number {
  return settings.countSeconds + pause;
}
/** Slower than the reference by at least this after the corner: the feedback right after it says so in km/h. */
const EXIT_SLOW_KMH = 5;

/** The helping cue for a mistake. */
export function assistFor(kind: Problem['kind']): AssistKind {
  switch (kind) {
    case 'brake-early':
      return 'wait';
    case 'brake-late':
      return 'early-now';
    case 'wrong-gear':
      return 'gear';
    case 'slow-apex':
    case 'fast-apex':
      return 'target';
    case 'late-throttle':
      return 'throttle';
    // Trail braking (docs/dev/coach-and-texts.md): "Langsam lösen" at turn-in, "Bremse los" where the reference lets go.
    case 'no-trail':
      return 'trail';
    case 'trail-long':
      return 'release';
    default:
      return 'force';
  }
}

/** A mistake's size, to tell progress (meters, km/h, percent points, gears). */
export function problemSize(p: Problem): number {
  switch (p.kind) {
    case 'brake-early':
    case 'brake-late':
    case 'late-throttle':
    case 'trail-long':
      return p.meters;
    case 'no-trail':
      return Math.max(0, p.refPercent - p.percent);
    case 'slow-apex':
    case 'fast-apex':
      return p.kmh;
    case 'brake-weak':
    case 'brake-hard':
      return Math.abs(p.refPercent - p.percent);
    case 'wrong-gear':
      return Math.abs(p.gear - p.refGear);
    case 'no-brake':
      return 1;
  }
}

interface Step {
  kind: CueKind;
  /** Track position the step refers to. */
  s: number;
  /** Seconds before that position at which the step plays (negative: after it). */
  offset: number;
  count?: number;
  gear?: number;
  short?: boolean;
  line?: LineCall;
  feedback?: FeedbackItem;
  variant?: FeedbackVariant;
  plan?: PlanVariant;
  assist?: AssistKind;
}

interface Plan {
  steps: Step[];
  next: number;
  /** "jetzt", once said: its step and when (frame time). */
  said?: { s: number; offset: number; at: number };
}

/** Turns live telemetry into countdowns to every braking point, and feedback on problem corners. */
export class CoachSession {
  private readonly locator: TrackLocator;
  private readonly segments: CornerSegment[];
  /** Key "lap:corner". */
  private readonly plans = new Map<string, Plan>();
  private readonly runs = new Map<number, RunSample[]>();
  /** Corners whose run is left out until the car leaves them (a slide or spin there, see dropRun). */
  private readonly dropped = new Set<number>();
  /** Corners whose feedback is announced on the next approach. */
  private readonly feedbackByCorner = new Map<number, FeedbackItem>();
  private readonly feedbackAudio = new Map<number, FeedbackAudio>();
  /** Corner index -> lengths of its plan clips; corners without are planned without the plan. */
  private readonly planAudio = new Map<number, PlanAudio>();
  /** Most recent result per corner, to pick the corners with the biggest time loss. */
  private readonly latestResults = new Map<number, CornerResult>();
  /** A corner keeps its feedback number for the whole session. */
  private readonly feedbackNumbers = new Map<number, number>();
  private nextFeedbackNumber = 1;
  private lastS: number | undefined;
  private lastFrame: TelemetryFrame | undefined;
  private lap = 0;
  /** When the current lap started (frame time, moved forward by pauses); undefined until a full lap is timed. */
  private lapStart: number | undefined;
  private previousFrameTime: number | undefined;
  /** Sector ends along the reference (meters); the last sector ends at the line. */
  private offReference = false;
  private otherCarWarned = false;
  private started: boolean;
  /** Until when the last gear word is still being spoken (frame time, ms). */
  private gearSpokenUntil = 0;
  private mode: SessionMode | undefined;
  private modeCandidate: SessionMode | undefined;
  private modeCandidateSince = 0;
  /** After the chequered flag (GT7 drives the car round itself, then its results). */
  private readonly raceEnd = new RaceEnd();
  /** Where the sectors end (meters along the reference) and the next one to come. */
  private sectorEnds: number[] = [];
  private nextSector = 0;
  /**
   * Help per corner for the mistake that keeps coming there; clean: clean runs in a row since; focused: its
   * focus exercise ran (once per mistake).
   */
  private readonly help = new Map<number, CornerHelp & { clean: number; focused: boolean }>();
  /**
   * The focus exercise running, if any: runs of the corner left, and the lap it ends at the latest (the
   * corner may be skipped: off the reference line, in the pits).
   */
  private focus: { cornerIndex: number; runsLeft: number; untilLap: number } | undefined;
  /** The corners without braking, and the spoken lengths of their pace notes (corners without are not called). */
  private readonly fastCorners: FastCorner[];
  /** Per braking corner: the corners without braking its plan announces too (chained, "dann …"). */
  private readonly chained = new Map<number, FastCorner[]>();
  /** Braking corners that follow the one before closely (docs/dev/coach-and-texts.md): named in its plan, no explanations of their own. */
  private readonly followers = new Set<number>();
  private readonly noteAudio = new Map<number, NoteAudio>();
  /** Pace notes played or left out, key "lap:corner". */
  private readonly notesDone = new Set<string>();
  /** Until when the last cue is still being spoken (frame time, ms, from the clips' lengths). */
  private busyUntil = 0;
  /** What earlier sessions remember per corner (the reference's history): problem corners before this session drives them. */
  private readonly earlier = new Map<number, { timeLossS: number; problems: Problem[] }>();
  /** The biggest problem corners for the race calls, worked out again when a result comes in. */
  private problemCornersCache: Set<number> | undefined;

  constructor(
    private readonly reference: ReferenceLap,
    private settings: CoachSettings = DEFAULT_COACH_SETTINGS,
    private readonly phrases: Phrases = builtInPhrases('de'),
  ) {
    this.locator = new TrackLocator(reference.points);
    this.segments = cornerSegments(reference);
    this.started = !settings.waitForFirstLap;
    this.fastCorners = reference.fastCorners ?? [];
    for (const corner of reference.corners) {
      const chained = chainedAfter(reference, corner);
      if (chained.length) this.chained.set(corner.index, chained);
      if (isFollower(reference, corner)) this.followers.add(corner.index);
    }
  }

  get activeFeedback(): FeedbackItem[] {
    return [...this.feedbackByCorner.values()];
  }

  /**
   * The corners' results remembered from earlier sessions (time loss and mistakes, key: braking zone index): the
   * race calls know the problem corners before this session has driven them.
   */
  setEarlierResults(corners: Record<string, { timeLossS: number; problems: Problem[] }>): void {
    this.earlier.clear();
    for (const [index, memory] of Object.entries(corners)) this.earlier.set(Number(index), { timeLossS: memory.timeLossS, problems: memory.problems });
    this.problemCornersCache = undefined;
  }

  /** False on the out lap (see waitForFirstLap). */
  get isStarted(): boolean {
    return this.started;
  }

  /** Laps counted by the coach (start/finish crossings). */
  get currentLap(): number {
    return this.lap;
  }

  get currentMode(): SessionMode | undefined {
    return this.mode;
  }

  /** Sectors of a timed lap against the reference: this many per lap (0 or 1 = none). */
  setSectors(count: number): void {
    const n = Math.max(0, Math.min(10, Math.round(count)));
    this.sectorEnds = Array.from({ length: Math.max(0, n - 1) }, (_, i) => (this.reference.lengthMeters * (i + 1)) / n);
    this.nextSector = 0;
  }

  /** The help for the feedback texts: none in races (only the mistake, no tips). */
  private feedbackHelp(cornerIndex: number): CornerHelp | undefined {
    return this.mode === 'race' ? undefined : this.helpFor(cornerIndex);
  }

  /** The help for a corner's mistake that keeps coming, if any. */
  helpFor(cornerIndex: number): CornerHelp | undefined {
    const help = this.help.get(cornerIndex);
    return help && { cornerIndex: help.cornerIndex, kind: help.kind, times: help.times, step: help.step, size: help.size, improved: help.improved };
  }

  /** The corner of the focus exercise running, and the laps left. */
  get focusExercise(): { cornerIndex: number; lapsLeft: number } | undefined {
    return this.focus && { cornerIndex: this.focus.cornerIndex, lapsLeft: this.focus.runsLeft };
  }

  /** The reference's time (ms since its lap start) at a point of the lap. */
  referenceTimeAt(s: number): number {
    return this.referenceTime(s) * 1000;
  }

  /** New settings apply from the next corner on; cue plans already fixed stay as they are. */
  updateSettings(settings: CoachSettings): void {
    this.settings = settings;
  }

  /** Called by the audio side when a corner's plan clips are ready. */
  setPlanAudio(cornerIndex: number, audio: PlanAudio): void {
    this.planAudio.set(cornerIndex, audio);
  }

  /** Called by the audio side when a feedback's clips are ready. */
  setFeedbackAudio(cornerIndex: number, audio: FeedbackAudio): void {
    this.feedbackAudio.set(cornerIndex, audio);
  }

  /** Called by the audio side when the pace note of a corner without braking is ready. */
  setNoteAudio(fastCornerIndex: number, audio: NoteAudio): void {
    this.noteAudio.set(fastCornerIndex, audio);
  }

  /**
   * Called by the audio side while it speaks something of its own (the feedback right after a corner, an
   * announcement), until when (frame time, ms): the pace notes wait for it instead of being left out.
   */
  holdUntil(time: number): void {
    this.busyUntil = Math.max(this.busyUntil, time);
  }

  /**
   * Seconds until the next planned cue, to know whether a sentence fits in now. withNotes: the pace notes of the
   * corners without braking count too; the feedback right after a corner goes first and leaves them out.
   */
  quietSeconds(withNotes = true): number {
    const frame = this.lastFrame;
    // Without a position nothing is planned, so nothing can be talked over (0 here dropped every sentence, 2026-11-03).
    if (this.lastS === undefined || !frame) return Infinity;
    const s = this.lastS;
    const speed = Math.max(frame.speed, MIN_SPEED);
    const corners = this.reference.corners;
    let quiet = Infinity;
    for (let c = 0; c < corners.length; c++) {
      const { distance: toBrake, lap } = this.ahead(corners[c]!.brakeS, s);
      // Before the first lap (the silent out lap) the cues start at the line: only the corners beyond it count.
      if (!this.started && lap <= this.lap) continue;
      const plan = this.plans.get(`${lap}:${corners[c]!.index}`);
      const steps = plan ? plan.steps.slice(plan.next) : toBrake >= 0 ? this.buildSteps(c) : [];
      for (const step of steps) {
        // After "jetzt" from the same point: on the clock, not by the speed (playCorner).
        const said = plan?.said;
        if (said && step.s === said.s && step.offset < said.offset) {
          quiet = Math.min(quiet, Math.max(0, (said.at - frame.time) / 1000 + said.offset - step.offset));
          continue;
        }
        const { distance } = this.ahead(step.s, s);
        // At the current speed, or as the reference drove it, whichever is shorter: out of a corner the car is
        // slow but accelerates, so the current speed alone promised far too much time (sentences were cut off).
        const travel = distance > 0 ? Math.min(distance / speed, this.referenceSecondsAhead(s, distance)) : distance / speed;
        const seconds = travel - step.offset - this.settings.outputLatencySeconds;
        if (seconds > -MAX_LATE_ANNOUNCEMENT) quiet = Math.min(quiet, Math.max(0, seconds));
      }
    }
    if (withNotes) {
      for (const corner of this.fastCorners) {
        const note = this.noteSeconds(corner);
        if (note === undefined) continue;
        const { distance, lap } = this.ahead(fastCornerPoint(corner), s);
        if (distance < 0 || this.notesDone.has(`${lap}:${corner.index}`)) continue;
        if (!this.started && lap <= this.lap) continue;
        const travel = Math.min(distance / speed, this.referenceSecondsAhead(s, distance));
        const seconds = travel - note.fullSeconds - this.settings.noteLeadSeconds - this.settings.outputLatencySeconds;
        if (seconds > -MAX_LATE_ANNOUNCEMENT) quiet = Math.min(quiet, Math.max(0, seconds));
      }
    }
    return quiet;
  }

  update(frame: TelemetryFrame): CoachEvent[] {
    const events: CoachEvent[] = [];
    const paused = (frame.flags & (Flags.Paused | Flags.Loading)) !== 0;
    // Paused time is no lap time: the lap's start moves along with the pause.
    if (paused && this.lapStart !== undefined && this.previousFrameTime !== undefined) this.lapStart += frame.time - this.previousFrameTime;
    this.previousFrameTime = frame.time;
    if (!paused) {
      // Debounced: session restarts briefly look like a replay.
      const mode = detectMode(frame);
      if (mode !== this.modeCandidate) {
        this.modeCandidate = mode;
        this.modeCandidateSince = frame.time;
      }
      if (mode !== this.mode && frame.time - this.modeCandidateSince >= MODE_STABLE_MS) {
        this.mode = mode;
        // Races are no training: a focus exercise ends without a word.
        if (mode === 'race') this.focus = undefined;
        events.push({ type: 'mode', mode });
      }
    }
    // Quiet in races unless asked for calls: no cues, no analysis against a solo lap, no laps of its own. From
    // the first race frame on (the mode itself is debounced): no car warning at the start either.
    const racing = this.mode === 'race' || (!paused && detectMode(frame) === 'race');
    const raceOver = this.raceEnd.update(frame);
    if (racing && this.settings.raceCalls === 'off') return events;
    // After the flag: no race corner calls while GT7 drives, and nothing it drives counts as the driver's result.
    if (raceOver) {
      this.runs.clear();
      return events;
    }
    if (frame.flags & (Flags.Paused | Flags.Loading) || frame.speed < MIN_SPEED) return events;
    // The preparation screen's video is nothing to coach, and a replay only on request.
    const shown = detectMode(frame);
    if (shown === 'menu' || (shown === 'replay' && !this.settings.replayCalls)) return events;

    const last = this.lastFrame;
    this.lastFrame = frame;
    // Results screens repeat the last packet (speed, but no movement): nothing to coach either.
    if (last && Math.hypot(frame.x - last.x, frame.y - last.y, frame.z - last.z) < FROZEN_M) return events;
    if (last && Math.hypot(frame.x - last.x, frame.z - last.z) > TELEPORT_M) {
      // Restart or replay jump: no lap change, no half-recorded corners, nothing played late.
      this.lastS = undefined;
      this.locator.reset();
      this.runs.clear();
      this.dropped.clear();
      this.lapStart = undefined;
    }

    if (frame.carCode !== this.reference.carCode && !this.otherCarWarned) {
      this.otherCarWarned = true;
      events.push({ type: 'other-car', carCode: frame.carCode });
    }

    const { s, offset } = this.locator.locate(frame.x, frame.z);
    if (offset > OFF_REFERENCE_M) {
      if (!this.offReference) events.push({ type: 'off-reference', offsetM: offset });
      this.offReference = true;
      this.runs.clear();
      return events;
    }
    if (this.offReference) {
      this.offReference = false;
      events.push({ type: 'back-on-reference' });
    }

    // Crossing the start/finish line: s jumps from the end back to the start.
    if (this.lastS !== undefined && this.lastS - s > this.reference.lengthMeters / 2) {
      this.lap++;
      const lapTimeMs = this.lapStart !== undefined ? frame.time - this.lapStart : undefined;
      this.lapStart = frame.time;
      this.nextSector = 0;
      events.push({ type: 'new-lap', lap: this.lap, lapTimeMs });
      if (this.focus && this.lap > this.focus.untilLap) {
        events.push({ type: 'focus-ended', cornerIndex: this.focus.cornerIndex, done: false });
        this.focus = undefined;
      }
      if (this.plans.size > 500) this.plans.clear();
      if (this.notesDone.size > 500) this.notesDone.clear();
      if (!this.started) {
        this.started = true;
        events.push({ type: 'coaching-started' });
      }
    }
    // Sector ends within a timed lap (not in races: the crew reports there).
    const end = this.sectorEnds[this.nextSector];
    if (end !== undefined && this.mode !== 'race' && this.lapStart !== undefined && this.lastS !== undefined && this.lastS < end && s >= end) {
      this.nextSector++;
      events.push({
        type: 'sector',
        lap: this.lap,
        sector: this.nextSector,
        sectors: this.sectorEnds.length + 1,
        elapsedMs: frame.time - this.lapStart,
        refElapsedMs: this.referenceTimeAt(end),
      });
    }
    this.lastS = s;
    if (!this.started) return events;

    this.trackRuns(events, frame, s);
    for (let c = 0; c < this.reference.corners.length; c++) this.playCorner(events, c, s, frame);
    for (const corner of this.fastCorners) this.playNote(events, corner, s, frame);
    return events;
  }

  // --- Corner analysis and feedback ---

  private trackRuns(events: CoachEvent[], frame: TelemetryFrame, s: number): void {
    const corners = this.reference.corners;
    for (let c = 0; c < corners.length; c++) {
      const segment = this.segments[c]!;
      const samples = this.runs.get(c);
      if (s >= segment.sampleStartS && s <= segment.endS) {
        if (this.dropped.has(c)) continue;
        const sample = { s, t: frame.time, speed: frame.speed, brake: frame.brake, throttle: frame.throttle, gear: frame.gear, x: frame.x, z: frame.z };
        if (samples) samples.push(sample);
        else this.runs.set(c, [sample]);
      } else {
        this.dropped.delete(c);
        if (samples) {
          this.runs.delete(c);
          if (samples.at(-1)!.s >= segment.endS - 10) this.finishCorner(events, c, samples);
        }
      }
    }
  }

  /**
   * Leaves the run of the braking zone being driven out (docs/dev/coach-and-texts.md): after a slide or spin its time loss and apex
   * speed say nothing about the braking, and its feedback would be wrong ("40 km/h too slow"). Returns that zone.
   */
  dropRun(): Corner | undefined {
    const s = this.lastS;
    if (s === undefined || this.offReference) return undefined;
    let dropped: Corner | undefined;
    for (let c = 0; c < this.reference.corners.length; c++) {
      const segment = this.segments[c]!;
      if (s < segment.sampleStartS || s > segment.endS) continue;
      this.runs.delete(c);
      this.dropped.add(c);
      dropped = this.reference.corners[c];
    }
    return dropped;
  }

  /** The braking zone (with its run before and after it) at a position, if the position is on the reference line. */
  cornerAt(x: number, z: number): Corner | undefined {
    const { s, offset } = new TrackLocator(this.reference.points).locate(x, z);
    if (offset > OFF_REFERENCE_M) return undefined;
    const c = this.segments.findIndex((segment) => s >= segment.sampleStartS && s <= segment.endS);
    return c >= 0 ? this.reference.corners[c] : undefined;
  }

  private finishCorner(events: CoachEvent[], c: number, samples: RunSample[]): void {
    const corner = this.reference.corners[c]!;
    const result = analyzeCorner(this.reference, corner, this.segments[c]!, samples);
    if (!result) return;
    // The help ladder is for training: not in races.
    const help = this.mode === 'race' ? undefined : this.updateHelp(events, result);
    events.push({ type: 'corner-result', result, help });
    if (this.mode !== 'race') this.updateFocus(events, corner.index);
    this.latestResults.set(corner.index, result);
    this.problemCornersCache = undefined;
    if (!this.settings.feedback) return;

    const existing = this.feedbackByCorner.get(corner.index);
    if (existing && !this.isSignificant(result)) {
      this.feedbackByCorner.delete(corner.index);
      events.push({ type: 'feedback-resolved', feedback: existing, result });
    }

    // The corners with the biggest time loss get the feedback slots for the next lap.
    const limit = this.settings.feedbackPerLap === 'all' ? Infinity : this.settings.feedbackPerLap;
    const chosen = [...this.latestResults.values()]
      .filter((r) => this.isSignificant(r))
      .sort((a, b) => b.timeLossS - a.timeLossS)
      .slice(0, limit);
    const chosenCorners = new Set(chosen.map((r) => r.corner.index));
    for (const index of this.feedbackByCorner.keys()) {
      if (!chosenCorners.has(index)) this.feedbackByCorner.delete(index);
    }

    for (const r of chosen) {
      const index = r.corner.index;
      const active = this.feedbackByCorner.get(index);
      if (active) {
        // Only the corner just driven has new data.
        if (index !== corner.index) continue;
        const texts = feedbackTexts(active.number, r.problems, this.phrases, this.feedbackHelp(index), r.corner, exitDelta(r), this.guidedBy(r));
        if (texts.long === active.texts.long) continue;
        const updated = { ...active, problems: r.problems, texts, version: active.version + 1 };
        this.feedbackByCorner.set(index, updated);
        events.push({ type: 'feedback-updated', feedback: updated, justDriven: true });
      } else {
        const number = limit === Infinity ? this.sessionNumber(index) : this.freeSlot(limit);
        const version = (this.feedbackAudio.get(index)?.version ?? 0) + 1;
        const feedback = { number, cornerIndex: index, problems: r.problems, version, texts: feedbackTexts(number, r.problems, this.phrases, this.feedbackHelp(index), r.corner, exitDelta(r), this.guidedBy(r)) };
        this.feedbackByCorner.set(index, feedback);
        events.push({ type: 'feedback-new', feedback, justDriven: index === corner.index });
      }
    }
  }

  /**
   * The help ladder for a corner (docs/dev/coach-and-texts.md): the same mistake again without clear progress goes one step
   * further: feedback, tip, helping cue (if on), focus exercise (if on, and no other one runs), exhausted.
   * Clearly smaller counts as progress and stays on its step. Clean twice in a row: the help ends.
   */
  private updateHelp(events: CoachEvent[], result: CornerResult): CornerHelp | undefined {
    const index = result.corner.index;
    const previous = this.help.get(index);
    const main = result.problems[0];
    if (!main || !this.isSignificant(result)) {
      if (!previous) return undefined;
      previous.clean++;
      // The exercise worked: one clean run is enough.
      if (previous.clean >= HELP_CLEAN_RUNS || this.focus?.cornerIndex === index) {
        this.help.delete(index);
        if (this.focus?.cornerIndex === index) {
          events.push({ type: 'focus-ended', cornerIndex: index, done: true });
          this.focus = undefined;
        }
      }
      return undefined;
    }
    const same = previous && result.problems.find((p) => p.kind === previous.kind);
    if (!previous || !same) {
      const step: HelpStep = this.settings.helpFirst ? 'feedback' : 'exhausted';
      const fresh = { cornerIndex: index, kind: main.kind, times: 1, step, size: problemSize(main), improved: false, clean: 0, focused: false };
      this.help.set(index, { ...fresh });
      return this.helpFor(index);
    }
    const size = problemSize(same);
    const improved = this.settings.helpFirst && size <= previous.size - Math.max(PROGRESS_MIN[same.kind], previous.size * PROGRESS_SHARE);
    previous.times++;
    previous.size = size;
    previous.improved = improved;
    previous.clean = 0;
    // During its focus exercise a corner stays on the step until the exercise is over.
    if (!improved && this.focus?.cornerIndex !== index) previous.step = this.nextStep(previous, index);
    return this.helpFor(index);
  }

  private nextStep(help: CornerHelp & { focused: boolean }, cornerIndex: number): HelpStep {
    if (!this.settings.helpFirst) return 'exhausted';
    // Steps switched off in the settings are skipped (also when the corner is on one of them right now).
    for (let i = HELP_STEPS.indexOf(help.step) + 1; i < HELP_STEPS.length; i++) {
      const next = HELP_STEPS[i]!;
      if (next === 'assist' && !this.settings.helpAssists) continue;
      if (next === 'focus' && (this.settings.focusLaps <= 0 || help.focused)) continue;
      // Only one focus exercise at a time; meanwhile the others wait on their step.
      if (next === 'focus' && this.focus && this.focus.cornerIndex !== cornerIndex) return help.step;
      return next;
    }
    return 'exhausted';
  }

  /**
   * The focus exercise: starts when a corner reaches the step (once per mistake), counts the corner's runs and
   * ends after the last one. A clean run ends it earlier (updateHelp).
   */
  private updateFocus(events: CoachEvent[], cornerIndex: number): void {
    if (this.focus?.cornerIndex === cornerIndex) {
      if (--this.focus.runsLeft > 0) return;
      events.push({ type: 'focus-ended', cornerIndex, done: false });
      this.focus = undefined;
      return;
    }
    const help = this.help.get(cornerIndex);
    if (help?.step !== 'focus' || help.focused || this.focus || this.settings.focusLaps <= 0) return;
    help.focused = true;
    const laps = this.settings.focusLaps;
    this.focus = { cornerIndex, runsLeft: laps, untilLap: this.lap + laps + 1 };
    events.push({ type: 'focus-started', cornerIndex, laps });
  }

  /** "Jede Kurve": a corner keeps its number for the whole session. */
  private sessionNumber(cornerIndex: number): number {
    let number = this.feedbackNumbers.get(cornerIndex);
    if (number === undefined) {
      number = this.nextFeedbackNumber++;
      this.feedbackNumbers.set(cornerIndex, number);
    }
    return number;
  }

  /** Limited ("2x", "3x"): names are slots, so "2x" only ever says "Feedback 1" and "Feedback 2". */
  private freeSlot(limit: number): number {
    const used = new Set([...this.feedbackByCorner.values()].map((f) => f.number));
    for (let slot = 1; slot <= limit; slot++) if (!used.has(slot)) return slot;
    return limit;
  }

  private isSignificant(result: CornerResult): boolean {
    return result.problems.length > 0 && result.timeLossS >= this.settings.feedbackMinLossSeconds;
  }

  // --- Cues ---

  private playCorner(events: CoachEvent[], c: number, s: number, frame: TelemetryFrame): void {
    const speed = frame.speed;
    const corners = this.reference.corners;
    const corner = corners[c]!;
    const { distance: toBrake, lap } = this.ahead(corner.brakeS, s);
    const key = `${lap}:${corner.index}`;

    // One corner at a time: wait until the previous corner's cues are behind us,
    // so a chicane's second countdown doesn't talk over the first.
    if (corners.length > 1) {
      const previous = corners[(c - 1 + corners.length) % corners.length]!;
      const previousEnd = this.lastCueS(previous);
      const toPreviousEnd = this.ahead(previousEnd, s).distance;
      if (toPreviousEnd >= 0 && toPreviousEnd < toBrake) return;
    }

    let plan = this.plans.get(key);
    if (!plan) {
      // Fix the plan shortly before the corner, so feedback from the last lap is included.
      if (toBrake < 0 || toBrake / speed > PLAN_HORIZON_SECONDS) return;
      // In races only the corners worth it get calls (an empty plan keeps the corner quiet this lap).
      plan = { steps: this.callsThisCorner(corner) ? this.buildSteps(c) : [], next: 0 };
      this.plans.set(key, plan);
    }

    while (plan.next < plan.steps.length) {
      const step = plan.steps[plan.next]!;
      const { distance } = this.ahead(step.s, s);
      // The announcements before the countdown (tone, feedback, intro, plan) start by the shorter of the current
      // speed and the reference's time: out of a corner the car accelerates, and at the current speed they started
      // too late and the countdown cut them off. Countdown, "jetzt", gear and turn-in stay on the current speed.
      const early = step.kind === 'tone' || step.kind === 'feedback' || step.kind === 'intro' || step.kind === 'plan' || step.kind === 'line';
      const seconds = early && distance > 0 ? Math.min(distance / speed, this.referenceSecondsAhead(s, distance)) : distance / speed;
      const trigger = step.offset + this.settings.outputLatencySeconds;
      // What follows "jetzt" from the same point runs on the clock from it: by the speed, which falls hard there, the words
      // came too early and ran into each other (a turn-in behind a gear was dropped for it).
      const said = plan.said;
      const onClock = !!said && step.s === said.s && step.offset < said.offset;
      if (onClock ? frame.time - said.at < (said.offset - step.offset) * 1000 : seconds > trigger) break;
      // Would cut off a gear word being said: it waits for it, it is not dropped.
      if (step.kind === 'turn-in' && frame.time < this.gearSpokenUntil) break;
      plan.next++;
      const maxLate = early ? MAX_LATE_ANNOUNCEMENT : step.kind === 'turn-in' ? MAX_LATE_TURN_IN : MAX_LATE_TIMED;
      if (step.kind === 'assist') this.gearSpokenUntil = Math.max(this.gearSpokenUntil, frame.time + this.settings.gearSeconds * 1000);
      // Never play a cue late: a countdown that starts mid-way skips the numbers already past.
      if (!onClock && seconds < trigger - maxLate) continue;
      if (step.kind === 'gear') this.gearSpokenUntil = frame.time + this.settings.gearSeconds * 1000;
      if (step.kind === 'now') plan.said = { s: step.s, offset: step.offset, at: frame.time };
      this.busyUntil = Math.max(this.busyUntil, frame.time + this.stepSeconds(step, corner) * 1000);
      // The full plan announces the corners without braking that follow right on it: their notes are said.
      if (step.kind === 'plan' && step.plan === 'full' && this.settings.fastCorners) {
        for (const fast of this.chained.get(corner.index) ?? []) this.notesDone.add(`${this.ahead(fastCornerPoint(fast), s).lap}:${fast.index}`);
      }
      events.push({
        type: 'cue',
        cue: { kind: step.kind, corner, count: step.count, gear: step.gear, short: step.short, line: step.line, feedback: step.feedback, variant: step.variant, plan: step.plan, assist: step.assist, secondsToPoint: seconds },
      });
    }
  }

  /** About how long a cue speaks, from the clips' lengths the audio side reported. */
  private stepSeconds(step: Step, corner: Corner): number {
    const settings = this.settings;
    switch (step.kind) {
      case 'tone':
        return settings.toneSeconds;
      case 'intro':
        return (step.feedback && this.feedbackAudio.get(corner.index)?.introSeconds) || settings.introSeconds;
      case 'plan': {
        const audio = this.planAudio.get(corner.index);
        return (step.plan === 'short' ? audio?.shortSeconds : step.plan === 'shape' ? audio?.shapeSeconds : step.plan === 'call' ? audio?.callSeconds : audio?.fullSeconds) ?? 0;
      }
      case 'feedback': {
        const audio = this.feedbackAudio.get(corner.index);
        return (step.variant === 'long' ? audio?.longSeconds : step.variant === 'tiny' ? audio?.tinySeconds : audio?.shortSeconds) ?? 0;
      }
      case 'count':
        return settings.countSeconds;
      case 'now':
        return settings.nowSeconds;
      case 'brake':
      case 'brake-point':
        return lightBrake(corner) === undefined ? settings.brakeSeconds : settings.brakeLightSeconds;
      case 'gear':
        return settings.gearSeconds;
      case 'turn-in':
        return step.short ? settings.turnInShortSeconds : settings.turnInSeconds;
      case 'line':
        return settings.lineSeconds;
      case 'assist':
        // "warten", "Gas!", "Langsam lösen", "Bremse los" or the target speed ("Scheitel 120").
        return Math.max(settings.gearSeconds, 1);
    }
  }

  /** A pace note's clip lengths, if it is called: setting on, clips ready; in races only with every corner called. */
  private noteSeconds(corner: FastCorner): NoteAudio | undefined {
    if (!this.settings.fastCorners) return undefined;
    if (this.mode === 'race' && this.settings.raceCalls !== 'all') return undefined;
    return this.noteAudio.get(corner.index);
  }

  /**
   * A corner without braking (docs/dev/coach-and-texts.md): its pace note before the lift or the turn, when there is room. The
   * braking calls come first: it waits while a cue is spoken and never runs into the next corner's announcements.
   * The full note (with the curbs) if it fits, else the short one; left out when even that would come too late.
   */
  private playNote(events: CoachEvent[], corner: FastCorner, s: number, frame: TelemetryFrame): void {
    const audio = this.noteSeconds(corner);
    if (!audio) return;
    const { distance, lap } = this.ahead(fastCornerPoint(corner), s);
    const key = `${lap}:${corner.index}`;
    if (distance < 0 || this.notesDone.has(key)) return;
    // As the announcements: the shorter of the current speed and the reference's time (the car accelerates).
    const speed = Math.max(frame.speed, MIN_SPEED);
    const travel = Math.min(distance / speed, this.referenceSecondsAhead(s, distance));
    const left = travel - this.settings.outputLatencySeconds;
    if (left > audio.fullSeconds + this.settings.noteLeadSeconds) return;
    if (left < Math.min(audio.fullSeconds, audio.shortSeconds) + NOTE_MIN_LEAD_S) {
      this.notesDone.add(key);
      return;
    }
    if (frame.time < this.busyUntil) return;
    const quiet = this.quietSeconds(false);
    const options: [NoteVariant, number][] = [
      ['full', audio.fullSeconds],
      ['short', audio.shortSeconds],
    ];
    const fitting = options.find(([, seconds]) => left >= seconds + NOTE_MIN_LEAD_S && quiet >= seconds + NOTE_GAP);
    if (!fitting) return;
    this.notesDone.add(key);
    this.busyUntil = frame.time + fitting[1] * 1000;
    events.push({ type: 'note', note: corner, variant: fitting[0], secondsToPoint: travel });
  }

  private callsThisCorner(corner: Corner): boolean {
    if (this.mode !== 'race' || this.settings.raceCalls === 'all') return true;
    return this.raceProblemCorners().has(corner.index);
  }

  private buildSteps(c: number): Step[] {
    const settings = this.settings;
    const corner = this.reference.corners[c]!;
    const steps: Step[] = [];
    const wanted = Math.max(0, Math.floor(settings.countdownSeconds));
    // The countdown and what comes before it are built back from the first action: the braking point, or a turn-in
    // before it, which takes that much of the time since the previous corner.
    const first = this.turnFirst(corner) ?? corner.brakeS;
    const head = this.cornerTime(corner, corner.brakeS) - this.cornerTime(corner, first);

    // A focus exercise elsewhere: no feedback here (the braking calls stay). A corner of a chain after its first one
    // explains nothing: its shape came with the first one's plan (docs/dev/coach-and-texts.md).
    const focusElsewhere = !!this.focus && this.focus.cornerIndex !== corner.index;
    const follower = settings.chainCalls && this.followers.has(corner.index);
    const feedback = focusElsewhere || follower ? undefined : this.feedbackByCorner.get(corner.index);
    const audio = this.feedbackAudio.get(corner.index);
    // Explanations (gears and curbs, feedback) only once the corners without braking before it are past; the short
    // calls (the shape, the braking announcement) may come before (docs/dev/coach-and-texts.md).
    const explain = this.explainSeconds(c) - head;
    // A feedback that cannot be said before then waits for the next approach (it never comes in a corner).
    const fits = (a: FeedbackAudio) => explain >= a.introSeconds + INTRO_GAP + a.tinySeconds + FEEDBACK_GAP;
    const withFeedback = feedback && audio && audio.version === feedback.version && fits(audio) ? { feedback, audio } : undefined;
    const assist = this.assistFor(corner);
    const help = this.help.get(corner.index);
    // The braking announcement with the pressure is the helping cue for braking too little or too much.
    const announceIntro = settings.announceIntro || assist === 'force';
    // A driver who keeps braking late hears "jetzt" (and the countdown) a little earlier; after a turn-in that came
    // first, only the word "bremsen".
    const brakeSpeed = Math.max(5, corner.brakeSpeedKmh / 3.6);
    const earlyBrake = assist === 'early-now' && help ? Math.min(EARLY_NOW_MAX_S, help.size / brakeSpeed) : 0;
    const early = head > 0 ? 0 : earlyBrake;

    // Built backwards from the first action: each announcement ends before the next one starts.
    const plan = settings.announcePlan ? this.planAudio.get(corner.index) : undefined;
    const longStep = countStep(settings);
    const shortStep = countStep(settings, settings.countPauseShort);
    const toneLead = settings.announceTone ? settings.toneSeconds + TONE_GAP : 0;
    const introLead = !follower && (withFeedback || announceIntro) ? (withFeedback ? withFeedback.audio.introSeconds : settings.introSeconds) + INTRO_GAP : 0;
    // Corners close together (chicanes, S-curves): fewer numbers rather than talking into the previous corner's calls
    // (stream feedback 2026-10-25: "zusammenhängende Kurven werden oft vermischt oder übersprungen"); too close even
    // for the braking announcement, then the tone and "jetzt" only (a feedback finds its own length below).
    const available = this.availableSeconds(c) - head;
    // Where to line up, right before the numbers, which make way for it.
    const line = this.lineFor(corner);
    const lineLead = line && available >= settings.lineSeconds + PLAN_GAP + toneLead ? settings.lineSeconds + PLAN_GAP : 0;
    const numbers = (announced: number, room = available) => {
      let n = wanted;
      while (n > 0 && room < announced + lineLead + toneLead + n * shortStep) n--;
      return n;
    };
    let countdown = numbers(introLead);
    let intro = !follower && (!!withFeedback || (announceIntro && available >= introLead + toneLead));
    let before = (intro ? introLead : 0) + toneLead;
    // The long pause between the numbers when everything fits with the full plan, else the short one.
    const full = plan?.fullSeconds !== undefined ? plan.fullSeconds + PLAN_GAP : 0;
    let step = available >= before + lineLead + full + countdown * longStep ? longStep : shortStep;
    let lead = countdown * step + lineLead;
    // The full plan if it fits since the previous corner, else only the gears: not while the driver is still in a corner without braking.
    const planned = plan && !follower ? ([['full', plan.fullSeconds], ['short', plan.shortSeconds]] as const).find(([, seconds]) => explain - lead - before >= seconds + PLAN_GAP) : undefined;
    if (planned) {
      lead += planned[1] + PLAN_GAP;
      steps.push({ kind: 'plan', s: first, offset: lead, plan: planned[0] });
    } else {
      // No room for that, or a corner of a chain (the user, 2026-11-03: the gear is hugely important, and "only 10 %" was
      // never said): the short call with the pressure and the gear, right before the countdown. It goes before the numbers.
      const call = plan?.callSeconds !== undefined && this.gearAnnounced(c) ? plan.callSeconds + PLAN_GAP : 0;
      if (call) {
        const feedbackIntro = withFeedback ? introLead : 0;
        countdown = numbers(call + feedbackIntro, available + PREVIOUS_CUE_MARGIN - CALL_AFTER_PREVIOUS_S);
        before = feedbackIntro + toneLead;
        step = available >= before + lineLead + call + countdown * longStep ? longStep : shortStep;
        lead = countdown * step + lineLead + call;
        steps.push({ kind: 'plan', s: first, offset: lead, plan: 'call' });
        intro = !!withFeedback;
      }
      // The shape alone may come while the driver is still in a corner without braking; a chain's first plan named it for the others.
      const shape = follower ? undefined : plan?.shapeSeconds;
      if (shape !== undefined && available - lead - before >= shape + PLAN_GAP) {
        lead += shape + PLAN_GAP;
        steps.push({ kind: 'plan', s: first, offset: lead, plan: 'shape' });
      }
      // The announcement beside the call only if it says something the call does not, and there is room for it.
      const saidByCall = settings.announceIntro && brakeForce(corner) !== 'full';
      if (call && !withFeedback && !follower && announceIntro && !saidByCall && available >= lead + introLead + toneLead) intro = true;
    }
    if (lineLead) steps.push({ kind: 'line', s: first, offset: countdown * step + lineLead, line });
    if (intro) {
      lead += introLead;
      steps.push({ kind: 'intro', s: first, offset: lead, feedback: withFeedback?.feedback });
    }
    if (withFeedback) {
      const available = explain;
      const tone = settings.announceTone ? settings.toneSeconds + TONE_GAP : 0;
      const { longSeconds, shortSeconds, tinySeconds } = withFeedback.audio;
      // The longest version that fits since the previous corner.
      const options: [FeedbackVariant, number][] = [['long', longSeconds], ['short', shortSeconds], ['tiny', tinySeconds]];
      const fitting = options.find(([, seconds]) => available >= lead + seconds + FEEDBACK_GAP + tone);
      const variant = fitting?.[0];
      if (fitting) {
        lead += fitting[1] + FEEDBACK_GAP;
        steps.push({ kind: 'feedback', s: first, offset: lead, feedback: withFeedback.feedback, variant });
      }
    }
    // Right behind the previous corner's calls there is no moment for it.
    if (settings.announceTone && available + PREVIOUS_CUE_MARGIN >= toneLead) {
      lead += settings.toneSeconds + TONE_GAP;
      steps.push({ kind: 'tone', s: first, offset: lead });
    }
    for (let n = countdown; n >= 1; n--) {
      // A driver who keeps braking early hears "warten" instead of the last number.
      if (n === 1 && assist === 'wait') steps.push({ kind: 'assist', assist: 'wait', s: first, offset: step + early });
      else steps.push({ kind: 'count', count: n, s: first, offset: n * step + early });
    }
    if (countdown === 0 && assist === 'wait') steps.push({ kind: 'assist', assist: 'wait', s: first, offset: 0.8 });
    steps.push(...this.actionSteps(corner, earlyBrake));
    steps.push(...this.cornerCues(corner));
    // Play in the order the reference driver would hear them.
    return steps.sort((a, b) => this.cornerTime(corner, a.s) - a.offset - (this.cornerTime(corner, b.s) - b.offset));
  }

  /**
   * The turn-in, when the countdown runs to it: the reference turns in before it brakes, and "jetzt" and at least the
   * direction are said before "bremsen" has to come. Else the driver hears "jetzt, bremsen" at the braking point.
   */
  private turnFirst(corner: Corner): number | undefined {
    const settings = this.settings;
    if (!settings.announceAction || !settings.announceTurnIn || corner.turnFirstS === undefined) return undefined;
    const room = this.cornerTime(corner, corner.brakeS) - this.cornerTime(corner, corner.turnFirstS);
    return room >= settings.nowSeconds + AFTER_NOW_GAP_S + settings.turnInShortSeconds - TURN_FIRST_SLACK_S ? corner.turnFirstS : undefined;
  }

  /** "jetzt" and the action it names (the user, 2026-11-03); nothing talks over them. early: the braking word that much earlier. */
  private actionSteps(corner: Corner, early = 0): Step[] {
    const settings = this.settings;
    const afterNow = -(settings.nowSeconds + AFTER_NOW_GAP_S);
    const turnFirst = this.turnFirst(corner);
    if (turnFirst !== undefined) {
      const room = this.cornerTime(corner, corner.brakeS) - this.cornerTime(corner, turnFirst) + afterNow;
      const short = room < settings.turnInSeconds + TURN_IN_AFTER_GAP_S;
      // The word waits for the direction if that ends a moment after the braking point.
      const wait = Math.min(0, room - (short ? settings.turnInShortSeconds : settings.turnInSeconds) - AFTER_NOW_GAP_S);
      return [
        { kind: 'now', s: turnFirst, offset: 0 },
        { kind: 'turn-in', s: turnFirst, offset: afterNow, short },
        { kind: 'brake-point', s: corner.brakeS, offset: early + wait },
      ];
    }
    const now: Step = { kind: 'now', s: corner.brakeS, offset: early };
    if (!settings.announceAction) return [now];
    // The apex so close that the direction would come too late behind the word: the direction is the word. The countdown and
    // the announcement already say it is braking (the user, 2026-11-03: the turn-in should always come).
    const word: Step = { kind: 'brake', s: corner.brakeS, offset: early + afterNow };
    const behindWord = settings.nowSeconds + AFTER_NOW_GAP_S + this.stepSeconds(word, corner) + TURN_IN_AFTER_GAP_S + settings.turnInShortSeconds / 2;
    const apex = this.cornerTime(corner, corner.apexS) - this.cornerTime(corner, corner.brakeS);
    if (settings.announceTurnIn && corner.turnInS !== undefined && !corner.sameTurn && behindWord > apex) return [now, { kind: 'turn-in', s: corner.brakeS, offset: early + afterNow, short: true }];
    return [now, word];
  }

  /**
   * Whether the plan or the short call can say the gear before the countdown, also with the previous corner's own gear
   * after its "jetzt" and a feedback's announcement here. Reckoned on that worst case, so it does not depend on what the
   * previous corner decides, and that one's on the corner before it, around the lap.
   */
  private gearAnnounced(c: number): boolean {
    const settings = this.settings;
    const corner = this.reference.corners[c]!;
    const call = settings.announcePlan ? this.planAudio.get(corner.index)?.callSeconds : undefined;
    if (call === undefined) return false;
    const head = this.cornerTime(corner, corner.brakeS) - this.cornerTime(corner, this.turnFirst(corner) ?? corner.brakeS);
    const tone = settings.announceTone ? settings.toneSeconds + TONE_GAP : 0;
    const feedback = this.feedbackByCorner.has(corner.index) ? this.feedbackAudio.get(corner.index) : undefined;
    const line = this.lineFor(corner) ? settings.lineSeconds + PLAN_GAP : 0;
    const room = this.availableSeconds(c, true) + PREVIOUS_CUE_MARGIN - CALL_AFTER_PREVIOUS_S - head;
    return room >= call + PLAN_GAP + tone + line + (feedback ? feedback.introSeconds + INTRO_GAP : 0);
  }

  /**
   * Clearly beside the reference at turn-in on the last run: where to line up this time (the user, 2026-11-03). Not in
   * races, nor while a focus exercise runs elsewhere.
   */
  private lineFor(corner: Corner): LineCall | undefined {
    if (!this.settings.announceLine || this.mode === 'race') return undefined;
    if (this.focus && this.focus.cornerIndex !== corner.index) return undefined;
    const line = this.latestResults.get(corner.index)?.line;
    return line && { side: line.side === 'left' ? 'right' : 'left', curb: line.curb };
  }

  /**
   * The entry gear comes right after the action where nothing before the countdown can say it and the driver has to
   * change gear (the user, 2026-11-03: chicanes went without any gear); still in it from the previous corner, nothing.
   */
  private gearAfterAction(corner: Corner): boolean {
    const corners = this.reference.corners;
    if (!this.settings.announceShifts || corners.length < 2) return false;
    const c = corners.indexOf(corner);
    const previous = corners[(c - 1 + corners.length) % corners.length]!;
    return cornerGears(corner).entry !== cornerGears(previous).exit && !this.gearAnnounced(c);
  }

  /**
   * The cues after "jetzt": the gears where the reference shifts (target gear right after "jetzt", further down
   * after the apex, up into the exit gear), the turn-in, the helping cue (docs/dev/coach-and-texts.md), and for a big problem
   * corner the calls through the corner (guideFor). Two that would overlap by the reference's timing keep the
   * more important one, or the later one waits: the turn-in first (the user, 2026-11-03: it should always come), then the gear
   * after "jetzt", the helping cue, and the gears in the corner. Where the phrase leaves no room for the turn-in or the gear
   * the driver has to hear, the direction alone. gearAfter: the entry gear after the action (see gearAfterAction).
   */
  private cornerCues(corner: Corner, gearAfter = this.gearAfterAction(corner)): Step[] {
    const phrase = this.placeCues(corner, gearAfter, false);
    return phrase.complete ? phrase.steps : this.placeCues(corner, gearAfter, true).steps;
  }

  private placeCues(corner: Corner, gearAfter: boolean, shortTurn: boolean): { steps: Step[]; complete: boolean } {
    const settings = this.settings;
    const assist = this.assistFor(corner);
    const guide = this.guideFor(corner);
    const calls = new Set<AssistKind>([...(assist ? [assist] : []), ...(guide ?? [])]);
    // latest: until when (the reference's time) a gear may wait for what is being said, if not its shift.
    const candidates: { step: Step; priority: number; latest?: number }[] = [];
    // The helping cue being trained beats the other calls through the corner.
    const importance = (kind: AssistKind, otherwise: number) => (kind === assist ? 80 : otherwise);

    const gears = cornerGears(corner);
    const nowAt = this.cornerTime(corner, corner.brakeS);
    // "jetzt" and its action are never talked over; the gear right after them follows the last of them.
    const fixed = this.actionSteps(corner).map((step) => {
      const at = this.cornerTime(corner, step.s) - step.offset;
      return { step, at, until: at + this.stepSeconds(step, corner) };
    });
    const afterAction = Math.max(...fixed.map((cue) => cue.until)) - nowAt + AFTER_NOW_GAP_S;
    const shifts = settings.announceShifts || settings.announceGear || calls.has('gear');
    if (gears.entry > 0) {
      // The entry gear: where the reference shifts into it when that is well after the braking point (down to first at
      // the apex of a hairpin), else right after "jetzt" (only when asked for).
      const late = corner.entryGearS !== undefined && this.cornerTime(corner, corner.entryGearS) - nowAt >= ENTRY_SHIFT_LATE_S;
      if (late && shifts) {
        // It may wait until half of it is said by the apex: a little late still helps (the user, 2026-11-03: the hairpin's first gear was lost to the turn-in).
        const latest = this.cornerTime(corner, corner.apexS) - settings.gearSeconds / 2;
        candidates.push({ step: { kind: 'gear', gear: gears.entry, s: corner.entryGearS!, offset: GEAR_LEAD_S }, priority: gearAfter ? 78 : 72, latest });
      } else if (settings.announceGear || calls.has('gear') || gearAfter) {
        // It may wait for the turn-in as well: until half of it is said by the apex, where nothing else says it a little longer.
        const beforeNext = this.nextCornerAt(corner) - NEXT_CORNER_LEAD_SHORT_S - settings.gearSeconds;
        const byApex = this.cornerTime(corner, corner.apexS) - settings.gearSeconds / 2;
        const latest = gearAfter ? Math.min(Math.max(byApex, this.cornerTime(corner, corner.exitS) + GEAR_AFTER_EXIT_S), beforeNext) : byApex;
        candidates.push({ step: { kind: 'gear', gear: gears.entry, s: corner.brakeS, offset: -afterAction }, priority: 90, latest });
      }
    }
    if (shifts && gears.entry > 0) {
      if (gears.mid && corner.midGearS !== undefined) {
        candidates.push({ step: { kind: 'gear', gear: gears.mid, s: corner.midGearS, offset: GEAR_LEAD_S }, priority: 60 });
      }
      if (gears.exit !== (gears.mid ?? gears.entry)) {
        const at = corner.exitGearS ?? corner.apexS;
        candidates.push({ step: { kind: 'gear', gear: gears.exit, s: at, offset: corner.exitGearS !== undefined ? GEAR_LEAD_S : 0 }, priority: 50 });
      }
    }
    if (calls.has('target')) {
      // The target speed instead of the turn-in direction, where the driver turns in.
      const s = corner.turnInS ?? corner.apexS;
      candidates.push({ step: { kind: 'assist', assist: 'target', s, offset: corner.turnInS !== undefined ? settings.turnInLeadSeconds : 1 }, priority: importance('target', 40) });
    }
    if (calls.has('trail') && corner.turnInS !== undefined) {
      // Trail braking: "Langsam lösen" instead of the direction, where the driver turns in.
      candidates.push({ step: { kind: 'assist', assist: 'trail', s: corner.turnInS, offset: settings.turnInLeadSeconds }, priority: importance('trail', 55) });
    }
    // Braked too far into the corner: "Bremse los" where the reference lets go.
    if (calls.has('release')) {
      candidates.push({ step: { kind: 'assist', assist: 'release', s: corner.brakeEndS, offset: THROTTLE_LEAD_S }, priority: importance('release', 55) });
    }
    if (calls.has('throttle')) {
      candidates.push({ step: { kind: 'assist', assist: 'throttle', s: corner.exitS, offset: THROTTLE_LEAD_S }, priority: importance('throttle', 70) });
    }
    // Always (the user, 2026-11-03: to know when to turn), also beside the helping cues; none where the reference simply stays in its bend.
    const turn = settings.announceTurnIn && corner.turnInS !== undefined && !corner.sameTurn && !fixed.some((cue) => cue.step.kind === 'turn-in');
    if (turn) candidates.push({ step: { kind: 'turn-in', s: corner.turnInS!, offset: settings.turnInLeadSeconds, short: shortTurn }, priority: 95 });

    const kept: { step: Step; at: number; until: number }[] = [...fixed];
    for (const candidate of candidates.sort((a, b) => b.priority - a.priority)) {
      let step = candidate.step;
      let at = this.cornerTime(corner, step.s) - step.offset;
      const seconds = this.stepSeconds(step, corner);
      const overlapping = () => kept.find((other) => at < other.until && other.at < at + seconds);
      if (step.kind === 'turn-in' || step.assist === 'trail' || step.assist === 'target') {
        // Never between the countdown and "jetzt": behind what names the first action, even where the word would fit before it.
        const action = fixed.at(-1)!;
        if (at < action.until) {
          at = action.until + TURN_IN_AFTER_GAP_S;
          step = { ...step, s: action.step.s, offset: action.step.offset - (action.until - action.at) - TURN_IN_AFTER_GAP_S };
        }
        // A call for the turn-in at or right after the braking point would talk over "jetzt, bremsen" (or the gear after
        // it): it comes right after them instead (the user, 2026-11-03: most corners lost it), anchored to what it follows
        // so the order holds at the car's own pace; as long as it ends before the apex and well before the next corner's calls.
        for (let other = overlapping(); other; other = overlapping()) {
          at = other.until + TURN_IN_AFTER_GAP_S;
          step = { ...step, s: other.step.s, offset: other.step.offset - (other.until - other.at) - TURN_IN_AFTER_GAP_S };
        }
        const room = this.nextCornerAt(corner) - (step.short ? NEXT_CORNER_LEAD_SHORT_S : NEXT_CORNER_LEAD_S);
        // Half of it said by the apex: later it no longer helps (a short corner at the braking point gets none).
        if (at + seconds / 2 > this.cornerTime(corner, corner.apexS) || at + seconds > room) continue;
      } else if (step.kind === 'gear' && (step.offset > 0 || candidate.latest !== undefined)) {
        // A gear said ahead of its shift waits for what is being said, at the latest until the shift itself.
        const shift = at + step.offset;
        let last: (typeof kept)[number] | undefined;
        for (let other = overlapping(); other; other = overlapping()) {
          at = other.until + AFTER_NOW_GAP_S;
          last = other;
        }
        if (at > (candidate.latest ?? shift)) continue;
        // Anchored to what it follows, as the turn-in: the order holds at the car's own pace.
        if (last) step = { ...step, s: last.step.s, offset: last.step.offset - (last.until - last.at) - AFTER_NOW_GAP_S };
      } else if (overlapping()) continue;
      kept.push({ step, at, until: at + seconds });
    }
    const said = kept.slice(fixed.length);
    // The gear the driver has to hear should be said by the apex: the direction alone leaves it the room.
    const gear = said.find((cue) => cue.step.kind === 'gear' && cue.step.gear === gears.entry);
    const complete = (!turn || said.some((cue) => cue.step.kind === 'turn-in')) && (!gearAfter || (!!gear && gear.at <= this.cornerTime(corner, corner.apexS) - settings.gearSeconds / 2));
    return { steps: said.map((cue) => cue.step), complete };
  }

  /** When the reference reaches the next corner's braking point, on from this corner's (across the line for the lap's last corner). */
  private nextCornerAt(corner: Corner): number {
    const corners = this.reference.corners;
    if (corners.length < 2) return Infinity;
    const at = this.referenceTime(corners[(corners.indexOf(corner) + 1) % corners.length]!.brakeS);
    return at < this.referenceTime(corner.brakeS) ? at + this.reference.lapTimeMs / 1000 : at;
  }

  /** The reference's time at s (seconds), counted on from the corner's braking point across the start/finish line. */
  private cornerTime(corner: Corner, s: number): number {
    const t = this.referenceTime(s);
    return s < corner.brakeS - this.reference.lengthMeters / 2 ? t + this.reference.lapTimeMs / 1000 : t;
  }

  /**
   * Where the reference is when this corner's last cue has been said. A cue moved behind another keeps that one's point,
   * so the points alone ended at the braking point: at the reference's pace the next corner's calls ran into "jetzt, bremsen".
   */
  private lastCueS(corner: Corner): number {
    const points = this.reference.points;
    const ms = (this.lastCueEnd(corner) * 1000) % this.reference.lapTimeMs;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid]!.t < ms) lo = mid + 1;
      else hi = mid;
    }
    return points[lo]!.s;
  }

  /** When this corner's last cue has been said (reference time from the lap start, see cornerTime): "jetzt" and its action at the least. */
  private lastCueEnd(corner: Corner, gearAfter?: boolean): number {
    let end = 0;
    for (const step of [...this.actionSteps(corner), ...this.cornerCues(corner, gearAfter)]) {
      end = Math.max(end, this.cornerTime(corner, step.s) - step.offset + this.stepSeconds(step, corner));
    }
    return end;
  }

  /**
   * A big problem corner's calls through the corner (stream feedback 2026-10-23: "during the corner, when
   * throttle, when to shift"): the gears and "Gas!" always, "langsam lösen" where the reference brakes into the
   * corner, "Bremse los!" when the driver braked too far in, the apex speed when that was off.
   */
  private guideFor(corner: Corner): Set<AssistKind> | undefined {
    if (!this.guided(corner)) return undefined;
    const problems = this.latestResults.get(corner.index)?.problems ?? this.earlier.get(corner.index)?.problems ?? [];
    const calls = new Set<AssistKind>(['gear', 'throttle']);
    if (corner.trailBrake !== undefined && corner.turnInS !== undefined) calls.add('trail');
    if (problems.some((p) => p.kind === 'trail-long')) calls.add('release');
    if (problems.some((p) => p.kind === 'slow-apex' || p.kind === 'fast-apex')) calls.add('target');
    return calls;
  }

  /**
   * Is this a big problem corner, called through the corner? A feedback corner (in races: a called problem
   * corner) that cost at least guideMinLossSeconds; not while a focus exercise runs elsewhere.
   */
  private guided(corner: Corner): boolean {
    if (!this.settings.guideCorners) return false;
    if (this.focus && this.focus.cornerIndex !== corner.index) return false;
    if (this.cornerLoss(corner.index) < this.settings.guideMinLossSeconds) return false;
    return this.mode === 'race' ? this.raceProblemCorners().has(corner.index) : this.feedbackByCorner.has(corner.index);
  }

  /** Whether a corner with this result is called through (its feedback says so). */
  private guidedBy(result: CornerResult): boolean {
    return this.settings.guideCorners && result.timeLossS >= this.settings.guideMinLossSeconds;
  }

  /** Time lost in a corner: the last run in this session, else as remembered from earlier ones. */
  private cornerLoss(index: number): number {
    return this.latestResults.get(index)?.timeLossS ?? this.earlier.get(index)?.timeLossS ?? 0;
  }

  /**
   * The race calls' problem corners (the user, 2026-10-24: only the big ones): the raceProblemCorners with the
   * biggest time loss and a mistake, from this session's runs, else from what earlier sessions remember.
   */
  private raceProblemCorners(): Set<number> {
    if (this.problemCornersCache) return this.problemCornersCache;
    const candidates = this.reference.corners.map((corner) => {
      const result = this.latestResults.get(corner.index);
      const memory = result ? undefined : this.earlier.get(corner.index);
      return { index: corner.index, loss: result?.timeLossS ?? memory?.timeLossS ?? 0, problems: result?.problems ?? memory?.problems ?? [] };
    });
    this.problemCornersCache = new Set(
      candidates
        .filter((c) => c.problems.length > 0 && c.loss >= this.settings.feedbackMinLossSeconds)
        .sort((a, b) => b.loss - a.loss)
        .slice(0, this.settings.raceProblemCorners)
        .map((c) => c.index),
    );
    return this.problemCornersCache;
  }

  /** The helping cue this corner gets now, if its help has come that far (and no focus exercise runs elsewhere). */
  private assistFor(corner: Corner): AssistKind | undefined {
    const help = this.help.get(corner.index);
    if (!help || !this.settings.helpFirst || !this.settings.helpAssists) return undefined;
    if (help.step === 'feedback' || help.step === 'tip' || this.mode === 'race') return undefined;
    if (this.focus && this.focus.cornerIndex !== corner.index) return undefined;
    return assistFor(help.kind);
  }

  /** Reference driving time between the previous corner's last cue and this braking point. */
  /**
   * As availableSeconds, but counted from the end of the corners without braking in between (with chain calls on):
   * the driver is still turning there (SUGO, after the hairpin: the next zone's plan came in the two fast corners).
   */
  private explainSeconds(c: number): number {
    const available = this.availableSeconds(c);
    const corners = this.reference.corners;
    if (!this.settings.chainCalls || corners.length < 2) return available;
    const corner = corners[c]!;
    const previous = corners[(c - 1 + corners.length) % corners.length]!;
    const across = previous.exitS > corner.brakeS;
    const between = this.fastCorners.filter((f) =>
      across ? f.startS >= previous.exitS || f.endS <= corner.brakeS : f.startS >= previous.exitS && f.endS <= corner.brakeS,
    );
    if (!between.length) return available;
    // From the end of the last of them (the shortest way back to it, also across the start/finish line).
    const lap = this.reference.lapTimeMs / 1000;
    const since = Math.min(
      ...between.map((f) => {
        const seconds = this.referenceTime(corner.brakeS) - this.referenceTime(f.endS);
        return seconds < 0 ? seconds + lap : seconds;
      }),
    );
    return Math.min(available, since - PREVIOUS_CUE_MARGIN);
  }

  private availableSeconds(c: number, previousGearAfter?: boolean): number {
    const corners = this.reference.corners;
    if (corners.length < 2) return this.reference.lapTimeMs / 1000;
    const corner = corners[c]!;
    const previous = corners[(c - 1 + corners.length) % corners.length]!;
    // From the end of the previous corner's last cue (a turn-in or a gear said after its braking point counts in full),
    // across the line for the lap's first corner. Negative when that cue ends after this braking point.
    const lap = c === 0 ? this.reference.lapTimeMs / 1000 : 0;
    return this.referenceTime(corner.brakeS) + lap - this.lastCueEnd(previous, previousGearAfter) - PREVIOUS_CUE_MARGIN;
  }

  /** Seconds since lap start at which the reference driver passed s. */
  private referenceTime(s: number): number {
    const points = this.reference.points;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid]!.s < s) lo = mid + 1;
      else hi = mid;
    }
    return points[lo]!.t / 1000;
  }

  /** The reference's time to cover a distance from s (across the start/finish line). */
  private referenceSecondsAhead(s: number, distance: number): number {
    const length = this.reference.lengthMeters;
    const from = this.referenceTime(s);
    const to = s + distance;
    if (to <= length) return this.referenceTime(to) - from;
    return this.reference.lapTimeMs / 1000 - from + this.referenceTime(to - length);
  }

  /** Distance from s to a point on the lap, across the start/finish line if that is shorter. */
  private ahead(pointS: number, s: number): { distance: number; lap: number } {
    const length = this.reference.lengthMeters;
    let distance = pointS - s;
    let lap = this.lap;
    if (distance < -length / 2) {
      distance += length;
      lap++;
    } else if (distance > length / 2) {
      distance -= length;
      lap--;
    }
    return { distance, lap };
  }
}

/**
 * The feedback's texts. Once the help has a tip (docs/dev/coach-and-texts.md), the feedback says the mistake again and how to
 * fix it, and from the helping cue on also what the cue does. guided: a big problem corner, called through the
 * corner; the long version says so (instead of the helping cue's note, which it includes).
 */
export function feedbackTexts(
  number: number,
  problems: Problem[],
  phrases: Phrases,
  help?: CornerHelp,
  corner?: Corner,
  exitDeltaKmh?: number,
  guided = false,
): FeedbackItem['texts'] {
  const texts = feedbackTextsWithoutGuide(number, problems, phrases, help, corner, exitDeltaKmh, guided);
  return guided ? { ...texts, long: `${texts.long} ${phrases.feedbackGuide}` } : texts;
}

function feedbackTextsWithoutGuide(
  number: number,
  problems: Problem[],
  phrases: Phrases,
  help: CornerHelp | undefined,
  corner: Corner | undefined,
  exitDeltaKmh: number | undefined,
  guided: boolean,
): FeedbackItem['texts'] {
  const problem = help && help.step !== 'feedback' ? (problems.find((p) => p.kind === help.kind) ?? problems[0]) : undefined;
  // Right after the corner, when the car came out of it clearly slower: by how much, and what to try (the tip for
  // the mistake being worked on, else for the most important one).
  const tried = problem ?? problems[0];
  const after =
    corner && tried && exitDeltaKmh !== undefined && exitDeltaKmh <= -EXIT_SLOW_KMH
      ? phrases.afterCorner(Math.round(-exitDeltaKmh), corner.shape === 'chicane' ? 'chicane' : (corner.shapeDirection ?? turnDirection(corner)), phrases.tipTiny(tried))
      : undefined;
  if (help && problem && corner) {
    const tip = phrases.tip(problem, corner.apexSpeedKmh);
    const assisted = !guided && (help.step === 'assist' || help.step === 'focus');
    const long = phrases.helpLong(number, describeProblems([problem], phrases), tip);
    return {
      long: assisted ? `${long} ${phrases.helpAssistNote(assistFor(problem.kind))}` : long,
      short: phrases.helpShort(number, tip),
      tiny: phrases.tipTiny(problem),
      intro: phrases.feedbackIntro(number),
      after,
    };
  }
  return {
    long: phrases.feedbackLong(number, describeProblems(problems, phrases)),
    // Short version for tight sections: only the most important problem.
    short: phrases.feedbackShort(number, describeProblems(problems.slice(0, 1), phrases)),
    // A few words, for right after the corner and tight sections.
    tiny: phrases.feedbackTiny(number, problems[0] ? phrases.problemTiny(problems[0]) : ''),
    intro: phrases.feedbackIntro(number),
    after,
  };
}

/** How much faster (positive) or slower the car came out of the corner than the reference, km/h. */
function exitDelta(result: CornerResult): number | undefined {
  return result.exitSpeedKmh !== undefined && result.refExitSpeedKmh !== undefined ? result.exitSpeedKmh - result.refExitSpeedKmh : undefined;
}

/** The pressure said in place of "bremsen" where the reference brakes this lightly or less: more than that is simply braking. */
const LIGHT_BRAKE_PERCENT = 70;

/** The pressure a lightly braked corner names after "jetzt" (the user, 2026-11-03: "only 10 %" was never said), else undefined. */
export function lightBrake(corner: Corner): number | undefined {
  const force = brakeForce(corner);
  return force !== 'full' && force <= LIGHT_BRAKE_PERCENT ? force : undefined;
}

/** "full" or the reference brake pressure rounded to 10 % (at least 10). */
export function brakeForce(corner: Corner): BrakeForce {
  const percent = Math.round((corner.peakBrake * 100) / 10) * 10;
  return percent >= 95 ? 'full' : Math.max(10, percent);
}

/** Negative front wheel angle steers right. */
export function turnDirection(corner: Corner): Direction {
  return corner.maxSteer < 0 ? 'right' : 'left';
}

/** Front wheel angle buckets; how to phrase steering is still open (see docs/dev/coach-and-texts.md). */
/**
 * How strongly to turn in: from the corner's shape, which is the same for every car (hairpin and tight:
 * sharp, medium, fast: slight), so the turn-in call matches the plan; a chicane or an unknown shape: steering.
 */
export function turnStrength(corner: Corner): SteerStrength {
  switch (corner.shape) {
    case 'hairpin':
    case 'tight':
      return 'sharp';
    case 'medium':
      return 'medium';
    case 'fast':
      return 'slight';
    default:
      return steerStrength(corner.maxSteer);
  }
}

export function steerStrength(steerRad: number): SteerStrength {
  const degrees = Math.abs((steerRad * 180) / Math.PI);
  if (degrees < 4) return 'slight';
  if (degrees < 8) return 'medium';
  return 'sharp';
}
