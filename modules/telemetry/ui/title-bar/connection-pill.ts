import { Component, computed, inject } from '@angular/core';
import { StreamerMode } from '@shell/core/streamer';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';

/** Connection state in the title bar: searching (amber), live (green), error (red). */
@Component({
  selector: 'gtt-connection-pill',
  template: `
    <div class="pill" [class]="tone()" [title]="tooltip()">
      <span class="dot" [class.pulse]="tone() !== 'error'"></span>
      <span class="text">{{ text() }}</span>
      @if (coach.connection()?.console?.name; as name) {
        @if (coach.isLive()) {
          <span class="sep"></span>
          <span class="console">{{ streamer.enabled() ? t('telemetry.conn.step.ps5') : name }}</span>
        }
      }
    </div>
  `,
  styles: `
    .pill {
      display: inline-flex; align-items: center; gap: 8px; height: 26px; padding: 0 12px; border-radius: 26px;
      font-size: 12px; font-weight: 600; border: 1px solid var(--border); background: var(--surface);
      color: var(--text-2); white-space: nowrap;
    }
    .pill.live { color: var(--ok); border-color: rgba(52,211,153,.25); background: var(--ok-soft); }
    .pill.search { color: var(--warn); border-color: rgba(251,191,36,.22); background: var(--warn-soft); }
    .pill.error { color: #ff8aa0; border-color: rgba(251,72,104,.3); background: var(--danger-soft); }
    .text { color: var(--text); }
    .live .text { color: var(--ok); }
    .sep { width: 1px; height: 12px; background: currentColor; opacity: .3; }
    .console { color: var(--text-2); font-weight: 500; }
  `,
})
export class ConnectionPill {
  protected readonly coach = inject(CoachStore);
  /** Streamer mode: the console's own name and its IP stay off the stream. */
  protected readonly streamer = inject(StreamerMode);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly tone = computed(() => {
    const stage = this.coach.stage();
    return stage === 'live' ? 'live' : stage === 'error' ? 'error' : 'search';
  });

  protected readonly text = computed(() => {
    const t = this.i18n.t;
    const connection = this.coach.connection();
    if (!connection) return t('telemetry.conn.ps5');
    switch (connection.stage) {
      case 'live':
        return t('telemetry.conn.live');
      case 'error':
        return t('telemetry.conn.error');
      case 'gt7':
        return connection.retryIn ? t('telemetry.conn.gt7Retry', { s: connection.retryIn }) : t('telemetry.conn.gt7');
      default:
        return connection.retryIn ? t('telemetry.conn.ps5Retry', { s: connection.retryIn }) : t('telemetry.conn.ps5');
    }
  });

  protected readonly tooltip = computed(() => {
    const connection = this.coach.connection();
    if (connection?.stage === 'error') return this.i18n.t('telemetry.conn.errorHint');
    if (!connection?.console) return '';
    if (this.streamer.enabled()) return `${this.i18n.t('telemetry.conn.step.ps5')} · ${this.i18n.t('streamer.hiddenShort')} · ${connection.packetType}`;
    return `${connection.console.name} · ${connection.console.address} · ${connection.packetType}`;
  });
}
