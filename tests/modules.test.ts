// The module host (apps/desktop/src/modules.ts, docs/dev/modules.md): a module gets its checked settings, starts only
// while it is on, and when it stops the shell takes back every call and listener it registered. One that fails to start
// does not take the app down; the telemetry cannot be switched off.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ModuleDefinition, StoredModule } from '../packages/core/src/index';
import { Modules, type Shell } from '../apps/desktop/src/modules';

interface Settings {
  volume: number;
}

/** A module that counts its starts and stops and registers one call and one frame listener. */
function counter(id: string, options: { enabledByDefault?: boolean; required?: boolean; failStart?: boolean; stopMs?: number } = {}) {
  const calls = { starts: 0, stops: 0, changes: [] as number[], app: 0, felt: [] as string[] };
  const definition: ModuleDefinition<Settings> = {
    id,
    enabledByDefault: options.enabledByDefault ?? true,
    required: options.required,
    settings: {
      defaults: () => ({ volume: 50 }),
      normalize: (value, base) => {
        const v = (value ?? {}) as Partial<Record<keyof Settings, unknown>>;
        return { volume: typeof v.volume === 'number' ? Math.min(100, Math.max(0, v.volume)) : base.volume };
      },
    },
    start(host) {
      if (options.failStart) throw new Error('broken');
      calls.starts++;
      host.bridge.handle('ping', () => 'pong');
      host.telemetry.onFrame(() => undefined);
      return {
        settingsChanged: (next) => void calls.changes.push(next.volume),
        appChanged: () => void calls.app++,
        feel: (cue) => void calls.felt.push(cue),
        stop: async () => {
          if (options.stopMs) await new Promise((resolve) => setTimeout(resolve, options.stopMs));
          calls.stops++;
        },
      };
    },
  };
  return { definition: definition as unknown as ModuleDefinition, calls };
}

function fakeShell(stored: Record<string, StoredModule> = {}) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const frameListeners = new Set<unknown>();
  const saved: Record<string, Required<StoredModule>> = {};
  const sent: [string, unknown][] = [];
  const log: string[] = [];
  const shell: Shell = {
    dev: false,
    app: () => ({ language: 'de' }),
    stored: (id) => stored[id],
    save: (id, module) => void (saved[id] = module),
    telemetry: {
      onFrame: (listener) => {
        frameListeners.add(listener);
        return () => frameListeners.delete(listener);
      },
      mode: () => 'menu',
      lastLap: () => undefined,
    },
    desktop: { copyText: () => undefined, openLocalPage: async () => undefined },
    handle: (channel, handler) => {
      if (handlers.has(channel)) throw new Error(`second handler for ${channel}`);
      handlers.set(channel, handler);
      return () => handlers.delete(channel);
    },
    log: (line) => void log.push(line),
    send: (channel, value) => void sent.push([channel, value]),
  };
  return { shell, handlers, frameListeners, saved, sent, log };
}

test('settings come checked from the file, and the settings calls work also while the module is off', async () => {
  const a = counter('alpha', { enabledByDefault: false });
  const fake = fakeShell({ alpha: { settings: { volume: 900 } } });
  const modules = new Modules(fake.shell, [a.definition]);
  modules.startEnabled();
  assert.equal(a.calls.starts, 0, 'off by default');
  assert.deepEqual(await fake.handlers.get('gtt:alpha:settings')!(), { volume: 100 });
  assert.deepEqual(await fake.handlers.get('gtt:alpha:setSettings')!({ volume: 20, other: 1 }), { volume: 20 });
  assert.deepEqual(fake.saved.alpha, { enabled: false, settings: { volume: 20 } });
  assert.deepEqual(fake.sent.at(-1), ['gtt:alpha:settings', { volume: 20 }]);
});

test('switching on and off starts and stops it, and takes back its calls and listeners', async () => {
  const a = counter('alpha');
  const fake = fakeShell();
  const modules = new Modules(fake.shell, [a.definition]);
  modules.startEnabled();
  assert.equal(a.calls.starts, 1);
  assert.equal(await fake.handlers.get('gtt:alpha:ping')!(), 'pong');
  assert.equal(fake.frameListeners.size, 1);

  await fake.handlers.get('gtt:alpha:setSettings')!({ volume: 70 });
  modules.appChanged();
  assert.deepEqual(a.calls.changes, [70]);
  assert.equal(a.calls.app, 1);

  await modules.setEnabled('alpha', false);
  assert.equal(a.calls.stops, 1);
  assert.equal(fake.handlers.has('gtt:alpha:ping'), false);
  assert.equal(fake.frameListeners.size, 0);
  assert.equal(fake.handlers.has('gtt:alpha:settings'), true, 'the settings calls stay');
  assert.deepEqual(modules.states, { alpha: { enabled: false } });
  assert.deepEqual(fake.saved.alpha, { enabled: false, settings: { volume: 70 } });

  await modules.setEnabled('alpha', true);
  assert.equal(a.calls.starts, 2);
  assert.equal(await fake.handlers.get('gtt:alpha:ping')!(), 'pong');
  await modules.stopAll();
  assert.equal(a.calls.stops, 2);
});

test('off and on again quickly: one after the other, never two running', async () => {
  const a = counter('alpha', { stopMs: 30 });
  const fake = fakeShell();
  const modules = new Modules(fake.shell, [a.definition]);
  modules.startEnabled();
  await Promise.all([modules.setEnabled('alpha', false), modules.setEnabled('alpha', true)]);
  assert.equal(a.calls.stops, 1);
  assert.equal(a.calls.starts, 2);
  assert.equal(fake.frameListeners.size, 1);
  await modules.stopAll();
});

test('a module that fails to start stays off without taking the others down; a required one cannot be switched off', async () => {
  const broken = counter('broken', { failStart: true });
  const telemetry = counter('telemetry', { required: true });
  const fake = fakeShell({ telemetry: { enabled: false } });
  const modules = new Modules(fake.shell, [broken.definition, telemetry.definition]);
  modules.startEnabled();
  assert.ok(fake.log.some((line) => line.includes('module broken could not start')));
  assert.equal(telemetry.calls.starts, 1, 'required: on whatever the file says');
  await modules.setEnabled('telemetry', false);
  assert.equal(telemetry.calls.stops, 0);
  assert.deepEqual(modules.states.telemetry, { enabled: true });
  await modules.stopAll();
});

test('the haptics sink reaches only modules that run', async () => {
  const on = counter('alpha');
  const off = counter('beta', { enabledByDefault: false });
  const modules = new Modules(fakeShell().shell, [on.definition, off.definition]);
  modules.startEnabled();
  modules.feel('now');
  modules.feel('turn', { side: 'left' });
  assert.deepEqual(on.calls.felt, ['now', 'turn']);
  assert.deepEqual(off.calls.felt, []);
  await modules.setEnabled('alpha', false);
  modules.feel('now');
  assert.deepEqual(on.calls.felt, ['now', 'turn'], 'nothing after it stopped');
});
