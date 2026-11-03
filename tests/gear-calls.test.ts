// The user's live test of 2026-11-03 (Nürburgring GP, Porsche 992): the gear "is hugely important", yet it was missing in
// the corners of a chain and wherever the plan with the gears did not fit, and "only 10 %" was never said. Now every corner
// says the gear before the countdown or right after the action, and a lightly braked one names the pressure.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoachSession, DEFAULT_COACH_SETTINGS, lightBrake, type CoachEvent, type CoachSettings, type PlanAudio } from '../packages/coach/src/coach';
import { builtInPhrases } from '../packages/coach/src/i18n';
import { isFollower } from '../packages/coach/src/fast';
import { buildReference, cornerGears, type Corner } from '../packages/coach/src/reference';
import { clipFor, coachClips, cornerPlanClips, cornerPlanText } from '../packages/runtime/src/clips';
import { hapticForClip } from '../packages/runtime/src/haptics';
import { DEFAULT_RUNNER_SETTINGS } from '../packages/runtime/src/settings';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

type MakeLap = (lap: number, start: number) => TelemetryFrame[];

const SETTINGS: CoachSettings = { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: false, feedback: false, guideCorners: false, helpFirst: false };
/** A plan too long for any corner, with a short call that fits: only the call can say the gear. */
const LONG_PLAN: PlanAudio = { fullSeconds: 60, shortSeconds: 60, callSeconds: 1.5 };

function referenceOf(makeLap: MakeLap) {
  const frames = makeLap(1, 0);
  return buildReference({ lapNumber: 1, frames, lapTimeMs: frames.at(-1)!.time, clean: true, live: true }, 'test');
}

/** Three laps at the reference's pace: every cue with when it is said; of one corner: its last pass, as "kind" or "plan:call". */
function drive(makeLap: MakeLap, audio?: PlanAudio, settings: Partial<CoachSettings> = {}) {
  const reference = referenceOf(makeLap);
  const coach = new CoachSession(reference, { ...SETTINGS, ...settings });
  if (audio) for (const corner of reference.corners) coach.setPlanAudio(corner.index, audio);
  const lapMs = makeLap(1, 0).at(-1)!.time + 1000 / 60;
  const cues: { corner: number; kind: string; gear?: number; time: number }[] = [];
  for (let lap = 1; lap <= 3; lap++) {
    for (const frame of makeLap(lap, (lap - 1) * lapMs)) {
      for (const e of coach.update(frame) as CoachEvent[]) {
        if (e.type === 'cue') cues.push({ corner: e.cue.corner.index, kind: e.cue.plan ? `plan:${e.cue.plan}` : e.cue.kind, gear: e.cue.gear, time: frame.time });
      }
    }
  }
  // The last pass that got as far as "now": a corner close after the line starts its calls in the lap before.
  const lastPass = (corner: number) => {
    const own = cues.filter((cue) => cue.corner === corner);
    const kinds = own.map((cue) => cue.kind);
    return own.slice(kinds.lastIndexOf('tone', kinds.lastIndexOf('now')));
  };
  return { reference, coach, cues, lastPass, kinds: (corner: number) => lastPass(corner).map((cue) => cue.kind) };
}

/** The reference brakes at this share of the pedal. */
const braking = (share: number): MakeLap => (lap, start) => ovalLap(lap, start).map((f) => ({ ...f, brake: f.brake * share }));
/** In the entry gear before the braking point, the other corner out in third: the driver has to shift, right at the braking point. */
const shiftAtBraking: MakeLap = (lap, start) =>
  ovalLap(lap, start).map((f) => {
    if (f.x < 1 && f.z >= 300) return { ...f, gear: 2 };
    if (f.z < -30) return { ...f, gear: 3 };
    return f;
  });
/** Corners so close that each follows the other (a chain). */
const SHORT_OVAL: MakeLap = (lap, start) => ovalLap(lap, start, 100, 20);

test('the plan with the gears fits: no short call beside it', () => {
  const { kinds } = drive(ovalLap, { fullSeconds: 3, shortSeconds: 2, callSeconds: 1.5 });
  assert.ok(kinds(1).includes('plan:full') || kinds(1).includes('plan:short'), kinds(1).join(', '));
  assert.ok(!kinds(1).includes('plan:call'), kinds(1).join(', '));
  assert.ok(kinds(1).includes('intro'), kinds(1).join(', '));
});

test('the plan does not fit: the short call right before the countdown; it says the pressure, so no announcement beside it', () => {
  const light = drive(braking(0.2), LONG_PLAN).kinds(1);
  assert.ok(light.includes('plan:call'), light.join(', '));
  assert.ok(!light.includes('intro'), light.join(', '));
  assert.equal(light[light.indexOf('plan:call') + 1], 'count', light.join(', '));
  // Full braking: the call only has the gear, the announcement stays where there is room for it.
  const full = drive(ovalLap, LONG_PLAN).kinds(1);
  assert.ok(full.indexOf('intro') >= 0 && full.indexOf('intro') < full.indexOf('plan:call'), full.join(', '));
  // The shape alone comes before the call.
  const shaped = drive(ovalLap, { ...LONG_PLAN, shapeSeconds: 1 }).kinds(1);
  assert.ok(shaped.indexOf('plan:shape') >= 0 && shaped.indexOf('plan:shape') < shaped.indexOf('plan:call'), shaped.join(', '));
});

test('a corner of a chain gets the short call, not the plan or the announcement', () => {
  const reference = referenceOf(SHORT_OVAL);
  assert.equal(isFollower(reference, reference.corners[0]!), true, 'the test: a chain');
  const { kinds } = drive(SHORT_OVAL, { fullSeconds: 2, shortSeconds: 1.5, shapeSeconds: 1, callSeconds: 1.2 });
  assert.ok(kinds(1).includes('plan:call'), kinds(1).join(', '));
  for (const kind of ['intro', 'plan:full', 'plan:short', 'plan:shape']) assert.ok(!kinds(1).includes(kind), `${kind}: ${kinds(1).join(', ')}`);
});

test('the numbers make way for the call', () => {
  const free = drive(SHORT_OVAL).kinds(1).filter((kind) => kind === 'count').length;
  const withCall = drive(SHORT_OVAL, { fullSeconds: 60, shortSeconds: 60, callSeconds: 2.5 }).kinds(1);
  assert.ok(withCall.includes('plan:call'), withCall.join(', '));
  assert.ok(withCall.filter((kind) => kind === 'count').length < free, `${free} numbers before: ${withCall.join(', ')}`);
});

test('nothing before the countdown can say it: the gear comes right after the action, where the driver has to shift', () => {
  const reference = referenceOf(shiftAtBraking);
  const [first, second] = reference.corners as [Corner, Corner];
  assert.notEqual(cornerGears(first).entry, cornerGears(second).exit, 'the test: a gear to change');
  for (const audio of [{ fullSeconds: 60, shortSeconds: 60, callSeconds: 60 }, undefined]) {
    const heard = drive(shiftAtBraking, audio).lastPass(1);
    const kinds = heard.map((cue) => cue.kind);
    assert.equal(kinds[kinds.indexOf('brake') + 1], 'gear', kinds.join(', '));
    assert.equal(heard[kinds.indexOf('brake') + 1]!.gear, cornerGears(first).entry);
  }
});

test('the short call said it, or the driver is still in that gear: no gear after the action', () => {
  const said = drive(shiftAtBraking, LONG_PLAN).kinds(1);
  assert.ok(said.includes('plan:call') && !said.includes('gear'), said.join(', '));
  // Second gear out of the corner before, second gear here (and no shift later to call it at).
  const same: MakeLap = (lap, start) => ovalLap(lap, start).map((f) => (f.x < 1 && f.z >= 300 ? { ...f, gear: 2 } : f));
  const reference = referenceOf(same);
  assert.equal(cornerGears(reference.corners[0]!).entry, cornerGears(reference.corners[1]!).exit, 'the test: the same gear');
  const still = drive(same, { fullSeconds: 60, shortSeconds: 60, callSeconds: 60 }).kinds(1);
  assert.ok(!still.includes('gear'), still.join(', '));
});

test('without the corner plan the coach keeps quiet about gears, as asked', () => {
  const kinds = drive(shiftAtBraking, undefined, { announceShifts: false }).kinds(1);
  assert.ok(!kinds.includes('gear'), kinds.join(', '));
});

test('the gear at its shift waits behind the turn-in until the apex, not only until the shift', () => {
  // The turn-in right after "now, brake"; the shift down to second about 1.1 s after the braking point, the apex 3 s after it.
  const turning: MakeLap = (lap, start) =>
    ovalLap(lap, start).map((f) => (f.x < 1 && f.z >= 400 ? { ...f, steeringWheel: -0.6, frontWheelAngle: -0.12, gear: f.z >= 440 ? 2 : 3 } : f));
  const { kinds } = drive(turning, undefined, { nowSeconds: 0.5, brakeSeconds: 0.5, turnInSeconds: 1.2, gearSeconds: 0.5 });
  assert.deepEqual(kinds(1).filter((kind) => kind === 'turn-in' || kind === 'gear'), ['turn-in', 'gear'], kinds(1).join(', '));
});

test('what follows "now" runs on the clock: under hard braking the words do not run into each other', () => {
  const settings = { announceGear: true, nowSeconds: 0.5, brakeSeconds: 0.5, gearSeconds: 0.8, turnInSeconds: 0.9, turnInShortSeconds: 0.5 };
  const turning: MakeLap = (lap, start) => shiftAtBraking(lap, start).map((f) => (f.x < 1 && f.z >= 400 ? { ...f, steeringWheel: -0.6, frontWheelAngle: -0.12 } : f));
  const heard = drive(turning, undefined, settings).lastPass(1);
  const at = (kind: string) => heard.find((cue) => cue.kind === kind)!.time;
  assert.deepEqual(heard.map((cue) => cue.kind).slice(-4), ['now', 'brake', 'turn-in', 'gear']);
  assert.ok(Math.abs(at('brake') - at('now') - 550) < 20, `brake ${at('brake') - at('now')} ms after now`);
  assert.ok(at('turn-in') - at('brake') >= 500, `turn-in ${at('turn-in') - at('brake')} ms after brake`);
  assert.ok(at('gear') - at('turn-in') >= 500, `gear ${at('gear') - at('turn-in')} ms after the turn-in`);
});

test('at the reference\'s pace the next corner waits until the last call has been said', () => {
  const settings = { nowSeconds: 0.5, brakeSeconds: 0.5, gearSeconds: 0.8, turnInSeconds: 1.2, toneSeconds: 0.25, countSeconds: 0.5 };
  const seconds: Record<string, number> = { tone: 0.25, intro: 1.2, count: 0.5, now: 0.5, brake: 0.5, gear: 0.8, 'turn-in': 1.2, 'plan:call': 1.2, 'plan:shape': 1 };
  const { cues } = drive(SHORT_OVAL, { fullSeconds: 60, shortSeconds: 60, shapeSeconds: 1, callSeconds: 1.2 }, settings);
  for (let i = 1; i < cues.length; i++) {
    const before = cues[i - 1]!;
    const gap = cues[i]!.time - before.time;
    assert.ok(gap >= (seconds[before.kind] ?? 0) * 1000 - 100, `${cues[i]!.kind} of corner ${cues[i]!.corner} ${gap} ms after ${before.kind} of corner ${before.corner}`);
  }
});

test('calls of the previous corner that end after this braking point leave no time; that is no lap of time', () => {
  const available = (settings: Partial<CoachSettings>) => {
    const coach = new CoachSession(referenceOf(ovalLap), { ...SETTINGS, ...settings }) as unknown as { availableSeconds(c: number): number };
    return [coach.availableSeconds(0), coach.availableSeconds(1)];
  };
  const [first, second] = available({});
  assert.ok(first! > 5 && first! < 42, `across the line (${first})`);
  assert.ok(second! > 5 && second! < 42, `to the next corner (${second})`);
  assert.ok(available({ nowSeconds: 40 })[1]! < 0, 'words longer than the way to the next corner');
});

test('a lightly braked corner names the pressure after "now"; from 80 % on it just brakes', () => {
  const corner = referenceOf(ovalLap).corners[0]!;
  const light = { ...corner, peakBrake: 0.24 };
  assert.equal(lightBrake(light), 20);
  assert.equal(lightBrake({ ...corner, peakBrake: 0.7 }), 70);
  assert.equal(lightBrake({ ...corner, peakBrake: 0.8 }), undefined);
  assert.equal(lightBrake(corner), undefined);
  const cue = (c: Corner, kind: 'brake' | 'brake-point') => clipFor({ kind, corner: c, secondsToPoint: 0 });
  assert.equal(cue(light, 'brake'), 'brake-20');
  assert.equal(cue(light, 'brake-point'), 'brake-point-20');
  assert.equal(cue(corner, 'brake'), 'brake');
  assert.equal(coachClips(builtInPhrases('en'))['brake-20'], '20 percent');
  assert.equal(coachClips(builtInPhrases('de'))['brake-point-70'], '70 Prozent');
  // Felt as "bremsen" is: once with "now", or alone at the braking point.
  assert.equal(hapticForClip('brake-20', true), undefined);
  assert.deepEqual(hapticForClip('brake-point-20', true), { cue: 'now' });
});

test('the longer pressure word is planned with its own length', () => {
  const coach = new CoachSession(referenceOf(ovalLap), { ...SETTINGS, brakeSeconds: 0.5, brakeLightSeconds: 0.9 }) as unknown as { stepSeconds(step: { kind: string }, corner: Corner): number };
  const corner = referenceOf(ovalLap).corners[0]!;
  assert.equal(coach.stepSeconds({ kind: 'brake' }, corner), 0.5);
  assert.equal(coach.stepSeconds({ kind: 'brake' }, { ...corner, peakBrake: 0.3 }), 0.9);
});

test('the short call: pressure and gears, in both languages, as short as it gets; only with the corner plan on', () => {
  const corner = { ...referenceOf(ovalLap).corners[0]!, peakBrake: 0.24 };
  const settings = DEFAULT_RUNNER_SETTINGS;
  assert.equal(cornerPlanText(corner, 'call', builtInPhrases('en'), settings), '20 percent in second gear.');
  assert.equal(cornerPlanText(corner, 'call', builtInPhrases('de'), settings), '20 Prozent im zweiten Gang.');
  const full = { ...corner, peakBrake: 1 };
  assert.equal(cornerPlanText(full, 'call', builtInPhrases('en'), settings), 'In second gear.');
  assert.equal(cornerPlanText(full, 'call', builtInPhrases('de'), settings), 'Im zweiten Gang.');
  assert.equal(cornerPlanText(corner, 'call', builtInPhrases('en'), { ...settings, intro: false }), 'In second gear.', 'announcement off: no pressure');
  assert.equal(cornerPlanClips(corner, builtInPhrases('en'), settings).call, '20 percent in second gear.');
  assert.equal(cornerPlanClips(corner, builtInPhrases('en'), { ...settings, plan: false }).call, undefined);
  // The user, 2026-11-03: other gear out of the corner, "in 2 aus 3" rather than "in Gang 2, aus in Gang 3".
  const gears = { entry: 2, exit: 3 };
  assert.equal(builtInPhrases('de').cornerCall('full', gears), 'In zwei aus drei.');
  assert.equal(builtInPhrases('en').cornerCall('full', gears), 'In two out three.');
  assert.equal(builtInPhrases('de').cornerCall(40, gears), '40 Prozent in zwei aus drei.');
  assert.equal(builtInPhrases('en').cornerCall(40, gears), '40 percent in two out three.');
});
