import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { deltaSeconds } from '@shell/core/format';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';

/** The race crew's card, only while it is on the radio (races): position, sectors, fuel and tyres. */
@Component({
  selector: 'gtt-race-card',
  imports: [Icon, DecimalPipe],
  templateUrl: './race-card.html',
  styleUrl: './race-card.css',
})
export class RaceCard {
  protected readonly settings = inject(SettingsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  private readonly status = inject(CoachStore).status;

  protected readonly crew = computed(() => (this.status()?.crew.active ? this.status()!.crew : null));

  protected sectorTime(ms: number | undefined): string {
    return ms === undefined ? '–' : (ms / 1000).toLocaleString(this.i18n.locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  protected delta(ms: number): string {
    return `${deltaSeconds(ms, this.i18n.locale())} s`;
  }

  protected number(value: number, digits: number): string {
    return this.i18n.number(value, digits);
  }

  protected tyreClass(temp: number): string {
    return temp < 60 ? 'cold' : temp > 100 ? 'hot' : 'ok';
  }
}
