import { gearSpans, lowestGear, type Corner, type ReferenceLap, type ReferencePoint } from './reference';
import { brakeAt } from './trail';

/** One live sample inside a corner segment. */
export interface RunSample {
  s: number;
  t: number;
  /** m/s */
  speed: number;
  brake: number;
  throttle: number;
  gear: number;
  /** Where the car is (live runs). */
  x?: number;
  z?: number;
}

export type Problem =
  | { kind: 'no-brake' }
  | { kind: 'brake-early'; meters: number }
  | { kind: 'brake-late'; meters: number }
  | { kind: 'wrong-gear'; gear: number; refGear: number }
  | { kind: 'slow-apex'; kmh: number }
  | { kind: 'fast-apex'; kmh: number }
  | { kind: 'late-throttle'; meters: number }
  | { kind: 'brake-weak'; percent: number; refPercent: number }
  | { kind: 'brake-hard'; percent: number; refPercent: number }
  /** Trail braking (docs/dev/coach-and-texts.md): the brake was off at turn-in, where the reference still brakes. */
  | { kind: 'no-trail'; percent: number; refPercent: number }
  /** Braked this much further into the corner than the reference (and too slow at the apex). */
  | { kind: 'trail-long'; meters: number };

export interface CornerResult {
  corner: Corner;
  /** Positive: slower than the reference through the corner. */
  timeLossS: number;
  brakeDeltaM?: number;
  peakBrake: number;
  apexSpeedKmh: number;
  apexGear: number;
  /** Lowest gear from the braking point to the reference's exit, without blips (compared with the reference's lowest). */
  lowGear: number;
  throttleDeltaM?: number;
  /** Brake (0..1) at the reference's turn-in point, and where the driver let the brake off before the apex. */
  brakeAtTurnIn?: number;
  brakeEndS?: number;
  /** Speed after the corner (EXIT_SPEED_AFTER_M past the reference's full-throttle point), and the reference's there. */
  exitSpeedKmh?: number;
  refExitSpeedKmh?: number;
  /** Most important first. */
  problems: Problem[];
  /** Clearly beside the reference where it begins to steer into the corner. */
  line?: TurnInLine;
}

/** The car was this far beside the reference at turn-in, too far to this side; curb: the reference is over the curb on the other side. */
export interface TurnInLine {
  meters: number;
  side: 'left' | 'right';
  curb: boolean;
}

/** Samples are collected from here ... */
const SAMPLES_BEFORE_BRAKE_M = 150;
/** ... and time is compared from here ... */
const TIMING_BEFORE_BRAKE_M = 100;
/** ... until this far past the corner exit (or the next corner's timing start, whichever comes first). */
const TIMING_AFTER_EXIT_M = 100;
/** The apex speed is the slowest speed this close to the reference apex. */
const APEX_WINDOW_M = 50;
/** The speed after the corner: this far past the reference's full-throttle point (or the segment's end). */
const EXIT_SPEED_AFTER_M = 50;

/** Where a corner's run is recorded and timed. Neighbouring corners never overlap. */
export interface CornerSegment {
  sampleStartS: number;
  timingStartS: number;
  endS: number;
  /** Braking before this point belongs to the previous corner (e.g. its apex in a chicane). */
  ignoreBrakingBeforeS: number;
}

const BRAKE_ON = 0.05;
const BRAKE_POINT_TOLERANCE_M = 10;
const APEX_SPEED_TOLERANCE_KMH = 5;
const THROTTLE_TOLERANCE_M = 15;
const BRAKE_FORCE_TOLERANCE = 0.25;
/** Trail braking: less than this at the reference's turn-in counts as released ... */
const TRAIL_RELEASED = 0.1;
/** ... and braking at least this much further into the corner than the reference as too long. */
const TRAIL_LONG_M = 20;
/**
 * Beside the reference at least this much at turn-in counts (the user's Nürburgring GP, 2026-11-03: over 71 passes the
 * median was 1.1 m, while the corner they were lined up wrong for was 2.2 to 4 m off on every pass) ...
 */
const LINE_OFF_M = 2;
/** ... and more than this is no line for the corner any more (a spin, a trip off the track). */
const LINE_OFF_MAX_M = 8;
/** The reference's heading at a point: over this many meters each way. */
const HEADING_M = 3;

export function cornerSegments(reference: ReferenceLap): CornerSegment[] {
  const corners = reference.corners;
  const timingStart = (i: number) =>
    Math.max(0, corners[i]!.brakeS - TIMING_BEFORE_BRAKE_M, i > 0 ? corners[i - 1]!.apexS : 0);
  return corners.map((corner, i) => {
    const next = i + 1 < corners.length ? timingStart(i + 1) : Infinity;
    const endS = Math.min(reference.lengthMeters, corner.exitS + TIMING_AFTER_EXIT_M, next);
    return {
      sampleStartS: Math.max(0, corner.brakeS - SAMPLES_BEFORE_BRAKE_M),
      timingStartS: timingStart(i),
      endS: Math.max(endS, corner.apexS + 10),
      ignoreBrakingBeforeS: i > 0 ? corners[i - 1]!.apexS : -Infinity,
    };
  });
}

/** Compares the driver's run through one corner with the reference. Undefined if the run is incomplete. */
export function analyzeCorner(
  reference: ReferenceLap,
  corner: Corner,
  segment: CornerSegment,
  samples: RunSample[],
): CornerResult | undefined {
  const { timingStartS, endS, ignoreBrakingBeforeS } = segment;
  const first = samples[0];
  const last = samples.at(-1);
  if (!first || !last || first.s > timingStartS + 10 || last.s < endS - 10) return undefined;

  const userTime = timeAt(samples, endS) - timeAt(samples, timingStartS);
  const refTime = timeAt(reference.points, endS) - timeAt(reference.points, timingStartS);

  // Braking point: first press after a release, so braking still going on from the previous corner doesn't count.
  let released = first.brake <= BRAKE_ON;
  let brakeSample: RunSample | undefined;
  for (const sample of samples) {
    if (sample.s > corner.apexS) break;
    if (sample.brake <= BRAKE_ON) released = true;
    else if (released && sample.s >= ignoreBrakingBeforeS) {
      brakeSample = sample;
      break;
    }
  }

  // Apex: slowest point near the reference apex, so a following corner in a chicane doesn't count.
  const apexFrom = corner.apexS - APEX_WINDOW_M;
  const apexTo = Math.min(corner.apexS + APEX_WINDOW_M, endS);
  let apex: RunSample | undefined;
  for (const sample of samples) {
    if (sample.s >= apexFrom && sample.s <= apexTo && (!apex || sample.speed < apex.speed)) apex = sample;
  }
  if (!apex) return undefined;
  const apexS = apex.s;

  let peakBrake = 0;
  let brakeEndS: number | undefined;
  if (brakeSample) {
    for (const sample of samples) {
      if (sample.s < brakeSample.s || sample.s > apexS) continue;
      peakBrake = Math.max(peakBrake, sample.brake);
      if (sample.brake > BRAKE_ON) brakeEndS = sample.s;
    }
  }

  const fullThrottle = samples.find((sample) => sample.s > apexS && sample.s <= endS && sample.throttle >= 0.95);
  const exitAt = Math.min(endS, corner.exitS + EXIT_SPEED_AFTER_M);

  // The gears from where the driver (or the reference) started braking to the reference's exit.
  const gearsFrom = samples.findIndex((sample) => sample.s >= Math.min(brakeSample?.s ?? corner.brakeS, corner.brakeS));
  const gearsTo = samples.findLastIndex((sample) => sample.s <= Math.max(corner.exitS, apexS));
  const gears = gearsFrom >= 0 ? gearSpans(samples, gearsFrom, gearsTo) : [];
  const lowGear = gears.length ? Math.min(...gears.map((span) => span.gear)) : apex.gear;

  const result: CornerResult = {
    corner,
    timeLossS: (userTime - refTime) / 1000,
    brakeDeltaM: brakeSample ? brakeSample.s - corner.brakeS : undefined,
    peakBrake,
    apexSpeedKmh: apex.speed * 3.6,
    apexGear: apex.gear,
    lowGear,
    throttleDeltaM: fullThrottle ? fullThrottle.s - corner.exitS : undefined,
    brakeAtTurnIn: brakeSample && corner.turnInS !== undefined ? brakeAt(samples, corner.turnInS) : undefined,
    brakeEndS,
    exitSpeedKmh: speedAt(samples, exitAt) * 3.6,
    refExitSpeedKmh: speedAt(reference.points, exitAt) * 3.6,
    problems: [],
  };
  result.problems = findProblems(result);
  const line = lineAtTurnIn(reference, corner, samples);
  if (line) result.line = line;
  return result;
}

/**
 * How far beside the reference the car was where the reference begins to steer (the user, 2026-11-03: in the middle of
 * the track instead of on the right, over the curb). Left and right from the track's plane: with the reference's
 * heading (hx, hz), hx * dz - hz * dx is positive to the right of its line.
 */
function lineAtTurnIn(reference: ReferenceLap, corner: Corner, samples: RunSample[]): TurnInLine | undefined {
  const at = corner.turnFirstS ?? corner.turnInS;
  if (at === undefined || corner.sameTurn) return undefined;
  const sample = samples.find((candidate) => candidate.s >= at);
  if (sample?.x === undefined || sample.z === undefined) return undefined;
  const point = (s: number) => reference.points.find((p) => p.s >= s) ?? reference.points.at(-1)!;
  const from = point(at - HEADING_M);
  const to = point(at + HEADING_M);
  const here = point(at);
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  if (!length) return undefined;
  const offset = ((to.x - from.x) * (sample.z - here.z) - (to.z - from.z) * (sample.x - here.x)) / length;
  if (Math.abs(offset) < LINE_OFF_M || Math.abs(offset) > LINE_OFF_MAX_M) return undefined;
  const side = offset > 0 ? 'right' : 'left';
  // Negative steering is a right-hander: its outside curb is on the left.
  const outside = corner.maxSteer < 0 ? 'left' : 'right';
  return { meters: Math.round(Math.abs(offset)), side, curb: !!corner.curbEntry && side !== outside };
}

function findProblems(r: CornerResult): Problem[] {
  const c = r.corner;
  const problems: Problem[] = [];
  if (r.brakeDeltaM === undefined) {
    if (c.peakBrake >= 0.3) problems.push({ kind: 'no-brake' });
  } else if (r.brakeDeltaM <= -BRAKE_POINT_TOLERANCE_M) {
    problems.push({ kind: 'brake-early', meters: roundTo5(-r.brakeDeltaM) });
  } else if (r.brakeDeltaM >= BRAKE_POINT_TOLERANCE_M) {
    problems.push({ kind: 'brake-late', meters: roundTo5(r.brakeDeltaM) });
  }
  const apexDelta = r.apexSpeedKmh - c.apexSpeedKmh;
  // Trail braking (docs/dev/coach-and-texts.md) right after the braking point: letting go before turn-in, or braking too far into
  // the corner, is usually why the apex is slow, so it comes before the apex speed (a description names two).
  // Let go before turn-in, where the reference still brakes.
  if (c.trailBrake !== undefined && r.brakeAtTurnIn !== undefined && r.brakeAtTurnIn < TRAIL_RELEASED) {
    problems.push({ kind: 'no-trail', percent: roundTo10(r.brakeAtTurnIn), refPercent: roundTo10(c.trailBrake) });
  }
  // Braked deeper into the corner than the reference, and it cost speed at the apex.
  if (r.brakeEndS !== undefined && r.brakeEndS - c.brakeEndS >= TRAIL_LONG_M && apexDelta <= -APEX_SPEED_TOLERANCE_KMH) {
    problems.push({ kind: 'trail-long', meters: roundTo5(r.brakeEndS - c.brakeEndS) });
  }
  // The lowest gear, not the one at the slowest point: the reference often shifts up again just before it (a
  // hairpin down to first, second at the apex; stream, 2026-10-23), and a driver in that gear did it right.
  const refLow = lowestGear(c);
  if (r.lowGear !== refLow && r.lowGear > 0 && refLow > 0) problems.push({ kind: 'wrong-gear', gear: r.lowGear, refGear: refLow });

  if (apexDelta <= -APEX_SPEED_TOLERANCE_KMH) problems.push({ kind: 'slow-apex', kmh: Math.round(-apexDelta) });
  else if (apexDelta >= APEX_SPEED_TOLERANCE_KMH) problems.push({ kind: 'fast-apex', kmh: Math.round(apexDelta) });

  if (r.throttleDeltaM !== undefined && r.throttleDeltaM >= THROTTLE_TOLERANCE_M) {
    problems.push({ kind: 'late-throttle', meters: roundTo5(r.throttleDeltaM) });
  }
  // Brake force only matters if it shows in the result: too little braking makes the car too fast
  // into the corner, too much makes it too slow.
  if (r.brakeDeltaM !== undefined) {
    if (r.peakBrake < c.peakBrake - BRAKE_FORCE_TOLERANCE && apexDelta >= APEX_SPEED_TOLERANCE_KMH) {
      problems.push({ kind: 'brake-weak', percent: roundTo10(r.peakBrake), refPercent: roundTo10(c.peakBrake) });
    } else if (r.peakBrake > c.peakBrake + BRAKE_FORCE_TOLERANCE && apexDelta <= -APEX_SPEED_TOLERANCE_KMH) {
      problems.push({ kind: 'brake-hard', percent: roundTo10(r.peakBrake), refPercent: roundTo10(c.peakBrake) });
    }
  }
  return problems;
}

function timeAt(points: readonly (RunSample | ReferencePoint)[], s: number): number {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.s >= s) {
      const f = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
      return a.t + Math.max(0, Math.min(1, f)) * (b.t - a.t);
    }
  }
  return points.at(-1)?.t ?? 0;
}

/** Speed (m/s) at a distance, between two samples. */
function speedAt(points: readonly (RunSample | ReferencePoint)[], s: number): number {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (b.s >= s) {
      const f = b.s > a.s ? Math.max(0, Math.min(1, (s - a.s) / (b.s - a.s))) : 0;
      return a.speed + f * (b.speed - a.speed);
    }
  }
  return points.at(-1)?.speed ?? 0;
}

function roundTo5(meters: number): number {
  return Math.max(5, Math.round(meters / 5) * 5);
}

function roundTo10(share: number): number {
  return Math.round((share * 100) / 10) * 10;
}
