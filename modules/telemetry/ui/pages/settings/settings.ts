import { Component, computed, inject, linkedSignal } from '@angular/core';
import { isLanAddress } from '@gtt/api';
import type { TelemetryModuleSettings } from '@gt-toolz/telemetry-module/api';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { SecretField } from '@shell/ui/secret';
import { Toggle } from '@shell/ui/toggle';
import { TelemetryStore } from '../../stores/telemetry.store';

/** The telemetry's settings: the PS5's address, learning references by itself, recording. The app's own are under /settings. */
@Component({
  selector: 'gtt-telemetry-settings',
  imports: [Icon, SecretField, Toggle],
  templateUrl: './settings.html',
  styles: `
    .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
    @media (max-width: 1180px) { .columns { grid-template-columns: 1fr; } }
    .ip { width: 180px; }
    .ip-row { display: flex; gap: 8px; align-items: center; }
    .error-text { color: #ff8aa0; font-size: 12px; }
  `,
})
export class TelemetrySettings {
  protected readonly store = inject(TelemetryStore);
  protected readonly t = inject(I18n).t;

  protected readonly s = this.store.settings;

  /** The IP field: edited locally, saved with the button. */
  protected readonly ip = linkedSignal(() => this.s()?.ip ?? '');
  protected readonly ipValid = computed(() => this.ip().trim() === '' || isLanAddress(this.ip().trim()));
  protected readonly ipChanged = computed(() => this.ip().trim() !== (this.s()?.ip ?? ''));

  protected set(change: Partial<TelemetryModuleSettings>): void {
    void this.store.update(change);
  }

  protected saveIp(): void {
    if (this.ipValid()) this.set({ ip: this.ip().trim() });
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
