// config.json version 2 (docs/dev/modules.md): an old file moves over once and keeps its values, every
// setting has exactly one owner, the modules that moved keep theirs as stored, and nothing a newer version wrote is
// lost.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { parseConfigFile } from '../packages/core/src/config';
import { loadConfig, saveConfig, VERSION1_BACKUP } from '../apps/desktop/src/config';
import { DEFAULT_RUNNER_SETTINGS, normalizeSettings } from '../packages/runtime/src/settings';
import { RUNNER_MODULE_IDS } from '../packages/runtime/src/app-api';
import { configFromVersion1, joinSettings, keysOf, splitSettings, upgradeConfig } from '../packages/runtime/src/settings-split';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-config-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let folders = 0;
function configFile(content?: unknown): string {
  const dir = path.join(root, String(folders++));
  fs.mkdirSync(dir);
  const file = path.join(dir, 'config.json');
  if (content !== undefined) fs.writeFileSync(file, JSON.stringify(content));
  return file;
}
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('every setting has one owner', () => {
  const owned = ['app', ...RUNNER_MODULE_IDS].flatMap((owner) => keysOf(owner as 'app'));
  assert.deepEqual([...owned].sort(), Object.keys(DEFAULT_RUNNER_SETTINGS).sort());
  assert.equal(new Set(owned).size, owned.length);
});

test('split and join give back the same settings', () => {
  const settings = normalizeSettings({ ...DEFAULT_RUNNER_SETTINGS, coach: false, driverName: 'Anja' });
  const { app, modules } = splitSettings(settings);
  assert.deepEqual(joinSettings({ version: 2, app, modules, guideDone: true }), settings);
  // The old switch is the module's "on", and nowhere else.
  assert.equal(modules.coach?.enabled, false);
  assert.equal('coach' in (modules.coach?.settings as object), false);
  // The telemetry, the crew, the overlays and the vibration keep their own (modules.ts).
  assert.deepEqual(Object.keys(modules), ['coach']);
  assert.equal(app.driverName, 'Anja');
});

test('a version 1 file moves over once, with its old migrations, and stays as config.v1.json', () => {
  const layout = { width: 1280, height: 720, look: 'panel', background: 0.3, widgets: [{ id: 'gear', kind: 'gear', x: 10, y: 20, scale: 1.5 }] };
  const old = {
    settings: {
      settingsVersion: 1,
      feedback: 'all',
      countdownSeconds: 3,
      crew: false,
      crewSectors: 4,
      crewTalk: 'much',
      coachQuits: false,
      standInLaps: 3,
      driverName: 'Jörg',
      ip: '192.168.1.20',
      overlayEnabled: true,
      overlayPort: 4800,
      overlayLayout: layout,
      overlayAutoHide: false,
      haptics: { enabled: true, output: 'gamepad', intensity: 0.5, patterns: { now: 'heartbeat' } },
    },
    activeReference: 'ref-2',
    guideDone: true,
  };
  const file = configFile(old);
  const config = loadConfig(file);
  assert.equal(config.settings.feedback, 2);
  assert.equal(config.settings.countdownSeconds, 2);
  assert.equal(config.settings.driverName, 'Jörg');
  // The crew: its switch and its keys; the team boss takes the coach's quitting and stand-in laps.
  assert.deepEqual(config.modules.crew, { enabled: false, settings: { crewSectors: 4, crewTalk: 'much', bossTakesOver: false, bossLaps: 3 } });
  assert.equal(config.settings.coachQuits, false);
  // The reference in use is the telemetry's now.
  assert.deepEqual(config.modules.telemetry, { settings: { ip: '192.168.1.20', activeReference: 'ref-2' } });
  assert.equal(config.guideDone, true);
  const backup = path.join(path.dirname(file), VERSION1_BACKUP);
  assert.deepEqual(read(backup), old);
  const stored = read(file);
  assert.equal(stored.version, 2);
  assert.equal(stored.modules.crew.enabled, false);
  assert.equal(stored.modules.telemetry.settings.ip, '192.168.1.20');
  assert.equal(stored.app.driverName, 'Jörg');
  // The overlays as they were, for their module to check.
  assert.deepEqual(stored.modules.overlays, { enabled: true, settings: { overlayPort: 4800, overlayLayout: layout, overlayAutoHide: false } });
  assert.deepEqual(config.modules.overlays, stored.modules.overlays);
  // The vibration: its switch out of its object.
  assert.deepEqual(stored.modules.haptics, { enabled: true, settings: { output: 'gamepad', intensity: 0.5, patterns: { now: 'heartbeat' } } });
  assert.deepEqual(Object.keys(stored.modules), ['telemetry', 'coach', 'crew', 'overlays', 'haptics']);
  // Read again: the same, and the backup is not overwritten.
  fs.writeFileSync(backup, '{"kept": true}');
  assert.deepEqual(loadConfig(file), config);
  assert.deepEqual(read(backup), { kept: true });
});

test('saving keeps modules a newer version wrote; the coach switch is the coach module\'s "on"', () => {
  const file = configFile();
  const config = loadConfig(file);
  assert.equal(config.settings.coach, true);
  saveConfig(file, config);
  const stored = read(file);
  stored.modules.coach.enabled = false;
  stored.modules.example = { enabled: true, settings: { a: 1 } };
  stored.modules.overlays = { enabled: true, settings: { overlayPort: 4801 } };
  fs.writeFileSync(file, JSON.stringify(stored));
  const off = loadConfig(file);
  assert.equal(off.settings.coach, false);
  saveConfig(file, { ...off, guideDone: true });
  const again = read(file);
  assert.deepEqual(again.modules.overlays, { enabled: true, settings: { overlayPort: 4801 } });
  assert.equal(again.modules.coach.enabled, false);
  assert.equal('coach' in again.modules.coach.settings, false);
  assert.deepEqual(again.modules.example, { enabled: true, settings: { a: 1 } });
  assert.equal(again.guideDone, true);
});

test('a hand-edited version 2 file is read with suspicion', () => {
  const file = configFile({ version: 2, app: { language: 'en', volume: 'loud' }, modules: { '__proto__': { enabled: true }, 'Bad Id': {}, crew: { enabled: 'yes', settings: [1] }, telemetry: { settings: { activeReference: 42 } } }, guideDone: 1 });
  const config = loadConfig(file);
  assert.equal(config.settings.language, 'en');
  assert.equal(config.settings.volume, DEFAULT_RUNNER_SETTINGS.volume);
  // Checked by their modules when they start (modules.ts).
  assert.deepEqual(config.modules.telemetry, { settings: { activeReference: 42 } });
  assert.deepEqual(config.modules.crew, { settings: [1] });
  assert.equal(config.guideDone, false);
  assert.deepEqual(Object.keys(parseConfigFile(read(file)).modules).sort(), ['crew', 'telemetry']);
  assert.equal(Object.getPrototypeOf(parseConfigFile(JSON.parse('{"modules": {"__proto__": {"enabled": true}}}')).modules), Object.prototype);
});

test('a version 1 file without settings is the defaults', () => {
  const converted = configFromVersion1({ settings: {}, guideDone: true });
  assert.deepEqual(joinSettings(converted), DEFAULT_RUNNER_SETTINGS);
  // No switch in the file: the module's own default (off).
  assert.deepEqual(converted.modules.overlays, { settings: {} });
  assert.deepEqual(converted.modules.haptics, { settings: {} });
  assert.equal(converted.modules.coach?.enabled, true);
});

test('a version 2 file from before the crew moved: the team boss takes the coach\'s quitting once', () => {
  const file = {
    version: 2,
    app: {},
    modules: { coach: { enabled: true, settings: { coachQuits: false, standInLaps: 1 } }, crew: { enabled: true, settings: { crewSectors: 2 } } },
    guideDone: true,
  };
  const upgraded = upgradeConfig(parseConfigFile(file));
  assert.deepEqual(upgraded.modules.crew, { enabled: true, settings: { crewSectors: 2, bossTakesOver: false, bossLaps: 1 } });
  // Its own once it has them.
  const own = { ...file, modules: { ...file.modules, crew: { enabled: true, settings: { bossTakesOver: true, bossLaps: 2 } } } };
  assert.deepEqual(upgradeConfig(parseConfigFile(own)).modules.crew, { enabled: true, settings: { bossTakesOver: true, bossLaps: 2 } });
  const loaded = loadConfig(configFile(file));
  assert.deepEqual(loaded.modules.crew, upgraded.modules.crew);
});
