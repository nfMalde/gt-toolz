// The user, 2026-11-03 (Nürburgring GP, Eifel Cup): the turn-in call came in two of eleven corners, and the gears the
// app's braking zone table shows (down to first at the apex, up on the way out) were never called. A turn-in at or
// right after the braking point would have talked over "now" and was dropped; now it follows "now" (and the gear).
// The gears where the reference shifts in the corner are called with the corner plan, not only with "gear after now".

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoachSession, DEFAULT_COACH_SETTINGS, type CoachEvent, type CoachSettings } from '../packages/coach/src/coach';
import { buildReference } from '../packages/coach/src/reference';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

/** The oval, but the driver already turns in during the braking for the first curve (70 m before it, at z = 430). */
function earlyTurnInLap(lap: number, start: number): TelemetryFrame[] {
  return ovalLap(lap, start).map((f) => (f.x < 1 && f.z >= 430 ? { ...f, steeringWheel: -0.6, frontWheelAngle: -0.12 } : f));
}

const lap = earlyTurnInLap(1, 0);
const lapMs = lap.at(-1)!.time + 1000 / 60;
const reference = buildReference({ lapNumber: 1, frames: lap, lapTimeMs: lap.at(-1)!.time, clean: true, live: true }, 'test');
const first = reference.corners[0]!;

/** The cues of the first curve on a coached lap, in order, as "kind" or "gear N". */
function cuesOfFirstCurve(settings: Partial<CoachSettings>): string[] {
  const coach = new CoachSession(reference, { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: false, ...settings });
  const events: CoachEvent[] = [];
  for (const f of earlyTurnInLap(1, 0)) events.push(...coach.update(f));
  for (const f of earlyTurnInLap(2, lapMs)) events.push(...coach.update(f));
  return events
    .filter((e): e is Extract<CoachEvent, { type: 'cue' }> => e.type === 'cue' && e.cue.corner.index === first.index)
    .slice(0, 8)
    .map((e) => (e.cue.kind === 'gear' ? `gear ${e.cue.gear}` : e.cue.kind));
}

test('the reference knows where its entry gear goes in', () => {
  assert.ok(first.turnInS !== undefined && first.turnInS > first.brakeS && first.turnInS < first.apexS, 'turn-in during the braking');
  assert.equal(first.entryGear, 2);
  assert.ok(first.entryGearS !== undefined && first.entryGearS > first.brakeS, `the shift down to second comes after the braking point (${first.entryGearS})`);
});

test('a turn-in at the braking point follows "now" instead of being dropped; the shifts in the corner are called', () => {
  const cues = cuesOfFirstCurve({});
  const now = cues.indexOf('now');
  const turnIn = cues.indexOf('turn-in');
  assert.ok(now >= 0 && turnIn > now, `turn-in after "now" (${cues.join(', ')})`);
  assert.ok(cues.includes('gear 2'), `the entry gear where the reference shifts down (${cues.join(', ')})`);
});

test('without the corner plan the shifts stay quiet, as before; the turn-in still comes', () => {
  const cues = cuesOfFirstCurve({ announceShifts: false });
  assert.ok(!cues.some((c) => c.startsWith('gear')), `no gears (${cues.join(', ')})`);
  assert.ok(cues.indexOf('turn-in') > cues.indexOf('now'), `turn-in after "now" (${cues.join(', ')})`);
});
