// Trail braking (docs/dev/coach-and-texts.md; feedback from the user's friend, 2026-10-22): the reference still brakes when it turns
// in and lets the brake off towards the apex, which turns the car into the corner. Measured on the user's
// references: 58 to 100 % brake at turn-in and still braking 28 to 61 m after it; short brakes show only about 5 %.

import type { ReferenceLap } from './reference';

/** The reference trails when it still brakes at least this much at turn-in ... */
export const TRAIL_MIN_BRAKE = 0.25;
/** ... and keeps braking at least this far after turn-in. */
export const TRAIL_MIN_M = 15;

/** Brake (0..1) at track position s, between the two samples around it. */
export function brakeAt(points: readonly { s: number; brake: number }[], s: number): number {
  let lo = 0;
  let hi = points.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.s < s) lo = mid + 1;
    else hi = mid;
  }
  const b = points[lo]!;
  const a = points[Math.max(0, lo - 1)]!;
  if (b.s <= a.s || s >= b.s) return b.brake;
  if (s <= a.s) return a.brake;
  return a.brake + ((b.brake - a.brake) * (s - a.s)) / (b.s - a.s);
}

/** Marks the corners the reference trail-brakes into, with its brake at turn-in (recomputed on every load). */
export function addTrailBraking(reference: ReferenceLap): void {
  for (const corner of reference.corners) {
    corner.trailBrake = undefined;
    if (corner.turnInS === undefined || corner.brakeEndS - corner.turnInS < TRAIL_MIN_M) continue;
    const atTurnIn = brakeAt(reference.points, corner.turnInS);
    if (atTurnIn >= TRAIL_MIN_BRAKE) corner.trailBrake = atTurnIn;
  }
}
