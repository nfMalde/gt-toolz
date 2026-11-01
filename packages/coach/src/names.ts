// Gives braking zones the official corner names where the track data has them.
// Data: packages/coach/data/corner-names.json (CC0, vendored, offline; see SOURCE.md).

import cornerFile from '../data/corner-names.json' with { type: 'json' };
import type { FastCorner } from './fast';
import type { Phrases } from './i18n';
import type { Corner, ReferenceLap, ReferencePoint } from './reference';

interface NamedTurn {
  n: number;
  name: string;
  x: number;
  z: number;
}

const tracks = new Map((cornerFile.tracks as { official_id: string; corners: NamedTurn[] }[]).map((t) => [t.official_id, t.corners]));

/** A braking zone's apex must be this close to a turn's apex to take its number and name. */
const MAX_DISTANCE_M = 40;

/** Sets turn number and name on every corner of the reference (if the track has corner data). */
export function nameCorners(reference: ReferenceLap): void {
  const turns = reference.track && !reference.track.reversed ? tracks.get(reference.track.id) : undefined;
  for (const corner of reference.corners) {
    corner.turn = undefined;
    corner.name = undefined;
    if (!turns) continue;
    const apex = pointAt(reference.points, corner.apexS);
    let best: NamedTurn | undefined;
    let bestDistance = MAX_DISTANCE_M;
    for (const turn of turns) {
      const d = Math.hypot(turn.x - apex.x, turn.z - apex.z);
      if (d < bestDistance) {
        best = turn;
        bestDistance = d;
      }
    }
    if (best) {
      corner.turn = best.n;
      corner.name = best.name.trim() || undefined;
    }
  }
}

/**
 * Turn number and name for the corners without braking: the official turn closest to the line through it, at
 * most 40 m away, that no braking zone has taken.
 */
export function nameFastCorners(reference: ReferenceLap): void {
  const turns = reference.track && !reference.track.reversed ? tracks.get(reference.track.id) : undefined;
  const taken = new Set(reference.corners.map((c) => c.turn).filter((n) => n !== undefined));
  for (const corner of reference.fastCorners ?? []) {
    corner.turn = undefined;
    corner.name = undefined;
    if (!turns) continue;
    const line = reference.points.filter((p) => p.s >= corner.startS && p.s <= corner.endS);
    let best: NamedTurn | undefined;
    let bestDistance = MAX_DISTANCE_M;
    for (const turn of turns) {
      if (taken.has(turn.n)) continue;
      for (const p of line) {
        const d = Math.hypot(turn.x - p.x, turn.z - p.z);
        if (d < bestDistance) {
          best = turn;
          bestDistance = d;
        }
      }
    }
    if (best) {
      taken.add(best.n);
      corner.turn = best.n;
      corner.name = best.name.trim() || undefined;
    }
  }
}

/** "La Source", "Kurve 6" or "Bremszone 3" (in the language of the phrases). */
export function cornerLabel(corner: Corner, phrases: Phrases): string {
  if (corner.name) return corner.name;
  if (corner.turn !== undefined) return phrases.turnLabel(corner.turn);
  return phrases.brakingZoneLabel(corner.index);
}

/** "Blanchimont", "Kurve 13" or "Schnelle Kurve 2". */
export function fastCornerLabel(corner: FastCorner, phrases: Phrases): string {
  if (corner.name) return corner.name;
  if (corner.turn !== undefined) return phrases.turnLabel(corner.turn);
  return phrases.fastCornerLabel(corner.index);
}

function pointAt(points: readonly ReferencePoint[], s: number): ReferencePoint {
  return points.find((p) => p.s >= s) ?? points.at(-1)!;
}
