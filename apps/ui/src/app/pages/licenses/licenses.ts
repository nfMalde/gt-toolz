import { Component, computed, inject, resource, signal } from '@angular/core';
import type { LicenseEntry } from '@gtt/api';
import { GTT } from '../../core/gtt';
import { I18n, type TextKey } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { Icon, type IconName } from '../../ui/icon';

const GROUPS: { id: LicenseEntry['shipped']; title: TextKey; hint: TextKey; icon: IconName }[] = [
  { id: 'bundled', title: 'licenses.group.bundled', hint: 'licenses.group.bundledHint', icon: 'pc' },
  { id: 'data', title: 'licenses.group.data', hint: 'licenses.group.dataHint', icon: 'route' },
  { id: 'download', title: 'licenses.group.download', hint: 'licenses.group.downloadHint', icon: 'download' },
  { id: 'credit', title: 'licenses.group.credit', hint: 'licenses.group.creditHint', icon: 'heart' },
];

/** Third-party licenses: everything the app ships, the data it includes, the optional downloads and credits, with full texts. */
@Component({
  selector: 'gtt-licenses',
  imports: [Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('about.eyebrow') }}</div>
          <h1>{{ t('licenses.title') }}</h1>
          <p class="muted intro">{{ t('licenses.intro') }}</p>
        </div>
        <div class="actions row wrap">
          <button type="button" class="btn" (click)="toggleAll()">
            <gtt-icon [name]="allOpen() ? 'chevronDown' : 'chevronRight'" [size]="15" />{{ allOpen() ? t('licenses.collapseAll') : t('licenses.expandAll') }}
          </button>
          <button type="button" class="btn" (click)="chromium()"><gtt-icon name="external" [size]="15" />{{ t('about.chromium') }}</button>
        </div>
      </div>

      @for (group of groups(); track group.id) {
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon [name]="group.icon" /></div>
            <div>
              <h2>{{ t(group.title) }}</h2>
              <p class="faint small">{{ t(group.hint) }}</p>
            </div>
          </div>
          <div class="licenses">
            @for (entry of group.entries; track entry.name) {
              <div class="license">
                <div class="license-row">
                  <div class="license-name">
                    <b>{{ entry.name }}</b>
                    @if (entry.version) { <span class="faint mono small">{{ entry.version }}</span> }
                  </div>
                  <span class="faint small usage">{{ usedFor(entry) }}</span>
                  <span class="chip">{{ entry.license }}</span>
                  @if (entry.text) {
                    <button type="button" class="btn sm ghost" (click)="toggle(entry.name)">
                      {{ open().has(entry.name) ? t('about.hideText') : t('about.showText') }}
                      <gtt-icon [name]="open().has(entry.name) ? 'chevronDown' : 'chevronRight'" [size]="14" />
                    </button>
                  }
                </div>
                @if (entry.notice; as notice) {
                  <div class="notice faint small">
                    {{ noticeText(notice) }}
                    @if (notice === 'chromium') {
                      <button type="button" class="link" (click)="chromium()">{{ t('about.chromium') }}</button>
                    }
                  </div>
                }
                @if (entry.url) {
                  <div class="faint small mono selectable">{{ entry.url }}</div>
                }
                @if (open().has(entry.name) && entry.text) {
                  <pre class="license-text selectable">{{ entry.text }}</pre>
                }
              </div>
            }
          </div>
        </section>
      }

      @if (settings.info(); as info) {
        <p class="faint small">{{ t('about.system') }}: Electron {{ info.electron }} · Chromium {{ info.chrome }} · Node.js {{ info.node }}</p>
      }
    </div>
  `,
  styles: `
    .intro { max-width: 720px; margin: 6px 0 0; }
    .licenses { display: flex; flex-direction: column; }
    .license { padding: 12px 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; }
    .license:first-child { border-top: 0; }
    .license-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .license-name { display: flex; gap: 8px; align-items: baseline; min-width: 220px; }
    .usage { flex: 1; }
    .license-text {
      margin: 8px 0 0; padding: 14px; border-radius: 10px; background: var(--bg-elevated); border: 1px solid var(--border);
      max-height: 280px; overflow: auto; white-space: pre-wrap; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-2);
    }
    .link { appearance: none; border: 0; background: none; color: var(--accent); font: inherit; cursor: pointer; padding: 0; text-decoration: underline; }
  `,
})
export class Licenses {
  protected readonly settings = inject(SettingsStore);
  private readonly gtt = inject(GTT);
  protected readonly t = inject(I18n).t;

  private readonly licenses = resource({ loader: () => this.gtt.licenses() });

  /** The groups that have entries, in a fixed order. */
  protected readonly groups = computed(() => {
    const entries = this.licenses.value() ?? [];
    return GROUPS.map((group) => ({ ...group, entries: entries.filter((e) => e.shipped === group.id) })).filter((g) => g.entries.length);
  });

  /** License texts that are expanded. */
  protected readonly open = signal(new Set<string>());
  private readonly withText = computed(() => (this.licenses.value() ?? []).filter((e) => e.text).map((e) => e.name));
  protected readonly allOpen = computed(() => this.withText().length > 0 && this.withText().every((name) => this.open().has(name)));

  protected toggle(name: string): void {
    const next = new Set(this.open());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.open.set(next);
  }

  protected toggleAll(): void {
    this.open.set(this.allOpen() ? new Set() : new Set(this.withText()));
  }

  protected usedFor(entry: LicenseEntry): string {
    return this.t(`about.usedFor.${entry.usedFor}` as TextKey);
  }

  protected noticeText(notice: string): string {
    return this.t(`about.notice.${notice}` as TextKey);
  }

  protected chromium(): void {
    void this.gtt.openChromiumLicenses();
  }
}
