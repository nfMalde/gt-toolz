// The part of the contract between the UI and the main process that every module shares: whether a module is on, the
// calls each module's settings have (window.gtt.<id>) and what can be felt (the haptics sink). Types, constants and
// the preload's helper only: no Node or Electron (the sandboxed preload and the UI import this).

export type Unsubscribe = () => void;

// --- The haptics sink (docs/dev/modules.md): what coach and crew make felt, for drivers who hear badly ---

/** What can be felt: the braking zone's cues, the lap time against the target, and "something is said". */
export type HapticCue = 'attention' | 'count' | 'now' | 'turn' | 'gear' | 'assist' | 'faster' | 'slower' | 'message';
export const HAPTIC_CUES: readonly HapticCue[] = ['attention', 'count', 'now', 'turn', 'gear', 'assist', 'faster', 'slower', 'message'];

/** A cue's detail: the turn's side; the countdown number or the gear. */
export interface HapticDetail {
  side?: 'left' | 'right';
  number?: number;
}

/** A module as the shell keeps it: switched on or off (its settings are its own, see ModuleSettingsApi). */
export interface ModuleState {
  enabled: boolean;
}

/** What a module's part of the preload builds its calls from: invoke and subscribe within its own namespace. */
export interface BridgeScope {
  invoke<T>(name: string, ...args: unknown[]): Promise<T>;
  subscribe<T>(event: string): (listener: (value: T) => void) => Unsubscribe;
}

/** Every module's settings, with the same three calls (the shell answers them, see apps/desktop/src/modules.ts). */
export interface ModuleSettingsApi<S> {
  settings(): Promise<S>;
  /** Applies and saves a change; returns the validated settings. */
  setSettings(change: Partial<S>): Promise<S>;
  /** Settings changed, also by the module itself. */
  onSettings(listener: (settings: S) => void): Unsubscribe;
}

export function settingsBridge<S>(scope: BridgeScope): ModuleSettingsApi<S> {
  return {
    settings: () => scope.invoke('settings'),
    setSettings: (change) => scope.invoke('setSettings', change),
    onSettings: scope.subscribe('settings'),
  };
}
