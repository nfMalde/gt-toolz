// Slides and spins (the user, 2026-10-28: most players spin because they do not know how to dose throttle and brake,
// or what to do in the grass; "Was den Alphatestern fehlt ist die Ursache"). Watches the slip angle (where the car
// points against where it goes); when the rear lets go, works out from the moment before what started it, so the
// coach can say why and how to avoid it. What happens after the rear let go (into the gravel, the throttle blip of a
// downshift, counter-steering) is the consequence, not the cause: only the moment before counts.

import { Flags, type TelemetryFrame } from '@gt-toolz/telemetry';

/**
 * What started it:
 * - grass-throttle, grass-brake, grass: wheels on grass or gravel already, on the throttle, braking, or neither;
 * - curb-throttle: on the throttle with a rear wheel on a curb;
 * - throttle: on the throttle (with the wheel still turned);
 * - brake: braking while turning in (the rear gets light); brake-straight: braking too hard, the wheel nearly straight;
 * - lift: off the throttle abruptly in the corner (the rear gets light);
 * - contact: a sudden loss of speed (another car, a wall);
 * - unknown: none of it (too fast into the corner, steered in abruptly, a wet track).
 */
export type SlideCause =
  | 'grass-throttle'
  | 'grass-brake'
  | 'grass'
  | 'curb-throttle'
  | 'throttle'
  | 'brake'
  | 'brake-straight'
  | 'lift'
  | 'contact'
  | 'unknown';

export const SLIDE_CAUSES: readonly SlideCause[] = ['grass-throttle', 'grass-brake', 'grass', 'curb-throttle', 'throttle', 'brake', 'brake-straight', 'lift', 'contact', 'unknown'];

export interface Slide {
  /** spin: turned round (SPIN_DEG or more); slide: the rear came and was caught. */
  kind: 'spin' | 'slide';
  cause: SlideCause;
  /** The biggest slip angle, degrees. */
  maxDeg: number;
  /** When it began: the slip angle passing ONSET_DEG (frame time, ms), and where. */
  time: number;
  x: number;
  z: number;
  speedKmh: number;
  gear: number;
  /** The most throttle and brake in the moment before, percent. */
  throttle: number;
  brake: number;
  /** Steering wheel as it began, degrees (positive: left); missing without packet B. */
  steerDeg?: number;
  /** The rear wheels in the moment before: the most spin (on the throttle) and the most locking (braking). */
  rearSpin: number;
  rearLock: number;
  /** The surface under the wheels as it began ("GTGT"), and grass ("G") or gravel ("S") for the grass causes. */
  surface?: string;
  offSurface?: 'G' | 'S';
  /** Caught, then it swung the other way: counter-steered too long. */
  pendulum: boolean;
}

/** A slide begins at this slip angle (degrees) at this speed (m/s, about 30 km/h), held for some frames ... */
const START_DEG = 20;
const START_SPEED = 8.3;
const START_FRAMES = 3;
/** ... and dates from where the slip angle passed this (a normal corner has up to about 5°, docs/dev/telemetry.md). */
const ONSET_DEG = 6;
/** No onset within this: the car was not going straight (driving backwards), no slide. */
const ONSET_MAX_MS = 3000;
/** It is over once the slip angle stays below this for END_HOLD_MS (standing counts as 0) ... */
const END_DEG = 8;
const END_HOLD_MS = 700;
/** ... or after this, whatever happens. */
const MAX_MS = 15_000;
/** Turned this far: a spin. */
export const SPIN_DEG = 90;
/** Back below this between the two sides: it swung over (pendulum), not round (a spin passes 180°). */
const PENDULUM_BACK_DEG = 10;
/** The moment before (ms around the onset) that tells what started it. */
const CAUSE_FROM_MS = -400;
const CAUSE_TO_MS = 100;
/** Wheels off track a little earlier still count: the car came off and then lost it. */
const OFF_FROM_MS = -600;
/** A pedal counts when held for this many frames (not the throttle blip of a downshift). */
const HELD_FRAMES = 3;
const THROTTLE_ON = 0.5;
/** The throttle counts this close before the onset (earlier and released: lifted off). */
const THROTTLE_FROM_MS = -300;
/** Rear wheels spinning more than this (wheel slip). */
const SPINNING = 0.1;
const BRAKE_ON = 0.2;
/** Throttle up to this long before the onset, and none at the onset: lifted off. */
const LIFT_FROM_MS = -1000;
const LIFT_TO_MS = -200;
const LIFT_THROTTLE = 0.6;
const LIFT_OFF = 0.15;
/** Braking with less steering than this (wheel degrees) is braking straight. */
const STRAIGHT_STEER_DEG = 30;
/**
 * Losing speed faster than this (m/s², 6 g; braking is at most about 1.5 g) over at least CONTACT_SPAN_MS is a hit,
 * looked for until this after the start (a hit later, while sliding, is a consequence).
 */
const CONTACT_DECEL = 60;
const CONTACT_SPAN_MS = 30;
const CONTACT_AFTER_MS = 150;
/** Frames further apart than this are a gap (pause), not driving. */
const MAX_FRAME_GAP_MS = 100;
/** A position jump beyond this is a restart or a replay jump. */
const TELEPORT_M = 50;
const FROZEN_M = 0.001;
/** How much history is kept. */
const KEEP_MS = 3500;

const DEG = 180 / Math.PI;

interface Sample {
  t: number;
  slip: number;
  speed: number;
  throttle: number;
  brake: number;
  steer?: number;
  gear: number;
  rearSpin: number;
  rearLock: number;
  surface?: string;
  x: number;
  z: number;
}

const offTrack = (c: string | undefined) => c === 'G' || c === 'S';

export class SlideWatcher {
  private samples: Sample[] = [];
  private slide: { onset: number; start: number; max: number; side: number; back: boolean; pendulum: boolean; calmSince: number } | undefined;
  /** A new slide only once the last one is over and the car went straight again. */
  private armed = true;
  private last: TelemetryFrame | undefined;

  /** The slide that just ended, if any. Feed every frame. */
  update(frame: TelemetryFrame): Slide | undefined {
    const last = this.last;
    if (frame.flags & (Flags.Paused | Flags.Loading) || !(frame.flags & Flags.CarOnTrack)) return undefined;
    this.last = frame;
    if (last) {
      const moved = Math.hypot(frame.x - last.x, frame.z - last.z);
      if (moved > TELEPORT_M) {
        this.reset();
        return undefined;
      }
      // Results screens repeat the last packet.
      if (moved < FROZEN_M && frame.speed > 1) return undefined;
    }
    const rear = frame.wheelSlip ? [frame.wheelSlip[2], frame.wheelSlip[3]] : [0, 0];
    const sample: Sample = {
      t: frame.time,
      slip: (frame.slipAngle ?? 0) * DEG,
      speed: frame.speed,
      throttle: frame.throttle,
      brake: frame.brake,
      steer: frame.steeringWheel !== undefined ? frame.steeringWheel * DEG : undefined,
      gear: frame.gear,
      // Both rear wheels: one alone spins on a curb or in the air.
      rearSpin: Math.min(rear[0]!, rear[1]!),
      rearLock: Math.max(rear[0]!, rear[1]!),
      surface: frame.surface,
      x: frame.x,
      z: frame.z,
    };
    const previous = this.samples.at(-1);
    if (previous && sample.t - previous.t > MAX_FRAME_GAP_MS * 10) this.samples = [];
    this.samples.push(sample);
    const slide = this.slide;
    if (!slide) {
      while (this.samples.length && this.samples[0]!.t < sample.t - KEEP_MS) this.samples.shift();
      this.watchStart();
      return undefined;
    }
    const abs = Math.abs(sample.slip);
    slide.max = Math.max(slide.max, abs);
    // Only while moving: standing counts as 0°, and driving off sideways is no swing.
    if (sample.speed >= START_SPEED) {
      if (abs < PENDULUM_BACK_DEG) slide.back = true;
      else if (slide.back && abs >= START_DEG && Math.sign(sample.slip) !== slide.side) slide.pendulum = true;
    }
    if (abs >= END_DEG) slide.calmSince = 0;
    else if (!slide.calmSince) slide.calmSince = sample.t;
    if ((slide.calmSince && sample.t - slide.calmSince >= END_HOLD_MS) || sample.t - slide.start >= MAX_MS) return this.finish();
    return undefined;
  }

  /** Forget everything (a restart, a new session). */
  reset(): void {
    this.samples = [];
    this.slide = undefined;
    this.armed = true;
    this.last = undefined;
  }

  /** The slide going on right now (from the start until it is over), with its biggest slip angle so far. */
  get current(): { maxDeg: number } | undefined {
    return this.slide && { maxDeg: Math.round(this.slide.max) };
  }

  private watchStart(): void {
    const recent = this.samples.slice(-START_FRAMES);
    const now = recent.at(-1)!;
    if (!this.armed) {
      if (Math.abs(now.slip) < END_DEG) this.armed = true;
      return;
    }
    if (recent.length < START_FRAMES || !recent.every((q) => Math.abs(q.slip) >= START_DEG && q.speed >= START_SPEED && q.gear >= 1)) return;
    // Back to where the slip angle passed ONSET_DEG: that is where it began.
    let onset = this.samples.length - 1;
    while (onset > 0 && Math.abs(this.samples[onset - 1]!.slip) > ONSET_DEG) onset--;
    const begin = this.samples[onset]!;
    if (onset === 0 || now.t - begin.t > ONSET_MAX_MS) {
      // No clean start: driving backwards, or the history begins mid-slide.
      this.armed = false;
      return;
    }
    this.armed = false;
    this.slide = { onset: begin.t, start: now.t, max: Math.abs(now.slip), side: Math.sign(now.slip), back: false, pendulum: false, calmSince: 0 };
  }

  private finish(): Slide {
    const slide = this.slide!;
    this.slide = undefined;
    const t0 = slide.onset;
    const window = (from: number, to: number) => this.samples.filter((q) => q.t >= t0 + from && q.t <= t0 + to);
    const begin = this.samples.find((q) => q.t >= t0)!;
    const moment = window(CAUSE_FROM_MS, CAUSE_TO_MS);
    const held = (list: Sample[], test: (q: Sample) => boolean) => list.filter(test).length >= HELD_FRAMES;
    const throttle = held(window(THROTTLE_FROM_MS, CAUSE_TO_MS), (q) => q.throttle >= THROTTLE_ON && q.brake < 0.1);
    const braking = held(moment, (q) => q.brake >= BRAKE_ON);
    const offMoment = window(OFF_FROM_MS, CAUSE_TO_MS);
    const offWheels = (q: Sample) => [...(q.surface ?? '')].filter(offTrack).length;
    const off = held(offMoment, (q) => offWheels(q) >= 2 || offTrack(q.surface?.[2]) || offTrack(q.surface?.[3]));
    const offSample = offMoment.find((q) => offWheels(q) > 0);
    const offSurface = offSample ? ([...offSample.surface!].find(offTrack) as 'G' | 'S') : undefined;
    const rearCurb = held(moment, (q) => q.surface?.[2] === 'C' || q.surface?.[3] === 'C');

    let contact = false;
    const impact = window(-300, slide.start - t0 + CONTACT_AFTER_MS);
    for (let i = 0, j = 0; i < impact.length; i++) {
      while (j < impact.length && impact[j]!.t - impact[i]!.t < CONTACT_SPAN_MS) j++;
      const dt = j < impact.length ? impact[j]!.t - impact[i]!.t : 0;
      if (dt > 0 && dt <= MAX_FRAME_GAP_MS && ((impact[i]!.speed - impact[j]!.speed) / dt) * 1000 > CONTACT_DECEL) contact = true;
    }
    const before = window(LIFT_FROM_MS, LIFT_TO_MS);
    const atOnset = window(-100, CAUSE_TO_MS);
    const lift = !braking && before.some((q) => q.throttle >= LIFT_THROTTLE) && atOnset.every((q) => q.throttle < LIFT_OFF);
    // Off the throttle as it began and the rear wheels not spinning: the lift, not the throttle before it.
    const spinning = atOnset.some((q) => q.rearSpin > SPINNING);

    const cause: SlideCause = contact
      ? 'contact'
      : off
        ? throttle
          ? 'grass-throttle'
          : braking
            ? 'grass-brake'
            : 'grass'
        : braking
          ? begin.steer !== undefined && Math.abs(begin.steer) < STRAIGHT_STEER_DEG
            ? 'brake-straight'
            : 'brake'
          : lift && !spinning
            ? 'lift'
            : throttle
              ? rearCurb
                ? 'curb-throttle'
                : 'throttle'
              : lift
                ? 'lift'
                : 'unknown';
    const most = (list: Sample[], pick: (q: Sample) => number) => (list.length ? Math.max(...list.map(pick)) : 0);
    return {
      kind: slide.max >= SPIN_DEG ? 'spin' : 'slide',
      cause,
      maxDeg: Math.round(slide.max),
      time: t0,
      x: begin.x,
      z: begin.z,
      speedKmh: Math.round(begin.speed * 3.6),
      gear: begin.gear,
      throttle: Math.round(most(moment, (q) => q.throttle) * 100),
      brake: Math.round(most(moment, (q) => q.brake) * 100),
      steerDeg: begin.steer !== undefined ? Math.round(begin.steer) : undefined,
      rearSpin: Math.round(most(moment, (q) => q.rearSpin) * 100) / 100,
      rearLock: Math.round(Math.min(0, ...moment.map((q) => q.rearLock)) * 100) / 100,
      surface: begin.surface,
      offSurface: cause.startsWith('grass') ? offSurface : undefined,
      pendulum: slide.pendulum,
    };
  }
}
