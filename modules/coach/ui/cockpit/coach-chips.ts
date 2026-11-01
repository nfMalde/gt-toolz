import { Component, computed, inject } from '@angular/core';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { soloQuiet } from './solo-quiet';

/** In the Cockpit's header: briefing, the cheeky coach's mood, the focus corner and the debrief. */
@Component({
  selector: 'gtt-coach-chips',
  imports: [Icon],
  template: `
    <!-- Briefing, mood and debrief belong to the solo coaching: not in races or menus. -->
    @if (!quiet() && status()?.briefing === 'playing') {
      <span class="chip accent"><span class="dot pulse"></span>{{ t('coach.cockpit.briefing.playing') }}</span>
    }
    @if (settings.settings()?.style === 'cheeky' && !coach.learning() && !quiet()) {
      <span class="chip" [class]="'mood-' + (status()?.mood ?? 0)"><span class="mood-face">{{ moodFace() }}</span>{{ t(moodKey()) }}</span>
    }
    @if (status()?.focus; as focus) {
      <span class="chip accent" [title]="t('coach.cockpit.focusHint')"><gtt-icon name="route" [size]="14" />{{ t('coach.cockpit.focus', { zone: focus.zoneLabel, n: focus.lapsLeft }) }}</span>
    }
    @switch (quiet() ? 'off' : status()?.debrief) {
      @case ('available') {
        @if (settings.settings()?.debriefHandbrake && coach.zones().length && !coach.learning()) {
          <span class="chip" [title]="t('coach.settings.debriefHandbrakeHint')"><gtt-icon name="steering" [size]="14" />{{ t('coach.cockpit.debrief.hint', { n: settings.settings()?.debriefZones ?? 4 }) }}</span>
        }
      }
      @case ('playing') {
        <span class="chip accent"><span class="dot pulse"></span>{{ t('coach.cockpit.debrief.playing') }}</span>
      }
    }
  `,
  styles: `
    :host { display: contents; }
    .mood-face { font-size: 14px; line-height: 1; }
  `,
})
export class CoachChips {
  protected readonly coach = inject(CoachStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;
  protected readonly status = this.coach.status;
  protected readonly quiet = soloQuiet();

  /** Cheeky style: how the coach feels about repeated mistakes. */
  protected readonly moodKey = computed(() => `coach.mood.${this.status()?.mood ?? 0}` as TextKey);
  protected readonly moodFace = computed(() => ['😌', '😏', '😤', '🤯', '🚪'][this.status()?.mood ?? 0]);
}
