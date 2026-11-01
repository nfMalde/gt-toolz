import { Component, computed, inject } from '@angular/core';
import { Links } from '../core/links';
import { markdownToHtml } from '../core/markdown';
import { I18n } from '../i18n/i18n';
import { SettingsStore } from '../stores/settings.store';
import { UpdatesStore } from '../stores/updates.store';
import { Icon } from './icon';

/**
 * A newer version: what changed (its release notes), then "Update" or "Later". The update downloads and checks the
 * installer; Windows runs it and the app restarts, macOS and Linux open the file for the user.
 */
@Component({
  selector: 'gtt-update-dialog',
  imports: [Icon],
  template: `
    @if (updates.open() && updates.status().release; as release) {
      <div class="backdrop" (click)="later()"></div>
      <section class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="t('updates.title', { version: release.version })">
        <div class="head">
          <div class="card-icon accent"><gtt-icon name="download" /></div>
          <div class="grow">
            <div class="eyebrow">{{ t('updates.eyebrow', { current: current() }) }}</div>
            <h2>{{ t('updates.title', { version: release.version }) }}</h2>
          </div>
          @if (release.prerelease) {
            <span class="chip warn">{{ t('updates.prerelease') }}</span>
          }
        </div>
        @if (notes(); as notes) {
          <div class="markdown selectable" [innerHTML]="notes"></div>
        } @else {
          <p class="muted">{{ t('updates.noNotes') }}</p>
        }
        <div class="file faint small">{{ release.file }} · {{ size(release.size) }}</div>

        @switch (updates.status().state) {
          @case ('downloading') {
            <div class="progress" role="progressbar" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100">
              <div class="bar" [style.width.%]="percent()"></div>
            </div>
            <div class="small muted">{{ t('updates.downloading', { n: percent() }) }}</div>
          }
          @case ('installing') {
            <div class="note ok-text">{{ t('updates.installing') }}</div>
          }
          @case ('opened') {
            <div class="note">{{ t(platform() === 'mac' ? 'updates.openedMac' : 'updates.openedLinux') }}</div>
          }
          @case ('error') {
            <div class="note error-text">{{ t('updates.error', { message: updates.status().error ?? '' }) }}</div>
          }
        }

        <div class="foot">
          <button type="button" class="btn ghost" (click)="links.open('releases')"><gtt-icon name="external" [size]="15" />{{ t('updates.onGitHub') }}</button>
          <span class="spacer"></span>
          <button type="button" class="btn" [disabled]="updates.status().state === 'installing'" (click)="later()">{{ t('updates.later') }}</button>
          @if (updates.status().state !== 'opened') {
            <button type="button" class="btn primary" [disabled]="updates.busy()" (click)="updates.install()">
              <gtt-icon name="download" [size]="16" />{{ updates.status().state === 'error' ? t('updates.retry') : t('updates.update') }}
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 75; display: grid; place-items: center; padding: 28px; pointer-events: none; }
    :host:has(.dialog) { pointer-events: auto; }
    .backdrop { position: absolute; inset: 0; background: rgba(var(--shade-rgb), .7); backdrop-filter: blur(4px); }
    .dialog {
      position: relative; width: min(640px, 100%); max-height: 100%; padding: 22px; display: flex; flex-direction: column; gap: 12px;
      border-radius: 18px; border: 1px solid var(--border-strong); background: linear-gradient(180deg, var(--surface-2), var(--surface));
      box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
    }
    .head { display: flex; align-items: center; gap: 12px; }
    .head h2 { margin: 0; }
    .grow { flex: 1; }
    .markdown { overflow: auto; min-height: 0; max-height: 50vh; color: var(--text-2); line-height: 1.5; padding-right: 4px; }
    .progress { height: 8px; border-radius: 4px; background: var(--surface-3); overflow: hidden; }
    .bar { height: 100%; background: var(--accent); transition: width .2s; }
    .note { padding: 10px 12px; border-radius: 10px; background: var(--surface-3); }
    .note.ok-text { color: var(--ok); }
    .foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  `,
})
export class UpdateDialog {
  protected readonly updates = inject(UpdatesStore);
  protected readonly links = inject(Links);
  private readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly current = computed(() => this.settings.info()?.version ?? '');
  protected readonly platform = computed(() => this.settings.info()?.platform);
  protected readonly notes = computed(() => markdownToHtml(this.updates.status().release?.notes ?? ''));
  protected readonly percent = computed(() => Math.round((this.updates.status().progress ?? 0) * 100));

  protected size(bytes: number): string {
    return this.t('updates.size', { mb: this.i18n.number(bytes / 1024 / 1024, 1) });
  }

  protected later(): void {
    if (this.updates.status().state !== 'installing') this.updates.later();
  }
}
