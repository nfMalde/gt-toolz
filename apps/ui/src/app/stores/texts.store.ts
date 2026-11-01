import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { OwnText, TextCatalog, TextEntry, TextProblem } from '@gtt/api';
import { GTT } from '../core/gtt';
import { SettingsStore } from './settings.store';

interface TextsState {
  catalog: TextCatalog | null;
  loading: boolean;
  /** The text being heard (its key). */
  playing: string | null;
  error: string | null;
}

/**
 * What coach and crew say, in the user's words (docs/dev/coach-and-texts.md "Own texts"): the language pack's texts from
 * the main process, the user's own in the settings (`texts`), saved like every other setting.
 */
export const TextsStore = signalStore(
  { providedIn: 'root' },
  withState<TextsState>({ catalog: null, loading: false, playing: null, error: null }),
  withComputed(({ catalog }, settings = inject(SettingsStore)) => ({
    /** The user's own texts in the catalogue's language. */
    own: computed<Record<string, OwnText>>(() => {
      const language = catalog()?.language;
      return (language && settings.settings()?.texts[language]) || {};
    }),
  })),
  withMethods((store, gtt = inject(GTT), settings = inject(SettingsStore)) => {
    async function setOwn(key: string, own: OwnText | undefined): Promise<void> {
      const language = store.catalog()?.language;
      const current = settings.settings();
      if (!language || !current) return;
      const texts = { ...current.texts[language] };
      if (own) texts[key] = own;
      else delete texts[key];
      const all = { ...current.texts, [language]: texts };
      if (!Object.keys(texts).length) delete all[language];
      await settings.update({ texts: all });
    }

    return {
      async load(language: string): Promise<void> {
        patchState(store, { loading: true, error: null });
        try {
          patchState(store, { catalog: await gtt.texts(language) });
        } catch (err) {
          patchState(store, { error: (err as Error).message });
        } finally {
          patchState(store, { loading: false });
        }
      },

      /** What keeps a text from being used, and hints; nothing is saved. */
      check(entry: TextEntry, value: string | string[]): Promise<TextProblem[]> {
        const language = store.catalog()?.language;
        return language ? gtt.checkText(entry.key, value, language) : Promise.resolve([]);
      },

      /** Saves an own text; the same as the pack's is none. */
      save(entry: TextEntry, value: string | string[]): Promise<void> {
        const same = JSON.stringify(value) === JSON.stringify(entry.standard);
        return setOwn(entry.key, same ? undefined : { text: value, base: entry.standard });
      },

      /** Back to the language pack's text. */
      reset(entry: TextEntry): Promise<void> {
        return setOwn(entry.key, undefined);
      },

      /** Keeps the own text after the pack's changed: the notice goes. */
      keep(entry: TextEntry): Promise<void> {
        const own = store.own()[entry.key];
        return own ? setOwn(entry.key, { ...own, base: entry.standard }) : Promise.resolve();
      },

      /** Speaks the text with the voice of who says it. */
      async preview(entry: TextEntry, text: string): Promise<void> {
        const language = store.catalog()?.language;
        if (!language) return;
        patchState(store, { playing: entry.key, error: null });
        try {
          await gtt.previewText(text, language, entry.speaker);
        } catch (err) {
          patchState(store, { error: (err as Error).message });
        } finally {
          if (store.playing() === entry.key) patchState(store, { playing: null });
        }
      },
    };
  }),
);
