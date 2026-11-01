import { Component, computed, inject } from '@angular/core';
import { deltaSeconds, lapTime } from '@shell/core/format';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon } from '@shell/ui/icon';

/** Speed, gear, pedals and lap times from the PS5, the last lap against the reference's target. */
@Component({
  selector: 'gtt-live-card',
  imports: [Icon],
  template: `
    <section class="card">
      <div class="card-header">
        <div class="card-icon live"><gtt-icon name="cockpit" /></div>
        <h2>{{ t('telemetry.cockpit.live') }}</h2>
        @if (live()?.paused && coach.hasTelemetry()) {
          <span class="chip warn header-chip">{{ t('telemetry.cockpit.paused') }}</span>
        }
      </div>

      @if (coach.hasTelemetry()) {
        <div class="gauges">
          <div class="speed">
            <div class="value num">{{ speed() }}</div>
            <div class="unit">{{ t('telemetry.cockpit.speed') }}</div>
          </div>
          <div class="gear">
            <div class="gear-box num">{{ gear() }}</div>
            <div class="unit">{{ t('telemetry.cockpit.gear') }}</div>
          </div>
          <div class="pedals">
            <div class="pedal">
              <div class="bar"><div class="fill throttle" [style.height.%]="throttle()"></div></div>
              <div class="unit">{{ t('telemetry.cockpit.throttle') }}</div>
            </div>
            <div class="pedal">
              <div class="bar"><div class="fill brake" [style.height.%]="brake()"></div></div>
              <div class="unit">{{ t('telemetry.cockpit.brake') }}</div>
            </div>
          </div>
        </div>
        <div class="laps">
          <div>
            <div class="unit">{{ t('telemetry.cockpit.lapCurrent') }}</div>
            <div class="lap num">{{ lapTime(live()?.currentLapMs) }}</div>
          </div>
          <div>
            <div class="unit">{{ t('telemetry.cockpit.lapLast') }}</div>
            <div class="lap num">{{ lapTime(live()?.lastLapMs) }}</div>
          </div>
          <div>
            <div class="unit">{{ t('telemetry.cockpit.lapBest') }}</div>
            <div class="lap num best">{{ lapTime(live()?.bestLapMs) }}</div>
          </div>
        </div>
        @if (coach.status()?.lastLap; as lastLap) {
          <div class="last-lap">
            <span class="unit">{{ t('telemetry.cockpit.lastLap') }} {{ lastLap.lap }}</span>
            <span class="num lap">{{ lastLap.time }}</span>
            <span class="delta num" [class.bad]="lastLap.deltaMs > 50" [class.good]="lastLap.deltaMs < -50">{{ delta(lastLap.deltaMs) }}</span>
            <span class="faint small">{{ t('telemetry.cockpit.target') }} {{ coach.reference()?.targetTime }}</span>
          </div>
        }
      } @else {
        <div class="empty compact">
          <div class="card-icon"><gtt-icon name="steering" [size]="22" /></div>
          <p>{{ t('telemetry.cockpit.noTelemetry') }}</p>
        </div>
      }
    </section>
  `,
  styles: `
    .gauges { display: grid; grid-template-columns: 1fr auto auto; align-items: end; gap: 18px; }
    .speed .value { font-family: var(--font-display); font-size: 64px; font-weight: 700; line-height: 0.95; letter-spacing: -0.03em; }
    .gear { text-align: center; }
    .gear-box {
      width: 64px; height: 64px; border-radius: 16px; display: grid; place-items: center;
      font-family: var(--font-display); font-size: 38px; font-weight: 700;
      background: var(--bg-elevated); border: 1px solid var(--border-strong);
      box-shadow: 0 0 0 4px rgba(34, 211, 238, 0.06) inset; color: var(--live);
    }
    .pedals { display: flex; gap: 10px; }
    .pedal { text-align: center; }
    .bar {
      width: 16px; height: 64px; margin: 0 auto; border-radius: 6px; background: var(--bg-elevated);
      border: 1px solid var(--border); display: flex; align-items: flex-end; overflow: hidden;
    }
    .fill { width: 100%; border-radius: 4px; transition: height 0.1s linear; }
    .fill.throttle { background: linear-gradient(0deg, #10b981, var(--throttle)); }
    .fill.brake { background: linear-gradient(0deg, #e11d48, var(--brake)); }
    .laps {
      display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 12px;
      margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--border);
    }
    .lap { font-family: var(--font-display); font-size: 17px; font-weight: 650; margin-top: 2px; }
    .lap.best { color: #c4b5fd; }
    .last-lap { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
    .last-lap .unit { margin: 0; }
    .delta { font-weight: 750; font-size: 15px; color: var(--text-2); }
    .delta.bad { color: #ff8aa0; }
    .delta.good { color: var(--ok); }
  `,
})
export class LiveCard {
  protected readonly coach = inject(CoachStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly lapTime = lapTime;
  protected readonly live = this.coach.live;

  protected readonly speed = computed(() => Math.round(this.live()?.speedKmh ?? 0));
  protected readonly gear = computed(() => {
    const gear = this.live()?.gear ?? 0;
    return gear === 0 ? 'N' : String(gear);
  });
  protected readonly throttle = computed(() => Math.round((this.live()?.throttle ?? 0) * 100));
  protected readonly brake = computed(() => Math.round((this.live()?.brake ?? 0) * 100));

  protected delta(ms: number): string {
    return `${deltaSeconds(ms, this.i18n.locale())} s`;
  }
}
