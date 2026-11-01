import { Component, computed, effect, inject, linkedSignal, signal, untracked } from '@angular/core';
import type { TextEntry, TextGroup } from '@gtt/api';
import { I18n, type TextKey } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { TextsStore } from '../../stores/texts.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Toggle } from '../../ui/toggle';
import { TextRow } from './text-row';

/** Areas only the coach says (hidden while it is off); the crew's while the crew is off; the rest both say. */
const COACH_GROUPS = new Set<TextGroup>(['notes', 'plan', 'feedback', 'help', 'slides', 'briefing', 'cheeky', 'calibration']);

/** The short calls, then the areas. */
type Tab = 'quick' | TextGroup;

/**
 * Everything coach and crew say, in the user's words (the user, 2026-10-31: "wie man das nennen soll, kann dann der
 * Nutzer entscheiden"): the short calls first, then every text by area.
 */
@Component({
  selector: 'gtt-texts',
  imports: [Icon, Segmented, Toggle, TextRow],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('texts.eyebrow') }}</div>
          <h1>{{ t('texts.title') }}</h1>
        </div>
      </div>

      <section class="card">
        <p class="muted intro">{{ t('texts.intro') }}</p>
        <div class="toolbar">
          @if (languageOptions().length > 1) {
            <gtt-segmented [options]="languageOptions()" [value]="language()" (valueChange)="language.set($event)" />
          }
          <input class="input search" type="search" spellcheck="false" [placeholder]="t('texts.search')" [attr.aria-label]="t('texts.search')"
                 [value]="search()" (input)="search.set(value($event))" />
          <label class="option"><gtt-toggle [checked]="onlyOwn()" [label]="t('texts.onlyOwn')" (checkedChange)="onlyOwn.set($event)" />{{ t('texts.onlyOwn') }}</label>
          <span class="faint small">{{ t('texts.ownCount', { n: ownCount() }) }}</span>
        </div>
        <p class="faint small">{{ t('texts.recordingsHint') }}</p>
        @if (store.error(); as error) {
          <div class="banner danger" role="alert"><gtt-icon name="alert" /><span>{{ t('common.error', { message: error }) }}</span></div>
        }
      </section>

      @if (store.catalog(); as catalog) {
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="speech" /></div>
            <h2>{{ search().trim() ? t('texts.results') : t('texts.all') }}</h2>
          </div>
          @if (!search().trim()) {
            <div class="sections" role="tablist">
              @for (g of groups(); track g.id) {
                <button type="button" role="tab" class="section-tab focusable" [class.active]="group() === g.id" [attr.aria-selected]="group() === g.id" (click)="group.set(g.id)">
                  {{ groupLabel(g.id) }}
                  @if (g.own) { <span class="count">{{ g.own }}</span> }
                </button>
              }
            </div>
            <p class="faint small">{{ groupHint(group()) }}</p>
          }
          <div class="grid">
            @for (entry of shown(); track entry.key) {
              <gtt-text-row [entry]="entry" [label]="group() === 'quick' && !search().trim() ? quickLabel(entry.key) : ''" [samples]="catalog.samples" />
            } @empty {
              <p class="faint small">{{ t('texts.none') }}</p>
            }
          </div>
        </section>
      } @else if (store.loading()) {
        <p class="faint small">{{ t('texts.loading') }}</p>
      }
    </div>
  `,
  styles: `
    .intro { margin: 0 0 12px; }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; }
    .search { flex: 1; min-width: 200px; }
    .option { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 10px; margin-top: 10px; }
    .sections { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .section-tab {
      appearance: none; font: inherit; font-size: 13px; color: var(--text-2); display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); background: transparent; cursor: pointer;
    }
    .section-tab.active { color: var(--text); border-color: rgba(var(--accent-rgb), .45); background: var(--accent-soft); }
    .count { font-size: 11.5px; color: var(--accent); font-variant-numeric: tabular-nums; }
  `,
})
export class Texts {
  protected readonly settings = inject(SettingsStore);
  protected readonly store = inject(TextsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** The texts of the language the coach speaks, unless another one is picked. */
  protected readonly language = linkedSignal(() => this.settings.speechLanguage('coach'));
  protected readonly search = signal('');
  protected readonly onlyOwn = signal(false);
  /** The short calls first, then the areas. */
  protected readonly group = signal<Tab>('quick');

  protected readonly languageOptions = computed<SegmentOption<string>[]>(() => this.settings.languages().map((l) => ({ value: l.id, label: l.name })));

  /** Areas of the modules that are on. */
  private readonly visible = computed(() => {
    const coach = this.settings.moduleEnabled('coach');
    const crew = this.settings.moduleEnabled('crew');
    return (group: TextGroup) => (group === 'crew' ? crew : COACH_GROUPS.has(group) ? coach : true);
  });

  private readonly entries = computed(() => (this.store.catalog()?.entries ?? []).filter((e) => this.visible()(e.group)));
  private readonly isOwn = (entry: TextEntry) => entry.key in this.store.own();
  private readonly filtered = computed(() => (this.onlyOwn() ? this.entries().filter(this.isOwn) : this.entries()));

  protected readonly ownCount = computed(() => this.entries().filter(this.isOwn).length);

  /** The short calls (the coach's), in their order. */
  private readonly quick = computed(() => {
    const catalog = this.store.catalog();
    if (!catalog || !this.settings.moduleEnabled('coach')) return [];
    const byKey = new Map(this.entries().map((e) => [e.key, e]));
    return catalog.quick.map((key) => byKey.get(key)).filter((e): e is TextEntry => !!e);
  });

  protected readonly groups = computed(() => {
    const ownIn = (entries: TextEntry[]) => entries.filter(this.isOwn).length;
    const areas = (this.store.catalog()?.groups ?? []).filter((id) => this.visible()(id));
    return [
      ...(this.quick().length ? [{ id: 'quick' as Tab, own: ownIn(this.quick()) }] : []),
      ...areas.map((id) => ({ id: id as Tab, own: ownIn(this.entries().filter((e) => e.group === id)) })),
    ];
  });

  /** The tab's texts, or what the search finds in every area (key, the pack's text, the own one). */
  protected readonly shown = computed(() => {
    const query = this.search().trim().toLocaleLowerCase();
    if (!query) {
      const tab = this.group();
      const inTab = tab === 'quick' ? this.quick() : this.entries().filter((e) => e.group === tab);
      return this.onlyOwn() ? inTab.filter(this.isOwn) : inTab;
    }
    const own = this.store.own();
    const words = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join(' ') : (value ?? '')).toLocaleLowerCase();
    return this.filtered().filter((e) => e.key.toLowerCase().includes(query) || words(e.standard).includes(query) || words(own[e.key]?.text).includes(query));
  });

  constructor() {
    effect(() => {
      const language = this.language();
      untracked(() => void this.store.load(language));
    });
    // An area of a module switched off: back to the first.
    effect(() => {
      const groups = this.groups();
      if (groups.length && !groups.some((g) => g.id === this.group())) this.group.set(groups[0]!.id);
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected quickLabel(key: string): string {
    return this.t(`texts.quick.${key}` as TextKey);
  }

  protected groupLabel(tab: Tab): string {
    return this.t(tab === 'quick' ? 'texts.quick' : (`texts.group.${tab}` as TextKey));
  }

  protected groupHint(tab: Tab): string {
    return this.t(tab === 'quick' ? 'texts.quickHint' : (`texts.groupHint.${tab}` as TextKey));
  }
}
