import { Component, computed, inject, signal } from '@angular/core';
import type { SampleGroup, SampleInfo } from '@gtt/api';
import { voiceName } from '../../core/format';
import { GTT } from '../../core/gtt';
import { I18n, type TextKey } from '../../i18n/i18n';
import { CoachStore } from '../../stores/coach.store';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';

const GROUPS: { id: SampleGroup; icon: 'flag' | 'alert' | 'timer' | 'mic' | 'steering' | 'sparkle' | 'info' | 'users' | 'heart' | 'refresh' }[] = [
  { id: 'corner', icon: 'flag' },
  { id: 'feedback', icon: 'alert' },
  { id: 'help', icon: 'heart' },
  { id: 'slides', icon: 'refresh' },
  { id: 'lap', icon: 'timer' },
  { id: 'briefing', icon: 'mic' },
  { id: 'debrief', icon: 'steering' },
  { id: 'cheeky', icon: 'sparkle' },
  { id: 'crew', icon: 'users' },
  { id: 'session', icon: 'info' },
];

/** The setting or situation each sample belongs to. */
const LABELS: Record<string, TextKey> = {
  'intro-full': 'settings.intro',
  'intro-40': 'settings.intro',
  shape: 'settings.cornerShape',
  'plan-full': 'settings.plan',
  'plan-short': 'listen.planShort',
  countdown: 'settings.countdown',
  'turn-first': 'listen.turnFirst',
  gear: 'settings.gearAfter',
  turn: 'settings.turnIn',
  'note-flat': 'listen.noteFlat',
  'note-lift': 'listen.noteLift',
  'feedback-long': 'listen.feedbackLong',
  'feedback-short': 'listen.feedbackShort',
  'feedback-tiny': 'listen.feedbackTiny',
  'feedback-after': 'listen.feedbackAfter',
  'feedback-intro': 'listen.feedbackIntro',
  'feedback-resolved': 'listen.feedbackResolved',
  'slide-throttle': 'listen.slide.throttle',
  'slide-grass': 'listen.slide.grass',
  'slide-brake': 'listen.slide.brake',
  'slide-pendulum': 'listen.slide.pendulum',
  'slide-race': 'listen.slide.race',
  'help-tip': 'listen.help.tip',
  'help-tip-short': 'listen.help.tipShort',
  'help-tip-tiny': 'listen.help.tipTiny',
  'help-assist': 'listen.help.assist',
  'help-wait': 'listen.help.wait',
  'help-target': 'listen.help.target',
  'help-throttle': 'listen.help.throttle',
  'help-trail': 'listen.help.trail',
  'help-release': 'listen.help.release',
  'help-guide': 'listen.help.guide',
  'help-better': 'listen.help.better',
  'help-focus-start': 'listen.help.focusStart',
  'help-focus-done': 'listen.help.focusDone',
  'help-focus-end': 'listen.help.focusEnd',
  'lap-faster': 'settings.lapDelta',
  'lap-slower': 'settings.lapDelta',
  'lap-target': 'settings.lapDelta',
  'ghost-sector': 'settings.ghostSectors',
  'cheeky-relief': 'listen.relief',
  'cheeky-escalation': 'listen.escalation',
  'cheeky-quit': 'listen.quit',
  'cheeky-standin': 'listen.standIn',
  'cheeky-standin-quit': 'listen.standInQuit',
  'cheeky-comeback': 'listen.comeback',
  'debrief-bonus': 'listen.debriefBonus',
  'crew-quit': 'listen.crew.quit',
  'crew-boss': 'listen.crew.boss',
  'crew-comeback': 'listen.crew.comeback',
  'crew-sector': 'listen.crew.sector',
  'crew-lap': 'listen.crew.lap',
  'crew-lap-slower': 'listen.crew.lap',
  'crew-position': 'listen.crew.position',
  'crew-fuel': 'listen.crew.fuel',
  'crew-fuel-finish': 'listen.crew.fuel',
  'crew-tyres': 'listen.crew.tyres',
  'crew-tyres-fuel': 'listen.crew.tyres',
  'crew-hot': 'listen.crew.tyres',
  'crew-tyres-cold': 'listen.crew.tyres',
  'crew-tyres-warm': 'listen.crew.tyres',
  'crew-tyres-hot': 'listen.crew.tyres',
  'crew-tyres-rising': 'listen.crew.tyres',
  'crew-tyres-falling': 'listen.crew.tyres',
};

/** Sound check: plays everything the coach can say, one by one or all in a row. */
@Component({
  selector: 'gtt-listen',
  imports: [Icon],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('listen.eyebrow') }}</div>
          <h1>{{ t('listen.title') }}</h1>
        </div>
        <div class="actions">
          @if (playingAll()) {
            <button type="button" class="btn danger" (click)="stop()"><gtt-icon name="stop" [size]="16" />{{ t('listen.stop') }}</button>
          } @else {
            <button type="button" class="btn primary" [disabled]="!ready()" (click)="playAll()"><gtt-icon name="play" [size]="16" />{{ t('listen.playAll') }}</button>
          }
        </div>
      </div>

      <div class="banner info">
        <gtt-icon name="headphones" />
        <span>
          <b>{{ voice() }}</b> · {{ style() }} · {{ t('listen.info') }}
        </span>
      </div>
      @if (!ready()) {
        <div class="banner warn"><gtt-icon name="mic" /><span>{{ t('listen.notReady') }}</span></div>
      }

      <div class="groups">
        @for (group of groups(); track group.id) {
          <section class="card" [class.wide]="group.id === 'corner'">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon [name]="group.icon" /></div>
              <h2>{{ t(groupKey(group.id)) }}</h2>
            </div>
            @if (group.id === 'help') {
              <p class="faint small hint">{{ t('listen.helpHint') }}</p>
            }
            @if (group.id === 'cheeky') {
              <p class="faint small hint">{{ cheekyOn() ? t('listen.cheekyHint') : t('listen.cheekyOff') }}</p>
            }
            <div class="samples">
              @for (sample of group.samples; track sample.id) {
                <div class="sample" [class.playing]="playing() === sample.id" [class.sequence]="sample.sequence">
                  <button type="button" class="btn icon-only play" [class.primary]="sample.sequence" [disabled]="!ready()" [attr.data-sample]="sample.id"
                          [title]="sample.text" (click)="playing() === sample.id ? stop() : play(sample)">
                    <gtt-icon [name]="playing() === sample.id ? 'stop' : 'play'" [size]="16" />
                  </button>
                  <div class="sample-text">
                    @if (sample.sequence) {
                      <div class="label-line">{{ t('listen.sequence') }}</div>
                    }
                    @if (label(sample); as label) {
                      <div class="label-line">{{ label }}</div>
                    }
                    <div class="said" [class.dim]="!sample.text">{{ sample.text ? '„' + sample.text + '“' : t('listen.tone') }}</div>
                  </div>
                  @if (playing() === sample.id) {
                    <span class="bars"><i></i><i></i><i></i></span>
                  }
                </div>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    .card.wide { grid-column: 1 / -1; }
    @media (max-width: 1180px) { .groups { grid-template-columns: 1fr; } }
    .hint { margin: -6px 0 10px; }
    .samples { display: flex; flex-direction: column; gap: 6px; }
    .sample {
      display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 8px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--bg-elevated); transition: border-color .15s, background .15s;
    }
    .sample.playing { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .08), transparent 70%); }
    .sample.sequence { padding: 12px 14px 12px 10px; }
    .play { flex: none; border-radius: 50%; width: 34px; height: 34px; }
    .sample-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .label-line { font-size: 11.5px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; color: var(--text-3); }
    .said { font-size: 13.5px; user-select: text; }
    .said.dim { color: var(--text-2); }
    .bars { display: inline-flex; gap: 3px; align-items: flex-end; height: 16px; flex: none; }
    .bars i { width: 3px; background: var(--accent); border-radius: 2px; animation: bar .8s ease-in-out infinite; }
    .bars i:nth-child(2) { animation-delay: .15s; }
    .bars i:nth-child(3) { animation-delay: .3s; }
    @keyframes bar { 0%, 100% { height: 4px; } 50% { height: 16px; } }
  `,
})
export class Listen {
  private readonly gtt = inject(GTT);
  private readonly coach = inject(CoachStore);
  private readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;

  protected readonly samples = signal<SampleInfo[]>([]);
  protected readonly playing = signal<string | null>(null);
  protected readonly playingAll = signal(false);
  private stopped = false;

  protected readonly ready = computed(() => this.coach.coachVoice()?.state === 'ready');
  protected readonly voice = computed(() => voiceName(this.coach.coachVoice()?.name ?? '') || '–');
  protected readonly cheekyOn = computed(() => this.settings.settings()?.style === 'cheeky');
  protected readonly style = computed(() => this.t(this.cheekyOn() ? 'settings.style.cheeky' : 'settings.style.neutral'));

  protected readonly groups = computed(() =>
    GROUPS.map((group) => ({ ...group, samples: this.samples().filter((s) => s.group === group.id) })).filter((g) => g.samples.length),
  );

  constructor() {
    void this.load();
  }

  protected groupKey(group: SampleGroup): TextKey {
    return `listen.group.${group}` as TextKey;
  }

  /** Which setting or situation a sample belongs to (not obvious from the text). */
  protected label(sample: SampleInfo): string {
    const level = /^cheeky-(\d)$/.exec(sample.id)?.[1];
    if (level) return this.t('listen.level', { n: level });
    const off = /^crew-off-(\d)$/.exec(sample.id)?.[1];
    if (off) return this.t('listen.crew.off', { n: off });
    const key = LABELS[sample.id];
    return key ? this.t(key) : '';
  }

  protected async play(sample: SampleInfo): Promise<void> {
    this.playing.set(sample.id);
    try {
      await this.gtt.playSample(sample.id);
    } finally {
      if (this.playing() === sample.id) this.playing.set(null);
    }
    // Cheeky remarks are picked anew every time: show the next ones.
    if (sample.group === 'cheeky' && !this.playingAll()) void this.load();
  }

  protected async playAll(): Promise<void> {
    this.stopped = false;
    this.playingAll.set(true);
    try {
      for (const group of this.groups()) {
        for (const sample of group.samples) {
          if (this.stopped) return;
          await this.play(sample);
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }
    } finally {
      this.playingAll.set(false);
      this.playing.set(null);
      void this.load();
    }
  }

  protected stop(): void {
    this.stopped = true;
    this.playing.set(null);
    void this.gtt.stopSample();
  }

  private async load(): Promise<void> {
    this.samples.set(await this.gtt.samples());
  }
}
