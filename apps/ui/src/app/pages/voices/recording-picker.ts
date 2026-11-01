import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { NameNotRecorded, VoiceRole } from '@gtt/api';
import { I18n } from '../../i18n/i18n';
import { RecordingsStore } from '../../stores/recordings.store';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';

/** The user's own recordings for a role, in the language it speaks: on top of the voice, never instead of it. */
@Component({
  selector: 'gtt-recording-picker',
  imports: [Icon, RouterLink, Segmented],
  template: `
    <p class="faint small">{{ t('voices.recordingsHint') }}</p>
    <div class="list" role="radiogroup">
      <button type="button" role="radio" class="item focusable" [class.selected]="!chosen()" [attr.aria-checked]="!chosen()" (click)="choose('')">
        <span class="radio"></span>
        <span class="name">{{ t('voices.recordingsNone') }}</span>
      </button>
      @for (pack of packs(); track pack.id) {
        <button type="button" role="radio" class="item focusable" [class.selected]="chosen() === pack.id" [attr.aria-checked]="chosen() === pack.id" (click)="choose(pack.id)">
          <span class="radio"></span>
          <span class="text">
            <span class="name">{{ pack.name }}</span>
            <span class="faint small">{{ t('voices.recordingsCount', { n: pack.recordings }) }}@if (pack.speaker) { · {{ pack.speaker }} }</span>
          </span>
        </button>
      }
    </div>
    @if (!packs().length) {
      <p class="faint small">{{ t('voices.recordingsEmpty', { language: languageName() }) }}</p>
    }
    <a class="btn sm ghost manage" routerLink="/recordings"><gtt-icon name="wave" [size]="14" />{{ t('voices.recordingsManage') }}</a>
    @if (chosen()) {
      <div class="setting">
        <div class="text">
          <div class="title">{{ t('voices.nameNotRecorded') }}</div>
          <div class="hint">{{ t('voices.nameNotRecordedHint') }}</div>
        </div>
        <div class="control">
          <gtt-segmented [options]="nameOptions()" [value]="settings.settings()?.nameNotRecorded ?? 'leave-out'"
                         (valueChange)="settings.update({ nameNotRecorded: $event })" />
        </div>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .manage { align-self: flex-start; }
    p { margin: 0; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .item {
      appearance: none; font: inherit; color: inherit; text-align: left; display: flex; align-items: center; gap: 10px;
      padding: 8px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer;
    }
    .item.selected { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .08), transparent 70%); }
    .radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-strong); flex: none; display: grid; place-items: center; }
    .selected .radio { border-color: var(--accent); }
    .selected .radio::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent-gradient); }
    .text { display: flex; flex-direction: column; min-width: 0; }
    .name { font-weight: 650; }
  `,
})
export class RecordingPicker {
  readonly role = input<VoiceRole>('coach');

  protected readonly settings = inject(SettingsStore);
  private readonly recordings = inject(RecordingsStore);
  protected readonly t = inject(I18n).t;

  private readonly language = computed(() => this.settings.speechLanguage(this.role()));
  /** Packs in the language this role speaks (one pack speaks one language). */
  protected readonly packs = computed(() => this.recordings.packs().filter((p) => p.language === this.language()));
  protected readonly chosen = computed(() => {
    const id = this.settings.settings()?.voices[this.role()].recordings?.[this.language()] ?? '';
    return this.packs().some((p) => p.id === id) ? id : '';
  });
  protected readonly languageName = computed(() => this.settings.languages().find((l) => l.id === this.language())?.name ?? this.language());
  protected readonly nameOptions = computed<SegmentOption<NameNotRecorded>[]>(() => [
    { value: 'leave-out', label: this.t('voices.nameNotRecorded.leave-out') },
    { value: 'voice', label: this.t('voices.nameNotRecorded.voice') },
  ]);

  constructor() {
    void this.recordings.load();
  }

  protected choose(id: string): void {
    void this.settings.setRecordings(this.role(), id);
  }
}
