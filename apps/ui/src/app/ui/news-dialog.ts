import { Component, computed, effect, inject, signal } from '@angular/core';
import { markdownToHtml } from '../core/markdown';
import { I18n } from '../i18n/i18n';
import { SettingsStore } from '../stores/settings.store';
import { UpdatesStore } from '../stores/updates.store';
import { Icon } from './icon';
import { Toggle } from './toggle';

/**
 * What is new: every version ships its news (public/news/<version>.<language>.md), shown once after the first start of
 * that version. The first time it also asks whether the app may look for updates (ticked; the user can untick it).
 */
@Component({
  selector: 'gtt-news-dialog',
  imports: [Icon, Toggle],
  template: `
    @if (visible()) {
      <div class="backdrop"></div>
      <section class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="t('news.title', { version: version() })">
        <div class="head">
          <div class="card-icon accent"><gtt-icon name="sparkle" /></div>
          <div>
            <div class="eyebrow">{{ t('news.eyebrow') }}</div>
            <h2>{{ t('news.title', { version: version() }) }}</h2>
          </div>
        </div>
        @if (html(); as html) {
          <div class="markdown selectable" [innerHTML]="html"></div>
        }
        @if (asking()) {
          <div class="ask">
            <div class="text">
              <div class="title">{{ t('updates.checkSetting') }}</div>
              <div class="hint">{{ t('updates.askHint') }}</div>
            </div>
            <gtt-toggle [checked]="lookForUpdates()" [label]="t('updates.checkSetting')" (checkedChange)="lookForUpdates.set($event)" />
          </div>
        }
        <div class="foot">
          <span class="spacer"></span>
          <button type="button" class="btn primary" (click)="done()"><gtt-icon name="check" [size]="16" />{{ t('news.ok') }}</button>
        </div>
      </section>
    }
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 28px; pointer-events: none; }
    :host:has(.dialog) { pointer-events: auto; }
    .backdrop { position: absolute; inset: 0; background: rgba(var(--shade-rgb), .7); backdrop-filter: blur(4px); }
    .dialog {
      position: relative; width: min(600px, 100%); max-height: 100%; padding: 22px; display: flex; flex-direction: column; gap: 14px;
      border-radius: 18px; border: 1px solid var(--border-strong); background: linear-gradient(180deg, var(--surface-2), var(--surface));
      box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
    }
    .head { display: flex; align-items: center; gap: 12px; }
    .head h2 { margin: 0; }
    .markdown { overflow: auto; min-height: 0; color: var(--text-2); line-height: 1.5; }
    .ask { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-3); }
    .ask .text { flex: 1; }
    .ask .title { font-weight: 600; }
    .ask .hint { font-size: 12px; color: var(--text-3); }
    .foot { display: flex; align-items: center; gap: 10px; }
  `,
})
export class NewsDialog {
  private readonly settings = inject(SettingsStore);
  private readonly updates = inject(UpdatesStore);
  protected readonly t = inject(I18n).t;
  protected readonly version = computed(() => this.settings.info()?.version ?? '');
  /** The news text of this version in the app's language (English when there is none in it). */
  private readonly news = signal<string | undefined>(undefined);
  protected readonly html = computed(() => {
    const news = this.news();
    return news ? markdownToHtml(news) : '';
  });
  protected readonly lookForUpdates = signal(true);
  private readonly closed = signal(false);
  /** The update question, once: only builds that can look for updates ask it. */
  protected readonly asking = computed(() => this.updates.status().available && !this.settings.settings()?.updateAsked);
  protected readonly visible = computed(() => {
    const s = this.settings.settings();
    const version = this.version();
    if (this.closed() || !s || !version || this.settings.welcomeOpen() || this.settings.guideOpen() || this.settings.tourOpen()) return false;
    return s.newsSeen !== version && (!!this.news() || this.asking());
  });

  constructor() {
    effect(() => {
      const version = this.version();
      const language = this.settings.language();
      if (version) void this.load(version, language);
    });
  }

  protected done(): void {
    this.closed.set(true);
    const asked = this.asking();
    void this.settings.update({ newsSeen: this.version(), ...(asked ? { updateAsked: true, updateCheck: this.lookForUpdates() } : {}) });
  }

  private async load(version: string, language: string): Promise<void> {
    for (const lang of [language, 'en']) {
      const text = await newsFile(`news/${version}.${lang}.md`);
      if (text) return this.news.set(text);
    }
    this.news.set(undefined);
  }
}

/** A news file shipped with the UI; undefined when there is none (unknown paths answer with the app's page). */
async function newsFile(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url);
    if (!response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) return undefined;
    return await response.text();
  } catch {
    return undefined;
  }
}
