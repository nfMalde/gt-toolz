// Recognizes the GT7 track from positions, since the telemetry has no track ID.
// Signature data: packages/telemetry/data/SOURCE.md (CC0, vendored, offline).

import ownSignatureFile from '../data/own-track-signatures.json' with { type: 'json' };
import signatureFile from '../data/track-signatures.json' with { type: 'json' };

interface RawSignature {
  official_id: string;
  official_name: string;
  length_m: number;
  min_x: number;
  max_x: number;
  min_z: number;
  max_z: number;
  path: [number, number][] | null;
  reverse: { official_id: string; official_name: string } | null;
}

export interface TrackMatch {
  id: string;
  name: string;
  /** Driven against the signature's direction (a reverse layout). */
  reversed: boolean;
  meanDistanceM: number;
  maxDistanceM: number;
  /** Other layouts that fit almost as well (shared sections); more driving resolves this. */
  ambiguousWith: string[];
}

/** Sample spacing along the driven line. */
const SAMPLE_STEP_M = 20;
const BBOX_MARGIN_M = 50;
/** A match must stay this close to the signature line on average. */
const MAX_MEAN_DISTANCE_M = 10;
/** Layouts within this mean distance of the best one count as ambiguous. */
const AMBIGUITY_MARGIN_M = 3;

// Our own recordings for tracks the vendored data does not have yet (SUGO, alpha 0.0.5; data/SOURCE.md).
const signatures = [...(signatureFile.signatures as unknown as RawSignature[]), ...(ownSignatureFile.signatures as unknown as RawSignature[])].filter(
  (s): s is RawSignature & { path: [number, number][] } => Array.isArray(s.path) && s.path.length > 1,
);

/** Identifies the track from driven positions (a full lap or at least a few hundred meters). */
export function recognizeTrack(points: readonly { x: number; z: number }[]): TrackMatch | undefined {
  const samples = sampleByDistance(points);
  if (samples.length < 5) return undefined;

  const scored = signatures
    .filter((s) => insideShare(samples, s) >= 0.9)
    .map((s) => ({ signature: s, ...score(samples, s.path) }))
    .sort((a, b) => a.mean - b.mean);

  const best = scored[0];
  if (!best || best.mean > MAX_MEAN_DISTANCE_M) return undefined;

  const reversed = best.backwardSteps > best.forwardSteps;
  const name = reversed && best.signature.reverse ? best.signature.reverse.official_name : best.signature.official_name;
  const id = reversed && best.signature.reverse ? best.signature.reverse.official_id : best.signature.official_id;
  return {
    id,
    name,
    reversed,
    meanDistanceM: best.mean,
    maxDistanceM: best.max,
    ambiguousWith: scored
      .slice(1)
      .filter((s) => s.mean - best.mean < AMBIGUITY_MARGIN_M)
      .map((s) => s.signature.official_name),
  };
}

function sampleByDistance(points: readonly { x: number; z: number }[]): { x: number; z: number }[] {
  const samples: { x: number; z: number }[] = [];
  let last: { x: number; z: number } | undefined;
  for (const p of points) {
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= SAMPLE_STEP_M) {
      samples.push(p);
      last = p;
    }
  }
  return samples;
}

function insideShare(samples: { x: number; z: number }[], s: RawSignature): number {
  const inside = samples.filter(
    (p) =>
      p.x >= s.min_x - BBOX_MARGIN_M &&
      p.x <= s.max_x + BBOX_MARGIN_M &&
      p.z >= s.min_z - BBOX_MARGIN_M &&
      p.z <= s.max_z + BBOX_MARGIN_M,
  ).length;
  return inside / samples.length;
}

function score(samples: { x: number; z: number }[], path: [number, number][]) {
  let sum = 0;
  let max = 0;
  let forwardSteps = 0;
  let backwardSteps = 0;
  let previousIndex: number | undefined;
  for (const p of samples) {
    const { distance, index } = nearestSegment(p, path);
    sum += distance;
    max = Math.max(max, distance);
    if (previousIndex !== undefined && index !== previousIndex) {
      // Steps wrap around at the start/finish line.
      const step = (index - previousIndex + path.length) % path.length;
      if (step < path.length / 2) forwardSteps++;
      else backwardSteps++;
    }
    previousIndex = index;
  }
  return { mean: sum / samples.length, max, forwardSteps, backwardSteps };
}

function nearestSegment(p: { x: number; z: number }, path: [number, number][]): { distance: number; index: number } {
  let best = Infinity;
  let bestIndex = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / lengthSq)) : 0;
    const d = Math.hypot(p.x - (ax + t * dx), p.z - (az + t * dz));
    if (d < best) {
      best = d;
      bestIndex = i;
    }
  }
  return { distance: best, index: bestIndex };
}
