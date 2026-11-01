// Slides and spins (the user, 2026-10-28: the alpha testers miss why they spun). The cause comes from the moment
// before the rear let go, not from what happened after (into the gravel, the throttle blip of a downshift); the
// coach says it with a tip; the corner's run is left out.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReference } from '../packages/coach/src/reference';
import { CoachSession, DEFAULT_COACH_SETTINGS, type CoachEvent } from '../packages/coach/src/coach';
import { builtInPhrases } from '../packages/coach/src/i18n';
import { SLIDE_CAUSES, SlideWatcher, type Slide } from '../packages/coach/src/slides';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

const RAD = Math.PI / 180;

/** What the car does at a moment of a run, from its start (ms). */
interface Step {
  speed: number;
  slipDeg?: number;
  throttle?: number;
  brake?: number;
  steerDeg?: number;
  rear?: number;
  surface?: string;
}

/** Frames at 60 Hz along a straight line; script(t) gives what happens at t ms. */
function run(ms: number, script: (t: number) => Step, start = 0): TelemetryFrame[] {
  const frames: TelemetryFrame[] = [];
  let z = 0;
  for (let t = 0; t <= ms; t += 1000 / 60) {
    const step = script(t);
    z += (step.speed / 60) * 1;
    frames.push({
      time: start + t,
      packetId: frames.length,
      flags: Flags.CarOnTrack,
      x: 0,
      y: 0,
      z,
      speed: step.speed,
      throttle: step.throttle ?? 0,
      brake: step.brake ?? 0,
      gear: 2,
      lapCount: 1,
      lapsInRace: 0,
      bestLapMs: -1,
      lastLapMs: -1,
      carCode: 1,
      racePosition: -1,
      carsInRace: 1,
      fuelLevel: 100,
      fuelCapacity: 100,
      tyreTemps: [80, 80, 80, 80],
      steeringWheel: (step.steerDeg ?? 0) * RAD,
      slipAngle: step.slipDeg === undefined ? 0 : Math.atan2(Math.sin(step.slipDeg * RAD), Math.cos(step.slipDeg * RAD)),
      wheelSlip: [0, 0, step.rear ?? 0, step.rear ?? 0],
      surface: step.surface ?? 'TTTT',
    });
  }
  return frames;
}

function slidesOf(frames: TelemetryFrame[]): Slide[] {
  const watcher = new SlideWatcher();
  return frames.map((f) => watcher.update(f)).filter((s): s is Slide => !!s);
}

/** Corner exit at 1 s: full throttle with the wheel turned, the rear wheels spin, the car turns round. */
const powerSpin = (t: number): Step =>
  t < 1000
    ? { speed: 20, throttle: 0.2, steerDeg: -90, slipDeg: -2 }
    : t < 3000
      ? { speed: 20 - (t - 1000) / 200, throttle: 1, steerDeg: -90, rear: 0.4, slipDeg: -Math.min(180, ((t - 1000) / 1000) * 180) }
      : { speed: 0, slipDeg: 0 };

test('a spin on the throttle out of a corner: too much throttle', () => {
  const [slide, ...more] = slidesOf(run(6000, powerSpin));
  assert.equal(more.length, 0);
  assert.equal(slide?.kind, 'spin');
  assert.equal(slide?.cause, 'throttle');
  assert.ok(slide!.maxDeg >= 170);
  assert.equal(slide!.throttle, 100);
});

test('braking while turning in: the gravel and the throttle blips afterwards are consequences, not the cause', () => {
  const frames = run(7000, (t) =>
    t < 1000
      ? { speed: 35, brake: 1, steerDeg: 10 }
      : t < 2000
        ? { speed: 35 - (t - 1000) / 100, brake: 1, steerDeg: 120, rear: -0.5, slipDeg: ((t - 1000) / 1000) * 40 }
        : // Off into the gravel, the downshift blips the throttle, the car turns round.
          t < 4000
          ? { speed: Math.max(9, 25 - (t - 2000) / 100), throttle: Math.floor(t / 200) % 2 ? 0.6 : 0, slipDeg: Math.min(180, 40 + ((t - 2000) / 1000) * 70), surface: 'SSSS' }
          : { speed: 0 },
  );
  const [slide] = slidesOf(frames);
  assert.equal(slide?.cause, 'brake');
  assert.equal(slide?.kind, 'spin');
  assert.equal(slide?.offSurface, undefined);
});

test('braking hard with the wheel nearly straight', () => {
  const frames = run(5000, (t) =>
    t < 2500 ? { speed: 40 - t / 200, brake: 1, steerDeg: 5, rear: t < 1000 ? -0.1 : -0.25, slipDeg: t < 1000 ? 0 : ((t - 1000) / 1500) * 60 } : { speed: 0 },
  );
  assert.equal(slidesOf(frames)[0]?.cause, 'brake-straight');
});

test('two wheels in the grass, then the throttle: throttle in the grass', () => {
  const frames = run(5000, (t) =>
    t < 1000
      ? { speed: 40, throttle: 1, steerDeg: 30, surface: t > 500 ? 'GTGT' : 'TTTT' }
      : t < 2500
        ? { speed: 40 - (t - 1000) / 300, throttle: 1, steerDeg: 30, rear: 0.2, slipDeg: ((t - 1000) / 1500) * 120, surface: 'GTGT' }
        : { speed: 0 },
  );
  const [slide] = slidesOf(frames);
  assert.equal(slide?.cause, 'grass-throttle');
  assert.equal(slide?.offSurface, 'G');
});

test('the throttle on a curb', () => {
  const frames = run(5000, (t) =>
    t < 1000 ? { speed: 25, throttle: 1, steerDeg: -60, surface: 'TCTC' } : t < 2000 ? { speed: 25, throttle: 1, steerDeg: -60, rear: 0.35, slipDeg: -((t - 1000) / 1000) * 50, surface: 'TCTC' } : { speed: 25 },
  );
  assert.equal(slidesOf(frames)[0]?.cause, 'curb-throttle');
});

test('lifting off abruptly in the corner', () => {
  const frames = run(5000, (t) =>
    t < 1000 ? { speed: 40, throttle: 0.9, steerDeg: 60 } : t < 2000 ? { speed: 40, steerDeg: 60, slipDeg: ((t - 1000) / 1000) * 50 } : { speed: 40 },
  );
  assert.equal(slidesOf(frames)[0]?.cause, 'lift');
});

test('a hit: a sudden loss of speed', () => {
  const frames = run(5000, (t) =>
    t < 1000 ? { speed: 45, throttle: 0.5 } : t < 1050 ? { speed: 45 - ((t - 1000) / 50) * 25, throttle: 0.5, slipDeg: ((t - 1000) / 50) * 30 } : t < 2500 ? { speed: 20, slipDeg: 30 + ((t - 1050) / 1450) * 120 } : { speed: 0 },
  );
  assert.equal(slidesOf(frames)[0]?.cause, 'contact');
});

test('caught, then swung the other way: counter-steered too long', () => {
  const frames = run(6000, (t) =>
    t < 1000
      ? { speed: 30, throttle: 1, steerDeg: 60, rear: 0.3 }
      : t < 2000
        ? { speed: 30, throttle: 1, steerDeg: -90, rear: 0.3, slipDeg: Math.sin(((t - 1000) / 1000) * Math.PI) * 35 }
        : t < 3000
          ? { speed: 28, steerDeg: -90, slipDeg: -Math.sin(((t - 2000) / 1000) * Math.PI) * 60 }
          : { speed: 25 },
  );
  const [slide, ...more] = slidesOf(frames);
  assert.equal(more.length, 0, 'one slide, swinging over');
  assert.equal(slide?.cause, 'throttle');
  assert.equal(slide?.pendulum, true);
});

test('no slide: a normal corner, driving backwards, a slow slide in the pits', () => {
  assert.deepEqual(slidesOf(run(5000, () => ({ speed: 30, steerDeg: 90, slipDeg: 4 }))), []);
  assert.deepEqual(slidesOf(run(5000, () => ({ speed: 10, slipDeg: 180 }))), []);
  assert.deepEqual(slidesOf(run(5000, (t) => ({ speed: 6, slipDeg: t > 1000 ? 40 : 0 }))), []);
});

test('the coach says what happened, why and how to avoid it; in races only why', () => {
  const de = builtInPhrases('de');
  const en = builtInPhrases('en');
  const gravel = { kind: 'spin', cause: 'grass-throttle', offSurface: 'S', pendulum: false } as const;
  assert.equal(de.slide(gravel), 'Dreher. Du hast mit Rädern im Kies Gas gegeben.');
  assert.equal(de.slideTip(gravel), 'Neben der Strecke Gas weg und die Lenkung gerade halten. Erst auf dem Asphalt wieder Gas geben.');
  assert.equal(en.slide({ kind: 'spin', cause: 'throttle', pendulum: false }), 'Spin. Too much throttle with the wheel still turned.');
  assert.equal(en.slide({ kind: 'slide', cause: 'contact', pendulum: false }), 'The rear stepped out. After contact.');
  assert.equal(en.slideTip({ cause: 'contact', pendulum: false }), undefined, 'no tip after a contact');
  assert.match(de.slide({ kind: 'spin', cause: 'throttle', pendulum: true }), /gependelt\.$/);
  assert.match(de.slideTip({ cause: 'throttle', pendulum: true })!, /^Nimm das Gegenlenken zurück/);
  // Every cause has its text and tip in both packs (a missing one would read out its key).
  for (const phrases of [de, en]) {
    for (const cause of SLIDE_CAUSES) {
      const said = `${phrases.slide({ kind: 'spin', cause, pendulum: false })} ${phrases.slideTip({ cause, pendulum: false }) ?? ''}`;
      assert.doesNotMatch(said, /slide\./, `${phrases.id} ${cause}`);
    }
  }
});

test('a slide or spin in a braking zone: its run is left out, the other corner counts', () => {
  const lap = ovalLap(1, 0);
  const reference = buildReference({ lapNumber: 1, frames: lap, lapTimeMs: lap.at(-1)!.time, clean: true, live: true }, 'test');
  assert.equal(reference.corners.length, 2, 'two braking zones');
  const coach = new CoachSession(reference, { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: false, feedback: true });
  const results = (frames: TelemetryFrame[], drop?: number) => {
    const done: number[] = [];
    frames.forEach((f, i) => {
      const events: CoachEvent[] = coach.update(f);
      if (i === drop) assert.equal(coach.dropRun()?.index, reference.corners[0]!.index, 'the zone driven');
      for (const e of events) if (e.type === 'corner-result') done.push(e.result.corner.index);
    });
    return done;
  };
  const lapMs = lap.at(-1)!.time + 1000 / 60;
  results(ovalLap(2, lapMs));
  const normal = results(ovalLap(3, 2 * lapMs));
  assert.deepEqual(normal.sort(), reference.corners.map((c) => c.index).sort(), 'both corners counted');
  // A spin in the first braking zone, at its apex.
  const third = ovalLap(4, 3 * lapMs);
  const apex = reference.corners[0]!.apexS;
  const spinAt = third.findIndex((f, i) => i > 0 && Math.hypot(f.x - reference.points.find((p) => p.s >= apex)!.x, f.z - reference.points.find((p) => p.s >= apex)!.z) < 2);
  assert.ok(spinAt > 0);
  assert.deepEqual(results(third, spinAt), [reference.corners[1]!.index], 'only the other corner');
  assert.equal(coach.cornerAt(third[spinAt]!.x, third[spinAt]!.z)?.index, reference.corners[0]!.index);
});
