// The coach module switched off (docs/dev/modules.md): the reference stays and the telemetry runs on, but the coach
// gets no frames (no braking calls, plans, feedback, debrief), offers no briefing, and holds no quiet time the crew
// would wait for.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, mock, test } from 'node:test';
import { normalizeSettings } from '../packages/runtime/src/settings';
import type { RunnerSettings } from '../packages/runtime/src/app-api';
import { packet } from './packets';
import { testRunner } from './runner';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-coach-switch-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

interface Inside {
  settings: RunnerSettings;
  coach: unknown;
  status: { briefing?: string; debrief?: string };
  coachQuiet: boolean;
  updateSpeechStatus(): void;
}

test('switched off, the coach gets no frames, offers no briefing and keeps nobody waiting', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const { runner, packetIn, inside } = testRunner({ settings: normalizeSettings({ coach: false, crew: false }), dirs: { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') } });
    const r = runner as unknown as Inside;
    let frames = 0;
    r.coach = { update: () => (frames++, []), quietSeconds: () => 0, currentLap: 1, isStarted: true };
    inside.ref = { points: [], corners: [] };
    const drive = (from: number) => {
      for (let t = from, x = 0; t < from + 1000; t += 16, x += 1) {
        mock.timers.setTime(t);
        packetIn(packet(t, t, { x, speed: 60, flags: 0, lapCount: 1, lapsInRace: 0, carsInRace: 1 }));
      }
    };
    drive(0);
    assert.equal(frames, 0);
    r.updateSpeechStatus();
    assert.equal(r.status.briefing, 'off');
    assert.equal(r.status.debrief, 'off');
    assert.equal(r.coachQuiet, true);
    // On again (the switch itself goes through updateSettings, which also starts a fresh session).
    r.settings = normalizeSettings({ coach: true, crew: false });
    drive(1000);
    assert.ok(frames > 0);
    assert.equal(r.coachQuiet, false);
  } finally {
    mock.timers.reset();
  }
});
