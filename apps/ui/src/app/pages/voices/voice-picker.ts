import { Component, computed, inject, input } from '@angular/core';
import type { VoiceChoice, VoiceRole } from '@gtt/api';
import { voiceName } from '../../core/format';
import { I18n, type TextKey } from '../../i18n/i18n';
import { CoachStore } from '../../stores/coach.store';
import { SettingsStore } from '../../stores/settings.store';
import { VoicesStore } from '../../stores/voices.store';
import { Icon } from '../../ui/icon';

/** Picks the voice of a role for the current language; every voice can be listened to first. */
@Component({
  selector: 'gtt-voice-picker',
  imports: [Icon],
  template: `
    <div class="voice-list" role="radiogroup">
      <button type="button" role="radio" class="voice focusable" [class.selected]="!chosen()" [attr.aria-checked]="!chosen()" (click)="choose('')">
        <span class="radio"></span>
        <span class="voice-text">
          <span class="voice-name">{{ t('voices.auto') }}</span>
          <span class="faint small">{{ t('voices.autoHint') }}@if (!chosen() && activeName()) { · {{ activeName() }} }</span>
        </span>
      </button>

      @for (group of groups(); track group.label) {
        @if (group.voices.length) {
          <div class="group-label eyebrow">{{ t(group.label) }}</div>
          @for (voice of group.voices; track voice.id) {
            <div class="voice" [class.selected]="chosen() === voice.id" [class.unavailable]="!voice.installed">
              <button type="button" role="radio" class="voice-main focusable" [disabled]="!voice.installed"
                      [attr.aria-checked]="chosen() === voice.id" (click)="choose(voice.id)">
                <span class="radio"></span>
                <span class="voice-text">
                  <span class="voice-name">{{ voice.label ?? name(voice.id) }}</span>
                  <span class="faint small">
                    {{ engineLabel(voice) }} · {{ voice.language }}@if (voice.gender) { · {{ gender(voice.gender) }} }
                    @if (!voice.installed) { · {{ t('voices.notInstalled') }} }
                  </span>
                </span>
              </button>
              @if (voice.installed) {
                <button type="button" class="btn sm ghost" [disabled]="!!voices.previewing()" (click)="voices.preview(voice.id, role())">
                  <gtt-icon [name]="voices.previewing() === voice.id ? 'volume' : 'play'" [size]="14" />{{ t('voices.preview') }}
                </button>
              }
              @if (activeId() === voice.id) {
                <span class="chip ok">{{ t('voices.current') }}</span>
              }
            </div>
          }
        }
      }
      @if (!forRole().length && !voices.loading()) {
        <p class="muted small">{{ t('voices.none') }}</p>
      }
    </div>
  `,
  styles: `
    .voice-list { display: flex; flex-direction: column; gap: 6px; }
    .group-label { margin: 12px 0 2px; }
    .voice {
      display: flex; align-items: center; gap: 10px; padding: 6px 10px 6px 6px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--bg-elevated); transition: border-color .15s, background .15s;
    }
    button.voice { appearance: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 6px 10px; }
    .voice:hover { border-color: var(--border-strong); }
    .voice.selected { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .08), transparent 70%); }
    .voice.unavailable { opacity: .6; }
    .voice-main {
      appearance: none; border: 0; background: transparent; color: inherit; font: inherit; text-align: left;
      display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; padding: 4px; cursor: pointer; border-radius: 8px;
    }
    .voice-main:disabled { cursor: default; }
    .radio {
      width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-strong); flex: none;
      display: grid; place-items: center; transition: border-color .15s;
    }
    .selected .radio { border-color: var(--accent); }
    .selected .radio::after { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--accent-gradient); }
    .voice-text { display: flex; flex-direction: column; min-width: 0; }
    .voice-name { font-weight: 650; }
  `,
})
export class VoicePicker {
  readonly role = input<VoiceRole>('coach');

  protected readonly voices = inject(VoicesStore);
  private readonly settings = inject(SettingsStore);
  private readonly coach = inject(CoachStore);
  protected readonly t = inject(I18n).t;
  protected readonly name = voiceName;

  /** The user's choice for the language this role speaks ('' = automatic). */
  protected readonly chosen = computed(() => {
    const s = this.settings.settings();
    return s ? (s.voices[this.role()].byLanguage[this.settings.speechLanguage(this.role())] ?? '') : '';
  });

  /** Voices for the language this role speaks, installed ones first. */
  protected readonly forRole = computed(() => {
    const language = this.settings.speechLanguage(this.role()).split('-')[0]!;
    return this.voices
      .voices()
      .filter((v) => v.language.toLowerCase().startsWith(language))
      .sort((a, b) => Number(b.installed) - Number(a.installed));
  });

  /** The voice that actually speaks (automatic resolves to one). */
  protected readonly activeId = computed(() => this.coach.status()?.voices[this.role()]?.id ?? '');
  protected readonly activeName = computed(() => voiceName(this.activeId()));

  protected readonly groups = computed<{ label: TextKey; voices: VoiceChoice[] }[]>(() => {
    const all = this.forRole();
    return [
      { label: 'voices.group.neural', voices: all.filter((v) => v.engine === 'piper' || v.engine === 'sherpa') },
      { label: 'voices.group.windows', voices: all.filter((v) => v.engine === 'onecore' || v.engine === 'sapi') },
      { label: 'voices.group.macos', voices: all.filter((v) => v.engine === 'macos') },
    ];
  });

  protected choose(id: string): void {
    void this.settings.setVoice(this.role(), id);
  }

  protected engineLabel(voice: VoiceChoice): string {
    return this.t(`voices.engine.${voice.engine}`);
  }

  protected gender(gender: string): string {
    return gender === 'female' ? this.t('voices.female') : gender === 'male' ? this.t('voices.male') : gender;
  }
}
