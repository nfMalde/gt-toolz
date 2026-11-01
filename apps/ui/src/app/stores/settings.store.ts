import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import { isRunnerModule, moduleSwitch, type AppConfig, type AppInfo, type LanguageInfo, type ModuleId, type ModuleState, type RunnerSettings, type VoiceRole } from '@gtt/api';
import { BRIDGE_AVAILABLE, GTT } from '../core/gtt';

interface SettingsState {
  config: AppConfig | null;
  info: AppInfo | null;
  languages: LanguageInfo[];
  /** First start: the welcome (how it works, trust); from there the setup assistant. */
  welcomeOpen: boolean;
  /** The setup assistant overlay (from the welcome, the navigation or the settings). */
  guideOpen: boolean;
  /** Step the assistant opens at (e.g. 'calibrate' from the settings); null: the first. */
  guideStep: string | null;
  /** The tour through the app's normal flow: once after the first setup, then from the navigation. */
  tourOpen: boolean;
  error: string | null;
}

/**
 * App configuration, the modules on or off and the settings of the modules still inside the runner (the modules that
 * moved have their own stores); changes are applied right away and saved by the main process.
 */
export const SettingsStore = signalStore(
  { providedIn: 'root' },
  withState<SettingsState>({ config: null, info: null, languages: [], welcomeOpen: false, guideOpen: false, guideStep: null, tourOpen: false, error: null }),
  withComputed(({ config }) => ({
    loaded: computed(() => config() !== null),
    /**
     * The first setup is not finished yet (the user, 2026-10-24: new users were swamped by the menus). Until then
     * the assistant cannot be closed and the app starts with it again.
     */
    firstRun: computed(() => config() !== null && !config()!.guideDone),
    settings: computed(() => config()?.settings ?? null),
    language: computed(() => config()?.settings.language ?? (navigator.language.startsWith('de') ? 'de' : 'en')),
    muted: computed(() => config()?.settings.mute ?? false),
    /** Not calibrated yet: the app reminds the driver (navigation, cockpit). */
    needsCalibration: computed(() => config() !== null && !config()!.settings.latencyCalibrated),
  })),
  withMethods((store, gtt = inject(GTT)) => {
    let markLoaded = () => {};
    const loaded = new Promise<void>((resolve) => (markLoaded = resolve));

    /** Optimistic: the UI shows the change at once, the main process returns the validated settings. */
    async function update(change: Partial<RunnerSettings>): Promise<void> {
      const config = store.config();
      if (!config) return;
      patchState(store, { config: { ...config, settings: { ...config.settings, ...change } }, error: null });
      try {
        const settings = await gtt.setSettings(change);
        patchState(store, { config: { ...store.config()!, settings } });
      } catch (err) {
        patchState(store, { config, error: (err as Error).message });
      }
    }

    function setModules(modules: Record<ModuleId, ModuleState>): void {
      const config = store.config();
      if (config) patchState(store, { config: { ...config, modules } });
    }

    return {
      update,

      async load(): Promise<void> {
        const [config, info, languages] = await Promise.all([gtt.getConfig(), gtt.info(), gtt.languages()]);
        patchState(store, { config, info, languages, welcomeOpen: !config.guideDone });
        markLoaded();
      },

      /** Resolves once the configuration has arrived (the route guards wait for it). */
      whenLoaded: (): Promise<void> => loaded,

      /** A module is on (false while the configuration is not loaded yet). */
      moduleEnabled(id: ModuleId): boolean {
        return store.config()?.modules[id]?.enabled ?? false;
      },

      /**
       * Optimistic as the settings: the navigation changes at once, the main process starts or stops the module. The
       * switch of a module still inside the runner is a setting: it changes here too, so the settings stay as the
       * main process has them.
       */
      async setModuleEnabled(id: ModuleId, on: boolean): Promise<void> {
        const config = store.config();
        if (!config) return;
        const settings = isRunnerModule(id) ? { ...config.settings, ...moduleSwitch(id, on) } : config.settings;
        patchState(store, { config: { ...config, settings, modules: { ...config.modules, [id]: { enabled: on } } }, error: null });
        try {
          setModules(await gtt.setModuleEnabled(id, on));
        } catch (err) {
          patchState(store, { config, error: (err as Error).message });
        }
      },

      /** The main process switched a module (also through a setting of the runner's). */
      modulesChanged: (modules: Record<ModuleId, ModuleState>) => setModules(modules),

      /** The language a role speaks: its own setting, else the app language (the stand-in speaks like the coach). */
      speechLanguage(role: VoiceRole): string {
        const settings = store.config()?.settings;
        if (!settings) return store.language();
        return (role === 'crew' ? settings.crewLanguage : settings.coachLanguage) || settings.language;
      },

      /** The voice for a role in the language it speaks ('' = automatic). */
      async setVoice(role: VoiceRole, id: string): Promise<void> {
        const settings = store.config()?.settings;
        if (!settings) return;
        const roleVoice = settings.voices[role];
        const language = (role === 'crew' ? settings.crewLanguage : settings.coachLanguage) || settings.language;
        await update({
          voices: { ...settings.voices, [role]: { ...roleVoice, byLanguage: { ...roleVoice.byLanguage, [language]: id } } },
        });
      },

      /** The user's recorded voice pack for a role in the language it speaks ('' = none, only the voice). */
      async setRecordings(role: VoiceRole, packId: string): Promise<void> {
        const settings = store.config()?.settings;
        if (!settings) return;
        const roleVoice = settings.voices[role];
        const language = (role === 'crew' ? settings.crewLanguage : settings.coachLanguage) || settings.language;
        const recordings = { ...roleVoice.recordings };
        if (packId) recordings[language] = packId;
        else delete recordings[language];
        await update({ voices: { ...settings.voices, [role]: { ...roleVoice, recordings } } });
      },

      async setVoiceStyle(role: VoiceRole, style: { rate?: number; pitch?: number; commaPause?: number; sentencePause?: number }): Promise<void> {
        const settings = store.config()?.settings;
        if (!settings) return;
        await update({ voices: { ...settings.voices, [role]: { ...settings.voices[role], ...style } } });
      },

      toggleMute(): Promise<void> {
        return update({ mute: !store.muted() });
      },

      openGuide(step: string | null = null): void {
        patchState(store, { guideOpen: true, guideStep: step, welcomeOpen: false, tourOpen: false });
      },

      /** From the welcome into the setup assistant (at step, if given); the welcome comes back until setup is done. */
      startSetup(step: string | null = null): void {
        patchState(store, { welcomeOpen: false, guideOpen: true, guideStep: step });
      },

      /** Closes the assistant; during the first setup it stays open (finishGuide ends it). */
      closeGuide(): void {
        if (store.firstRun()) return;
        patchState(store, { guideOpen: false });
      },

      /** The assistant's last step: setup is done for good; after the first one the tour starts. */
      async finishGuide(): Promise<void> {
        const first = store.firstRun();
        patchState(store, { guideOpen: false, tourOpen: first });
        const config = store.config();
        if (config && !config.guideDone) {
          patchState(store, { config: { ...config, guideDone: true } });
          await gtt.setGuideDone(true);
        }
      },

      startTour(): void {
        patchState(store, { tourOpen: true, guideOpen: false });
      },

      endTour(): void {
        patchState(store, { tourOpen: false });
      },
    };
  }),
  withHooks({
    onInit(store, gtt = inject(GTT)) {
      if (!BRIDGE_AVAILABLE) return;
      void store.load();
      gtt.onModules((modules) => store.modulesChanged(modules));
    },
  }),
);
