import { DecimalPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import type { CurbLevelKind, HelpStep, ZoneMetrics, ZoneState } from '@gtt/api';
import { signedSeconds } from '@shell/core/format';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon } from '@shell/ui/icon';

/** The reference's braking zones: how to drive each one, and how the last try went. */
@Component({
  selector: 'gtt-zones-card',
  imports: [Icon, DecimalPipe],
  templateUrl: './zones-card.html',
  styleUrl: './zones-card.css',
})
export class ZonesCard {
  protected readonly coach = inject(CoachStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected force(zone: ZoneState): string {
    return zone.force === 'full' ? this.t('coach.zones.full') : `${zone.force} %`;
  }

  protected loss(value: number): string {
    return signedSeconds(value, this.i18n.locale());
  }

  /** The measured values of a zone next to the reference; off: noticeably different. */
  protected metrics(m: ZoneMetrics): { label: string; value: string; off: boolean }[] {
    const t = this.t;
    const ref = t('coach.metric.ref');
    const brake =
      m.brakeDeltaM === undefined
        ? { value: t('coach.metric.noBrake'), off: true }
        : Math.abs(m.brakeDeltaM) < 5
          ? { value: t('coach.metric.onPoint'), off: false }
          : { value: t(m.brakeDeltaM < 0 ? 'coach.metric.early' : 'coach.metric.late', { m: Math.round(Math.abs(m.brakeDeltaM)) }), off: Math.abs(m.brakeDeltaM) >= 10 };
    const list = [
      { label: t('coach.metric.brake'), ...brake },
      {
        label: t('coach.metric.apex'),
        value: `${Math.round(m.apexKmh)} km/h (${ref} ${Math.round(m.refApexKmh)})`,
        off: Math.abs(m.apexKmh - m.refApexKmh) >= 5,
      },
      { label: t('coach.metric.gear'), value: `${m.gear} (${ref} ${m.refGear})`, off: m.gear !== m.refGear },
      { label: t('coach.metric.pressure'), value: `${m.brakePercent} % (${ref} ${m.refBrakePercent} %)`, off: Math.abs(m.brakePercent - m.refBrakePercent) >= 20 },
    ];
    // Trail braking (docs/dev/coach-and-texts.md): the brake at turn-in, where the reference brakes into the corner.
    if (m.refTurnInBrakePercent !== undefined && m.turnInBrakePercent !== undefined) {
      list.push({ label: t('coach.metric.turnIn'), value: `${m.turnInBrakePercent} % (${ref} ${m.refTurnInBrakePercent} %)`, off: m.turnInBrakePercent < 10 });
    }
    if (m.throttleDeltaM !== undefined) {
      const late = m.throttleDeltaM;
      list.push({
        label: t('coach.metric.throttle'),
        value: Math.abs(late) < 5 ? t('coach.metric.onPoint') : t(late < 0 ? 'coach.metric.early' : 'coach.metric.late', { m: Math.round(Math.abs(late)) }),
        off: late >= 15,
      });
    }
    return list;
  }

  /** "Haarnadel · rechts", "Schikane · rechts-links"; only the direction for a corner without a shape. */
  protected shapeLabel(zone: ZoneState): string {
    const t = this.t;
    const direction = zone.shapeDirection ?? zone.direction;
    const side = t(direction === 'left' ? 'coach.zones.left' : 'coach.zones.right');
    if (!zone.shape) return side;
    const way = zone.shape === 'chicane' ? t(direction === 'left' ? 'coach.zones.chicane.left' : 'coach.zones.chicane.right') : side;
    return `${t(`coach.zones.shape.${zone.shape}` as TextKey)} · ${way}`;
  }

  protected helpStepKey(step: HelpStep): TextKey {
    return `coach.zones.help.${step}` as TextKey;
  }

  /** How much of the car was on the curb: "antippen", "halb", "voll". */
  protected curbLevelKey(level: CurbLevelKind): TextKey {
    return `coach.zones.curb.${level}` as TextKey;
  }
}
