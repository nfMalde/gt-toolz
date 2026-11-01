import { inject } from '@angular/core';
import { patchState, signalStore, withHooks, withMethods, withState } from '@ngrx/signals';
import type { OverlayFrame, OverlaysSettings, OverlayStatus } from '@gt-toolz/overlays/api';
import { BRIDGE_AVAILABLE, GTT } from '@shell/core/gtt';

interface OverlaysState {
  settings: OverlaysSettings | null;
  /** The server: listening, or why not. */
  status: OverlayStatus | null;
  /** The latest frame as the overlay shows it (the editor's preview while it is fresh). */
  preview: OverlayFrame | null;
  error: string | null;
}

/** The OBS overlays (window.gtt.overlays): their settings, the server's state and the live preview. */
export const OverlaysStore = signalStore(
  { providedIn: 'root' },
  withState<OverlaysState>({ settings: null, status: null, preview: null, error: null }),
  withMethods((store, gtt = inject(GTT)) => ({
    async load(): Promise<void> {
      const [settings, status] = await Promise.all([gtt.overlays.settings(), gtt.overlays.status()]);
      patchState(store, { settings, status });
    },

    /** Optimistic: the UI (and the editor) shows the change at once, the main process returns the checked settings. */
    async update(change: Partial<OverlaysSettings>): Promise<void> {
      const settings = store.settings();
      if (!settings) return;
      patchState(store, { settings: { ...settings, ...change }, error: null });
      try {
        patchState(store, { settings: await gtt.overlays.setSettings(change) });
      } catch (err) {
        patchState(store, { settings, error: (err as Error).message });
      }
    },

    /** The overlay's address to the clipboard; false while the server is not running. */
    copyLink(): Promise<boolean> {
      return gtt.overlays.copyLink();
    },

    openLink(): Promise<void> {
      return gtt.overlays.openLink();
    },
  })),
  withHooks({
    onInit(store, gtt = inject(GTT)) {
      if (!BRIDGE_AVAILABLE) return;
      void store.load();
      gtt.overlays.onSettings((settings) => patchState(store, { settings }));
      gtt.overlays.onStatus((status) => patchState(store, { status }));
      gtt.overlays.onPreview((preview) => patchState(store, { preview }));
    },
  }),
);
