// The telemetry as a part of its own (modules/telemetry, docs/dev/modules.md): the mode and driving worked out once,
// the driver's own laps learned into a reference, a saved one picked when it fits the track, nothing of that while
// suspended (the calibration), and the coach following every change of the reference. Frames are handed in
// directly, without a PS5.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, mock, test } from 'node:test';
import type { ReferenceEvent, TelemetrySettings } from '../packages/runtime/src/telemetry-feed';
import { normalizeSettings } from '../packages/runtime/src/settings';
import type { RunnerSettings } from '../packages/runtime/src/app-api';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { defaultSettings, normalizeSettings as normalizeTelemetry } from '../modules/telemetry/src/settings';
import { ovalLap } from './oval';
import { testRunner } from './runner';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-telemetry-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => mock.timers.reset());
let folders = 0;

/** A runner with its telemetry in a folder of its own (or the given one), and what it said and was told. */
function setup(settings: Partial<RunnerSettings> = {}, dir = path.join(root, String(folders++)), telemetrySettings: Partial<TelemetrySettings> = {}) {
  const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };
  fs.mkdirSync(dirs.references, { recursive: true });
  const { runner, telemetry } = testRunner({ settings: normalizeSettings({ crew: false, practiceTyres: false, slides: false, ...settings }), dirs }, { autoReference: false, ...telemetrySettings });
  const lines: string[] = [];
  runner.on('log', (line) => void lines.push(line));
  const events: ReferenceEvent['why'][] = [];
  telemetry.on('reference', (event) => void events.push(event.why));
  const modes: string[] = [];
  telemetry.on('mode', (mode) => void modes.push(mode));
  const drive = (frames: TelemetryFrame[]) => {
    for (const frame of frames) {
      mock.timers.setTime(frame.time);
      telemetry.handleFrame(frame);
    }
  };
  return { runner, telemetry, lines, events, modes, drive, dir };
}

/** Laps of the oval one after another, starting at lap `from`. */
function laps(from: number, count: number, start = 1_000_000): TelemetryFrame[] {
  const frames: TelemetryFrame[] = [];
  let t = start;
  for (let lap = from; lap < from + count; lap++) {
    const one = ovalLap(lap, t);
    frames.push(...one);
    t = one.at(-1)!.time + 1000 / 60;
  }
  return frames;
}

test('the mode counts once it held for 3 s; a picture that stands still at speed is a menu', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const { telemetry, modes, drive } = setup();
  telemetry.choose(undefined);
  const lap = ovalLap(1, 0);
  drive(lap.slice(0, 120));
  assert.deepEqual(modes, [], 'two seconds are not enough');
  drive(lap.slice(120, 240));
  assert.deepEqual(modes, ['practice']);
  assert.equal(telemetry.driving, true);
  // A results screen: the last packet again and again.
  const last = lap[239]!;
  drive(Array.from({ length: 300 }, (_, i) => ({ ...last, time: last.time + (i + 1) * (1000 / 60) })));
  assert.deepEqual(modes, ['practice', 'menu']);
  assert.equal(telemetry.frozen, true);
  assert.equal(telemetry.driving, false);
});

test('own laps: the fastest clean one of three becomes the reference, and the coach takes it', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const { runner, telemetry, lines, events, drive, dir } = setup({ driverName: 'Anja' });
  telemetry.choose(undefined);
  assert.equal(telemetry.status.coach, 'learning');
  let learned: { id: string } | undefined;
  runner.on('reference-learned', (summary) => (learned = summary));
  drive(laps(1, 5));
  assert.ok(events.includes('learned'), `learned (${events.join(', ')})`);
  assert.equal(telemetry.status.coach, 'coaching');
  assert.equal(telemetry.reference?.driver, 'Anja', 'an own lap is the driver\'s');
  assert.ok(learned && fs.existsSync(path.join(dir, 'references', `${learned.id}.json`)), 'saved');
  // The coach: its zones on the page, the sentence that it learned one.
  assert.equal(runner.currentStatus.zones.length, telemetry.reference!.corners.length);
  assert.ok(lines.some((line) => line.startsWith('SAY') && line.includes('Referenz')), 'said');
});

test('a saved reference that fits the track is picked while driving, and the coach starts at once', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const first = setup();
  first.telemetry.choose(undefined);
  first.drive(laps(1, 5));
  assert.ok(first.events.includes('learned'));
  mock.timers.reset();

  mock.timers.enable({ apis: ['Date'], now: 0 });
  const { runner, telemetry, events, drive } = setup({}, first.dir, { autoReference: true });
  telemetry.choose(undefined);
  // Learning was asked for: nothing is picked meanwhile.
  drive(laps(1, 1));
  assert.ok(!events.includes('picked'));
  // Without the request (as after a start without a reference), the saved one is found.
  (telemetry as unknown as { learnRequested: boolean }).learnRequested = false;
  let changed: unknown;
  runner.on('reference-changed', (summary) => (changed = summary));
  drive(laps(2, 2, 2_000_000));
  assert.ok(events.includes('picked'), `picked (${events.join(', ')})`);
  assert.ok(changed, 'remembered as the active one');
  assert.equal(runner.currentStatus.coach, 'coaching');
});

test('suspended (the calibration): frames and the car go on, no mode and no learning', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const { telemetry, modes, drive } = setup();
  telemetry.choose(undefined);
  let frames = 0;
  telemetry.on('frame', () => void frames++);
  const resume = telemetry.suspend('calibration');
  drive(laps(1, 1));
  assert.ok(frames > 0);
  assert.deepEqual(modes, []);
  assert.equal(telemetry.status.learning?.frames, 0);
  assert.equal(telemetry.status.car?.code, 1);
  resume();
  drive(laps(2, 1, 2_000_000).slice(0, 300));
  assert.deepEqual(modes, ['practice']);
  assert.ok((telemetry.status.learning?.frames ?? 0) > 0);
});

test('paused frames count as not driving', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  const { telemetry, drive } = setup();
  telemetry.choose(undefined);
  const lap = ovalLap(1, 0);
  drive(lap.slice(0, 60));
  assert.equal(telemetry.driving, true);
  drive(lap.slice(60, 70).map((f) => ({ ...f, flags: f.flags | Flags.Paused })));
  assert.equal(telemetry.driving, false);
});

test('its settings: the PS5 found by itself, only a home-network address kept, a reference id or none', () => {
  const base = defaultSettings();
  assert.equal(base.ip, '', 'the PS5 is found automatically by default');
  assert.equal(normalizeTelemetry({ ip: ' 192.168.178.20 ' }, base).ip, '192.168.178.20');
  assert.equal(normalizeTelemetry({ ip: '8.8.8.8' }, base).ip, '');
  assert.equal(normalizeTelemetry({ ip: 'example.com' }, base).ip, '');
  assert.equal(normalizeTelemetry({ driveMode: 'rally', record: 'yes' }, base).driveMode, 'daily');
  assert.equal(normalizeTelemetry({ activeReference: '2026-10-23-22-22-49_lap1' }, base).activeReference, '2026-10-23-22-22-49_lap1');
  assert.equal('activeReference' in normalizeTelemetry({ activeReference: '../../secret' }, base), false);
  // Forgotten: a change to none removes it.
  const active = normalizeTelemetry({ activeReference: 'ref-1' }, base);
  assert.equal('activeReference' in normalizeTelemetry({ ...active, activeReference: undefined }, active), false);
});
