import { computed, effect, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { UpdateStatus } from '@gtt/api';
import { BRIDGE_AVAILABLE, GTT } from '../core/gtt';
import { SettingsStore } from './settings.store';

interface UpdatesState {
  status: UpdateStatus;
  /** The update window is open. */
  open: boolean;
  /** "Later" in this session: the window does not open by itself again until the next start. */
  later: boolean;
}

/**
 * Updates (apps/desktop/src/updates.ts): the main process looks for a newer release once at start, when the user
 * agreed (asked once in the news window), and whenever the update button asks. A release it finds opens the update
 * window once per start; "Later" closes it, the button in the title bar opens it again.
 */
export const UpdatesStore = signalStore(
  { providedIn: 'root' },
  withState<UpdatesState>({ status: { available: false, state: 'idle' }, open: false, later: false }),
  withComputed(({ status }) => ({
    /** A newer version is there (also while it downloads or after it opened). */
    found: computed(() => !!status().release && ['found', 'downloading', 'installing', 'opened'].includes(status().state)),
    busy: computed(() => ['checking', 'downloading', 'installing'].includes(status().state)),
  })),
  withMethods((store, gtt = inject(GTT)) => ({
    async check(): Promise<void> {
      patchState(store, { status: await gtt.checkForUpdate() });
    },
    async install(): Promise<void> {
      patchState(store, { status: await gtt.installUpdate() });
    },
    show(): void {
      patchState(store, { open: true });
    },
    later(): void {
      patchState(store, { open: false, later: true });
    },
  })),
  withHooks((store, gtt = inject(GTT), settings = inject(SettingsStore)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = gtt.onUpdate((status) => {
          const appeared = status.state === 'found' && store.status().state !== 'found';
          patchState(store, { status, ...(appeared && !store.later() ? { open: true } : {}) });
        });
        void gtt.updateStatus().then((status) => patchState(store, { status }));
        // Once at start, after the user agreed (the news window asks first).
        let looked = false;
        effect(() => {
          const s = settings.settings();
          if (looked || !s?.updateAsked || !s.updateCheck || !store.status().available) return;
          looked = true;
          void store.check();
        });
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
