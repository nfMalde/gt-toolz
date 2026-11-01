import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { modeBop, REFERENCE_MODES, type ReferenceMode, type ReferenceSummary } from '@gtt/api';
import { carLabel } from '@shell/core/format';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { SecretField } from '@shell/ui/secret';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Toggle } from '@shell/ui/toggle';
import { ReferencesStore } from '../../stores/references.store';
import { TelemetryStore } from '../../stores/telemetry.store';

/**
 * "Was ist diese Referenz?" (docs/dev/telemetry.md; the user, 2026-10-21): GT7 sends neither the mode nor BoP, so after
 * learning the driver says what the lap is, prefilled with the app's guess, who drove it, and may give it a name. Also asked once
 * for the active reference if it has no mode yet. Saving sets the Cockpit's "Ich fahre" to the same.
 */
@Component({
  selector: 'gtt-mode-dialog',
  imports: [Icon, SecretField, Segmented, Toggle],
  template: `
    @if (shown(); as ref) {
      <div class="backdrop"></div>
      <section class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="t('telemetry.modeDialog.title')">
        <header class="head">
          <div class="card-icon accent"><gtt-icon name="flag" /></div>
          <div>
            <h2>{{ t('telemetry.modeDialog.title') }}</h2>
            <div class="muted small">{{ ref.track ?? t('common.unknownTrack') }} · {{ carLabel(ref) }} · {{ ref.lapTime }}</div>
          </div>
        </header>

        <div class="body">
          <p class="muted">{{ t('telemetry.modeDialog.text') }}</p>
          <div class="field">
            <span class="label">{{ t('telemetry.refs.mode') }}</span>
            <gtt-segmented [options]="modeOptions()" [value]="mode()" (valueChange)="mode.set($event)" />
            <span class="faint small">{{ t(ref.origin === 'live' ? 'telemetry.modeDialog.guessLive' : 'telemetry.modeDialog.guessReplay') }}</span>
          </div>
          <div class="field row">
            <gtt-toggle [checked]="bop()" [disabled]="mode() === 'daily'" [label]="t('telemetry.refMode.bop')" (checkedChange)="bop.set($event)" />
            <span>{{ t('telemetry.refMode.bop') }}</span>
            @if (mode() === 'daily') { <span class="faint small">{{ t('telemetry.refMode.dailyBop') }}</span> }
          </div>
          <div class="field">
            <label for="mode-driver">{{ t('telemetry.learnDialog.driver') }}</label>
            <gtt-secret-field>
              <input id="mode-driver" class="input" maxlength="60" spellcheck="false" [placeholder]="t('telemetry.refs.driverPlaceholder')"
                     [value]="driver()" (input)="driver.set(inputValue($event))" />
            </gtt-secret-field>
            @if (ref.origin !== 'live') { <span class="faint small">{{ t('telemetry.learnDialog.driverHint') }}</span> }
          </div>
          <div class="field">
            <label for="mode-label">{{ t('telemetry.modeDialog.label') }}</label>
            <input id="mode-label" class="input" maxlength="60" spellcheck="false" [placeholder]="t('telemetry.modeDialog.labelPlaceholder')"
                   [value]="label()" (input)="label.set(inputValue($event))" />
          </div>
        </div>

        <footer class="foot">
          <button type="button" class="btn ghost" (click)="dismissed.set(ref.id)">{{ t('telemetry.modeDialog.later') }}</button>
          <span class="spacer"></span>
          <button type="button" class="btn primary" [disabled]="busy()" (click)="save(ref)"><gtt-icon name="check" [size]="16" />{{ t('telemetry.modeDialog.save') }}</button>
        </footer>
      </section>
    }
  `,
  styles: `
    :host { position: fixed; inset: var(--titlebar-height) 0 0 0; z-index: 55; display: grid; place-items: center; padding: 28px; pointer-events: none; }
    :host:has(.dialog) { pointer-events: auto; }
    .backdrop { position: absolute; inset: 0; background: rgba(var(--shade-rgb), .78); backdrop-filter: blur(6px); animation: fade .2s ease-out; }
    @keyframes fade { from { opacity: 0; } }
    .dialog {
      position: relative; width: min(600px, 100%); max-height: 100%; display: flex; flex-direction: column;
      border-radius: 20px; border: 1px solid var(--border-strong);
      background: linear-gradient(180deg, var(--surface-2), var(--surface)); box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
      animation: rise .25s cubic-bezier(.2,.8,.3,1);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.985); } }
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
    .body { padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field.row { flex-direction: row; align-items: center; gap: 10px; }
    .label { font-weight: 600; }
    .foot { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); }
  `,
})
export class ModeDialog {
  private readonly coach = inject(CoachStore);
  private readonly references = inject(ReferencesStore);
  private readonly settings = inject(SettingsStore);
  private readonly telemetry = inject(TelemetryStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly carLabel = carLabel;

  /** The reference put off with "Später" (asked again next time the app starts). */
  protected readonly dismissed = signal<string | null>(null);
  protected readonly mode = signal<ReferenceMode>('daily');
  protected readonly bop = signal(true);
  protected readonly label = signal('');
  protected readonly driver = signal('');
  protected readonly busy = signal(false);

  /** The active reference while its mode is the app's guess (not over the welcome or the setup assistant). */
  protected readonly shown = computed(() => {
    const ref = this.coach.reference();
    if (!ref || ref.modeConfirmed || this.dismissed() === ref.id) return undefined;
    if (this.settings.welcomeOpen() || this.settings.guideOpen()) return undefined;
    return ref;
  });

  protected readonly modeOptions = computed<SegmentOption<ReferenceMode>[]>(() =>
    REFERENCE_MODES.map((mode) => ({ value: mode, label: this.t(`telemetry.refMode.${mode}` as TextKey) })),
  );

  constructor() {
    // Prefilled with the guess: the reference's own (set when learned), else a replay is a Daily Race ghost and an
    // own lap what the Cockpit's switch says.
    effect(() => {
      const ref = this.shown();
      if (!ref) return;
      untracked(() => {
        const drive = this.telemetry.settings();
        const mode = ref.mode ?? (ref.origin === 'live' && drive ? drive.driveMode : 'daily');
        this.mode.set(mode);
        this.bop.set(modeBop(mode, ref.mode ? ref.bop : ref.origin === 'live' ? drive?.driveBop : true));
        this.label.set(ref.label ?? '');
        // GT7 sends no names: an own lap is the driver's (the runner fills it in too), a ghost's player is typed in.
        this.driver.set(ref.driver ?? (ref.origin === 'live' ? (this.settings.settings()?.driverName ?? '') : ''));
      });
    });
    // A Daily Race always has BoP.
    effect(() => {
      if (this.mode() === 'daily') untracked(() => this.bop.set(true));
    });
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected async save(ref: ReferenceSummary): Promise<void> {
    this.busy.set(true);
    try {
      const mode = this.mode();
      const bop = modeBop(mode, this.bop());
      await this.references.update(ref.id, { mode, bop, label: this.label().trim(), driver: this.driver().trim(), modeConfirmed: true });
      // What the driver drives is what this reference is for.
      await this.telemetry.update({ driveMode: mode, driveBop: bop });
    } finally {
      this.busy.set(false);
    }
  }
}
