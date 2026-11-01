import { Component, computed, inject, signal } from '@angular/core';
import type { VoiceRole } from '@gtt/api';
import { I18n } from '../../i18n/i18n';
import { CoachStore } from '../../stores/coach.store';
import { SettingsStore } from '../../stores/settings.store';
import { VoicesStore } from '../../stores/voices.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Slider } from '../../ui/slider';
import { VoicePackages } from './voice-packages';
import { RecordingPicker } from './recording-picker';
import { VoicePicker } from './voice-picker';

@Component({
  selector: 'gtt-voices',
  imports: [Icon, Slider, VoicePicker, RecordingPicker, VoicePackages, Segmented],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('voices.eyebrow') }}</div>
          <h1>{{ t('voices.title') }}</h1>
        </div>
      </div>

      <!-- Roles: coach, race crew, stand-in -->
      <div class="roles">
        <button type="button" class="role focusable" [class.active]="role() === 'coach'" (click)="role.set('coach')">
          <div class="card-icon accent"><gtt-icon name="headphones" /></div>
          <div>
            <div class="role-name">{{ t('voices.role.coach') }}</div>
            <div class="faint small">{{ t('voices.role.coachHint') }}</div>
          </div>
        </button>
        <button type="button" class="role focusable" [class.active]="role() === 'crew'" (click)="role.set('crew')">
          <div class="card-icon accent"><gtt-icon name="users" /></div>
          <div>
            <div class="role-name">{{ t('voices.role.crew') }}</div>
            <div class="faint small">{{ t('voices.role.crewHint') }}</div>
          </div>
        </button>
        <button type="button" class="role focusable" [class.active]="role() === 'standin'" (click)="role.set('standin')">
          <div class="card-icon accent"><gtt-icon name="refresh" /></div>
          <div>
            <div class="role-name">{{ t('voices.role.standin') }}</div>
            <div class="faint small">{{ t('voices.role.standinHint') }}</div>
          </div>
        </button>
      </div>

      <div class="columns">
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="mic" /></div>
            <h2>{{ t('voices.forLanguage', { language: languageName() }) }}</h2>
          </div>
          @if (role() === 'standin') {
            <p class="faint small speaks">{{ t('voices.standinLanguage') }}</p>
          } @else {
            <div class="setting speaks">
              <div class="text"><div class="title">{{ t('voices.speaks') }}</div></div>
              <div class="control">
                <gtt-segmented [options]="speechLanguageOptions()" [value]="roleLanguageSetting()"
                               (valueChange)="settings.update(role() === 'crew' ? { crewLanguage: $event } : { coachLanguage: $event })" />
              </div>
            </div>
          }
          <gtt-voice-picker [role]="role()" />
        </section>

        <div class="stack">
          <section class="card">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon name="wave" /></div>
              <h2>{{ t('voices.recordings') }}</h2>
            </div>
            <gtt-recording-picker [role]="role()" />
          </section>

          <section class="card">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon name="sliders" /></div>
              <h2>{{ t('voices.style') }}</h2>
            </div>
            @if (style(); as style) {
              <div class="setting">
                <div class="text"><div class="title">{{ t('voices.rate') }}</div></div>
                <div class="control wide">
                  <gtt-slider [value]="style.rate" [min]="-5" [max]="5" [format]="signed" [label]="t('voices.rate')"
                              (changed)="settings.setVoiceStyle(role(), { rate: $event })" />
                </div>
              </div>
              <div class="setting">
                <div class="text"><div class="title">{{ t('voices.pitch') }}</div></div>
                <div class="control wide">
                  <gtt-slider [value]="style.pitch" [min]="-30" [max]="50" [step]="5" [format]="percent" [label]="t('voices.pitch')"
                              (changed)="settings.setVoiceStyle(role(), { pitch: $event })" />
                </div>
              </div>
              <div class="setting">
                <div class="text">
                  <div class="title">{{ t('voices.commaPause') }}</div>
                  <div class="hint">{{ t('voices.pauseHint') }}</div>
                </div>
                <div class="control wide">
                  <gtt-slider [value]="style.commaPause" [min]="0" [max]="1.5" [step]="0.05" [format]="seconds" [label]="t('voices.commaPause')"
                              (changed)="settings.setVoiceStyle(role(), { commaPause: $event })" />
                </div>
              </div>
              <div class="setting">
                <div class="text"><div class="title">{{ t('voices.sentencePause') }}</div></div>
                <div class="control wide">
                  <gtt-slider [value]="style.sentencePause" [min]="0" [max]="2" [step]="0.05" [format]="seconds" [label]="t('voices.sentencePause')"
                              (changed)="settings.setVoiceStyle(role(), { sentencePause: $event })" />
                </div>
              </div>
              <div class="setting">
                <div class="text"></div>
                <div class="control">
                  @if (role() === 'coach') {
                    <button type="button" class="btn" [disabled]="coach.coachVoice()?.state !== 'ready'" (click)="coach.testAudio()">
                      <gtt-icon name="play" [size]="16" />{{ t('settings.test') }}
                    </button>
                  }
                </div>
              </div>
            }
          </section>

          <section class="card">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon name="download" /></div>
              <h2>{{ t('voices.packages') }}</h2>
            </div>
            <gtt-voice-packages />
          </section>
        </div>
      </div>
    </div>
  `,
  styles: `
    .roles { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .role {
      appearance: none; font: inherit; color: inherit; text-align: left; display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; border-radius: var(--radius); border: 1px solid var(--border); background: var(--surface);
      cursor: pointer; transition: border-color .15s, background .15s;
    }
    .role.active { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .09), var(--surface) 70%); }
    .role:disabled { cursor: default; opacity: .65; }
    .role-name { font-weight: 650; }
    .soon { margin-left: auto; }
    .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .columns { grid-template-columns: 1fr; } }
  `,
})
export class Voices {
  protected readonly settings = inject(SettingsStore);
  protected readonly coach = inject(CoachStore);
  private readonly voices = inject(VoicesStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly role = signal<VoiceRole>('coach');
  protected readonly style = computed(() => this.settings.settings()?.voices[this.role()]);
  /** '' = like the app, else a language id. */
  protected readonly speechLanguageOptions = computed<SegmentOption<string>[]>(() => [
    { value: '', label: this.t('settings.languageApp') },
    ...this.settings.languages().map((l) => ({ value: l.id, label: l.name })),
  ]);
  protected readonly roleLanguageSetting = computed(() => {
    const s = this.settings.settings();
    return s ? (this.role() === 'crew' ? s.crewLanguage : s.coachLanguage) : '';
  });

  protected readonly languageName = computed(
    () => {
      const language = this.settings.speechLanguage(this.role());
      return this.settings.languages().find((l) => l.id === language)?.name ?? language;
    },
  );

  protected readonly signed = (value: number) => (value > 0 ? `+${value}` : String(value));
  protected readonly percent = (value: number) => `${value > 0 ? '+' : ''}${value} %`;
  protected readonly seconds = (value: number) => `${value.toLocaleString(this.settings.language(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;

  constructor() {
    void this.voices.load();
  }
}
