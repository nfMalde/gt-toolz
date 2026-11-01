import { Component, inject, input, signal } from '@angular/core';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon } from '@shell/ui/icon';
import { LearnDialog } from '../pages/references/learn-dialog';
import { ReferencesStore } from '../stores/references.store';

/** The setup assistant: learning the first track, or the reference that is there already. */
@Component({
  selector: 'gtt-reference-step',
  imports: [Icon, LearnDialog],
  template: `
    <section class="step two-col">
      <div class="col">
        <div class="step-icon"><gtt-icon name="flag" [size]="26" /></div>
        <h1>{{ t('telemetry.guide.reference.title') }}</h1>
        <p class="muted">{{ t('telemetry.guide.reference.text') }}</p>
        <ol class="steps">
          <li>{{ t('telemetry.learn.step1') }}</li>
          <li>{{ t('telemetry.learn.step2') }}</li>
          <li>{{ t('telemetry.learn.step3') }}</li>
        </ol>
        <p class="faint small">{{ t('telemetry.learn.tip') }}</p>
      </div>
      <div class="col">
        <div class="detect card flat">
          @if (learned() && coach.reference(); as ref) {
            <div class="detect-row ok">
              <div class="detect-icon"><gtt-icon name="check" [size]="16" [weight]="2.4" /></div>
              <b>{{ t('telemetry.guide.reference.learned', { track: ref.track ?? t('common.unknownTrack'), time: ref.lapTime }) }}</b>
            </div>
          } @else if (coach.learning()) {
            <div class="detect-row" [class.idle]="coach.learnState() !== 'recording'">
              <div class="detect-icon">
                @if (coach.learnState() === 'recording') { <span class="spinner"></span> } @else { <span class="idle-dot"></span> }
              </div>
              <div>
                @switch (coach.learnState()) {
                  @case ('recording') {
                    <b>{{ t('telemetry.learn.receiving', { frames: coach.status()?.learning?.frames ?? 0 }) }}</b>
                    @if (coach.status()?.learning?.replay) {
                      <div class="faint small">{{ t('telemetry.learn.replay') }}</div>
                    }
                  }
                  @case ('menu') { <b>{{ t('telemetry.learn.inMenu') }}</b> }
                  @case ('race') { <b>{{ t('telemetry.learn.inRace') }}</b> }
                  @default { <b>{{ t('telemetry.learn.waiting') }}</b> }
                }
              </div>
            </div>
          } @else if (coach.reference(); as ref) {
            <div class="detect-row ok">
              <div class="detect-icon"><gtt-icon name="check" [size]="16" [weight]="2.4" /></div>
              <div>
                <b>{{ ref.track ?? t('common.unknownTrack') }} · {{ ref.targetTime }}</b>
                <div class="faint small">{{ t('telemetry.guide.reference.have') }}</div>
              </div>
            </div>
          }
        </div>
        <!-- Also while learning: a way out when something else was recorded (the user was stuck in the setup, alpha 0.0.5). -->
        @if (coach.learning()) {
          <p class="faint small">{{ t('telemetry.guide.reference.restartHint') }}</p>
          <button type="button" class="btn" (click)="learnOpen.set(true)"><gtt-icon name="refresh" [size]="16" />{{ t('telemetry.guide.reference.restart') }}</button>
        } @else {
          <button type="button" class="btn" (click)="learnOpen.set(true)"><gtt-icon name="sparkle" [size]="16" />{{ t('telemetry.refs.learnNew') }}</button>
        }
      </div>
    </section>

    @if (learnOpen()) {
      <gtt-learn-dialog (closed)="learnOpen.set(false)" />
    }
  `,
})
export class ReferenceStep {
  protected readonly coach = inject(CoachStore);
  protected readonly t = inject(I18n).t;
  /** A reference was learned while the assistant is open (kept by the assistant, also on other steps). */
  readonly learned = input(false);
  protected readonly learnOpen = signal(false);

  constructor() {
    void inject(ReferencesStore).load();
  }
}
