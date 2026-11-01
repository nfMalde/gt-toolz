import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { modeBop, REFERENCE_MODES, type ReferenceMode, type ReferenceSummary } from '@gtt/api';
import { carLabel } from '@shell/core/format';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon, type IconName } from '@shell/ui/icon';
import { Secret } from '@shell/ui/secret';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Toggle } from '@shell/ui/toggle';
import { TelemetryStore } from '../stores/telemetry.store';

type StepState = 'done' | 'active' | 'waiting' | 'error';

interface ConnectionStep {
  label: TextKey;
  icon: IconName;
  state: StepState;
  detail?: string;
  /** The detail is the PlayStation's IP: hidden in streamer mode. */
  secret?: boolean;
}

/** The Cockpit's first card: the way to the PS5, the reference and what the driver drives. */
@Component({
  selector: 'gtt-session-card',
  imports: [Icon, RouterLink, Secret, Segmented, Toggle],
  templateUrl: './session-card.html',
  styleUrl: './session-card.css',
})
export class SessionCard {
  protected readonly coach = inject(CoachStore);
  private readonly settings = inject(SettingsStore);
  private readonly telemetry = inject(TelemetryStore);
  protected readonly t = inject(I18n).t;
  protected readonly carLabel = carLabel;
  protected readonly status = this.coach.status;

  /** "Ich fahre" (docs/dev/telemetry.md): what the driver drives right now; the automatic choice takes references for it. */
  protected readonly driveOptions = computed<SegmentOption<ReferenceMode>[]>(() =>
    REFERENCE_MODES.map((mode) => ({ value: mode, label: this.t(`telemetry.refMode.short.${mode}` as TextKey) })),
  );
  protected readonly driveMode = computed<ReferenceMode>(() => this.telemetry.settings()?.driveMode ?? 'daily');
  protected readonly driveBop = computed(() => modeBop(this.driveMode(), this.telemetry.settings()?.driveBop));

  protected setDrive(change: { driveMode?: ReferenceMode; driveBop?: boolean }): void {
    void this.telemetry.update(change);
  }

  /** "Daily Race · BoP", "Zeitrennen", or that the mode is still the app's guess. */
  protected modeText(ref: ReferenceSummary): string {
    if (!ref.mode || !ref.modeConfirmed) return this.t('telemetry.refMode.unknown');
    const mode = this.t(`telemetry.refMode.short.${ref.mode}` as TextKey);
    return modeBop(ref.mode, ref.bop) ? `${mode} · ${this.t('telemetry.refMode.bop')}` : mode;
  }

  protected readonly steps = computed<ConnectionStep[]>(() => {
    const stage = this.coach.stage();
    const connection = this.coach.connection();
    const telemetry = this.coach.hasTelemetry();
    const ps5: StepState = stage === 'error' ? 'error' : stage === 'ps5' ? 'active' : 'done';
    const gt7: StepState = stage === 'live' ? 'done' : stage === 'gt7' ? 'active' : 'waiting';
    return [
      { label: 'telemetry.conn.step.pc', icon: 'pc', state: stage === 'error' ? 'error' : 'done' },
      { label: 'telemetry.conn.step.ps5', icon: 'gamepad', state: ps5, detail: connection?.console?.address, secret: true },
      { label: 'telemetry.conn.step.gt7', icon: 'steering', state: gt7 },
      { label: 'telemetry.conn.step.telemetry', icon: 'wifi', state: telemetry ? 'done' : stage === 'live' ? 'active' : 'waiting', detail: telemetry ? connection?.packetType : undefined },
    ];
  });

  protected readonly sessionState = computed(() => {
    const status = this.status();
    if (!status) return '';
    const coach = this.settings.moduleEnabled('coach');
    const settings = this.settings.settings();
    // In races the coach is quiet unless asked for calls; the crew is on the radio.
    if (status.mode === 'race') return this.t(coach && settings?.raceCalls ? 'telemetry.cockpit.state.raceCalls' : 'telemetry.cockpit.state.race');
    // Preparation screen, results, menus: the tool waits.
    if (status.mode === 'menu') return this.t('telemetry.cockpit.state.menu');
    // A replay plays and the coach is quiet there (docs/dev/telemetry.md).
    if (status.mode === 'replay' && coach && !settings?.replayCalls) return this.t('telemetry.cockpit.state.replay');
    if (status.coach === 'learning') return this.t('telemetry.cockpit.state.learning');
    return status.started ? this.t('telemetry.cockpit.state.lap', { lap: status.lap }) : this.t('telemetry.cockpit.state.outLap');
  });
}
