import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import type { TelemetryModuleSettings } from '@gt-toolz/telemetry-module/api';
import { BRIDGE_AVAILABLE, GTT } from '@shell/core/gtt';

interface TelemetryState {
  settings: TelemetryModuleSettings | null;
  error: string | null;
}

/** The telemetry's settings (window.gtt.telemetry): the PS5's address, picking references, "Ich fahre", recording. */
export const TelemetryStore = signalStore(
  { providedIn: 'root' },
  withState<TelemetryState>({ settings: null, error: null }),
  withMethods((store, gtt = inject(GTT)) => ({
    async load(): Promise<void> {
      patchState(store, { settings: await gtt.telemetry.settings() });
    },

    /** Optimistic: the page shows the change at once, the main process returns the checked settings. */
    async update(change: Partial<TelemetryModuleSettings>): Promise<void> {
      const settings = store.settings();
      if (!settings) return;
      patchState(store, { settings: { ...settings, ...change }, error: null });
      try {
        patchState(store, { settings: await gtt.telemetry.setSettings(change) });
      } catch (err) {
        patchState(store, { settings, error: (err as Error).message });
      }
    },
  })),
  withHooks({
    onInit(store, gtt = inject(GTT)) {
      if (!BRIDGE_AVAILABLE) return;
      void store.load();
      // Also when the telemetry changes them itself (the reference in use).
      gtt.telemetry.onSettings((settings) => patchState(store, { settings }));
    },
  }),
);
