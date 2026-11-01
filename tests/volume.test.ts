// Volume (the user, 2026-10-25): one control for everything, coach and crew on their own. Every channel a role opens
// plays at overall × role and follows a change at once, without rendering anything again.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_RUNNER_SETTINGS, normalizeSettings } from '../packages/runtime/src/settings';
import type { AudioChannel, AudioOutput } from '../packages/runtime/src/voice';
import { testRunner } from './runner';

/** An audio output that only records the volume of each channel. */
function fakeAudio() {
  const volumes: number[] = [];
  const output: AudioOutput = {
    openChannel: (): AudioChannel => {
      const index = volumes.push(1) - 1;
      return { load: async () => undefined, play: () => undefined, stop: () => undefined, close: () => undefined, setVolume: (gain) => (volumes[index] = gain) };
    },
  };
  return { output, volumes };
}

test('volumes default to 100 % and stay within 0 to 100', () => {
  assert.equal(DEFAULT_RUNNER_SETTINGS.volume, 100);
  assert.equal(DEFAULT_RUNNER_SETTINGS.coachVolume, 100);
  assert.equal(DEFAULT_RUNNER_SETTINGS.crewVolume, 100);
  const s = normalizeSettings({ volume: 150, coachVolume: -5, crewVolume: 42.4 });
  assert.deepEqual([s.volume, s.coachVolume, s.crewVolume], [100, 0, 42]);
});

test('each role plays at overall × role volume and follows changes at once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-volume-'));
  const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };
  const { output, volumes } = fakeAudio();
  const { runner } = testRunner({ settings: normalizeSettings({ volume: 80, coachVolume: 50, crewVolume: 100 }), dirs, audio: output });
  // The outputs the shell's voices hand to the coach (and stand-in) and to the crew.
  const outputFor = (role: 'coach' | 'crew') => (runner as unknown as { voices: { output(r: string): AudioOutput } }).voices.output(role);
  const coach = outputFor('coach').openChannel();
  outputFor('crew').openChannel();
  assert.deepEqual(volumes, [0.4, 0.8]);

  await runner.updateSettings(normalizeSettings({ ...runner.currentSettings, volume: 50, crewVolume: 20 }));
  assert.deepEqual(volumes, [0.25, 0.1]);

  // A closed channel no longer follows.
  coach.close();
  await runner.updateSettings(normalizeSettings({ ...runner.currentSettings, volume: 100 }));
  assert.deepEqual(volumes, [0.25, 0.2]);
  fs.rmSync(dir, { recursive: true, force: true });
});
