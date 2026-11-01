// The crew's tyre wear estimate (modules/crew/src/crew.ts, docs/user/crew.md): the pace lost against the stint's best early
// laps. The user's Manufacturers Cup, 2026-10-31: after a lap with a spin, 16 s slower, the crew said "Reifen bauen ab,
// 8,1 Sekunden", and two laps later again with the advice to pit; on 2026-10-30 two slow laps after a crash were
// "18 Sekunden" for five laps at best pace again. Slow laps are no wear while a recent one is at pace; the start lap
// counts neither.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { builtInPhrases } from '../packages/coach/src/i18n';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { RaceCrew } from '../modules/crew/src/crew';

/** A race of these lap times (s), lap 1 from the grid: what the crew says about the tyres' wear. */
function wear(lapsS: number[]): string[] {
  const crew = new RaceCrew(builtInPhrases('en'), { pitLossSeconds: 25, strategy: true, cheeky: false, patience: 'normal', sectors: 1, talk: 'normal' });
  let t = 0;
  const at = (lapCount: number, lastLapMs: number, speed: number) =>
    ({
      time: t, packetId: t, flags: Flags.CarOnTrack, x: t * 0.03, y: 0, z: 0, speed, throttle: 1, brake: 0, gear: 4,
      lapCount, lapsInRace: lapsS.length, bestLapMs: -1, lastLapMs, carCode: 1, racePosition: 3, carsInRace: 12,
      fuelLevel: 100, fuelCapacity: 100, tyreTemps: [80, 80, 80, 80], currentLapMs: 0,
    }) as TelemetryFrame;
  crew.start(at(0, -1, 0));
  const said: string[] = [];
  let last = -1;
  lapsS.forEach((s, i) => {
    for (const end = t + s * 1000; t < end; t += 100) said.push(...crew.frame(at(i + 1, last, 30), t));
    last = Math.round(s * 1000);
  });
  said.push(...crew.frame(at(lapsS.length + 1, last, 30), t));
  return said.filter((text) => /going off/.test(text));
}

test('a lap with a spin is no tyre wear, nor two slow laps after a crash, nor the start lap', () => {
  // The races of 2026-10-31 and 2026-10-30 (the laps with an excursion left out, as the crew does).
  assert.deepEqual(wear([96.4, 90.9, 107.2, 90.9, 89.2, 89.6, 89.2, 89.5]), []);
  assert.deepEqual(wear([96.1, 83.7, 83.6, 83.6, 105.8, 97.3, 81.5, 82.3, 82.1]), []);
});

test('tyres that go off lap by lap are said, and tyres that drop off at once after three laps', () => {
  const gradual = wear([92, 90.0, 90.2, 90.5, 91.0, 91.6, 92.3]);
  assert.equal(gradual.length, 2, gradual.join(' | '));
  assert.match(gradual[0]!, /0\.5 seconds/);
  assert.match(gradual[1]!, /1\.0 seconds/);
  // Worn out: from 90 to 95 s. One or two slow laps could be a spin or a crash; with the third the loss is there.
  const cliff = wear([92, 90, 90, 90, 95, 95.2, 95.4]);
  assert.equal(cliff.length, 1, cliff.join(' | '));
  assert.match(cliff[0]!, /5\.0 seconds/);
});
