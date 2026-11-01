// Corner chains (alpha 0.0.5, SUGO: "die schnell aufeinander folgenden Kurven bringen ihn durcheinander"): a braking
// zone right after another is named in the first one's plan and explains nothing of its own. And SUGO, which the
// vendored track data does not have yet, is recognized from our own signature.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chainFollowers, FOLLOW_SECONDS, isFollower } from '../packages/coach/src/fast';
import { builtInPhrases } from '../packages/coach/src/i18n';
import type { Corner, ReferenceLap, ReferencePoint } from '../packages/coach/src/reference';
import { recognizeTrack } from '../packages/telemetry/src/tracks';
import ownSignatures from '../packages/telemetry/data/own-track-signatures.json' with { type: 'json' };
import { cornerPlanText, type PlanSettings } from '../packages/runtime/src/clips';
import { DEFAULT_RUNNER_SETTINGS } from '../packages/runtime/src/settings';

/** A lap at a steady 50 m/s with braking zones given as [brake, exit] in meters; indices start at 1 as in GT Toolz. */
function lap(zones: [number, number][], shapes: Corner['shape'][] = []): ReferenceLap {
  const length = 5000;
  const points = Array.from({ length: length / 10 + 1 }, (_, i): ReferencePoint => ({ s: i * 10, t: i * 200, x: i * 10, y: 0, z: 0, speed: 50, throttle: 1, brake: 0, gear: 4, steer: 0 }));
  const corners = zones.map(([brakeS, exitS], i) => ({ index: i + 1, brakeS, exitS, shape: shapes[i], shapeDirection: 'right' }) as unknown as Corner);
  return { version: 1, createdAt: '', source: '', carCode: 1, lapTimeMs: 100_000, lengthMeters: length, steerSource: 'none', points, corners } as ReferenceLap;
}

test('a braking zone less than 6 s after the previous exit follows it; the first names at most two', () => {
  // 50 m/s: 6 s are 300 m. Zone 2 brakes 250 m after zone 1's exit, zone 3 100 m after zone 2's, zone 4 is far away.
  const ref = lap([
    [500, 700],
    [950, 1100],
    [1200, 1300],
    [1400, 1500],
    [3000, 3200],
  ]);
  const [z1, z2, z3, z4, z5] = ref.corners as [Corner, Corner, Corner, Corner, Corner];
  assert.equal(FOLLOW_SECONDS, 6);
  assert.deepEqual([z1, z2, z3, z4, z5].map((c) => isFollower(ref, c)), [false, true, true, true, false]);
  assert.deepEqual(chainFollowers(ref, z1).map((c) => c.index), [2, 3], 'at most two');
  assert.deepEqual(chainFollowers(ref, z2), [], 'a follower announces nothing');
  assert.deepEqual(chainFollowers(ref, z5), [], 'nothing follows closely');
  // Across the start/finish line: zone 1 follows the last zone when it ends shortly before the line.
  const across = lap([
    [200, 400],
    [4800, 4950],
  ]);
  assert.equal(isFollower(across, across.corners[0]!), true);
});

test('the first plan of a chain names the corners after it, in every variant', () => {
  const ref = lap(
    [
      [500, 700],
      [950, 1100],
      [1200, 1300],
    ],
    ['tight', 'medium', undefined],
  );
  const settings: PlanSettings = { ...DEFAULT_RUNNER_SETTINGS, chainCalls: true };
  const followers = chainFollowers(ref, ref.corners[0]!);
  const de = builtInPhrases('de');
  for (const variant of ['full', 'short', 'shape'] as const) {
    assert.match(cornerPlanText(ref.corners[0]!, variant, de, settings, [], followers), /Dann mittlere Rechtskurve\. Dann rechts\.$/, variant);
  }
  assert.match(cornerPlanText(ref.corners[0]!, 'shape', builtInPhrases('en'), settings, [], followers), /Then medium right\. Then right\.$/);
  // Switched off: as before.
  assert.doesNotMatch(cornerPlanText(ref.corners[0]!, 'shape', de, { ...settings, chainCalls: false }, [], followers), /Dann/);
});

test('SUGO is recognized from our own signature', () => {
  const sugo = ownSignatures.signatures.find((s) => s.official_id === 'own-sugo')!;
  // The driven line a little off the recorded one, as another driver would take it.
  const driven = (sugo.path as [number, number][]).map(([x, z], i) => ({ x: x + (i % 2 ? 1.5 : -1.5), z }));
  const match = recognizeTrack(driven);
  assert.equal(match?.name, 'SUGO International Racing Course');
  assert.equal(match?.reversed, false);
});
