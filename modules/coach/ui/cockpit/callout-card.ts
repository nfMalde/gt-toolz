import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import type { CueEvent } from '@gtt/api';
import { GTT } from '@shell/core/gtt';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';

/** A call is shown highlighted for this long. */
const CUE_FRESH_MS = 2200;

/** The coach's last call, and its briefing and debrief on a click. */
@Component({
  selector: 'gtt-callout-card',
  imports: [Icon],
  template: `
    <section class="card callout" [class.fresh]="fresh()" data-tour="cockpit-callout">
      <div class="card-header">
        <div class="card-icon accent"><gtt-icon name="bell" /></div>
        <h2>{{ t('coach.cockpit.callout') }}</h2>
      </div>
      @if (coach.lastCue(); as c) {
        @for (shown of [display(c)]; track coach.cueCount()) {
          <div class="cue" [class]="shown.tone">
            <div class="cue-big">{{ shown.big }}</div>
            <!-- Pace notes of corners without braking have no braking zone number. -->
            <div class="cue-zone muted small">{{ c.zone ? c.zone + ' · ' : '' }}{{ c.zoneLabel }}</div>
          </div>
        }
      } @else {
        <div class="empty compact">
          <p class="small">{{ t('coach.cockpit.calloutEmpty') }}</p>
        </div>
      }
      <div class="talks">
        @switch (coach.status()?.briefing) {
          @case ('playing') {
            <button type="button" class="btn sm" (click)="stopBriefing()"><gtt-icon name="stop" [size]="14" />{{ t('coach.cockpit.briefing.stop') }}</button>
          }
          @case ('available') {
            <button type="button" class="btn sm" [title]="t('coach.cockpit.briefing.hint')" (click)="startBriefing()"><gtt-icon name="mic" [size]="14" />{{ t('coach.cockpit.briefing.start') }}</button>
          }
          @case ('waiting') {
            <button type="button" class="btn sm" disabled [title]="t('coach.cockpit.briefing.whileDriving')"><gtt-icon name="mic" [size]="14" />{{ t('coach.cockpit.briefing.start') }}</button>
          }
        }
        <!-- The debrief only with this button (the user, 2026-10-28: "nur manuell"); the handbrake is an option. -->
        @switch (coach.status()?.debrief) {
          @case ('playing') {
            <button type="button" class="btn sm" (click)="stopDebrief()"><gtt-icon name="stop" [size]="14" />{{ t('coach.cockpit.debrief.stop') }}</button>
          }
          @case ('available') {
            <button type="button" class="btn sm" [title]="t('coach.cockpit.debrief.startHint', { n: settings.settings()?.debriefZones ?? 4 })" (click)="startDebrief()">
              <gtt-icon name="flag" [size]="14" />{{ t('coach.cockpit.debrief.start') }}
            </button>
          }
          @case ('waiting') {
            <button type="button" class="btn sm" disabled [title]="t('coach.cockpit.briefing.whileDriving')"><gtt-icon name="flag" [size]="14" />{{ t('coach.cockpit.debrief.start') }}</button>
          }
        }
      </div>
    </section>
  `,
  styles: `
    .callout { display: flex; flex-direction: column; transition: border-color 0.3s, box-shadow 0.3s; }
    .callout.fresh {
      border-color: rgba(var(--accent-rgb), 0.4);
      box-shadow: var(--shadow), 0 0 0 1px rgba(var(--accent-rgb), 0.15), 0 18px 50px -24px rgba(var(--accent-rgb), 0.7);
    }
    .cue {
      flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 8px;
      animation: cue-in 0.22s cubic-bezier(0.2, 0.8, 0.3, 1.2);
    }
    @keyframes cue-in {
      from { opacity: 0; transform: scale(0.92); }
    }
    .cue-big { font-family: var(--font-display); font-weight: 750; font-size: 22px; line-height: 1.15; letter-spacing: -0.01em; }
    .cue.count .cue-big, .cue.now .cue-big, .cue.gear .cue-big { font-size: 44px; text-transform: uppercase; }
    .cue.now .cue-big { background: var(--accent-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .cue.gear .cue-big { color: var(--live); font-size: 34px; }
    .callout:not(.fresh) .cue-big { opacity: 0.55; transition: opacity 0.6s; }
    .empty.compact { flex: 1; justify-content: center; }
    .talks { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
    .talks:empty { display: none; }
  `,
})
export class CalloutCard {
  protected readonly coach = inject(CoachStore);
  protected readonly settings = inject(SettingsStore);
  private readonly gtt = inject(GTT);
  protected readonly t = inject(I18n).t;

  /** The last call stays highlighted for a moment, then fades. */
  protected readonly fresh = signal(false);

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      if (!this.coach.cueCount()) return;
      this.fresh.set(true);
      clearTimeout(timer);
      timer = setTimeout(() => this.fresh.set(false), CUE_FRESH_MS);
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }

  protected display(cue: CueEvent): { big: string; tone: 'count' | 'now' | 'gear' | 'text' } {
    switch (cue.kind) {
      case 'count':
        return { big: cue.text, tone: 'count' };
      case 'now':
        return { big: cue.text, tone: 'now' };
      case 'gear':
        return { big: cue.text, tone: 'gear' };
      case 'tone':
        return { big: '♪', tone: 'count' };
      default:
        return { big: cue.text, tone: 'text' };
    }
  }

  protected startBriefing(): void {
    void this.gtt.startBriefing();
  }

  protected stopBriefing(): void {
    void this.gtt.stopBriefing();
  }

  protected startDebrief(): void {
    void this.gtt.startDebrief();
  }

  protected stopDebrief(): void {
    void this.gtt.stopDebrief();
  }
}
