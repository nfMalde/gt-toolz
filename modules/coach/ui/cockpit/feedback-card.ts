import { Component, inject } from '@angular/core';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { Icon } from '@shell/ui/icon';

/** The corners the coach still has a remark about, numbered as in the zones table. */
@Component({
  selector: 'gtt-feedback-card',
  imports: [Icon],
  template: `
    <section class="card">
      <div class="card-header">
        <div class="card-icon accent"><gtt-icon name="alert" /></div>
        <h2>{{ t('coach.cockpit.feedback') }}</h2>
      </div>
      @for (item of coach.feedback(); track item.number) {
        <div class="feedback-item">
          <span class="badge-number">{{ item.number }}</span>
          <div>
            <div class="zone-label">{{ item.zoneLabel }}</div>
            <div class="muted small">{{ item.problems }}</div>
          </div>
        </div>
      } @empty {
        <p class="muted small">{{ t('coach.cockpit.feedbackEmpty') }}</p>
      }
    </section>
  `,
  styles: `
    .feedback-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--border); }
    .feedback-item:first-of-type { border-top: 0; padding-top: 0; }
    .zone-label { font-weight: 600; white-space: nowrap; }
  `,
})
export class FeedbackCard {
  protected readonly coach = inject(CoachStore);
  protected readonly t = inject(I18n).t;
}
