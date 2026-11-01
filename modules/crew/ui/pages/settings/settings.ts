import { Component, computed, inject, signal } from '@angular/core';
import type { CrewModuleSettings } from '@gt-toolz/crew/api';
import type { RaceCallsScope, RunnerSettings, TalkLevel } from '@gtt/api';
import { GTT } from '@shell/core/gtt';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { CrewStore } from '../../stores/crew.store';

/**
 * The crew's settings (its module's): how much it says, its splits, strategy, practice tyres and the team boss. On the
 * same page: how it sounds (the shell's voice settings) and the race corner calls (the coach's, it makes them).
 */
@Component({
  selector: 'gtt-crew-settings',
  imports: [Icon, Segmented, Slider, Toggle],
  templateUrl: './settings.html',
  styles: `
    .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .columns { grid-template-columns: 1fr; } }
    .latency-row { display: flex; align-items: center; gap: 12px; }
    .latency-row gtt-slider { flex: 1; }
    .note { margin-top: 10px; }
    .note + .setting { margin-top: 10px; }
    .warn-text { color: var(--warn); }
  `,
})
export class CrewSettings {
  protected readonly store = inject(SettingsStore);
  private readonly crewStore = inject(CrewStore);
  private readonly gtt = inject(GTT);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** The coach's switch is read too: it makes the race corner calls. */
  protected readonly s = this.store.settings;
  protected readonly crew = this.crewStore.settings;

  /** '' = like the app, else a language. */
  protected readonly speechLanguageOptions = computed<SegmentOption<string>[]>(() => [
    { value: '', label: this.t('settings.languageApp') },
    ...this.store.languages().map((l) => ({ value: l.id, label: l.name })),
  ]);

  protected readonly raceCallScopeOptions = computed<SegmentOption<RaceCallsScope>[]>(() => [
    { value: 'all', label: this.t('crew.settings.raceCallsScope.all') },
    { value: 'mistakes', label: this.t('crew.settings.raceCallsScope.mistakes') },
  ]);

  protected readonly talkOptions = computed<SegmentOption<TalkLevel>[]>(() => [
    { value: 'much', label: this.t('settings.talk.much') },
    { value: 'normal', label: this.t('settings.talk.normal') },
    { value: 'little', label: this.t('settings.talk.little') },
  ]);

  /** What a talk level leaves out, under the control. */
  protected talkHint(role: 'crew', level: TalkLevel): string {
    return this.t(`settings.${role}TalkHint.${level}` as TextKey);
  }

  protected readonly bossLapsOptions: SegmentOption<number>[] = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));

  protected readonly testing = signal(false);
  protected readonly wholeSeconds = (value: number) => this.t('settings.seconds', { n: value });
  protected readonly percent = (value: number) => this.t('settings.percent', { n: value });

  protected set(change: Partial<RunnerSettings>): void {
    void this.store.update(change);
  }

  protected setCrew(change: Partial<CrewModuleSettings>): void {
    void this.crewStore.update(change);
  }

  /** A crew message on the radio, to set the crew's volume against the coach's. */
  protected async testCrew(): Promise<void> {
    this.testing.set(true);
    try {
      await this.gtt.samples();
      await this.gtt.playSample('crew-position');
    } finally {
      this.testing.set(false);
    }
  }
}
