// Corners taken without braking (docs/dev/coach-and-texts.md): flat out ("Rechts voll"), with a lift ("auf 125 liften, links") or
// on part throttle (called like a lift: "auf 170 liften, rechts").
// From the reference's driven line and pedals, like the corner shape (shape.ts); the pace notes call them.

import { curbOn, hasCurbWheels, setCurbUse, type CurbUse } from './curbs';
import type { Direction } from './i18n/types';
import type { Corner, ReferenceLap, ReferencePoint } from './reference';
import { positionsOf } from './shape';

export interface FastCorner extends CurbUse {
  /** 1, 2, ... in lap order. */
  index: number;
  /**
   * flat: full throttle through it; lift: off the throttle (or a touch of the brake), no braking zone; feather: on
   * part throttle for a while, often in pulses (the user, 2026-10-31: Willow Springs turn 2 was called "flat").
   */
  kind: FastKind;
  direction: Direction;
  /** Where the line starts and stops turning (meters along the lap). */
  startS: number;
  endS: number;
  /** Lift: where the driver comes off the throttle; feather: where the part throttle starts. */
  liftS?: number;
  /** Slowest speed from the lift (or the start) to the end; for a lift, the speed to lift to, for feathering the one to hold. */
  minSpeedKmh: number;
  /** How far the line turns, degrees. */
  turnDeg: number;
  /** The previous corner ends shortly before: the call starts with "dann". */
  chained: boolean;
  /** Official turn number and name, if the track data has them (names.ts). */
  turn?: number;
  name?: string;
}

export type FastKind = 'flat' | 'lift' | 'feather';

/** The point a fast corner's call is timed to, like a braking point: the lift, else where the line starts turning. */
export function fastCornerPoint(corner: FastCorner): number {
  return corner.liftS !== undefined ? Math.min(corner.liftS, corner.startS) : corner.startS;
}

const DEG = Math.PI / 180;
/** Headings over ±5 m, as in shape.ts. */
const STEP_M = 5;
/** Turning more than this per step is a bend (1° per 5 m: a radius below about 290 m). */
const BEND_PER_STEP = 1 * DEG;
/** Bends of the same direction closer than this are one corner. */
const MERGE_GAP_M = 30;
/** A bend that turns less is a kink: nothing to call. */
const MIN_TURN_DEG = 20;
/** No fast corner from shortly before a braking point until shortly after its full-throttle point. */
const BRAKING_MARGIN_M = 20;
/**
 * A flat bend that starts this close after a braking corner's full-throttle point is that corner's exit, not one
 * of its own (Spa: the line keeps turning after La Source, Bruxelles and Campus).
 */
const EXIT_CONTINUATION_M = 80;
/** A lift: the throttle below this ... */
const LIFT_THROTTLE = 0.5;
/** ... for at least this long; shorter dips are gear changes (about 80 ms in GT7). */
const LIFT_MIN_MS = 250;
/** Brake above this without a braking zone (a touch of the brake) is a lift too. */
const BRAKE_TOUCH = 0.05;
/**
 * Feathering: the throttle below this, never under the lift's threshold for long, for at least this long. Gear
 * changes and short corrections stay below half a second in every reference so far; Willow Springs turn 2 (the
 * Audi TT Cup ghost) holds 47 to 94 percent for 1.6 s.
 */
const FEATHER_THROTTLE = 0.9;
const FEATHER_MIN_MS = 1000;
/** The lift may come this far before the line starts turning. */
const LIFT_BEFORE_M = 80;
/** The outside curb: from the middle of the bend until this far after it. */
const CURB_AFTER_END_M = 40;
/** The previous corner ends less than this (the reference's time) before the call point: "dann". */
const CHAIN_SECONDS = 4;

const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** The reference's corners without a braking zone, in lap order. */
export function findFastCorners(reference: ReferenceLap): FastCorner[] {
  const { points, corners, lengthMeters } = reference;
  const position = positionsOf(points, lengthMeters);
  if (!position) return [];
  const heading = (s: number) => {
    const a = position(s - STEP_M);
    const b = position(s + STEP_M);
    return Math.atan2(b.z - a.z, b.x - a.x);
  };
  const braking = (s: number) => corners.some((c) => s >= c.brakeS - BRAKING_MARGIN_M && s <= c.exitS + BRAKING_MARGIN_M);

  // Where the line turns, split where it changes direction (GT7's coordinates: a growing heading turns right).
  const bends: { from: number; to: number; sum: number }[] = [];
  for (let s = STEP_M; s < lengthMeters - 2 * STEP_M; s += STEP_M) {
    const turn = wrap(heading(s + STEP_M) - heading(s));
    if (Math.abs(turn) < BEND_PER_STEP || braking(s)) continue;
    const last = bends.at(-1);
    if (last && Math.sign(last.sum) === Math.sign(turn) && s - last.to <= MERGE_GAP_M) {
      last.to = s;
      last.sum += turn;
    } else bends.push({ from: s, to: s, sum: turn });
  }

  const withCurbs = points.some((p) => p.curb);
  const withWheels = hasCurbWheels(points);
  const found: FastCorner[] = [];
  for (const bend of bends) {
    const turnDeg = Math.abs(bend.sum) / DEG;
    if (turnDeg < MIN_TURN_DEG) continue;
    const startS = bend.from;
    const endS = bend.to + STEP_M;
    const liftS = findLift(points, startS - LIFT_BEFORE_M, endS, braking);
    const previous = corners.filter((c) => c.exitS <= startS).at(-1);
    if (liftS === undefined && previous && startS - previous.exitS < EXIT_CONTINUATION_M) continue;
    const featherS = liftS === undefined ? findFeather(points, startS - LIFT_BEFORE_M, endS, braking) : undefined;
    const offS = liftS ?? featherS;

    let minSpeed = Infinity;
    const from = offS !== undefined ? Math.min(offS, startS) : startS;
    for (const p of points) if (p.s >= from && p.s <= endS) minSpeed = Math.min(minSpeed, p.speed);
    const right = bend.sum > 0;
    const corner: FastCorner = {
      index: found.length + 1,
      kind: liftS !== undefined ? 'lift' : featherS !== undefined ? 'feather' : 'flat',
      direction: right ? 'right' : 'left',
      startS,
      endS,
      liftS: offS,
      minSpeedKmh: minSpeed * 3.6,
      turnDeg,
      chained: false,
    };
    if (withCurbs) {
      setCurbUse(
        corner,
        curbOn(points, startS, endS, right, withWheels),
        curbOn(points, (startS + endS) / 2, endS + CURB_AFTER_END_M, !right, withWheels),
      );
    }
    // Right after the previous corner (braking or not): "dann".
    const point = fastCornerPoint(corner);
    const previousEnd = Math.max(...corners.filter((c) => c.exitS <= point).map((c) => c.exitS), ...found.filter((f) => f.endS <= point).map((f) => f.endS), -Infinity);
    corner.chained = previousEnd > -Infinity && timeAt(points, point) - timeAt(points, previousEnd) < CHAIN_SECONDS * 1000;
    found.push(corner);
  }
  return found;
}

/**
 * The braking corner whose plan announces a corner without braking too, chained like the user's example (2026-10-20:
 * "Rechts voll, Curb halb, dann 120 liften, links, Curb außen voll"): it follows right on a braking corner, so its
 * own note rarely finds room after that corner's calls. Braking corners right after each other (a chicane) have no
 * room for a plan in between: then the plan before the first one says it. None if another corner without braking
 * comes between.
 */
export function chainHost(reference: ReferenceLap, fast: FastCorner): Corner | undefined {
  if (!fast.chained) return undefined;
  const { corners, points } = reference;
  const point = fastCornerPoint(fast);
  let i = corners.findLastIndex((c) => c.exitS <= point);
  if (i < 0) return undefined;
  const between = (reference.fastCorners ?? []).some((f) => f !== fast && f.startS >= corners[i]!.exitS && f.endS <= point);
  if (between) return undefined;
  while (i > 0 && timeAt(points, corners[i]!.brakeS) - timeAt(points, corners[i - 1]!.exitS) < CHAIN_SECONDS * 1000) i--;
  return corners[i];
}

/** The corners without braking that a braking corner's plan announces too (chainHost), in lap order. */
export function chainedAfter(reference: ReferenceLap, corner: Corner): FastCorner[] {
  return (reference.fastCorners ?? []).filter((f) => chainHost(reference, f)?.index === corner.index);
}

/**
 * A braking corner whose braking point comes this soon (the reference's time) after the previous one's exit follows
 * it: a corner chain (alpha 0.0.5, SUGO: "die schnell aufeinander folgenden Kurven bringen ihn durcheinander").
 */
export const FOLLOW_SECONDS = 6;
/** The chain's first plan names at most this many of the corners after it. */
const MAX_FOLLOWERS = 2;

/** Seconds from the previous braking corner's exit to this one's braking point (across the start/finish line). */
function secondsAfterPrevious(reference: ReferenceLap, corner: Corner): number | undefined {
  const { corners, points } = reference;
  const at = corners.indexOf(corner);
  if (corners.length < 2 || at < 0) return undefined;
  const previous = corners[(at - 1 + corners.length) % corners.length]!;
  let ms = timeAt(points, corner.brakeS) - timeAt(points, previous.exitS);
  if (ms < 0) ms += reference.lapTimeMs;
  return ms / 1000;
}

/** A braking corner that follows the one before it closely: no explanations of its own, its shape comes before. */
export function isFollower(reference: ReferenceLap, corner: Corner): boolean {
  const seconds = secondsAfterPrevious(reference, corner);
  return seconds !== undefined && seconds < FOLLOW_SECONDS;
}

/** The braking corners a chain's first corner announces too ("Dann mittlere Linkskurve."); none inside a chain. */
export function chainFollowers(reference: ReferenceLap, corner: Corner): Corner[] {
  if (isFollower(reference, corner)) return [];
  const { corners } = reference;
  const at = corners.indexOf(corner);
  const followers: Corner[] = [];
  for (let i = 1; at >= 0 && i <= MAX_FOLLOWERS && i < corners.length; i++) {
    const next = corners[(at + i) % corners.length]!;
    if (!isFollower(reference, next)) break;
    followers.push(next);
  }
  return followers;
}

/** Where the driver comes off the throttle for long enough (or touches the brake), outside braking corners. */
function findLift(points: readonly ReferencePoint[], from: number, to: number, braking: (s: number) => boolean): number | undefined {
  let runStart: ReferencePoint | undefined;
  for (const p of points) {
    if (p.s < from) continue;
    if (p.s > to) break;
    if (braking(p.s)) {
      runStart = undefined;
      continue;
    }
    if (p.brake > BRAKE_TOUCH) return p.s;
    if (p.throttle < LIFT_THROTTLE) {
      runStart ??= p;
      if (p.t - runStart.t >= LIFT_MIN_MS) return runStart.s;
    } else runStart = undefined;
  }
  return undefined;
}

/** Where the driver stays on part throttle for long enough (pulses included), outside braking corners. */
function findFeather(points: readonly ReferencePoint[], from: number, to: number, braking: (s: number) => boolean): number | undefined {
  let runStart: ReferencePoint | undefined;
  for (const p of points) {
    if (p.s < from) continue;
    if (p.s > to) break;
    if (braking(p.s) || p.throttle >= FEATHER_THROTTLE) {
      runStart = undefined;
      continue;
    }
    runStart ??= p;
    if (p.t - runStart.t >= FEATHER_MIN_MS) return runStart.s;
  }
  return undefined;
}

/** The reference's time (ms since its lap start) at a distance along it. */
function timeAt(points: readonly ReferencePoint[], s: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.s < s) lo = mid + 1;
    else hi = mid;
  }
  return points[lo]!.t;
}
