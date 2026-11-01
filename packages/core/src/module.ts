// The contract between the shell and a module's main-process part (docs/dev/modules.md, as in Stream Toolz): what a
// module declares, and what the shell hands it when it starts. A module never imports Electron and never reaches into
// another module: everything it uses comes from its host, and the host takes it all back when the module stops
// (switched off, app closing). The services the modules share (telemetry feed, speech floor, voices, haptics) join
// the host step by step (docs/dev/modules.md).

import type { SessionMode, TelemetryFrame } from '@gt-toolz/telemetry';
import type { HapticCue, HapticDetail } from './api';

export type { SessionMode };

export interface ModuleDefinition<S extends object = object> {
  /** Lower case letters: the key in config.json, the IPC namespace (gtt:<id>:…) and window.gtt.<id>. */
  readonly id: string;
  /** Switched on in a new install. */
  readonly enabledByDefault: boolean;
  /** Cannot be switched off (the telemetry: every other module reads it). */
  readonly required?: boolean;
  readonly settings: ModuleSettings<S>;
  /** Called when the module is switched on (at start, or later by the user). */
  start(host: ModuleHost<S>): ModuleInstance<S>;
}

export interface ModuleSettings<S> {
  /** Every setting with its default. */
  defaults(): S;
  /** Turns untrusted input into complete, valid settings: what is missing or invalid keeps its value from base. */
  normalize(value: unknown, base: S): S;
}

/** A running module. The shell calls these; all but stop() are optional. */
export interface ModuleInstance<S> {
  /** The settings changed (in the UI, or by the module itself); the host has saved them and told the UI. */
  settingsChanged?(next: S, before: S): void;
  /** The shell's settings changed (language, name …). */
  appChanged?(): void;
  /** The vibration: a cue is due now (the shell's haptics sink hands it to every running module that feels). */
  feel?(cue: HapticCue, detail?: HapticDetail): void;
  /** Voice packages are about to be removed (engines must not run meanwhile), or were installed or removed. */
  voicesChanged?(phase: 'removing' | 'changed'): void;
  /** Switched off or the app closes: stop speaking, close engines. Handlers and listeners are removed by the host. */
  stop(): void | Promise<void>;
}

export interface ModuleHost<S> {
  readonly id: string;
  readonly dev: boolean;
  /** One line in the session log (anonymised when written). */
  log(line: string): void;
  settings(): S;
  /** Validates, saves and announces a change the module makes itself. */
  updateSettings(change: Partial<S>): Promise<S>;
  /** The shell's settings, read only. */
  app(): Readonly<Record<string, unknown>>;
  readonly telemetry: ModuleTelemetry;
  readonly haptics: ModuleHaptics;
  readonly desktop: ModuleDesktop;
  readonly bridge: ModuleBridge;
}

/** The haptics sink: coach and crew speech is felt. Nothing happens while the vibration is off. */
export interface ModuleHaptics {
  feel(cue: HapticCue, detail?: HapticDetail): void;
}

/** The last lap against the target time. */
export interface LapTime {
  lap: number;
  timeMs: number;
  /** Positive: slower than the target. */
  deltaMs: number;
}

/** The PS5's telemetry, read once for every module (docs/dev/modules.md). */
export interface ModuleTelemetry {
  /** Every frame (about 60 a second). The returned function stops listening; stopping the module does that too. */
  onFrame(listener: (frame: TelemetryFrame) => void): () => void;
  /** The session as it is now (a frozen game counts as a menu). */
  mode(): SessionMode;
  lastLap(): LapTime | undefined;
}

/** What a module may do on the desktop, through the shell (it never imports Electron). */
export interface ModuleDesktop {
  /** To the clipboard: the UI has no clipboard access. */
  copyText(text: string): void;
  /** A page of the module's own server in the browser: http://127.0.0.1 or http://localhost only. */
  openLocalPage(url: string): Promise<void>;
}

/** The module's calls from the UI (gtt:<id>:<name>) and its events to the UI. */
export interface ModuleBridge {
  /** Arguments come from the UI: check every one of them. */
  handle(name: string, handler: (...args: unknown[]) => unknown): void;
  send(event: string, value: unknown): void;
}
