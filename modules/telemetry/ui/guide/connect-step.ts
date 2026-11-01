import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { isLanAddress } from '@gtt/api';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon } from '@shell/ui/icon';
import { Secret, SecretField } from '@shell/ui/secret';
import { TelemetryStore } from '../stores/telemetry.store';

/** The setup assistant: finding the PlayStation and GT7's telemetry, or giving its address by hand. */
@Component({
  selector: 'gtt-connect-step',
  imports: [Icon, Secret, SecretField],
  template: `
    <section class="step two-col">
      <div class="col">
        <div class="step-icon"><gtt-icon name="gamepad" [size]="26" /></div>
        <h1>{{ t('telemetry.guide.connect.title') }}</h1>
        <p class="muted">{{ t('telemetry.guide.connect.text') }}</p>
        <ul class="checklist">
          <li><gtt-icon name="wifi" [size]="16" />{{ t('telemetry.guide.connect.check1') }}</li>
          <li><gtt-icon name="steering" [size]="16" />{{ t('telemetry.guide.connect.check2') }}</li>
          <li><gtt-icon name="shield" [size]="16" />{{ t('telemetry.guide.connect.check3') }}</li>
        </ul>
      </div>
      <div class="col">
        <div class="detect card flat">
          <div class="detect-row" [class.ok]="ps5Found()" [class.error]="coach.stage() === 'error'">
            <div class="detect-icon">
              @if (ps5Found()) { <gtt-icon name="check" [size]="16" [weight]="2.4" /> } @else { <span class="spinner"></span> }
            </div>
            <div>
              @if (coach.stage() === 'error') {
                <b>{{ t('telemetry.conn.error') }}</b>
                <div class="faint small">{{ t('telemetry.conn.errorHint') }}</div>
              } @else if (ps5Found()) {
                <b>{{ t('telemetry.guide.connect.found') }} <gtt-secret [value]="coach.connection()?.console?.name ?? 'PlayStation'" />
                  (<gtt-secret [value]="coach.connection()?.console?.address ?? ''" />)</b>
              } @else {
                <b>{{ t('telemetry.guide.connect.ps5Searching') }}</b>
              }
            </div>
          </div>
          <div class="detect-row" [class.ok]="coach.isLive()" [class.idle]="!ps5Found()">
            <div class="detect-icon">
              @if (coach.isLive()) { <gtt-icon name="check" [size]="16" [weight]="2.4" /> } @else if (ps5Found()) { <span class="spinner"></span> } @else { <span class="idle-dot"></span> }
            </div>
            <b>{{ coach.isLive() ? t('guide.connect.gt7Live') : t('telemetry.guide.connect.gt7Waiting') }}</b>
          </div>
        </div>

        <button type="button" class="link-btn" (click)="showManual.set(!showManual())">
          <gtt-icon [name]="showManual() ? 'chevronDown' : 'chevronRight'" [size]="14" />{{ t('telemetry.guide.connect.manual') }}
        </button>
        @if (showManual()) {
          <div class="manual">
            <p class="faint small">{{ t('telemetry.guide.connect.manualHint') }}</p>
            <div class="row">
              <gtt-secret-field>
                <input class="input mono" [class.invalid]="!ipValid()" [value]="ip()" [placeholder]="t('telemetry.settings.ipPlaceholder')"
                       spellcheck="false" (input)="ip.set(inputValue($event))" (keydown.enter)="saveIp()" />
              </gtt-secret-field>
              <button type="button" class="btn" [disabled]="!ipValid()" (click)="saveIp()">{{ t('common.save') }}</button>
            </div>
            @if (!ipValid()) {
              <div class="error-text small">{{ t('telemetry.settings.ipInvalid') }}</div>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .manual { display: flex; flex-direction: column; gap: 8px; }
    .manual .input { width: 200px; }
  `,
})
export class ConnectStep {
  protected readonly coach = inject(CoachStore);
  private readonly telemetry = inject(TelemetryStore);
  protected readonly t = inject(I18n).t;

  protected readonly ps5Found = computed(() => ['gt7', 'live'].includes(this.coach.stage()));
  protected readonly showManual = signal(false);
  protected readonly ip = linkedSignal(() => this.telemetry.settings()?.ip ?? '');
  protected readonly ipValid = computed(() => this.ip().trim() === '' || isLanAddress(this.ip().trim()));

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected saveIp(): void {
    if (this.ipValid()) void this.telemetry.update({ ip: this.ip().trim() });
  }
}
