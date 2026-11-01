// Learning a reference ignores GT7's intro (alpha 0.0.5, the user's Mac): on the title screen GT7 repeats one
// standing packet, only its number counting on (recorded 2026-10-28: 227 km/h, no flags, laps, cars and position
// -1). Nothing of it is recorded; a replay that moves is.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, mock, test } from 'node:test';
import { normalizeSettings } from '../packages/runtime/src/settings';
import { packet } from './packets';
import { testRunner } from './runner';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-learning-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

test("GT7's intro is not recorded, a moving replay is", () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const { telemetry, packetIn } = testRunner({ settings: normalizeSettings({ crew: false }), dirs: { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') } });
    const r = { status: telemetry.status, onPacket: packetIn };
    telemetry.choose(undefined);
    // The intro: one standing packet, 10 s at 60 per second.
    let t = 0;
    let id = 181_604;
    for (; t < 10_000; t += 16) {
      mock.timers.setTime(t);
      r.onPacket(packet(t, id++, { x: -318.99, speed: 63, flags: 0, lapCount: -1, lapsInRace: -1, carsInRace: -1 }));
    }
    assert.equal(r.status.mode, 'menu');
    assert.equal(r.status.learning?.frames, 0, 'nothing recorded during the intro');
    // A ghost replay: the car moves, the session has one car.
    for (let x = 0; t < 14_000; t += 16, x += 1) {
      mock.timers.setTime(t);
      r.onPacket(packet(t, id++, { x, speed: 60, flags: 0, lapCount: 1, lapsInRace: 0, carsInRace: 1 }));
    }
    assert.ok((r.status.learning?.frames ?? 0) > 200, `a replay is recorded (${r.status.learning?.frames})`);
    assert.equal(r.status.learning?.replay, true);
  } finally {
    mock.timers.reset();
  }
});
