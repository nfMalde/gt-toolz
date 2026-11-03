import { distance, recognizeTrack, type Lap, type ReferencePoint, type TelemetryFrame, type TrackMatch } from '@gt-toolz/telemetry';
import { curbOn, hasCurbWheels, setCurbUse, type CurbUse } from './curbs';
import { findFastCorners, type FastCorner } from './fast';
import { nameCorners, nameFastCorners } from './names';
import { addCornerShapes, type CornerShape } from './shape';
import type { CornerGears, Direction } from './i18n/types';
import { addTrailBraking } from './trail';

// The line is the telemetry's (packages/telemetry/src/line.ts); the coach's code reads its points from here as before.
export type { ReferencePoint };


/** A braking zone; curbIn / curbOut: the inside curb towards the apex, the outside curb on the exit. */
export interface Corner extends CurbUse {
  index: number;
  /** Braking point. */
  brakeS: number;
  brakeSpeedKmh: number;
  /** 0..1 */
  peakBrake: number;
  brakeEndS: number;
  /** Turn-in point; undefined if the car barely steers (straight-line braking, chicane exit). */
  turnInS?: number;
  /** Trail braking (trail.ts): the reference's brake at turn-in (0..1) when it brakes into the corner; computed on load. */
  trailBrake?: number;
  /** Signed steering at the corner's maximum, rad. */
  maxSteer: number;
  apexS: number;
  apexSpeedKmh: number;
  /** Gear at the slowest point; the shift points around it are entryGear, midGear and exitGearS. */
  apexGear: number;
  /** Gear when braking starts. */
  brakeGear: number;
  /**
   * Lowest gear from the braking point to the apex: the gear to shift down to, also when the reference shifts
   * up again before the slowest point (a hairpin taken down to first, second at the apex; stream, 2026-10-23).
   */
  entryGear: number;
  /** Where the reference shifts down into its entry gear, when it does so after the braking point (undefined: already in it). */
  entryGearS?: number;
  /** A lower gear the reference shifts down to after the apex, still in the corner (a chicane's second part), and where. */
  midGear?: number;
  midGearS?: number;
  /** First point after the apex with (almost) full throttle; end of the corner. */
  exitS: number;
  exitGear: number;
  /** Where the reference shifts up into its exit gear after its lowest gear, if it does so in the corner. */
  exitGearS?: number;
  /** Official turn number and name, if the track data has them (see names.ts). */
  turn?: number;
  name?: string;
  /** How the corner looks from the driven line (shape.ts); computed on load. */
  shape?: CornerShape;
  /** The corner's direction; for a chicane the direction it starts with. */
  shapeDirection?: Direction;
}

export interface ReferenceLap {
  version: 1;
  createdAt: string;
  source: string;
  /** Undefined if the track is not in the signature data. */
  track?: TrackMatch;
  carCode: number;
  /** Player whose lap this is (from the leaderboard; entered by the user, GT7 does not send names). */
  driver?: string;
  /** Car name entered by the user, for a car newer than the bundled list (cars.ts). */
  carName?: string;
  /** Lap time to beat; the lap's own time if not set (e.g. the official leaderboard time). */
  targetTimeMs?: number;
  carCategory?: string;
  /** Learned from a replay (a ghost) or from one's own driving; older references do not say. */
  origin?: 'replay' | 'live';
  /**
   * What it is, said by the user after learning (docs/dev/telemetry.md; GT7 sends neither the mode nor BoP): Daily Race,
   * online lobby, single player time trial, single player race or free run. modeConfirmed: the user said so.
   */
  mode?: 'daily' | 'lobby' | 'timeTrial' | 'custom';
  bop?: boolean;
  /** The user's own name for it. */
  label?: string;
  modeConfirmed?: boolean;
  lapTimeMs: number;
  lengthMeters: number;
  /** "front-wheel" (packet C) or "steering-wheel" (packet B). */
  steerSource: 'front-wheel' | 'steering-wheel' | 'none';
  points: ReferencePoint[];
  corners: Corner[];
  /** Corners taken without braking, flat out or with a lift (fast.ts); computed on load. */
  fastCorners?: FastCorner[];
}

export interface CornerDetectionOptions {
  /** Brake above this share counts as braking. */
  brakeThreshold: number;
  /** Braking must pause this long to end a zone (trail-braking taps stay in one zone). */
  releaseMs: number;
  /** Zones shorter than this are ignored. */
  minZoneMs: number;
  /** Zones whose peak stays below this are ignored. */
  minPeakBrake: number;
}

export const DEFAULT_CORNER_OPTIONS: CornerDetectionOptions = {
  brakeThreshold: 0.05,
  releaseMs: 400,
  minZoneMs: 150,
  minPeakBrake: 0.1,
};

/**
 * Brings a reference up to date: recomputes the corners (references from older versions lack
 * some fields) and names them. Cheap; call it after loading a reference file.
 */
export function prepareReference(reference: ReferenceLap, options = DEFAULT_CORNER_OPTIONS): ReferenceLap {
  // Learned before its track was known (SUGO, alpha 0.0.5): recognized with the signatures there are now.
  reference.track ??= recognizeTrack(reference.points);
  reference.corners = findCorners(reference.points, options);
  addCurbUse(reference);
  addCornerShapes(reference);
  addTrailBraking(reference);
  nameCorners(reference);
  reference.fastCorners = findFastCorners(reference);
  nameFastCorners(reference);
  return reference;
}

/** Inside curb: from turn-in until shortly after the apex. Outside curb: from the apex until after the exit. */
const CURB_AFTER_APEX_M = 25;
const CURB_AFTER_EXIT_M = 40;

/** Which curbs the reference driver used per corner (inside towards the apex, outside on the exit), and how much. */
function addCurbUse(reference: ReferenceLap): void {
  if (!reference.points.some((p) => p.curb)) return;
  const withWheels = hasCurbWheels(reference.points);
  for (const corner of reference.corners) {
    // Negative steering is a right-hander (see turnDirection).
    const right = corner.maxSteer < 0;
    setCurbUse(
      corner,
      curbOn(reference.points, corner.turnInS ?? corner.brakeEndS, corner.apexS + CURB_AFTER_APEX_M, right, withWheels),
      curbOn(reference.points, corner.apexS, corner.exitS + CURB_AFTER_EXIT_M, !right, withWheels),
    );
  }
}

export function buildReference(lap: Lap, source: string, options = DEFAULT_CORNER_OPTIONS): ReferenceLap {
  const first = lap.frames[0]!;
  const steerSource = first.frontWheelAngle !== undefined ? 'front-wheel' : first.steeringWheel !== undefined ? 'steering-wheel' : 'none';
  const points = toPoints(lap.frames);
  return prepareReference({
    version: 1,
    createdAt: new Date().toISOString(),
    source,
    track: recognizeTrack(points),
    carCode: first.carCode,
    carCategory: first.carCategory,
    origin: lap.live ? 'live' : 'replay',
    lapTimeMs: lap.lapTimeMs,
    lengthMeters: points.at(-1)?.s ?? 0,
    steerSource,
    points,
    corners: [],
  }, options);
}

function toPoints(frames: TelemetryFrame[]): ReferencePoint[] {
  const start = frames[0]!.time;
  let s = 0;
  return frames.map((frame, i) => {
    if (i > 0) s += distance(frames[i - 1]!, frame);
    return {
      s,
      t: frame.time - start,
      x: frame.x,
      y: frame.y,
      z: frame.z,
      speed: frame.speed,
      throttle: frame.throttle,
      brake: frame.brake,
      gear: frame.gear,
      steer: frame.frontWheelAngle ?? frame.steeringWheel ?? 0,
      ...(frame.curb ? { curb: frame.curb } : {}),
      ...(frame.curbWheels ? { wheels: frame.curbWheels } : {}),
    };
  });
}

export function findCorners(points: ReferencePoint[], options = DEFAULT_CORNER_OPTIONS): Corner[] {
  const zones = findBrakingZones(points, options);
  return zones.map(([startIndex, endIndex], index) => {
    const start = points[startIndex]!;
    const end = points[endIndex]!;

    // Apex: slowest point from the braking point until the driver is back on the throttle.
    let apexIndex = startIndex;
    for (let i = startIndex; i < points.length; i++) {
      const p = points[i]!;
      if (p.speed < points[apexIndex]!.speed) apexIndex = i;
      if (i > endIndex && p.throttle > 0.5) break;
      if (p.t - end.t > 4000) break;
    }
    const apex = points[apexIndex]!;

    // Steering: strongest angle between shortly before the braking point and the apex.
    let maxIndex = startIndex;
    for (let i = startIndex; i <= apexIndex; i++) {
      if (Math.abs(points[i]!.steer) > Math.abs(points[maxIndex]!.steer)) maxIndex = i;
    }
    const maxSteer = points[maxIndex]!.steer;
    const turnInThreshold = Math.max(0.02, Math.abs(maxSteer) * 0.3);
    let turnInS: number | undefined;
    if (Math.abs(maxSteer) >= 0.03) {
      for (let i = startIndex; i <= maxIndex; i++) {
        const p = points[i]!;
        if (Math.sign(p.steer) === Math.sign(maxSteer) && Math.abs(p.steer) >= turnInThreshold) {
          turnInS = p.s;
          break;
        }
      }
    }

    let peakBrake = 0;
    for (let i = startIndex; i <= endIndex; i++) peakBrake = Math.max(peakBrake, points[i]!.brake);

    let exitIndex = apexIndex;
    while (exitIndex < points.length - 1 && points[exitIndex]!.throttle < 0.95 && points[exitIndex]!.t - apex.t < 4000) exitIndex++;
    const exit = points[exitIndex]!;

    return {
      index: index + 1,
      brakeS: start.s,
      brakeSpeedKmh: start.speed * 3.6,
      peakBrake,
      brakeEndS: end.s,
      turnInS,
      maxSteer,
      apexS: apex.s,
      apexSpeedKmh: apex.speed * 3.6,
      apexGear: apex.gear,
      brakeGear: start.gear,
      exitS: exit.s,
      ...shiftPoints(points, startIndex, apex, exit),
    };
  });
}

/** A gear held shorter than this is a blip of a shift, not a gear the car is driven in. */
const GEAR_MIN_MS = 300;
/** The gears are read this long past the exit, so a shift just before it is not cut short and taken for a blip. */
const GEARS_AFTER_EXIT_MS = 1000;

export interface GearSpan {
  gear: number;
  /** Where (s) and when (t, ms) the gear was engaged. */
  s: number;
  t: number;
}

/**
 * The gears driven between two indexes, in order: neutral and blips (GEAR_MIN_MS) left out, a blip's time added to
 * the gear before it. Shared by the reference and the driver's run (analysis.ts).
 */
export function gearSpans(points: readonly { s: number; t: number; gear: number }[], from: number, to: number): GearSpan[] {
  const raw: GearSpan[] = [];
  for (let i = Math.max(0, from); i <= Math.min(to, points.length - 1); i++) {
    const p = points[i]!;
    if (p.gear <= 0 || raw.at(-1)?.gear === p.gear) continue;
    raw.push({ gear: p.gear, s: p.s, t: p.t });
  }
  const spans: GearSpan[] = [];
  raw.forEach((span, i) => {
    // The last gear runs to the end of the window: never a blip.
    const next = raw[i + 1];
    if (next && next.t - span.t < GEAR_MIN_MS) return;
    if (spans.at(-1)?.gear !== span.gear) spans.push(span);
  });
  return spans;
}

/** The corner's shift points (entryGear, midGear, exitGear) from the gears between the braking point and the exit. */
function shiftPoints(
  points: ReferencePoint[],
  startIndex: number,
  apex: ReferencePoint,
  exit: ReferencePoint,
): Pick<Corner, 'entryGear' | 'entryGearS' | 'midGear' | 'midGearS' | 'exitGear' | 'exitGearS'> {
  let to = startIndex;
  while (to < points.length - 1 && points[to + 1]!.t <= exit.t + GEARS_AFTER_EXIT_MS) to++;
  const spans = gearSpans(points, startIndex, to).filter((span) => span.s <= exit.s);
  const toApex = spans.filter((span) => span.s <= apex.s);
  const afterApex = spans.filter((span) => span.s > apex.s);
  const entryGear = toApex.length ? Math.min(...toApex.map((span) => span.gear)) : apex.gear;
  // Where the entry gear goes in (the user, 2026-11-03: a corner taken down to first at the apex gets its call there, not after "jetzt").
  const entrySpan = toApex.find((span) => span.gear === entryGear);
  const entryGearS = entrySpan && entrySpan.s > points[startIndex]!.s ? entrySpan.s : undefined;
  const lowAfter = afterApex.length ? Math.min(...afterApex.map((span) => span.gear)) : Infinity;
  const mid = lowAfter < entryGear ? afterApex.find((span) => span.gear === lowAfter) : undefined;
  const last = spans.at(-1);
  const exitGear = last?.gear ?? exit.gear;
  const lowest = mid?.gear ?? entryGear;
  // Shifted up into the exit gear after the lowest one (and not driven in it from the start).
  const before = spans.at(-2);
  const exitGearS = last && before && exitGear > lowest && before.gear < exitGear ? last.s : undefined;
  return {
    entryGear,
    ...(entryGearS !== undefined ? { entryGearS } : {}),
    ...(mid ? { midGear: mid.gear, midGearS: mid.s } : {}),
    exitGear,
    ...(exitGearS !== undefined ? { exitGearS } : {}),
  };
}

/** The lowest gear the reference drives in the corner: entryGear, or midGear when it shifts down after the apex. */
export function lowestGear(corner: Corner): number {
  return Math.min(corner.entryGear, corner.midGear ?? corner.entryGear);
}

/** The gears the plan, the briefing and the pace notes say: down to, further down after the apex, out. */
export function cornerGears(corner: Corner): CornerGears {
  const entry = corner.entryGear > 0 ? corner.entryGear : corner.apexGear;
  return { entry, ...(corner.midGear ? { mid: corner.midGear } : {}), exit: corner.exitGear > 0 ? corner.exitGear : entry };
}

/** Returns [startIndex, endIndex] of every braking zone. */
function findBrakingZones(points: ReferencePoint[], options: CornerDetectionOptions): [number, number][] {
  const zones: [number, number][] = [];
  let start: number | undefined;
  let lastOn = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (p.brake > options.brakeThreshold) {
      start ??= i;
      lastOn = i;
    } else if (start !== undefined && p.t - points[lastOn]!.t > options.releaseMs) {
      zones.push([start, lastOn]);
      start = undefined;
    }
  }
  if (start !== undefined) zones.push([start, lastOn]);

  return zones.filter(([s, e]) => {
    if (points[e]!.t - points[s]!.t < options.minZoneMs) return false;
    let peak = 0;
    for (let i = s; i <= e; i++) peak = Math.max(peak, points[i]!.brake);
    return peak >= options.minPeakBrake;
  });
}
