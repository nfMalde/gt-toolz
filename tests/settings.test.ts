// Settings from the file: defaults, one-time migrations and validation (packages/runtime/src/settings.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_RUNNER_SETTINGS, SETTINGS_VERSION, migrateSettings, normalizeSettings } from '../packages/runtime/src/settings';

test('a missing or broken file gives the defaults', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_RUNNER_SETTINGS);
  assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_RUNNER_SETTINGS);
  assert.equal(DEFAULT_RUNNER_SETTINGS.detailedLog, false, 'the detailed log is off by default');
});

test('coach and crew have their own patience; a file from before keeps its one setting for both', () => {
  assert.equal(normalizeSettings({ patience: 'low' }).crewPatience, 'low');
  const own = normalizeSettings({ patience: 'low', crewPatience: 'high' });
  assert.equal(own.patience, 'low');
  assert.equal(own.crewPatience, 'high');
  assert.equal(normalizeSettings({ crewPatience: 'nonsense' }).crewPatience, 'normal');
});

test('the countdown to the first action is on, also for a file from before it', () => {
  assert.equal(normalizeSettings({ gearAfterNow: true }).actionAfterNow, true);
  assert.equal(normalizeSettings({ actionAfterNow: false }).actionAfterNow, false);
});

test('settings from before version 2 get the new defaults once', () => {
  const old = migrateSettings({ feedback: 'all', raceCalls: false }) as Record<string, unknown>;
  assert.equal(old.feedback, 2);
  assert.equal(old.raceCalls, true);
  assert.equal(old.settingsVersion, SETTINGS_VERSION);
  // A choice made after the migration stays.
  const current = migrateSettings({ settingsVersion: SETTINGS_VERSION, feedback: 'all', raceCalls: false }) as Record<string, unknown>;
  assert.equal(current.feedback, 'all');
  assert.equal(current.raceCalls, false);
});

test('wrong types fall back to the defaults', () => {
  const s = normalizeSettings({ detailedLog: 'yes', coach: 1, language: 'xx-invalid-language' });
  assert.equal(s.detailedLog, false);
  assert.equal(s.coach, true);
  assert.equal(typeof s.language, 'string');
});

