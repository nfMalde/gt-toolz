import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import type { ReferenceDetails, ReferenceSummary } from '@gtt/api';
import { GTT } from '@shell/core/gtt';

interface ReferencesState {
  list: ReferenceSummary[];
  loading: boolean;
  /** Reference waiting for the delete confirmation. */
  confirmDelete: string | null;
}

export const ReferencesStore = signalStore(
  { providedIn: 'root' },
  withState<ReferencesState>({ list: [], loading: false, confirmDelete: null }),
  withMethods((store, gtt = inject(GTT)) => {
    async function load(): Promise<void> {
      patchState(store, { loading: true });
      try {
        patchState(store, { list: await gtt.telemetry.listReferences() });
      } finally {
        patchState(store, { loading: false });
      }
    }
    return {
      load,
      async activate(id: string | null): Promise<void> {
        await gtt.telemetry.activateReference(id);
        await load();
      },
      askDelete(id: string | null): void {
        patchState(store, { confirmDelete: id });
      },
      async remove(id: string): Promise<void> {
        patchState(store, { confirmDelete: null });
        await gtt.telemetry.deleteReference(id);
        await load();
      },
      async forget(id: string): Promise<void> {
        await gtt.forgetHistory(id);
        await load();
      },
      /**
       * Learn mode for a new reference, after deleting the given references (or only their remembered
       * mistakes). The user chose and confirmed them in the learn dialog.
       */
      async learnNew(ids: string[], historyOnly: boolean, details: ReferenceDetails = {}): Promise<void> {
        for (const id of ids) {
          if (historyOnly) await gtt.forgetHistory(id);
          else await gtt.telemetry.deleteReference(id);
        }
        await gtt.telemetry.activateReference(null, details);
        await load();
      },
      /** Player and target time (null: back to the lap's own time). */
      async update(id: string, details: ReferenceDetails): Promise<void> {
        const summary = await gtt.telemetry.updateReference(id, details);
        patchState(store, { list: store.list().map((r) => (r.id === id ? summary : r)) });
      },
      openFolder(): Promise<void> {
        return gtt.openFolder('references');
      },
    };
  }),
);
