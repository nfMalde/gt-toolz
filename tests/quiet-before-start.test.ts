// The user, 2026-11-03: in a race the crew's radio stayed silent, the radio check too; the log said "dropped, no quiet
// moment" for every line. The coach answered quietSeconds() with 0 whenever it had no position or had not started
// (the out lap, a reference for another class), so the speech floor never found a moment. Nothing planned: every
// moment is quiet; on the out lap only the corners beyond the line count.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoachSession, DEFAULT_COACH_SETTINGS } from '../packages/coach/src/coach';
import { buildReference } from '../packages/coach/src/reference';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

const lap = ovalLap(1, 0);
const lapMs = lap.at(-1)!.time + 1000 / 60;
const reference = buildReference({ lapNumber: 1, frames: lap, lapTimeMs: lap.at(-1)!.time, clean: true, live: true }, 'test');

/** Drives the first straight up to z metres (x = 0 there) and returns the frames driven. */
function firstStraight(frames: TelemetryFrame[], z: number): TelemetryFrame[] {
  const out: TelemetryFrame[] = [];
  for (const f of frames) {
    if (f.x < 1 && f.z > z) break;
    out.push(f);
  }
  return out;
}

test('without a position every moment is quiet; on the out lap the corners before the line do not count', () => {
  const coach = new CoachSession(reference, { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: true });
  assert.equal(coach.quietSeconds(), Infinity, 'no frame yet: nothing planned');

  // The out lap, 300 m down the first straight: braking zone 1 (about 470 m) is ahead, but it is not coached.
  for (const f of firstStraight(ovalLap(1, 0), 300)) coach.update(f);
  assert.equal(coach.isStarted, false, 'still the out lap');
  assert.equal(coach.quietSeconds(), Infinity, 'the out lap: no cue before the line');

  // The rest of the out lap, over the line, and 300 m into the first coached lap: the same corner, now with cues.
  for (const f of ovalLap(1, 0).slice(firstStraight(ovalLap(1, 0), 300).length)) coach.update(f);
  for (const f of firstStraight(ovalLap(2, lapMs), 300)) coach.update(f);
  assert.equal(coach.isStarted, true, 'coaching started at the line');
  const quiet = coach.quietSeconds();
  assert.ok(Number.isFinite(quiet) && quiet < 5, `braking zone 1 is close: a short quiet moment at most (${quiet})`);
});
