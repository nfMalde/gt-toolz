// Corners without braking (packages/coach/src/fast.ts, docs/dev/coach-and-texts.md). The user, 2026-10-31: Willow Springs turn 2 was
// called "flat", but it takes several throttle pulses. Part throttle for a while is its own kind now, called like a
// lift ("Auf 170 liften, rechts."); short dips (gear changes, corrections) stay flat, and a real lift stays a lift.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findFastCorners } from '../packages/coach/src/fast';
import { builtInPhrases } from '../packages/coach/src/i18n';
import { buildReference } from '../packages/coach/src/reference';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

/** A stadium without braking: two straights of 600 m, two half circles of 150 m at 50 m/s; throttle per curve. */
function stadiumLap(throttle: (curve: 1 | 2, secondsIn: number) => number): TelemetryFrame[] {
  const L = 600;
  const R = 150;
  const v = 50;
  const length = 2 * L + 2 * Math.PI * R;
  const template = ovalLap(1, 0)[0]!;
  const frames: TelemetryFrame[] = [];
  for (let i = 0; ; i++) {
    const t = (i * 1000) / 60;
    const u = (v * t) / 1000;
    if (u >= length) break;
    let x: number;
    let z: number;
    let curve: 0 | 1 | 2 = 0;
    let into = 0;
    if (u < L) [x, z] = [0, u];
    else if (u < L + Math.PI * R) {
      const a = (u - L) / R;
      [x, z, curve, into] = [R - R * Math.cos(a), L + R * Math.sin(a), 1, u - L];
    } else if (u < 2 * L + Math.PI * R) [x, z] = [2 * R, L - (u - L - Math.PI * R)];
    else {
      const a = (u - 2 * L - Math.PI * R) / R;
      [x, z, curve, into] = [R + R * Math.cos(a), -R * Math.sin(a), 2, u - 2 * L - Math.PI * R];
    }
    frames.push({ ...template, time: t, packetId: i, x, z, speed: v, throttle: curve ? throttle(curve, into / v) : 1, brake: 0, gear: 5, lapCount: 1 });
  }
  return frames;
}

const kinds = (frames: TelemetryFrame[]) => {
  const reference = buildReference({ lapNumber: 1, frames, lapTimeMs: frames.at(-1)!.time, clean: true, live: true }, 'test');
  assert.equal(reference.corners.length, 0, 'no braking zone');
  return findFastCorners(reference).map((c) => c.kind);
};

test('part throttle with pulses is feathering; a short dip stays flat', () => {
  const pulses = (secondsIn: number) => (secondsIn > 1 && secondsIn < 4 ? (Math.floor(secondsIn / 0.4) % 2 ? 0.85 : 0.6) : 1);
  const shortDip = (secondsIn: number) => (secondsIn > 1 && secondsIn < 1.4 ? 0.6 : 1);
  assert.deepEqual(kinds(stadiumLap((curve, s) => (curve === 1 ? shortDip(s) : pulses(s)))), ['flat', 'feather']);
});

test('a real lift stays a lift, even with part throttle around it', () => {
  const liftThenPart = (secondsIn: number) => (secondsIn < 0.5 ? 0.3 : secondsIn < 3 ? 0.7 : 1);
  assert.deepEqual(kinds(stadiumLap((curve, s) => (curve === 2 ? liftThenPart(s) : 1))), ['flat', 'lift']);
});

test('feathering is called like a lift, with the speed to hold, in both languages', () => {
  const note = { kind: 'feather' as const, direction: 'right' as const, kmh: 169, chained: false };
  assert.equal(builtInPhrases('de').fastNote(note), 'Auf 170 liften, rechts.');
  assert.equal(builtInPhrases('en').fastNote(note), 'Lift to 170, right.');
  assert.equal(builtInPhrases('de').fastNote({ ...note, chained: true }), 'Dann auf 170 liften, rechts.');
});
