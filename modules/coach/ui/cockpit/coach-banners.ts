import { Component, inject } from '@angular/core';
import { StreamerMode } from '@shell/core/streamer';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';

/** Above the Cockpit's cards: not calibrated yet, the coach's voice is being prepared or failed. */
@Component({
  selector: 'gtt-coach-banners',
  imports: [Icon],
  template: `
    @if (settings.needsCalibration()) {
      <div class="banner warn">
        <gtt-icon name="timer" />
        <span class="spacer"><b>{{ t('coach.cockpit.calibrate.title') }}</b> {{ t('coach.cockpit.calibrate.text') }}</span>
        <button type="button" class="btn sm" (click)="settings.openGuide('calibrate')">{{ t('coach.cockpit.calibrate.button') }}</button>
      </div>
    }
    @if (coach.coachVoice(); as v) {
      @if (v.state === 'preparing') {
        <div class="banner info">
          <gtt-icon name="mic" />
          <span class="spacer">{{ t('coach.cockpit.voicePreparing', { voice: v.name, done: v.done ?? 0, total: v.total ?? 0 }) }}</span>
          <div class="progress mini"><div [style.width.%]="((v.done ?? 0) / (v.total || 1)) * 100"></div></div>
        </div>
      } @else if (v.error) {
        <div class="banner warn"><gtt-icon name="alert" /><span>{{ t('coach.cockpit.voiceError', { error: streamer.paths(v.error) }) }}</span></div>
      }
    }
  `,
  styles: `
    :host { display: contents; }
    .progress.mini { width: 160px; }
  `,
})
export class CoachBanners {
  protected readonly coach = inject(CoachStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly streamer = inject(StreamerMode);
  protected readonly t = inject(I18n).t;
}
