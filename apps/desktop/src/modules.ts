// The modules that moved into their folders and their hosts (docs/dev/modules.md). A module starts when it is switched
// on and gets only what the shell offers (packages/core/src/module.ts): its settings, the telemetry, the haptics sink,
// the desktop and its own IPC namespace (gtt:<id>:…). When it stops, the shell takes all of that back. The shell keeps
// every module's settings in config.json and answers its settings calls, also while the module is off. The modules
// still inside the runner (telemetry, coach, crew) join one by one (docs/dev/modules.md).

import {
  asObject,
  type HapticCue,
  type HapticDetail,
  type ModuleDefinition,
  type ModuleDesktop,
  type ModuleHost,
  type ModuleInstance,
  type ModuleState,
  type ModuleTelemetry,
  type StoredModule,
} from '@gt-toolz/core';

/** What the shell gives its modules. */
export interface Shell {
  dev: boolean;
  app: () => Readonly<Record<string, unknown>>;
  stored: (id: string) => StoredModule | undefined;
  save: (id: string, module: Required<StoredModule>) => void;
  telemetry: ModuleTelemetry;
  desktop: ModuleDesktop;
  /** Registers an IPC call; the returned function removes it (bridge.ts). */
  handle: (channel: string, handler: (...args: unknown[]) => unknown) => () => void;
  log: (line: string) => void;
  send: (channel: string, value: unknown) => void;
}

interface Entry {
  definition: ModuleDefinition;
  enabled: boolean;
  settings: object;
  running?: { instance: ModuleInstance<object>; cleanup: (() => void)[] };
}

export class Modules {
  private readonly entries: Entry[];
  /** Switching one after the other: a module switched off and on again quickly must find its port free. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly shell: Shell,
    definitions: readonly ModuleDefinition[],
  ) {
    this.entries = definitions.map((definition) => {
      const stored = shell.stored(definition.id);
      return {
        definition,
        enabled: definition.required || (stored?.enabled ?? definition.enabledByDefault),
        settings: definition.settings.normalize(stored?.settings, definition.settings.defaults()),
      };
    });
    for (const entry of this.entries) {
      const id = entry.definition.id;
      shell.handle(`gtt:${id}:settings`, () => entry.settings);
      shell.handle(`gtt:${id}:setSettings`, (change) => this.updateSettings(entry, asObject(change)));
    }
  }

  has(id: string): boolean {
    return this.entries.some((entry) => entry.definition.id === id);
  }

  /** A module's settings as checked and saved, also while it is off. */
  settingsOf(id: string): object | undefined {
    return this.entries.find((entry) => entry.definition.id === id)?.settings;
  }

  get states(): Record<string, ModuleState> {
    return Object.fromEntries(this.entries.map((entry) => [entry.definition.id, { enabled: entry.enabled }]));
  }

  startEnabled(): void {
    for (const entry of this.entries) if (entry.enabled) this.start(entry);
  }

  /** Switched on or off by the user: saved, and the module starts or stops at once. */
  setEnabled(id: string, enabled: boolean): Promise<void> {
    const result = this.queue.then(async () => {
      const entry = this.entries.find((e) => e.definition.id === id);
      if (!entry || entry.enabled === enabled || (entry.definition.required && !enabled)) return;
      entry.enabled = enabled;
      this.save(entry);
      this.shell.log(`MODULES   ${id} ${enabled ? 'on' : 'off'}`);
      if (enabled) this.start(entry);
      else await this.stop(entry);
    });
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** The haptics sink: a cue to every running module that feels (the vibration); nothing while none runs. */
  feel(cue: HapticCue, detail?: HapticDetail): void {
    for (const entry of this.entries) entry.running?.instance.feel?.(cue, detail);
  }

  /** The shell's settings changed (language, name …). */
  appChanged(): void {
    for (const entry of this.entries) entry.running?.instance.appChanged?.();
  }

  voicesChanged(phase: 'removing' | 'changed'): void {
    for (const entry of this.entries) entry.running?.instance.voicesChanged?.(phase);
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(this.entries.map((entry) => this.stop(entry)));
  }

  /** Validated by the module, saved, passed to the running module and announced to the UI. */
  private async updateSettings(entry: Entry, change: object): Promise<object> {
    const before = entry.settings;
    const next = entry.definition.settings.normalize({ ...before, ...change }, before);
    entry.settings = next;
    this.save(entry);
    entry.running?.instance.settingsChanged?.(next, before);
    this.shell.send(`gtt:${entry.definition.id}:settings`, next);
    return next;
  }

  private save(entry: Entry): void {
    this.shell.save(entry.definition.id, { enabled: entry.enabled, settings: entry.settings });
  }

  private start(entry: Entry): void {
    if (entry.running) return;
    const shell = this.shell;
    const id = entry.definition.id;
    const cleanup: (() => void)[] = [];
    const host: ModuleHost<object> = {
      id,
      dev: shell.dev,
      log: shell.log,
      settings: () => entry.settings,
      updateSettings: (change) => this.updateSettings(entry, change),
      app: shell.app,
      telemetry: {
        onFrame: (listener) => {
          const off = shell.telemetry.onFrame(listener);
          cleanup.push(off);
          return off;
        },
        mode: () => shell.telemetry.mode(),
        lastLap: () => shell.telemetry.lastLap(),
      },
      haptics: { feel: (cue, detail) => this.feel(cue, detail) },
      desktop: shell.desktop,
      bridge: {
        handle: (name, handler) => void cleanup.push(shell.handle(`gtt:${id}:${name}`, handler)),
        send: (event, value) => shell.send(`gtt:${id}:${event}`, value),
      },
    };
    try {
      entry.running = { instance: entry.definition.start(host), cleanup };
      shell.log(`MODULES   ${id} started`);
    } catch (err) {
      // One module failing must not take the app down: it stays off until the next start.
      shell.log(`ERROR     module ${id} could not start: ${(err as Error).message}`);
      for (const undo of cleanup.reverse()) undo();
    }
  }

  private async stop(entry: Entry): Promise<void> {
    const running = entry.running;
    if (!running) return;
    entry.running = undefined;
    let stopped: void | Promise<void> = undefined;
    try {
      stopped = running.instance.stop();
    } catch (err) {
      this.shell.log(`ERROR     module ${entry.definition.id} could not stop: ${(err as Error).message}`);
    }
    // Its calls and listeners go at once, also while it is still closing (it may be started again meanwhile).
    for (const undo of running.cleanup.reverse()) undo();
    try {
      await stopped;
    } catch (err) {
      this.shell.log(`ERROR     module ${entry.definition.id} could not stop: ${(err as Error).message}`);
    }
  }
}
