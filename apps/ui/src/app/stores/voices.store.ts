import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { InstallState, VoiceChoice, VoicePackageInfo, VoiceRole } from '@gtt/api';
import { BRIDGE_AVAILABLE, GTT } from '../core/gtt';
import { SettingsStore } from './settings.store';

interface VoicesState {
  voices: VoiceChoice[];
  packages: VoicePackageInfo[];
  /** Packages ticked for installation (voices and models; their engines come along). */
  selected: string[];
  /** The user changed the selection; the language's preselection no longer applies. */
  touched: boolean;
  install: InstallState;
  previewing: string | null;
  loading: boolean;
}

/** A package as offered to the user: a voice or model, with the engine it needs if that is still missing. */
export interface OfferedPackage {
  pkg: VoicePackageInfo;
  engine?: VoicePackageInfo;
  /** Download size including the missing engine. */
  sizeBytes: number;
}

export const VoicesStore = signalStore(
  { providedIn: 'root' },
  withState<VoicesState>({ voices: [], packages: [], selected: [], touched: false, install: { state: 'idle' }, previewing: null, loading: false }),
  withComputed(({ voices, packages, selected, install }, settings = inject(SettingsStore)) => {
    const language = computed(() => settings.language().split('-')[0]!);
    const offered = computed<OfferedPackage[]>(() => {
      const byId = new Map(packages().map((p) => [p.id, p]));
      return packages()
        .filter((p) => p.kind !== 'engine')
        .map((pkg) => {
          const engine = pkg.requires ? byId.get(pkg.requires) : undefined;
          return { pkg, engine, sizeBytes: pkg.sizeBytes + (engine && !engine.installed ? engine.sizeBytes : 0) };
        });
    });
    return {
      language,
      offered,
      /** Voices for the coach language, installed ones first. */
      forLanguage: computed(() =>
        voices()
          .filter((v) => v.language.toLowerCase().startsWith(language()))
          .sort((a, b) => Number(b.installed) - Number(a.installed)),
      ),
      /** Download size of the selection; an engine needed by several packages counts once. */
      selectedBytes: computed(() => {
        const ids = new Set<string>();
        for (const offer of offered()) {
          if (!selected().includes(offer.pkg.id) || offer.pkg.installed) continue;
          ids.add(offer.pkg.id);
          if (offer.engine && !offer.engine.installed) ids.add(offer.engine.id);
        }
        return packages()
          .filter((p) => ids.has(p.id))
          .reduce((sum, p) => sum + p.sizeBytes, 0);
      }),
      installing: computed(() => install().state === 'installing'),
    };
  }),
  withMethods((store, gtt = inject(GTT)) => {
    /** The preselection for the app language (the main process marks it), until the user changes it. */
    function preselect(): void {
      if (store.touched()) return;
      const ids = store
        .packages()
        .filter((p) => p.kind !== 'engine' && !p.installed && p.preselected)
        .map((p) => p.id);
      patchState(store, { selected: ids });
    }

    async function load(): Promise<void> {
      patchState(store, { loading: true });
      try {
        const [voices, packages] = await Promise.all([gtt.listVoices(), gtt.voicePackages()]);
        patchState(store, { voices, packages });
        preselect();
      } finally {
        patchState(store, { loading: false });
      }
    }

    return {
      load,
      preselect,

      toggle(id: string): void {
        const selected = store.selected();
        patchState(store, { touched: true, selected: selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id] });
      },

      /**
       * Downloads the selected packages: only ever from the user's click. Not named install(): that is the
       * install state, and a method of the same name replaced it, so reading the state in a template
       * started the download.
       */
      async installSelected(): Promise<void> {
        const ids = store.selected().filter((id) => !store.packages().find((p) => p.id === id)?.installed);
        if (!ids.length) return;
        await gtt.installVoicePackages(ids);
      },

      cancel(): Promise<void> {
        return gtt.cancelVoiceInstall();
      },

      async remove(id: string): Promise<void> {
        await gtt.removeVoicePackages([id]);
        await load();
      },

      async preview(id: string, role: VoiceRole): Promise<void> {
        patchState(store, { previewing: id });
        try {
          await gtt.previewVoice(id, role);
        } finally {
          patchState(store, { previewing: null });
        }
      },
    };
  }),
  withHooks((store, gtt = inject(GTT)) => {
    let unsubscribe = () => {};
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe = gtt.onVoiceInstall((install) => {
          patchState(store, { install });
          if (install.state === 'done') {
            patchState(store, { selected: [], touched: true });
            void store.load();
          }
        });
        void store.load();
      },
      onDestroy() {
        unsubscribe();
      },
    };
  }),
);
