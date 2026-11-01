// Which curbs the reference driver used, and how much of the car was on them (docs/dev/coach-and-texts.md). From packet C's
// surface per wheel; braking corners and corners without braking (fast.ts) share it.

import { CURB_FL, CURB_FR, CURB_LEFT, CURB_RIGHT, CURB_RL, CURB_RR } from '@gt-toolz/telemetry';
import type { ReferencePoint } from './reference';

/**
 * How much of the car was on a curb (the user's words, 2026-10-20): one wheel ("antippen"), half the car, that
 * is the front and rear wheel of one side ("halb"), or the whole car ("voll").
 */
export type CurbLevel = 'touch' | 'half' | 'full';

/** Which curbs the reference driver used in a corner (packet C only). */
export interface CurbUse {
  /** The inside curb towards the apex / the outside curb on the exit. */
  curbIn?: boolean;
  curbOut?: boolean;
  /**
   * How much of the car was on it. Only for references that know the wheels (learned since 2026-10-20); older
   * ones know the side only.
   */
  curbInLevel?: CurbLevel;
  curbOutLevel?: CurbLevel;
}

/** A curb counts as used when the wheels were on it this long (samples at 60 Hz); a level just the same. */
const MIN_CURB_SAMPLES = 4;
const LEVELS: readonly CurbLevel[] = ['touch', 'half', 'full'];

/** Whether the reference knows the wheels (else only the side). */
export function hasCurbWheels(points: readonly ReferencePoint[]): boolean {
  return points.some((p) => p.wheels !== undefined);
}

/** 0 none, 1 one wheel of that side, 2 both wheels of that side, 3 all four. */
function wheelLevel(wheels: number, right: boolean): number {
  if ((wheels & (CURB_FL | CURB_FR | CURB_RL | CURB_RR)) === (CURB_FL | CURB_FR | CURB_RL | CURB_RR)) return 3;
  const front = (wheels & (right ? CURB_FR : CURB_FL)) !== 0;
  const rear = (wheels & (right ? CURB_RR : CURB_RL)) !== 0;
  return front && rear ? 2 : front || rear ? 1 : 0;
}

/**
 * Whether the curb on one side was used between two points of the lap, and how much of the car was on it: the
 * most that held for MIN_CURB_SAMPLES (a wheel touching on the way does not make it "voll").
 */
export function curbOn(points: readonly ReferencePoint[], from: number, to: number, right: boolean, withWheels: boolean): { used: boolean; level?: CurbLevel } {
  const side = right ? CURB_RIGHT : CURB_LEFT;
  let used = 0;
  // Samples with at least that level: [one wheel, half, whole car].
  const atLeast = [0, 0, 0];
  for (const p of points) {
    if (p.s < from || p.s > to) continue;
    if (((p.curb ?? 0) & side) !== 0) used++;
    if (withWheels) for (let level = wheelLevel(p.wheels ?? 0, right); level > 0; level--) atLeast[level - 1]!++;
  }
  if (used < MIN_CURB_SAMPLES) return { used: false };
  if (!withWheels) return { used: true };
  for (let i = LEVELS.length - 1; i >= 0; i--) if (atLeast[i]! >= MIN_CURB_SAMPLES) return { used: true, level: LEVELS[i] };
  return { used: true };
}

/** Sets curbIn / curbOut and their levels. */
export function setCurbUse(target: CurbUse, inside: { used: boolean; level?: CurbLevel }, outside: { used: boolean; level?: CurbLevel }): void {
  target.curbIn = inside.used;
  target.curbOut = outside.used;
  target.curbInLevel = inside.used ? inside.level : undefined;
  target.curbOutLevel = outside.used ? outside.level : undefined;
}
