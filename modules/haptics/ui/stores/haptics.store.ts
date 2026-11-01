import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import type { HapticCue, HapticSettings } from '@gt-toolz/haptics/api';
import { BRIDGE_AVAILABLE, GTT } from '@shell/core/gtt';

interface HapticsState {
  settings: HapticSettings | null;
  error: string | null;
}

/** The vibration's settings (window.gtt.haptics); the player and the Vibration page read them here. */
export const HapticsStore = signalStore(
  { providedIn: 'root' },
  withState<HapticsState>({ settings: null, error: null }),
  withMethods((store, gtt = inject(GTT)) => ({
    async load(): Promise<void> {
      patchState(store, { settings: await gtt.haptics.settings() });
    },

    /** Optimistic: the page shows the change at once, the main process returns the checked settings. */
    async update(change: Partial<HapticSettings>): Promise<void> {
      const settings = store.settings();
      if (!settings) return;
      patchState(store, { settings: { ...settings, ...change }, error: null });
      try {
        patchState(store, { settings: await gtt.haptics.setSettings(change) });
      } catch (err) {
        patchState(store, { settings, error: (err as Error).message });
      }
    },

    /** A cue's pattern, or a whole braking zone timed like on track ('zone'); resolves when it is over. */
    test(cue: HapticCue | 'zone'): Promise<void> {
      return gtt.haptics.test(cue);
    },
  })),
  withHooks({
    onInit(store, gtt = inject(GTT)) {
      if (!BRIDGE_AVAILABLE) return;
      void store.load();
      gtt.haptics.onSettings((settings) => patchState(store, { settings }));
    },
  }),
);
