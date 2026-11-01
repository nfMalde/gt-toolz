import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import type { Addressing, CoachStyle, DataSummary, Patience, RunnerSettings } from '@gtt/api';
import { bytes } from '../../core/format';
import { GTT } from '../../core/gtt';
import { I18n } from '../../i18n/i18n';
import { CoachStore } from '../../stores/coach.store';
import { SettingsStore } from '../../stores/settings.store';
import { UpdatesStore } from '../../stores/updates.store';
import { Icon } from '../../ui/icon';
import { Secret } from '../../ui/secret';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Slider } from '../../ui/slider';
import { Toggle } from '../../ui/toggle';

/** The app's own settings: the driver, language, volume, personality, diagnostics. Each module has its own page. */
@Component({
  selector: 'gtt-settings',
  imports: [Icon, Secret, Segmented, Slider, Toggle],
  templateUrl: './settings.html',
  styles: `
    .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .columns { grid-template-columns: 1fr; } }
    .name { width: 170px; }
    .ip-row { display: flex; gap: 8px; align-items: center; }
    .ok-text { color: var(--ok); }
    /* "Reset data": what goes, before the user confirms. */
    .reset-confirm { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding: 14px 16px; border-radius: 12px; border: 1px solid rgba(255, 107, 129, 0.35); background: rgba(255, 107, 129, 0.06); }
    .reset-confirm ul { margin: 0; padding-left: 18px; color: var(--text-2); }
    .reset-confirm .keep { display: flex; align-items: center; gap: 10px; }
    .path { word-break: break-all; }
  `,
})
export class Settings {
  protected readonly store = inject(SettingsStore);
  protected readonly coach = inject(CoachStore);
  private readonly gtt = inject(GTT);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly s = this.store.settings;

  protected readonly languageOptions = computed<SegmentOption<string>[]>(() =>
    this.store.languages().map((l) => ({ value: l.id, label: l.name })),
  );

  protected readonly styleOptions = computed<SegmentOption<CoachStyle>[]>(() => [
    { value: 'neutral', label: this.t('settings.style.neutral') },
    { value: 'cheeky', label: this.t('settings.style.cheeky') },
  ]);

  protected readonly patienceOptions = computed<SegmentOption<Patience>[]>(() => [
    { value: 'high', label: this.t('settings.patience.high') },
    { value: 'normal', label: this.t('settings.patience.normal') },
    { value: 'low', label: this.t('settings.patience.low') },
  ]);

  /** The name field: saved on Enter or when leaving the field. */
  protected readonly name = linkedSignal(() => this.s()?.driverName ?? '');

  protected readonly addressingOptions = computed<SegmentOption<Addressing>[]>(() => [
    { value: 'always', label: this.t('settings.addressing.always') },
    { value: 'sometimes', label: this.t('settings.addressing.sometimes') },
  ]);

  protected saveName(): void {
    const name = this.name().trim();
    if (name !== (this.s()?.driverName ?? '')) this.set({ driverName: name });
  }

  /** Plays the greeting with the name (the sound check sample, freshly built). */
  protected async listenName(): Promise<void> {
    this.saveName();
    await this.gtt.samples();
    await this.gtt.playSample('reference-loaded');
  }

  /** How much slower: "3×", "1,5×". */
  protected readonly factor = (value: number) => this.t('settings.factor', { n: this.i18n.number(value, value % 1 ? 1 : 0) });
  protected readonly seconds = (value: number) => this.t('settings.seconds', { n: this.i18n.number(value, value % 1 ? 2 : 0) });

  protected set(change: Partial<RunnerSettings>): void {
    void this.store.update(change);
  }

  protected readonly percent = (value: number) => this.t('settings.percent', { n: value });

  protected openLogs(): void {
    void this.gtt.openFolder('logs');
  }

  /** Updates: the switch, the state of the last look, and looking now (the update window opens when one is there). */
  protected readonly updates = inject(UpdatesStore);
  protected readonly updateLine = computed(() => {
    const status = this.updates.status();
    if (status.state === 'checking') return this.t('updates.checking');
    if (status.state === 'none') return this.t('updates.upToDate');
    if (status.state === 'error') return this.t('updates.error', { message: status.error ?? '' });
    if (status.release) return this.t('updates.foundLine', { version: status.release.version });
    return this.t('updates.notChecked');
  });

  protected async checkNow(): Promise<void> {
    await this.updates.check();
    if (this.updates.found()) this.updates.show();
  }

  /** The log for a GitHub issue: what was saved (file name only) or that there is none yet. */
  protected readonly exported = signal<{ file?: string; empty?: boolean } | undefined>(undefined);

  protected async exportLog(): Promise<void> {
    this.exported.set(await this.gtt.exportLog());
  }

  /** "Reset data": what would go, shown before the user confirms; the app restarts as on the first day. */
  protected readonly resetInfo = signal<DataSummary | undefined>(undefined);
  protected readonly keepVoices = signal(false);
  protected readonly resetting = signal(false);

  protected async askReset(): Promise<void> {
    this.keepVoices.set(false);
    this.resetInfo.set(await this.gtt.dataSummary());
  }

  protected async reset(): Promise<void> {
    this.resetting.set(true);
    await this.gtt.resetData(this.keepVoices());
  }

  protected size(value: number): string {
    return bytes(value, this.i18n.locale());
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
