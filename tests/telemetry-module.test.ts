// The user, 2026-11-03: the Cockpit's "I drive" switch still said "own race" from the race before; the Daily Race
// reference chosen for the time trial counted as not fitting (another mode), and after 30 s the app began to learn a
// new one. A reference the user chooses sets the switch to what it is for.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { ModuleHost } from '../packages/core/src/module';
import { telemetryModule } from '../modules/telemetry/main/module';
import type { TelemetrySession } from '../modules/telemetry/main/session';
import type { TelemetryModuleSettings } from '../modules/telemetry/src/api';
import { defaultSettings } from '../modules/telemetry/src/settings';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-telemetry-module-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A host that keeps its settings and the UI handlers; a session that only answers choose(). */
function setup(reference: Record<string, unknown> | undefined, settings: Pick<TelemetryModuleSettings, 'driveMode' | 'driveBop'>) {
  fs.writeFileSync(path.join(dir, 'eifel.json'), '{}');
  let current: TelemetryModuleSettings = { ...defaultSettings(), ...settings };
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const logged: string[] = [];
  const chosen: (string | undefined)[] = [];
  const host = {
    id: 'telemetry',
    dev: false,
    log: (line: string) => void logged.push(line),
    settings: () => current,
    updateSettings: async (change: Partial<TelemetryModuleSettings>) => (current = { ...current, ...change }),
    app: () => ({}),
    telemetry: { onFrame: () => () => undefined, mode: () => undefined, lastLap: () => undefined },
    haptics: { feel: () => undefined },
    desktop: { copyText: () => undefined, openLocalPage: async () => undefined },
    bridge: { handle: (name: string, handler: (...args: unknown[]) => unknown) => void handlers.set(name, handler), send: () => undefined },
  } as unknown as ModuleHost<TelemetryModuleSettings>;
  const session = {
    on: () => undefined,
    off: () => undefined,
    start: async () => undefined,
    stop: async () => undefined,
    choose: (file: string | undefined) => (chosen.push(file), file ? reference : undefined),
  } as unknown as TelemetrySession;
  telemetryModule(session, dir).start(host);
  return { activate: (id: string | null) => handlers.get('activateReference')!(id), settings: () => current, logged, chosen };
}

test('a chosen Daily Race reference puts the switch on Daily Race with BoP', async () => {
  const { activate, settings, logged, chosen } = setup({ mode: 'daily', bop: true, modeConfirmed: true }, { driveMode: 'custom', driveBop: false });
  await activate('eifel');
  assert.deepEqual(chosen, [path.join(dir, 'eifel.json')]);
  assert.equal(settings().driveMode, 'daily');
  assert.equal(settings().driveBop, true);
  assert.ok(logged.some((l) => l.startsWith('REFERENCE chosen: you drive daily with BoP now')), logged.join('\n'));
});

test('a reference whose mode the user has not confirmed leaves the switch alone', async () => {
  const { activate, settings } = setup({ mode: 'daily', bop: true, modeConfirmed: false }, { driveMode: 'timeTrial', driveBop: false });
  await activate('eifel');
  assert.equal(settings().driveMode, 'timeTrial');
  assert.equal(settings().driveBop, false);
});
