import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import type { CrewModuleSettings } from '@gt-toolz/crew/api';
import { BRIDGE_AVAILABLE, GTT } from '@shell/core/gtt';

interface CrewState {
  settings: CrewModuleSettings | null;
  error: string | null;
}

/** The race crew's settings (window.gtt.crew): how much it says, its splits, strategy, practice tyres and the team boss. */
export const CrewStore = signalStore(
  { providedIn: 'root' },
  withState<CrewState>({ settings: null, error: null }),
  withMethods((store, gtt = inject(GTT)) => ({
    async load(): Promise<void> {
      patchState(store, { settings: await gtt.crew.settings() });
    },

    /** Optimistic: the page shows the change at once, the main process returns the checked settings. */
    async update(change: Partial<CrewModuleSettings>): Promise<void> {
      const settings = store.settings();
      if (!settings) return;
      patchState(store, { settings: { ...settings, ...change }, error: null });
      try {
        patchState(store, { settings: await gtt.crew.setSettings(change) });
      } catch (err) {
        patchState(store, { settings, error: (err as Error).message });
      }
    },
  })),
  withHooks({
    onInit(store, gtt = inject(GTT)) {
      if (!BRIDGE_AVAILABLE) return;
      void store.load();
      gtt.crew.onSettings((settings) => patchState(store, { settings }));
    },
  }),
);
