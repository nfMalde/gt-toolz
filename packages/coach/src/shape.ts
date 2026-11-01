// How a corner looks, from the reference's driven line (docs/dev/coach-and-texts.md): how tight it is, or a chicane.
// From positions, not from the steering angle: that depends on the car and on understeer.

import type { Direction } from './i18n/types';
import type { Corner, ReferenceLap, ReferencePoint } from './reference';

/** Hairpin, tight, medium, fast; a chicane changes direction (it starts with Corner.shapeDirection). */
export type CornerShape = 'hairpin' | 'tight' | 'medium' | 'fast' | 'chicane';

/** Headings are taken over ±5 m, curvature over 20 m: smooth enough for 60 Hz points, short enough for a hairpin. */
const STEP_M = 5;
const CURVATURE_SPAN_M = 20;
/** The corner from turn-in until a bit after the full-throttle point (a hairpin keeps turning there). */
const AFTER_EXIT_M = 40;
/** A chicane turns at least this much both ways. */
const CHICANE_MIN_DEG = 35;
/** A hairpin turns at least this much, around a tight radius. */
const HAIRPIN_MIN_DEG = 120;
const TIGHT_MAX_RADIUS_M = 45;
const MEDIUM_MAX_RADIUS_M = 90;
/** The first direction of a chicane: where the line has turned this much. */
const FIRST_TURN_DEG = 15;

const DEG = Math.PI / 180;
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** Sets shape and shapeDirection on every corner; also for references saved before shapes existed. */
export function addCornerShapes(reference: ReferenceLap): void {
  const position = positionsOf(reference.points, reference.lengthMeters);
  if (!position) return;
  const heading = (s: number) => {
    const a = position(s - STEP_M);
    const b = position(s + STEP_M);
    return Math.atan2(b.z - a.z, b.x - a.x);
  };
  for (const corner of reference.corners) {
    const from = corner.turnInS ?? corner.brakeEndS;
    const to = corner.exitS + AFTER_EXIT_M;
    // GT7's coordinates: a growing heading is a right-hander (checked against the steering sign on Spa).
    let right = 0;
    let left = 0;
    let first: Direction | undefined;
    let minRadius = Infinity;
    for (let s = from; s < to; s += STEP_M) {
      const turn = wrap(heading(s + STEP_M) - heading(s));
      if (turn > 0) right += turn;
      else left -= turn;
      if (!first && Math.max(right, left) >= FIRST_TURN_DEG * DEG) first = right > left ? 'right' : 'left';
      const curvature = Math.abs(wrap(heading(s + CURVATURE_SPAN_M / 2) - heading(s - CURVATURE_SPAN_M / 2))) / CURVATURE_SPAN_M;
      if (curvature > 0) minRadius = Math.min(minRadius, 1 / curvature);
    }
    const shape = classify(right / DEG, left / DEG, minRadius);
    corner.shape = shape;
    // A plain corner keeps the steering's direction, so the plan never contradicts the turn-in call.
    corner.shapeDirection = shape === 'chicane' ? (first ?? steerDirection(corner)) : steerDirection(corner);
  }
}

function classify(rightDeg: number, leftDeg: number, minRadiusM: number): CornerShape {
  if (Math.min(rightDeg, leftDeg) >= CHICANE_MIN_DEG) return 'chicane';
  if (Math.max(rightDeg, leftDeg) >= HAIRPIN_MIN_DEG && minRadiusM <= TIGHT_MAX_RADIUS_M) return 'hairpin';
  if (minRadiusM <= TIGHT_MAX_RADIUS_M) return 'tight';
  return minRadiusM <= MEDIUM_MAX_RADIUS_M ? 'medium' : 'fast';
}

/** Negative steering is a right-hander (as turnDirection in coach.ts). */
const steerDirection = (corner: Corner): Direction => (corner.maxSteer < 0 ? 'right' : 'left');

/** Position at a distance along the lap (between points, wrapping around the start). */
export function positionsOf(points: ReferencePoint[], lengthMeters: number): ((s: number) => { x: number; z: number }) | undefined {
  if (points.length < 2 || !(lengthMeters > 0)) return undefined;
  return (distance: number) => {
    const s = ((distance % lengthMeters) + lengthMeters) % lengthMeters;
    let lo = 0;
    let hi = points.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (points[mid]!.s <= s) lo = mid;
      else hi = mid;
    }
    const a = points[lo]!;
    const b = points[hi]!;
    const f = b.s > a.s ? Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))) : 0;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  };
}
