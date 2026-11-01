import type { CornerResult, Problem } from './analysis';
import { brakeForce, turnDirection, type FeedbackItem } from './coach';
import { describeProblems, type Phrases } from './i18n';
import { cornerLabel } from './names';
import { cornerGears, type ReferenceLap } from './reference';

/** What the coach remembers about one braking zone, also across sessions. */
export interface CornerMemory {
  problems: Problem[];
  timeLossS: number;
  /** ISO date of the run. */
  at: string;
}

/** Stored next to the reference file as <reference>.history.json. */
export interface CoachHistory {
  version: 1;
  /** Key: braking zone index. */
  corners: Record<string, CornerMemory>;
}

export function emptyHistory(): CoachHistory {
  return { version: 1, corners: {} };
}

export function rememberResult(history: CoachHistory, result: CornerResult): void {
  history.corners[String(result.corner.index)] = {
    problems: result.problems,
    timeLossS: Math.round(result.timeLossS * 100) / 100,
    at: new Date().toISOString(),
  };
}

/**
 * all:      every braking zone
 * problems: only zones with a mistake last time
 * auto:     all zones while nothing is known yet (learning the track), afterwards only the problems
 */
export type BriefingScope = 'auto' | 'all' | 'problems';

/**
 * Sentences for the briefing in the pause menu: the braking zones in order, with what to do and
 * what went wrong last time.
 */
export function buildBriefing(
  reference: ReferenceLap,
  history: CoachHistory,
  activeFeedback: FeedbackItem[],
  phrases: Phrases,
  scope: BriefingScope = 'auto',
): string[] {
  const track = reference.track?.name ?? phrases.unknownTrack;
  const hasProblem = (index: number) => (history.corners[String(index)]?.problems.length ?? 0) > 0;
  const problemZones = reference.corners.filter((c) => hasProblem(c.index));
  const onlyProblems = scope === 'problems' || (scope === 'auto' && problemZones.length > 0);
  const zones = onlyProblems ? problemZones : reference.corners;

  if (onlyProblems && zones.length === 0) return [phrases.briefingNoProblems(track)];
  const sentences = [
    onlyProblems ? phrases.briefingIntroProblems(track, zones.length, reference.corners.length) : phrases.briefingIntro(track, reference.corners.length),
  ];
  // Trail braking (docs/dev/coach-and-texts.md): once what it is, if one of the zones is braked into.
  if (zones.some((c) => c.trailBrake !== undefined)) sentences.push(phrases.briefingTrailIntro);

  for (const corner of zones) {
    const name = corner.name || corner.turn !== undefined ? phrases.briefingZoneName(corner.index, cornerLabel(corner, phrases)) : cornerLabel(corner, phrases);
    let sentence = phrases.briefingZone({
      name,
      direction: corner.shapeDirection ?? turnDirection(corner),
      shape: corner.shape,
      force: brakeForce(corner),
      speed: Math.round(corner.brakeSpeedKmh / 10) * 10,
      // Entry gear (after downshifting), a downshift after the apex, and exit gear, always entry and exit.
      gears: cornerGears(corner),
    });
    if (corner.trailBrake !== undefined) sentence += ` ${phrases.briefingTrail(corner.trailBrake * 100)}`;

    const feedback = activeFeedback.find((f) => f.cornerIndex === corner.index);
    const memory = history.corners[String(corner.index)];
    if (memory && memory.problems.length > 0) {
      if (feedback) sentence += ` ${phrases.briefingFeedbackName(feedback.number)}`;
      sentence += ` ${phrases.briefingLastTime(describeProblems(memory.problems, phrases))}`;
    } else if (memory) {
      sentence += ` ${phrases.briefingCleanLastTime}`;
    }
    sentences.push(sentence);
  }

  sentences.push(phrases.briefingEnd);
  return sentences;
}

/**
 * Debrief with the car stopped and the handbrake pulled: the zones that cost the most time last time,
 * biggest first. Short on purpose: the driver is standing on track.
 */
/** Mistakes beyond the listed ones from which the cheeky bonus mistake comes. */
const BONUS_MIN_UNLISTED = 2;

/**
 * The biggest mistakes, for the debrief. handbrake: it was started with the handbrake (it ends with "release the
 * handbrake …"). bonus (cheeky style): with at least BONUS_MIN_UNLISTED more
 * mistakes than listed, a cheeky extra one follows (the user, 2026-10-22: "listet der Coach das Installieren und
 * Starten von GT7 als Fehler mit auf").
 */
export function buildDebrief(reference: ReferenceLap, history: CoachHistory, phrases: Phrases, limit = 4, bonus = false, handbrake = true): string[] {
  const all = reference.corners
    .map((corner) => ({ corner, memory: history.corners[String(corner.index)] }))
    .filter((zone): zone is { corner: (typeof reference.corners)[number]; memory: CornerMemory } => !!zone.memory && zone.memory.problems.length > 0 && zone.memory.timeLossS > 0)
    .sort((a, b) => b.memory.timeLossS - a.memory.timeLossS);
  const worst = all.slice(0, Math.max(1, limit));
  if (!worst.length) return [phrases.debriefNone];
  const extra = bonus && all.length - worst.length >= BONUS_MIN_UNLISTED ? phrases.debriefBonus(worst.length + 1) : undefined;
  return [
    phrases.debriefIntro(worst.length),
    ...worst.map(({ corner, memory }) => {
      const name = corner.name || corner.turn !== undefined ? phrases.briefingZoneName(corner.index, cornerLabel(corner, phrases)) : cornerLabel(corner, phrases);
      return phrases.debriefZone(name, describeProblems(memory.problems, phrases), memory.timeLossS);
    }),
    ...(extra ? [extra] : []),
    // "Release the handbrake …": only when the handbrake started it.
    ...(handbrake ? [phrases.debriefEnd] : []),
  ];
}
