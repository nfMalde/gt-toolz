// The ghost (the reference lap) as a comparison in races, and whether a reference fits the track at all (the
// reference is picked by it): only while the car drives on the reference's line, in its direction. A position
// check alone is not enough: another track's line can cross the reference's by chance (a Spa reference at Red
// Bull Ring touched its line again and again), so the car has to stay on it.

import type { ReferenceLap } from '@gt-toolz/coach';
import { referenceTimeMs, TrackLocator, type TelemetryFrame } from '@gt-toolz/telemetry';

/** Closer than this to the reference line counts as on it (as the coach's off-reference limit). */
const ON_LINE_M = 30;
/** The share of the last WINDOW_MS on the line from which the reference fits the track ... */
const ON_SHARE = 0.9;
const WINDOW_MS = 30_000;
/** ... once there is at least this much driving to judge. */
const MIN_JUDGED_MS = 10_000;
/** Moving back along the line by more than this per frame is driving it the other way (a reverse layout). */
const BACKWARDS_M = 0.5;

export class GhostWatch {
  private readonly locator: TrackLocator;
  private samples: { at: number; on: boolean }[] = [];
  private lastS: number | undefined;

  constructor(readonly reference: ReferenceLap) {
    this.locator = new TrackLocator(reference.points);
  }

  /** Every driving frame: on the reference's line (and going its way) or not. */
  observe(frame: TelemetryFrame): void {
    const { s, offset } = this.locator.locate(frame.x, frame.z);
    const length = this.reference.lengthMeters;
    let ds = this.lastS === undefined ? 0 : s - this.lastS;
    if (ds < -length / 2) ds += length;
    else if (ds > length / 2) ds -= length;
    this.lastS = s;
    this.samples.push({ at: frame.time, on: offset <= ON_LINE_M && ds > -BACKWARDS_M });
    const oldest = frame.time - WINDOW_MS;
    if (this.samples[0]!.at < oldest) this.samples = this.samples.filter((sample) => sample.at >= oldest);
  }

  /** How long the recent window covers (ms): the share means little before MIN_JUDGED_MS. */
  get judgedMs(): number {
    const first = this.samples[0];
    const last = this.samples.at(-1);
    return first && last ? last.at - first.at : 0;
  }

  /** The share of the recent window on the line (0..1). */
  get onShare(): number {
    return this.samples.length ? this.samples.filter((sample) => sample.on).length / this.samples.length : 0;
  }

  /** The reference fits the track: the car has been on its line nearly all the time recently. */
  get fits(): boolean {
    return this.judgedMs >= MIN_JUDGED_MS && this.onShare >= ON_SHARE;
  }

  /** The ghost's time (ms since its lap start) at the car's position, if the reference fits. */
  timeAt(frame: TelemetryFrame): number | undefined {
    if (!this.fits) return undefined;
    const { s, offset } = this.locator.locate(frame.x, frame.z);
    return offset <= ON_LINE_M ? referenceTimeMs(this.reference, s) : undefined;
  }

  /** The reference's lap length, if it fits: the crew's sector ends from lap 2 on (the same as the ghost's). */
  lengthMeters(): number | undefined {
    return this.fits ? this.reference.lengthMeters : undefined;
  }

  /** A lap against the ghost's lap (positive: the ghost is ahead), if the reference fits. */
  lapGap(timeMs: number): number | undefined {
    return this.fits ? timeMs - this.reference.lapTimeMs : undefined;
  }
}
