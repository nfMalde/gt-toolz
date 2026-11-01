import type { ReferencePoint } from './line';

export interface Location {
  /** Distance along the reference lap in meters. */
  s: number;
  /** Distance from the reference line in meters. */
  offset: number;
  index: number;
}

/** Search this many points around the last match before falling back to a full search. */
const LOCAL_WINDOW = 120;
/** If the local search ends up further away than this, search the whole lap. */
const RESYNC_DISTANCE_M = 30;

/** Projects live positions onto the reference line. */
export class TrackLocator {
  private lastIndex: number | undefined;

  constructor(private readonly points: readonly ReferencePoint[]) {}

  locate(x: number, z: number): Location {
    let result = this.lastIndex === undefined ? undefined : this.search(x, z, this.lastIndex - 20, this.lastIndex + LOCAL_WINDOW);
    if (!result || result.offset > RESYNC_DISTANCE_M) {
      const full = this.search(x, z, 0, this.points.length - 1);
      if (!result || full.offset < result.offset) result = full;
    }
    this.lastIndex = result.index;
    return result;
  }

  reset(): void {
    this.lastIndex = undefined;
  }

  private search(x: number, z: number, from: number, to: number): Location {
    const n = this.points.length;
    let best: Location = { s: 0, offset: Infinity, index: 0 };
    for (let k = from; k <= to; k++) {
      // Wrap around the start/finish line.
      const i = ((k % (n - 1)) + (n - 1)) % (n - 1);
      const a = this.points[i]!;
      const b = this.points[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const lengthSq = dx * dx + dz * dz;
      const t = lengthSq ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq)) : 0;
      const offset = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
      if (offset < best.offset) best = { s: a.s + t * (b.s - a.s), offset, index: i };
    }
    return best;
  }
}
