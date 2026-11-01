import { Component, computed, inject, signal } from '@angular/core';
import type { CalibrationStatus } from '@gtt/api';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { Slider } from '@shell/ui/slider';

/** The setup assistant: measuring how late the calls arrive, so "jetzt" comes on the braking point. */
@Component({
  selector: 'gtt-calibrate-step',
  imports: [Icon, Slider],
  template: `
    <section class="step two-col">
      <div class="col">
        <div class="step-icon"><gtt-icon name="timer" [size]="26" /></div>
        <h1>{{ t('coach.guide.calibrate.title') }} <span class="chip warn">{{ t('welcome.important') }}</span></h1>
        <p class="muted">{{ t('coach.guide.calibrate.text') }}</p>
        <ol class="steps">
          <li>{{ t('coach.guide.calibrate.step1') }}</li>
          <li>{{ t('coach.guide.calibrate.step2') }}</li>
          <li>{{ t('coach.guide.calibrate.step3') }}</li>
          <li>{{ t('coach.guide.calibrate.step4', { n: calibration()?.needed ?? 5 }) }}</li>
        </ol>
        <p class="faint small">{{ t('coach.guide.calibrate.why') }}</p>
        @if (settings.moduleEnabled('haptics')) {
          <div class="banner info"><gtt-icon name="vibrate" /><span>{{ t('coach.guide.calibrate.haptics') }}</span></div>
        }
      </div>
      <div class="col">
        <div class="detect card flat">
          <div class="detect-row" [class.ok]="coach.isLive()" [class.idle]="!coach.isLive()">
            <div class="detect-icon">
              @if (coach.isLive()) { <gtt-icon name="check" [size]="16" [weight]="2.4" /> } @else { <span class="idle-dot"></span> }
            </div>
            <b>{{ coach.isLive() ? t('guide.connect.gt7Live') : t('coach.guide.calibrate.needLive') }}</b>
          </div>
          @if (calibration(); as cal) {
            <div class="detect-row" [class.ok]="cal.state === 'done'" [class.error]="!!cal.rejected && cal.state === 'waiting'">
              <div class="detect-icon">
                @if (cal.state === 'done') { <gtt-icon name="check" [size]="16" [weight]="2.4" /> } @else { <span class="spinner"></span> }
              </div>
              <div>
                <b>{{ calibrationText(cal) }}</b>
                <div class="faint small">{{ t('coach.guide.calibrate.tries', { n: cal.samples.length, needed: cal.needed }) }}</div>
              </div>
            </div>
            @if (cal.samples.length) {
              <div class="tries">
                @for (sample of cal.samples; track $index) {
                  <span class="chip num">{{ seconds(sample) }}</span>
                }
              </div>
            }
            @if (cal.state === 'done' && cal.result !== undefined) {
              <div class="calibration-result">
                <div>
                  <span class="label">{{ t('coach.guide.calibrate.result') }}</span>
                  <b class="result-value num">{{ seconds(cal.result) }}</b>
                  <div class="faint small">{{ t('coach.guide.calibrate.current', { value: seconds(settings.settings()?.latencySeconds ?? 0) }) }}</div>
                </div>
                <button type="button" class="btn primary" [disabled]="applied()" (click)="apply(cal.result)">
                  <gtt-icon name="check" [size]="16" />{{ applied() ? t('coach.guide.calibrate.applied') : t('coach.guide.calibrate.apply') }}
                </button>
              </div>
            }
          }
        </div>
        <div class="row">
          @if (calibrating()) {
            <button type="button" class="btn" (click)="stop()"><gtt-icon name="stop" [size]="16" />{{ t('coach.guide.calibrate.stop') }}</button>
          } @else {
            <button type="button" class="btn" [class.primary]="!calibration()" (click)="start()">
              <gtt-icon name="play" [size]="16" />{{ calibration() ? t('coach.guide.calibrate.again') : t('coach.guide.calibrate.start') }}
            </button>
          }
        </div>
        <div class="field latency">
          <span class="label">{{ t('coach.settings.latency') }}</span>
          <gtt-slider [value]="settings.settings()?.latencySeconds ?? 0.2" [min]="0" [max]="1" [step]="0.05" [format]="seconds"
                      [label]="t('coach.settings.latency')" (changed)="settings.update({ latencySeconds: $event })" />
          <span class="faint small">{{ t('coach.guide.calibrate.manual') }}</span>
        </div>
      </div>
    </section>
  `,
  styles: `
    .tries { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 12px 8px; }
    .calibration-result {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 12px; border-radius: 12px; background: var(--accent-soft);
    }
    .calibration-result .label { display: block; }
    .result-value { font-size: 26px; }
    .latency { margin-top: 6px; }
  `,
})
export class CalibrateStep {
  protected readonly coach = inject(CoachStore);
  protected readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly seconds = (value: number) => this.t('settings.seconds', { n: this.i18n.number(value, 2) });

  protected readonly calibration = computed(() => this.coach.status()?.calibration ?? null);
  protected readonly calibrating = computed(() => calibrating(this.calibration()));
  /** The measured value was taken over in this run. */
  protected readonly applied = signal(false);

  protected start(): void {
    this.applied.set(false);
    void this.coach.startCalibration();
  }

  protected stop(): void {
    void this.coach.stopCalibration();
  }

  protected apply(result: number): void {
    void this.settings.update({ latencySeconds: result, latencyCalibrated: true });
    this.applied.set(true);
  }

  protected calibrationText(cal: CalibrationStatus): string {
    if (cal.state === 'done') return this.t('coach.guide.calibrate.done');
    if (cal.rejected && cal.state === 'waiting') return this.t(cal.rejected === 'early' ? 'coach.guide.calibrate.early' : 'coach.guide.calibrate.late');
    return this.t(`coach.guide.calibrate.${cal.state}`);
  }
}

/** A calibration runs (waiting for the next try, counting down, measuring the brake). */
export function calibrating(cal: CalibrationStatus | null): boolean {
  return cal?.state === 'waiting' || cal?.state === 'countdown' || cal?.state === 'brake';
}
