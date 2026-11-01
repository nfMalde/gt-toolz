import { NgComponentOutlet } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { carLabel } from '@shell/core/format';
import type { CockpitArea } from '@shell/core/module-ui';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { MODULE_UIS } from '@shell/modules';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';

/** The share of the row's width the "side" column takes (of 12, as the zones' 8). */
const SIDE_WEIGHT = 4;

/**
 * The start page while driving: its header and the telemetry's warnings; the cards come from the modules that are on
 * (`ModuleUi.cockpit`), the telemetry's own among them.
 */
@Component({
  selector: 'gtt-cockpit',
  imports: [Icon, NgComponentOutlet],
  templateUrl: './cockpit.html',
  styleUrl: './cockpit.css',
})
export class Cockpit {
  protected readonly coach = inject(CoachStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;
  protected readonly status = this.coach.status;
  protected readonly sideWeight = SIDE_WEIGHT;

  /** Every module's part (made once: they read stores); shown while its module is on. */
  private readonly parts = MODULE_UIS.map((module) => ({ id: module.id, ...module.cockpit?.() }));
  private readonly active = computed(() => this.parts.filter((part) => this.settings.moduleEnabled(part.id)));
  protected readonly chips = computed(() => this.active().flatMap((part) => (part.chips ? [part.chips] : [])));
  protected readonly banners = computed(() => this.active().flatMap((part) => (part.banners ? [part.banners] : [])));
  private readonly cards = computed(() =>
    this.active()
      .flatMap((part) => part.cards ?? [])
      .filter((card) => card.shown?.() ?? true)
      .sort((a, b) => a.order - b.order),
  );
  protected readonly top = this.area('top');
  protected readonly wide = this.area('wide');
  protected readonly main = this.area('main');
  protected readonly side = this.area('side');

  /** A different car than the reference's: which one the driver drives, and which one the reference used. */
  protected readonly otherCarText = computed(() => {
    const car = this.status()?.car;
    const ref = this.coach.reference();
    if (!car || !ref) return this.t('telemetry.cockpit.otherCar');
    return this.t('telemetry.cockpit.otherCarNamed', { car: carLabel({ carName: car.name, carCode: car.code, carCategory: car.category }), ref: carLabel(ref) });
  });

  protected readonly title = computed(() => {
    const ref = this.coach.reference();
    if (this.coach.learning()) return this.t('telemetry.cockpit.state.learning');
    return ref ? (ref.track ?? this.t('common.unknownTrack')) : this.t('telemetry.cockpit.title');
  });

  protected modeKey(mode: string): TextKey {
    return `telemetry.mode.${mode}` as TextKey;
  }

  private area(area: CockpitArea) {
    return computed(() => this.cards().filter((card) => card.area === area));
  }
}
