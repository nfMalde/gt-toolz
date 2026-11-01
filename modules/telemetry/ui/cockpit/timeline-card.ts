import { Component, inject } from '@angular/core';
import type { Activity } from '@gtt/api';
import { deltaSeconds, signedSeconds } from '@shell/core/format';
import { StreamerMode } from '@shell/core/streamer';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon, type IconName } from '@shell/ui/icon';

/** One timeline for every module (docs/dev/modules.md): laps, references, calls, the crew's radio. */
@Component({
  selector: 'gtt-timeline-card',
  imports: [Icon],
  template: `
    <section class="card">
      <div class="card-header">
        <div class="card-icon"><gtt-icon name="clock" /></div>
        <h2>{{ t('telemetry.cockpit.activity') }}</h2>
      </div>
      <div class="timeline">
        @for (item of coach.activity(); track item.id) {
          <div class="event" [class]="activityTone(item)">
            <div class="event-icon"><gtt-icon [name]="activityIcon(item)" [size]="14" /></div>
            <div class="event-body">
              <div class="event-text">
                @if (activityZone(item); as zone) {
                  <b>{{ zone }}</b>
                }
                @if (item.kind === 'remark' || item.kind === 'crew' || item.kind === 'help') {
                  <span class="remark">„{{ item.text }}“</span>
                }
                @if (item.kind === 'corner') {
                  <span class="loss num" [class.bad]="item.lossS > 0.1" [class.good]="item.lossS < -0.05">{{ loss(item.lossS) }}</span>
                }
                <span>{{ activityText(item) }}</span>
              </div>
              <div class="faint small num">{{ time(item.at) }}</div>
            </div>
          </div>
        } @empty {
          <p class="muted small">{{ t('telemetry.cockpit.activityEmpty') }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .timeline { display: flex; flex-direction: column; gap: 2px; max-height: 420px; overflow-y: auto; margin-right: -8px; padding-right: 8px; }
    .event { display: flex; gap: 10px; padding: 8px 0; animation: page-in 0.2s ease-out; }
    .event-icon {
      width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex: none;
      background: var(--surface-3); color: var(--text-2);
    }
    .event.bad .event-icon { background: var(--danger-soft); color: #ff8aa0; }
    .event.good .event-icon { background: var(--ok-soft); color: var(--ok); }
    .event-body { min-width: 0; }
    .event-text { display: flex; flex-wrap: wrap; gap: 6px; font-size: 13px; }
    .remark { font-style: italic; color: var(--text); }
  `,
})
export class TimelineCard {
  protected readonly coach = inject(CoachStore);
  private readonly streamer = inject(StreamerMode);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected loss(value: number): string {
    return signedSeconds(value, this.i18n.locale());
  }

  protected time(at: number): string {
    return new Date(at).toLocaleTimeString(this.i18n.locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  protected activityIcon(activity: Activity): IconName {
    switch (activity.kind) {
      case 'corner':
        return 'route';
      case 'feedback-new':
      case 'feedback-updated':
        return 'alert';
      case 'feedback-resolved':
        return 'check';
      case 'lap':
      case 'coaching-started':
        return 'flag';
      case 'lap-time':
        return 'timer';
      case 'debrief-started':
      case 'debrief-finished':
      case 'debrief-stopped':
        return 'steering';
      case 'remark':
        return activity.level === 0 ? 'heart' : 'mic';
      case 'help':
        return activity.event === 'focus-done' ? 'check' : activity.event === 'better' ? 'heart' : 'route';
      case 'crew':
        return 'users';
      case 'slide':
        return 'refresh';
      case 'reference-loaded':
      case 'reference-learned':
        return 'sparkle';
      case 'briefing-started':
      case 'briefing-finished':
      case 'briefing-stopped':
        return 'mic';
      case 'voice-error':
      case 'other-car':
      case 'off-reference':
        return 'alert';
      default:
        return 'info';
    }
  }

  protected activityTone(activity: Activity): string {
    switch (activity.kind) {
      case 'corner':
        return activity.lossS > 0.1 ? 'bad' : activity.lossS < -0.05 ? 'good' : '';
      case 'feedback-new':
      case 'feedback-updated':
      case 'voice-error':
      case 'other-car':
      case 'off-reference':
      case 'slide':
        return 'bad';
      case 'feedback-resolved':
      case 'reference-learned':
        return 'good';
      case 'lap-time':
        return activity.deltaMs > 50 ? 'bad' : activity.deltaMs < -50 ? 'good' : '';
      case 'remark':
        return activity.level === 0 ? 'good' : activity.level >= 3 ? 'bad' : '';
      case 'help':
        return activity.event === 'better' || activity.event === 'focus-done' ? 'good' : '';
      default:
        return '';
    }
  }

  protected activityText(activity: Activity): string {
    const t = this.t;
    const unknown = t('common.unknownTrack');
    switch (activity.kind) {
      case 'corner':
        return activity.problems || t('zones.clean');
      case 'feedback-new':
        return t('telemetry.activity.feedbackNew', { n: activity.number, problems: activity.problems });
      case 'feedback-updated':
        return t('telemetry.activity.feedbackUpdated', { n: activity.number, problems: activity.problems });
      case 'feedback-resolved':
        return t('telemetry.activity.feedbackResolved', { n: activity.number });
      case 'lap':
        return t('telemetry.activity.lap', { lap: activity.lap });
      case 'lap-time':
        return `${t('telemetry.activity.lapTime', { lap: activity.lap, time: activity.time })} · ${deltaSeconds(activity.deltaMs, this.i18n.locale())} s`;
      case 'debrief-started':
        return t('telemetry.activity.debriefStarted');
      case 'debrief-finished':
        return t('telemetry.activity.debriefFinished');
      case 'debrief-stopped':
        return t('telemetry.activity.debriefStopped');
      case 'remark':
      case 'crew':
      case 'help':
        return '';
      case 'slide':
        return `${activity.slide === 'spin' ? t('telemetry.activity.spin') : t('telemetry.activity.slide', { deg: activity.maxDeg })} · ${t(`telemetry.activity.slideCause.${activity.cause}` as TextKey)}`;
      case 'coaching-started':
        return t('telemetry.activity.coachingStarted');
      case 'mode':
        return t('telemetry.activity.mode', { mode: t(`telemetry.mode.${activity.mode}`) });
      case 'off-reference':
        return t('telemetry.activity.offReference', { m: Math.round(activity.offsetM) });
      case 'back-on-reference':
        return t('telemetry.activity.backOnReference');
      case 'other-car':
        return activity.refCar
          ? t('telemetry.activity.otherCarNamed', { car: activity.car ?? `#${activity.carCode}`, ref: activity.refCar })
          : t('telemetry.activity.otherCar', { code: activity.carCode });
      case 'reference-loaded':
        return t('telemetry.activity.referenceLoaded', { track: activity.track ?? unknown, time: activity.lapTime });
      case 'reference-learned':
        return t('telemetry.activity.referenceLearned', { track: activity.track ?? unknown, time: activity.lapTime });
      case 'briefing-started':
        return t('telemetry.activity.briefingStarted');
      case 'briefing-finished':
        return t('telemetry.activity.briefingFinished');
      case 'briefing-stopped':
        return t('telemetry.activity.briefingStopped');
      case 'voice-error':
        return t('telemetry.activity.voiceError', { message: this.streamer.paths(activity.message) });
    }
  }

  /** Zone label for timeline entries that refer to one. */
  protected activityZone(activity: Activity): string | undefined {
    return 'zoneLabel' in activity ? activity.zoneLabel : undefined;
  }
}
