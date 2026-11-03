// The coach's prepared clips: every timing-critical word is rendered once at start.

import {
  brakeForce,
  chainedAfter,
  chainFollowers,
  cornerGears,
  turnDirection,
  turnStrength,
  type Corner,
  type CurbCall,
  type CurbLevel,
  type Cue,
  type Direction,
  type FastCorner,
  type FeedbackItem,
  type NoteVariant,
  type Phrases,
  type PlanVariant,
  type ReferenceLap,
  type SteerStrength,
} from '@gt-toolz/coach';
import type { RunnerSettings } from './app-api';

export const MAX_COUNTDOWN = 5;

const DIRECTIONS: Direction[] = ['left', 'right'];
const STRENGTHS: SteerStrength[] = ['slight', 'medium', 'sharp'];

/** Clip name → text. */
export function coachClips(phrases: Phrases): Record<string, string> {
  const clips: Record<string, string> = {
    now: phrases.now,
    brake: phrases.brake,
    'brake-point': phrases.brake,
    'intro-full': phrases.brakeIntro('full'),
    'assist-wait': phrases.assistWait,
    'assist-throttle': phrases.assistThrottle,
    'assist-trail': phrases.assistTrail,
    'assist-release': phrases.assistRelease,
  };
  for (let percent = 10; percent <= 90; percent += 10) clips[`intro-${percent}`] = phrases.brakeIntro(percent);
  for (let n = 1; n <= MAX_COUNTDOWN; n++) clips[`count-${n}`] = phrases.count(n);
  for (let gear = 1; gear <= 8; gear++) clips[`gear-${gear}`] = phrases.gear(gear);
  for (const direction of DIRECTIONS) {
    for (const strength of STRENGTHS) clips[`turn-${direction}-${strength}`] = phrases.turn(direction, strength);
  }
  return clips;
}

/** after: right after the corner, with how much slower the car came out of it. */
export type FeedbackPart = 'long' | 'short' | 'tiny' | 'intro' | 'after';

export const feedbackClip = (feedback: FeedbackItem, part: FeedbackPart) => `fb-${feedback.number}-${part}`;

export const planClip = (cornerIndex: number, variant: PlanVariant) => `plan-${cornerIndex}-${variant}`;

/** The pace note of a corner without braking. */
export const noteClip = (fastCornerIndex: number, variant: NoteVariant) => `note-${fastCornerIndex}-${variant}`;

/** The target speed at turn-in, a helping cue (rendered once a corner's help gets there). */
export const assistTargetClip = (cornerIndex: number) => `assist-target-${cornerIndex}`;

/** What the plan says, from the settings. */
export type PlanSettings = Pick<RunnerSettings, 'plan' | 'curbs' | 'cornerShape' | 'planStyle' | 'fastCorners' | 'trailCalls' | 'chainCalls'>;

/** A curb the reference used, with how much of the car went on it when the reference knows the wheels. */
export function curbCall(used: boolean | undefined, level: CurbLevel | undefined): CurbCall | undefined {
  return used ? (level ?? 'used') : undefined;
}

/**
 * What the corner plan says: the shape (docs/dev/coach-and-texts.md), then gears and curbs, as far as they are switched on.
 * Variant 'shape': the shape alone, the shortest plan. As pace notes (docs/dev/coach-and-texts.md) the same in short words, in
 * one line, always with the direction. chained: corners without braking that follow right on it ("Dann auf 125
 * liften, rechts."), said by the full plan; the shorter ones leave them to their own note. followers: the braking
 * corners of a chain after this one (docs/dev/coach-and-texts.md), named at the end of every variant ("Dann mittlere Linkskurve.").
 */
export function cornerPlanText(
  corner: Corner,
  variant: PlanVariant,
  phrases: Phrases,
  settings: PlanSettings,
  chained: readonly FastCorner[] = [],
  followers: readonly Corner[] = [],
): string {
  const direction = corner.shapeDirection ?? turnDirection(corner);
  // Curbs come with the gears (the plan), and only in the full plan.
  const curbs = settings.curbs && settings.plan && variant === 'full';
  const curbIn = curbs ? curbCall(corner.curbIn, corner.curbInLevel) : undefined;
  const curbOut = curbs ? curbCall(corner.curbOut, corner.curbOutLevel) : undefined;
  const gears = settings.plan && variant !== 'shape' ? cornerGears(corner) : undefined;
  // Trail braking (docs/dev/coach-and-texts.md), only in the full plan: braking comes before the gears.
  const trail = settings.trailCalls && settings.plan && variant === 'full' && corner.trailBrake !== undefined;
  const parts: string[] = [];
  if (settings.planStyle === 'notes') {
    parts.push(phrases.cornerNotes({ shape: settings.cornerShape ? corner.shape : undefined, direction, gears, curbIn, curbOut }));
    if (trail) parts.push(phrases.noteTrail);
  } else {
    if (settings.cornerShape && corner.shape) parts.push(phrases.cornerShape(corner.shape, direction));
    if (trail) parts.push(phrases.planTrail);
    if (gears) parts.push(phrases.cornerPlan(gears, curbIn, curbOut, variant === 'short' ? 'short' : 'full'));
  }
  if (settings.fastCorners && variant === 'full') for (const fast of chained) parts.push(fastNoteText(fast, phrases, settings));
  if (settings.chainCalls) {
    for (const next of followers) parts.push(phrases.thenShape(settings.cornerShape ? next.shape : undefined, next.shapeDirection ?? turnDirection(next)));
  }
  return parts.join(' ');
}

/** The plan clips of a corner: full and short; shape only when the plan says shape and gears. None without a plan. */
export function cornerPlanClips(
  corner: Corner,
  phrases: Phrases,
  settings: PlanSettings,
  chained: readonly FastCorner[] = [],
  followers: readonly Corner[] = [],
): Partial<Record<PlanVariant, string>> {
  if (!settings.plan && !settings.cornerShape) return {};
  return {
    full: cornerPlanText(corner, 'full', phrases, settings, chained, followers),
    short: cornerPlanText(corner, 'short', phrases, settings, [], followers),
    ...(settings.plan && settings.cornerShape && corner.shape ? { shape: cornerPlanText(corner, 'shape', phrases, settings, [], followers) } : {}),
  };
}

/**
 * The pace note of a corner without braking: "Rechts voll, Curb halb." / "Dann auf 125 liften, links." The short
 * one without the curbs, for tight sections.
 */
export function fastNoteText(corner: FastCorner, phrases: Phrases, settings: Pick<RunnerSettings, 'curbs'>, variant: NoteVariant = 'full'): string {
  const curbs = settings.curbs && variant === 'full';
  return phrases.fastNote({
    kind: corner.kind,
    direction: corner.direction,
    kmh: corner.minSpeedKmh,
    curbIn: curbs ? curbCall(corner.curbIn, corner.curbInLevel) : undefined,
    curbOut: curbs ? curbCall(corner.curbOut, corner.curbOutLevel) : undefined,
    chained: corner.chained,
  });
}

/** Every clip a reference needs besides the cue words: the corner plans and the pace notes, by clip name. */
export function referenceClips(reference: ReferenceLap, phrases: Phrases, settings: PlanSettings): Record<string, string> {
  const clips: Record<string, string> = {};
  for (const corner of reference.corners) {
    const plans = cornerPlanClips(corner, phrases, settings, chainedAfter(reference, corner), chainFollowers(reference, corner));
    for (const [variant, text] of Object.entries(plans)) clips[planClip(corner.index, variant as PlanVariant)] = text;
  }
  if (settings.fastCorners) {
    for (const corner of reference.fastCorners ?? []) {
      for (const variant of ['full', 'short'] as const) clips[noteClip(corner.index, variant)] = fastNoteText(corner, phrases, settings, variant);
    }
  }
  return clips;
}

export function clipFor(cue: Cue): string {
  switch (cue.kind) {
    case 'tone':
      return 'tone';
    case 'feedback':
      return feedbackClip(cue.feedback!, cue.variant ?? 'short');
    case 'intro':
      return cue.feedback ? feedbackClip(cue.feedback, 'intro') : `intro-${brakeForce(cue.corner)}`;
    case 'plan':
      return planClip(cue.corner.index, cue.plan ?? 'full');
    case 'count':
      return `count-${cue.count}`;
    case 'now':
      return 'now';
    case 'brake':
    case 'brake-point':
      return cue.kind;
    case 'gear':
      return `gear-${cue.gear}`;
    case 'turn-in':
      return `turn-${turnDirection(cue.corner)}-${turnStrength(cue.corner)}`;
    case 'assist':
      return cue.assist === 'target' ? assistTargetClip(cue.corner.index) : `assist-${cue.assist}`;
  }
}

/** What a cue says, for logs and the app's live view. */
export function cueText(cue: Cue, phrases: Phrases, clips: Record<string, string>): string {
  switch (cue.kind) {
    case 'tone':
      return '(tone)';
    case 'feedback':
      return cue.feedback!.texts[cue.variant ?? 'short'];
    case 'intro':
      return cue.feedback ? cue.feedback.texts.intro : phrases.brakeIntro(brakeForce(cue.corner));
    case 'assist':
      return cue.assist === 'target' ? phrases.assistTarget(cue.corner.apexSpeedKmh) : (clips[clipFor(cue)] ?? '');
    default:
      return clips[clipFor(cue)] ?? '';
  }
}
