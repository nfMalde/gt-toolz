import { Component, computed, inject, signal } from '@angular/core';
import type { BriefingSetting, FeedbackSetting, PlanStyle, RunnerSettings, TalkLevel } from '@gtt/api';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';

/**
 * The coach's settings: the braking calls, its voice and delay, feedback and help, briefing and debrief. The race
 * corner calls are under the crew (they go over its radio); style and patience are the app's.
 */
@Component({
  selector: 'gtt-coach-settings',
  imports: [Icon, Segmented, Slider, Toggle],
  templateUrl: './settings.html',
  styles: `
    .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .columns { grid-template-columns: 1fr; } }
    .latency-row { display: flex; align-items: center; gap: 12px; }
    .latency-row gtt-slider { flex: 1; }
  `,
})
export class CoachSettings {
  protected readonly store = inject(SettingsStore);
  protected readonly coach = inject(CoachStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly s = this.store.settings;

  /** '' = like the app, else a language. */
  protected readonly speechLanguageOptions = computed<SegmentOption<string>[]>(() => [
    { value: '', label: this.t('settings.languageApp') },
    ...this.store.languages().map((l) => ({ value: l.id, label: l.name })),
  ]);

  protected readonly feedbackOptions = computed<SegmentOption<FeedbackSetting>[]>(() => [
    { value: 'all', label: this.t('coach.settings.feedback.all') },
    { value: 1, label: '1' },
    { value: 2, label: '2' },
    { value: 3, label: '3' },
    { value: 'off', label: this.t('coach.settings.feedback.off') },
  ]);

  protected readonly briefingOptions = computed<SegmentOption<BriefingSetting>[]>(() => [
    { value: 'auto', label: this.t('coach.settings.briefing.auto') },
    { value: 'all', label: this.t('coach.settings.briefing.all') },
    { value: 'problems', label: this.t('coach.settings.briefing.problems') },
    { value: 'off', label: this.t('coach.settings.briefing.off') },
  ]);

  protected readonly planStyleOptions = computed<SegmentOption<PlanStyle>[]>(() => [
    { value: 'sentences', label: this.t('coach.settings.planStyle.sentences') },
    { value: 'notes', label: this.t('coach.settings.planStyle.notes') },
  ]);

  protected readonly talkOptions = computed<SegmentOption<TalkLevel>[]>(() => [
    { value: 'much', label: this.t('settings.talk.much') },
    { value: 'normal', label: this.t('settings.talk.normal') },
    { value: 'little', label: this.t('settings.talk.little') },
  ]);

  /** What a talk level leaves out, under the control. */
  protected talkHint(role: 'coach', level: TalkLevel): string {
    return this.t(`settings.${role}TalkHint.${level}` as TextKey);
  }

  protected readonly standInLapsOptions: SegmentOption<number>[] = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));

  protected readonly focusLapsOptions = computed<SegmentOption<number>[]>(() =>
    [0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? this.t('coach.settings.focusLaps.off') : String(n) })),
  );

  protected readonly testing = signal(false);

  /** The countdown in numbers ("drei, zwei, eins" = 3); 0: only "jetzt". */
  protected readonly numbers = (value: number) => (value === 0 ? this.t('coach.settings.countdownNone') : this.t('coach.settings.countdownNumbers', { n: value }));
  protected readonly mistakes = (value: number) => (value === 0 ? this.t('coach.settings.off') : this.t('coach.settings.debriefCount', { n: value }));
  protected readonly seconds = (value: number) => this.t('settings.seconds', { n: this.i18n.number(value, value % 1 ? 2 : 0) });
  protected readonly percent = (value: number) => this.t('settings.percent', { n: value });

  protected set(change: Partial<RunnerSettings>): void {
    void this.store.update(change);
  }

  protected async test(): Promise<void> {
    this.testing.set(true);
    try {
      await this.coach.testAudio();
    } finally {
      this.testing.set(false);
    }
  }
}
