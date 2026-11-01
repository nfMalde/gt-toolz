import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { RecordingCatalog, RecordingEntry, RecordingPackInfo, RecordingSection } from '@gtt/api';
import { BRIDGE_AVAILABLE, GTT } from '../core/gtt';

interface RecordingsState {
  packs: RecordingPackInfo[];
  selectedId: string | null;
  catalog: RecordingCatalog | null;
  loading: boolean;
  /** An error code from the main process ("recording-silent") or a message. */
  error: string | null;
}

/** Codes the main process throws for the user's own mistakes; anything else is shown as it is. */
const CODES = /\b(pack-unknown|pack-file-too-large|pack-file-invalid|pack-language-unknown|pack-version-newer|recording-silent|recording-too-long|recording-invalid|text-invalid)\b/;

export function errorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return CODES.exec(message)?.[1] ?? message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

/** The user's recorded voice packs (one language each) and what there is to record in the selected one. */
export const RecordingsStore = signalStore(
  { providedIn: 'root' },
  withState<RecordingsState>({ packs: [], selectedId: null, catalog: null, loading: false, error: null }),
  withComputed(({ packs, selectedId, catalog }) => ({
    selected: computed(() => packs().find((p) => p.id === selectedId()) ?? null),
    entries: computed(() => catalog()?.entries ?? []),
  })),
  withMethods((store, gtt = inject(GTT)) => {
    async function loadCatalog(): Promise<void> {
      const id = store.selectedId();
      if (!id) {
        patchState(store, { catalog: null });
        return;
      }
      const catalog = await gtt.recordingCatalog(id);
      // Another pack may have been selected meanwhile.
      if (store.selectedId() === id) patchState(store, { catalog });
    }

    async function load(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const packs = await gtt.recordingPacks();
        const selectedId = packs.some((p) => p.id === store.selectedId()) ? store.selectedId() : (packs[0]?.id ?? null);
        patchState(store, { packs, selectedId });
        await loadCatalog();
      } catch (err) {
        patchState(store, { error: errorCode(err) });
      } finally {
        patchState(store, { loading: false });
      }
    }

    /** The pack's numbers (recordings, length) changed. */
    async function refreshPacks(): Promise<void> {
      patchState(store, { packs: await gtt.recordingPacks() });
    }

    /** Marks an entry recorded or not everywhere it is listed (one recording can be in several sections). */
    function markEntry(key: string, recorded: boolean, seconds?: number): void {
      const catalog = store.catalog();
      if (!catalog) return;
      patchState(store, { catalog: { ...catalog, entries: catalog.entries.map((e) => (e.key === key ? { ...e, recorded, seconds } : e)) } });
    }

    return {
      load,
      loadCatalog,

      async select(id: string): Promise<void> {
        patchState(store, { selectedId: id, catalog: null, error: null });
        await loadCatalog();
      },

      clearError(): void {
        patchState(store, { error: null });
      },

      setError(error: string): void {
        patchState(store, { error });
      },

      async create(details: { name: string; language: string; speaker: string }): Promise<void> {
        try {
          const pack = await gtt.createRecordingPack(details);
          patchState(store, { selectedId: pack.id, error: null });
          await load();
        } catch (err) {
          patchState(store, { error: errorCode(err) });
        }
      },

      async rename(id: string, details: { name?: string; speaker?: string }): Promise<void> {
        try {
          await gtt.updateRecordingPack(id, details);
          await refreshPacks();
        } catch (err) {
          patchState(store, { error: errorCode(err) });
        }
      },

      async remove(id: string): Promise<void> {
        try {
          await gtt.deleteRecordingPack(id);
          if (store.selectedId() === id) patchState(store, { selectedId: null, catalog: null });
          await load();
        } catch (err) {
          patchState(store, { error: errorCode(err) });
        }
      },

      /** Stores a take; throws the error code (the page shows it next to the text). */
      async save(entry: { text: string; section: RecordingSection }, wav: Uint8Array): Promise<RecordingEntry> {
        const id = store.selectedId();
        if (!id) throw new Error('pack-unknown');
        try {
          const saved = await gtt.saveRecording(id, entry.text, entry.section, wav);
          const catalog = store.catalog();
          // A new text (another name) joins its section.
          if (catalog && !catalog.entries.some((e) => e.key === saved.key && e.section === entry.section)) {
            patchState(store, { catalog: { ...catalog, entries: [...catalog.entries, { ...saved, section: entry.section }] } });
          }
          markEntry(saved.key, true, saved.seconds);
          void refreshPacks();
          return saved;
        } catch (err) {
          throw new Error(errorCode(err));
        }
      },

      async deleteTake(key: string): Promise<void> {
        const id = store.selectedId();
        if (!id) return;
        try {
          await gtt.deleteRecording(id, key);
          markEntry(key, false);
          void refreshPacks();
        } catch (err) {
          patchState(store, { error: errorCode(err) });
        }
      },

      audio(key: string): Promise<Uint8Array> {
        return gtt.recordingAudio(store.selectedId()!, key);
      },

      async preview(): Promise<void> {
        const id = store.selectedId();
        if (!id) return;
        try {
          await gtt.previewRecordingPack(id);
        } catch (err) {
          patchState(store, { error: errorCode(err) });
        }
      },

      /** Only after the user confirmed the consent statement. True: saved. */
      async exportPack(): Promise<boolean> {
        const id = store.selectedId();
        if (!id) return false;
        try {
          return await gtt.exportRecordingPack(id, true);
        } catch (err) {
          patchState(store, { error: errorCode(err) });
          return false;
        }
      },

      /** Only after the user read the notice. The imported pack, or null when cancelled. */
      async importPack(): Promise<RecordingPackInfo | null> {
        try {
          const pack = await gtt.importRecordingPack(true);
          if (pack) {
            patchState(store, { selectedId: pack.id, error: null });
            await load();
          }
          return pack;
        } catch (err) {
          patchState(store, { error: errorCode(err) });
          return null;
        }
      },
    };
  }),
  withHooks((store) => ({
    onInit() {
      if (BRIDGE_AVAILABLE) void store.load();
    },
  })),
);
