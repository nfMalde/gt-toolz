// The user, 2026-11-03: the countdown runs to the first action the corner needs, braking or turning, and names it:
// "now, brake", or where the reference turns in before it brakes, "now, right, sharp" and "brake" at the braking point.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoachSession, DEFAULT_COACH_SETTINGS, type CoachEvent, type CoachSettings } from '../packages/coach/src/coach';
import { builtInPhrases } from '../packages/coach/src/i18n';
import { buildReference } from '../packages/coach/src/reference';
import { coachClips } from '../packages/runtime/src/clips';
import { hapticForClip } from '../packages/runtime/src/haptics';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

type MakeLap = (lap: number, start: number) => TelemetryFrame[];

/** The oval, the driver already steering into the first curve from z on (the braking starts near z = 390). */
const turningFrom = (z: number): MakeLap => (lap, start) =>
  ovalLap(lap, start).map((f) => (f.x < 1 && f.z >= z ? { ...f, steeringWheel: -0.6, frontWheelAngle: -0.12 } : f));

const LONG_BEFORE = turningFrom(260);
/** Room for "now" and the direction, not for the whole phrase. */
const SHORTLY_BEFORE = turningFrom(335);
/** A clear turn-in, too close to the braking point even for that. */
const JUST_BEFORE = turningFrom(352);

function referenceOf(makeLap: MakeLap) {
  const frames = makeLap(1, 0);
  return buildReference({ lapNumber: 1, frames, lapTimeMs: frames.at(-1)!.time, clean: true, live: true }, 'test');
}

/** What the first curve says on a coached lap, in order, with where the car is when it is said. */
function firstCurve(makeLap: MakeLap, settings: Partial<CoachSettings> = {}) {
  const reference = referenceOf(makeLap);
  const corner = reference.corners[0]!;
  const coach = new CoachSession(reference, { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: false, ...settings });
  const lapMs = makeLap(1, 0).at(-1)!.time + 1000 / 60;
  const heard: { kind: string; z: number }[] = [];
  for (const f of [...makeLap(1, 0), ...makeLap(2, lapMs)]) {
    const events: CoachEvent[] = coach.update(f);
    for (const e of events) if (e.type === 'cue' && e.cue.corner.index === corner.index && heard.filter((h) => h.kind === 'now').length < 2) heard.push({ kind: e.cue.kind, z: f.z });
  }
  // One pass of the corner: up to the next pass's first call.
  const next = heard.findIndex((h, i) => i > 0 && h.z < heard[i - 1]!.z - 100);
  const pass = next < 0 ? heard : heard.slice(0, next);
  return { corner, pass, kinds: pass.map((h) => h.kind), at: (kind: string) => pass.find((h) => h.kind === kind)?.z };
}

test('the reference knows a turn-in before its braking point, only a clear one', () => {
  assert.equal(referenceOf(ovalLap).corners[0]!.turnFirstS, undefined, 'straight until it brakes');
  const { turnFirstS, brakeS } = referenceOf(LONG_BEFORE).corners[0]!;
  assert.ok(turnFirstS !== undefined && Math.abs(turnFirstS - 260) < 5 && turnFirstS < brakeS, `where it begins to steer (${turnFirstS})`);
  assert.equal(referenceOf(turningFrom(380)).corners[0]!.turnFirstS, undefined, 'a moment before braking counts as braking first');
  assert.equal(referenceOf(turningFrom(100)).corners[0]!.turnFirstS, undefined, 'steering for seconds is a long bend, no turn-in');
});

test('braking first: the countdown ends at the braking point with "now, brake"', () => {
  const { corner, kinds, at } = firstCurve(ovalLap);
  const now = kinds.indexOf('now');
  assert.equal(kinds[now - 1], 'count', kinds.join(', '));
  assert.equal(kinds[now + 1], 'brake', kinds.join(', '));
  assert.ok(corner.brakeS - at('now')! < 30, `"now" at the braking point (${at('now')})`);
  assert.ok(!kinds.includes('brake-point'), kinds.join(', '));
});

test('turning first: the countdown ends at the turn-in, "brake" comes at the braking point', () => {
  const { corner, kinds, at } = firstCurve(LONG_BEFORE);
  const now = kinds.indexOf('now');
  assert.equal(kinds[now - 1], 'count', kinds.join(', '));
  assert.equal(kinds[now + 1], 'turn-in', kinds.join(', '));
  assert.equal(kinds[now + 2], 'brake-point', kinds.join(', '));
  assert.equal(kinds.filter((k) => k === 'turn-in').length, 1, kinds.join(', '));
  assert.ok(!kinds.includes('brake'), kinds.join(', '));
  const nowAt = at('now')!;
  assert.ok(nowAt < corner.turnFirstS! && corner.turnFirstS! - nowAt < 30, `"now" at the turn-in (${nowAt}, ${corner.turnFirstS})`);
  const brakeAt = at('brake-point')!;
  assert.ok(brakeAt < corner.brakeS && corner.brakeS - brakeAt < 30, `"brake" at the braking point (${brakeAt}, ${corner.brakeS})`);
});

test('a turn-in too close to the braking point for the phrase: "now" and the direction, then the braking word', () => {
  const { corner, kinds } = firstCurve(SHORTLY_BEFORE);
  assert.ok(corner.turnFirstS !== undefined, 'the reference does turn in first');
  const now = kinds.indexOf('now');
  assert.deepEqual(kinds.slice(now, now + 3), ['now', 'turn-in', 'brake-point'], kinds.join(', '));
});

test('a turn-in too close even for the direction: braking goes first, the turn-in follows', () => {
  const { corner, kinds, at } = firstCurve(JUST_BEFORE);
  assert.ok(corner.turnFirstS !== undefined, 'the reference does turn in first');
  const now = kinds.indexOf('now');
  assert.deepEqual(kinds.slice(now, now + 3), ['now', 'brake', 'turn-in'], kinds.join(', '));
  assert.ok(corner.brakeS - at('now')! < 30, `"now" at the braking point (${at('now')})`);
});

test('switched off: "now" at the braking point, no word after it, also where the reference turns in first', () => {
  const { corner, kinds, at } = firstCurve(LONG_BEFORE, { announceAction: false });
  assert.ok(!kinds.includes('brake') && !kinds.includes('brake-point'), kinds.join(', '));
  assert.ok(corner.brakeS - at('now')! < 30, `"now" at the braking point (${at('now')})`);
});

test('without the turn-in calls the countdown does not run to one', () => {
  const { corner, kinds, at } = firstCurve(LONG_BEFORE, { announceTurnIn: false });
  assert.ok(!kinds.includes('turn-in'), kinds.join(', '));
  assert.equal(kinds[kinds.indexOf('now') + 1], 'brake', kinds.join(', '));
  assert.ok(corner.brakeS - at('now')! < 30, `"now" at the braking point (${at('now')})`);
});

test('"now, brake" costs no call in a tight corner: the turn-in follows it, the gear waits for the turn-in', () => {
  // The turn-in shortly after the braking point, the shift down to second near the end of the braking.
  const { kinds } = firstCurve(turningFrom(430), { announceShifts: true });
  const order = kinds.filter((k) => ['now', 'brake', 'turn-in', 'gear'].includes(k));
  assert.deepEqual(order.slice(0, 4), ['now', 'brake', 'turn-in', 'gear'], kinds.join(', '));
});

test('the gear right after "now" waits for the action', () => {
  // Already in the entry gear before the braking point: no shift in the corner to call it at.
  const inGear: MakeLap = (lap, start) => ovalLap(lap, start).map((f) => (f.x < 1 && f.z >= 300 ? { ...f, gear: 2 } : f));
  const { kinds } = firstCurve(inGear, { announceGear: true });
  const now = kinds.indexOf('now');
  assert.equal(kinds[now + 1], 'brake', kinds.join(', '));
  assert.equal(kinds[now + 2], 'gear', kinds.join(', '));
});

test('the word is in both languages; it is felt once, with "now" or alone at the braking point', () => {
  assert.equal(coachClips(builtInPhrases('de')).brake, 'bremsen');
  assert.equal(coachClips(builtInPhrases('en')).brake, 'brake');
  assert.equal(coachClips(builtInPhrases('de'))['brake-point'], 'bremsen');
  assert.equal(hapticForClip('brake', true), undefined);
  assert.deepEqual(hapticForClip('brake-point', true), { cue: 'now' });
});
