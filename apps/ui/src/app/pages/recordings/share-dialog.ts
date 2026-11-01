import { Component, inject, input, output, signal } from '@angular/core';
import { I18n } from '../../i18n/i18n';
import { Icon } from '../../ui/icon';

/**
 * Before a pack leaves or enters the app: GT Toolz hosts nothing, the user passes files on and is
 * responsible for them. Export needs the speaker's consent confirmed; import needs the notice read.
 */
@Component({
  selector: 'gtt-share-dialog',
  imports: [Icon],
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <section class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="title()">
      <header class="head">
        <div class="card-icon accent"><gtt-icon name="shield" /></div>
        <h2>{{ title() }}</h2>
        <button type="button" class="btn ghost sm icon-only close" [title]="t('common.close')" (click)="closed.emit()"><gtt-icon name="x" /></button>
      </header>

      <div class="body">
        @if (mode() === 'export') {
          <p>{{ t('recordings.exportText') }}</p>
          <div class="banner warn"><gtt-icon name="alert" /><span>{{ t('recordings.exportRules') }}</span></div>
          <button type="button" role="checkbox" class="option focusable" [attr.aria-checked]="agreed()" (click)="agreed.set(!agreed())">
            <span class="check" [class.on]="agreed()">@if (agreed()) { <gtt-icon name="check" [size]="13" [weight]="2.6" /> }</span>
            <span>{{ t('recordings.exportConsent') }}</span>
          </button>
          <p class="faint small">{{ t('recordings.exportStored') }}</p>
        } @else {
          <p>{{ t('recordings.importText') }}</p>
          <div class="banner info"><gtt-icon name="shield" /><span>{{ t('recordings.importSafe') }}</span></div>
          <button type="button" role="checkbox" class="option focusable" [attr.aria-checked]="agreed()" (click)="agreed.set(!agreed())">
            <span class="check" [class.on]="agreed()">@if (agreed()) { <gtt-icon name="check" [size]="13" [weight]="2.6" /> }</span>
            <span>{{ t('recordings.importConfirm') }}</span>
          </button>
        }
      </div>

      <footer class="foot">
        <button type="button" class="btn ghost" (click)="closed.emit()">{{ t('common.cancel') }}</button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" [disabled]="!agreed()" (click)="confirmed.emit()">
          <gtt-icon [name]="mode() === 'export' ? 'external' : 'download'" [size]="16" />
          {{ mode() === 'export' ? t('recordings.exportButton') : t('recordings.importButton') }}
        </button>
      </footer>
    </section>
  `,
  styles: `
    :host { position: fixed; inset: var(--titlebar-height) 0 0 0; z-index: 60; display: grid; place-items: center; padding: 28px; }
    .backdrop { position: absolute; inset: 0; background: rgba(var(--shade-rgb), .78); backdrop-filter: blur(6px); animation: fade .2s ease-out; }
    @keyframes fade { from { opacity: 0; } }
    .dialog {
      position: relative; width: min(580px, 100%); max-height: 100%; display: flex; flex-direction: column;
      border-radius: 20px; border: 1px solid var(--border-strong);
      background: linear-gradient(180deg, var(--surface-2), var(--surface)); box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
      animation: rise .25s cubic-bezier(.2,.8,.3,1);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.985); } }
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
    .close { margin-left: auto; }
    .body { padding: 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .body p { margin: 0; }
    .banner { align-items: flex-start; }
    .option {
      appearance: none; font: inherit; color: inherit; text-align: left; display: flex; align-items: flex-start; gap: 12px;
      padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer;
    }
    .check {
      width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--border-strong); display: grid; place-items: center;
      flex: none; color: var(--on-accent); margin-top: 1px;
    }
    .check.on { background: var(--accent-gradient); border-color: transparent; }
    .foot { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); }
    .spacer { flex: 1; }
  `,
})
export class ShareDialog {
  readonly mode = input.required<'export' | 'import'>();
  readonly closed = output<void>();
  readonly confirmed = output<void>();

  protected readonly t = inject(I18n).t;
  protected readonly agreed = signal(false);

  protected title(): string {
    return this.mode() === 'export' ? this.t('recordings.exportTitle') : this.t('recordings.importTitle');
  }
}
