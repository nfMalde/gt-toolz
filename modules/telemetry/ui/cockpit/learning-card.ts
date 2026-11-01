import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon } from '@shell/ui/icon';

/** While no reference is there: how to get one, and how far the learning has come. */
@Component({
  selector: 'gtt-learning-card',
  imports: [Icon, RouterLink],
  template: `
    <section class="card learn">
      <div class="learn-text">
        <div class="card-header">
          <div class="card-icon accent"><gtt-icon name="sparkle" /></div>
          <h2>{{ t('telemetry.learn.title') }}</h2>
        </div>
        <p class="muted">{{ t('telemetry.learn.text') }}</p>
        <ol class="steps">
          <li>{{ t('telemetry.learn.step1') }}</li>
          <li>{{ t('telemetry.learn.step2') }}</li>
          <li>{{ t('telemetry.learn.step3') }}</li>
        </ol>
        <p class="faint small">{{ t('telemetry.learn.tip') }}</p>
      </div>
      <div class="learn-status">
        <div class="learn-orb" [class.active]="coach.learnState() === 'recording'">
          <gtt-icon name="flag" [size]="30" />
        </div>
        @if (coach.learnState() === 'menu' || coach.learnState() === 'race') {
          <div class="learn-line">{{ t(coach.learnState() === 'menu' ? 'telemetry.learn.inMenu' : 'telemetry.learn.inRace') }}</div>
        } @else if (coach.hasTelemetry()) {
          <div class="learn-line"><span class="dot pulse live-dot"></span>{{ t('telemetry.learn.receiving', { frames: samples() }) }}</div>
          @if (coach.status()?.learning; as learning) {
            @if (learning.replay) {
              <span class="chip ok"><gtt-icon name="check" [size]="14" />{{ t('telemetry.learn.replay') }}</span>
            } @else if (learning.ownLaps > 0) {
              <!-- Own driving: the fastest clean one of the first laps becomes the reference. -->
              <span class="chip accent">{{ t('telemetry.learn.ownLaps', { n: learning.ownLaps, total: learning.ownLapsNeeded }) }}</span>
            }
          }
        } @else {
          <div class="learn-line muted">{{ t('telemetry.learn.waiting') }}</div>
        }
        <a class="btn sm" routerLink="/telemetry/references">{{ t('telemetry.learn.useExisting') }}</a>
      </div>
    </section>
  `,
  styles: `
    .learn { display: grid; grid-template-columns: 1fr 320px; gap: 28px; align-items: center; }
    .learn-text { display: flex; flex-direction: column; gap: 14px; }
    .learn-status {
      display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px;
      border-radius: var(--radius); background: var(--bg-elevated); border: 1px solid var(--border); text-align: center;
    }
    .learn-orb {
      width: 76px; height: 76px; border-radius: 50%; display: grid; place-items: center;
      color: var(--text-3); background: var(--surface-3); border: 1px solid var(--border-strong);
    }
    .learn-orb.active {
      color: var(--on-accent); background: var(--accent-gradient); border-color: transparent;
      box-shadow: var(--accent-glow); animation: orb 2s ease-in-out infinite;
    }
    @keyframes orb {
      50% { box-shadow: 0 0 0 12px rgba(var(--accent-rgb), 0.08), var(--accent-glow); }
    }
    .learn-line { display: flex; align-items: center; gap: 8px; font-weight: 600; }
    .live-dot { color: var(--live); }
  `,
})
export class LearningCard {
  protected readonly coach = inject(CoachStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly samples = computed(() => this.i18n.number(this.coach.status()?.learning?.frames ?? 0));
}
