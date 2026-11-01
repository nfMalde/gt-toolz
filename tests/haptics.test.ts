// The vibration as a module (modules/haptics, docs/user/haptics.md and docs/dev/modules.md): its settings, how a cue becomes the
// driver's pattern, and the module on a host: one pattern at a time, "jetzt" at once, nothing stale, the zone test.

import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import type { ModuleHost, ModuleInstance } from '../packages/core/src/index';
import type { HapticEvent, HapticSettings } from '../modules/haptics/src/api';
import { hapticEvent } from '../modules/haptics/src/patterns';
import { defaultSettings, normalizeSettings } from '../modules/haptics/src/settings';
import { hapticsModule } from '../modules/haptics/main/module';

afterEach(() => mock.timers.reset());
/** A clock time like a real one (the module compares with Date.now()). */
const NOW = 1_790_000_000_000;

test('defaults: audio, the suggested patterns, nothing for the gear and for speech', () => {
  const d = defaultSettings();
  assert.equal(d.output, 'audio');
  assert.equal(d.patterns.now, 'long');
  assert.equal(d.patterns.gear, 'off');
  assert.equal(d.patterns.message, 'off');
  assert.equal('enabled' in d, false, 'on and off is the module switch');
});

test('wrong types and unknown patterns fall back; the driver\'s own patterns are cleaned', () => {
  const base = defaultSettings();
  assert.deepEqual(normalizeSettings(undefined, base), base);
  const s = normalizeSettings(
    {
      output: 'speaker',
      frequency: 5000,
      intensity: 'strong',
      verified: 'audio:"; rm',
      patterns: { now: 'custom:gone', turn: 'heartbeat', count: 'custom:mine' },
      custom: [
        { id: 'mine', name: 'Mein <b>Muster</b>', pulses: [{ duration: 5000, strength: 3, pause: -1 }] },
        { id: 'mine', name: 'twice', pulses: [{ duration: 100, strength: 1, pause: 0 }] },
        { id: 'empty', name: 'no pulses', pulses: [] },
      ],
    },
    base,
  );
  assert.equal(s.output, 'audio');
  assert.equal(s.frequency, 250);
  assert.equal(s.intensity, base.intensity);
  assert.equal(s.verified, '');
  assert.equal(s.patterns.now, 'long', 'a pattern that no longer exists falls back');
  assert.equal(s.patterns.turn, 'heartbeat');
  assert.equal(s.patterns.count, 'custom:mine');
  assert.deepEqual(s.custom, [{ id: 'mine', name: 'Mein bMusterb', pulses: [{ duration: 1000, strength: 1, pause: 0 }] }]);
});

test('a cue becomes the pattern at the strength, with the side only when the driver wants sides', () => {
  const settings: HapticSettings = { ...defaultSettings(), intensity: 0.5, tempo: 1, patterns: { ...defaultSettings().patterns, count: 'number' } };
  const count = hapticEvent(settings, 'count', { number: 3 });
  assert.equal(count?.pulses.length, 3);
  assert.ok(count?.pulses.every((p) => p.strength <= 0.5));
  assert.equal(hapticEvent(settings, 'turn', { side: 'left' })?.side, 'both');
  assert.equal(hapticEvent({ ...settings, directions: true }, 'turn', { side: 'left' })?.side, 'left');
  assert.equal(hapticEvent(settings, 'gear', { number: 2 }), undefined, "'off' is not felt");
});

/** The module on a host of its own: what it sends and registers is kept for the checks. */
function start(settings: HapticSettings = defaultSettings()) {
  const sent: HapticEvent[] = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const host: ModuleHost<HapticSettings> = {
    id: 'haptics',
    dev: false,
    log: () => undefined,
    settings: () => settings,
    updateSettings: async () => settings,
    app: () => ({}),
    telemetry: { onFrame: () => () => undefined, mode: () => 'menu', lastLap: () => undefined },
    haptics: { feel: () => undefined },
    desktop: { copyText: () => undefined, openLocalPage: async () => undefined },
    bridge: {
      handle: (name, handler) => void handlers.set(name, handler),
      send: (event, value) => {
        if (event === 'haptic') sent.push(value as HapticEvent);
      },
    },
  };
  const instance: ModuleInstance<HapticSettings> = hapticsModule.start(host);
  return { instance, sent, handlers, cues: () => sent.map((e) => e.cue) };
}

test('one pattern at a time: the next waits for the one before', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW });
  const { instance, cues } = start();
  instance.feel!('attention');
  mock.timers.tick(100);
  instance.feel!('turn', { side: 'right' });
  assert.deepEqual(cues(), ['attention']);
  mock.timers.tick(600);
  assert.deepEqual(cues(), ['attention', 'turn']);
  void instance.stop();
});

test('"jetzt" goes out at once and the pattern waiting is dropped', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW });
  const { instance, cues } = start();
  instance.feel!('attention');
  mock.timers.tick(100);
  instance.feel!('turn', { side: 'right' });
  mock.timers.tick(200);
  instance.feel!('now');
  mock.timers.tick(3000);
  assert.deepEqual(cues(), ['attention', 'now']);
  void instance.stop();
});

test('a pattern that would come too late is dropped', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW });
  const long = { id: 'long', name: 'Lang', pulses: Array.from({ length: 4 }, () => ({ duration: 1000, strength: 1, pause: 1000 })) };
  const settings = { ...defaultSettings(), custom: [long], patterns: { ...defaultSettings().patterns, attention: 'custom:long' as const } };
  const { instance, cues } = start(settings);
  instance.feel!('attention');
  instance.feel!('turn', { side: 'left' });
  mock.timers.tick(10_000);
  assert.deepEqual(cues(), ['attention']);
  void instance.stop();
});

test('the test: a single cue, or a whole braking zone; anything else is refused', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: NOW });
  const { instance, handlers, cues } = start();
  const testCall = handlers.get('test')!;
  assert.throws(() => testCall('explode'), /Invalid argument/);
  await testCall('turn');
  assert.deepEqual(cues(), ['turn']);
  mock.timers.tick(2000);
  const zone = testCall('zone') as Promise<void>;
  // In small steps, as time passes (one big step would run every timer at its end).
  for (let ms = 0; ms < 6000; ms += 50) mock.timers.tick(50);
  await zone;
  // The gear has no pattern by default.
  assert.deepEqual(cues(), ['turn', 'attention', 'count', 'count', 'now', 'turn']);
  void instance.stop();
});
