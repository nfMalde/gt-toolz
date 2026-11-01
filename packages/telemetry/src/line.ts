// The driven line of a lap, as a reference keeps it: a point every few metres with the car's state there, and the
// time along it. The telemetry learns and watches it (picking a reference), the coach coaches along it.

export interface ReferencePoint {
  /** Distance along the lap in meters. */
  s: number;
  /** ms since lap start. */
  t: number;
  x: number;
  y: number;
  z: number;
  /** m/s */
  speed: number;
  throttle: number;
  brake: number;
  gear: number;
  /** Front wheel angle (C) or steering wheel rotation (B), rad. */
  steer: number;
  /** Wheels on a curb (CURB_LEFT / CURB_RIGHT bits); only set when on one, and only from packet C. */
  curb?: number;
  /** Each wheel on a curb (CURB_FL / CURB_FR / CURB_RL / CURB_RR bits), as curb; references since 2026-10-20. */
  wheels?: number;
}

/** The reference lap's time (ms since its start) at a distance along it. */
export function referenceTimeMs(reference: { points: readonly ReferencePoint[] }, s: number): number {
  const points = reference.points;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid]!.s < s) lo = mid + 1;
    else hi = mid;
  }
  return points[lo]!.t;
}
