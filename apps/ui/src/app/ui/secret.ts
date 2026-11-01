import { Component, inject, input } from '@angular/core';
import { REVEAL_SECONDS, Reveal, StreamerMode } from '../core/streamer';
import { I18n } from '../i18n/i18n';
import { Icon } from './icon';

/** A value that streamer mode hides (an IP, a path, a player's name): dots, a click shows it after a warning. */
@Component({
  selector: 'gtt-secret',
  imports: [Icon],
  template: `
    @if (reveal.hidden()) {
      <button type="button" class="masked focusable" [title]="t('streamer.hidden')" [attr.aria-label]="t('streamer.hidden')"
              (click)="$event.stopPropagation(); $event.preventDefault(); reveal.show()">
        <gtt-icon name="eyeOff" [size]="12" /><span>•••••</span>
      </button>
    } @else {
      <span [class.revealed]="reveal.revealed()" [title]="reveal.revealed() ? t('streamer.hide') : ''"
            (click)="reveal.revealed() && reveal.hide()">{{ value() }}</span>
    }
  `,
  styles: `
    :host { display: inline; }
    .masked {
      appearance: none; display: inline-flex; align-items: center; gap: 4px; padding: 0 6px; height: 18px; vertical-align: middle;
      border-radius: 6px; border: 1px dashed var(--border-strong); background: var(--surface-3); color: var(--text-3);
      font: inherit; font-size: 11px; letter-spacing: 1px; cursor: pointer;
    }
    .masked:hover { color: var(--text); border-color: var(--accent); }
    .revealed { outline: 1px dashed var(--warn); outline-offset: 2px; border-radius: 3px; cursor: pointer; }
  `,
})
export class Secret {
  readonly value = input<string | null | undefined>('');
  protected readonly t = inject(I18n).t;
  protected readonly reveal = new Reveal();
}

/**
 * An input whose content streamer mode hides (the PlayStation's IP, a player's name): wraps the input, shows dots
 * while typing, and an eye button that shows it after a warning (styles.css: gtt-secret-field.masked input).
 */
@Component({
  selector: 'gtt-secret-field',
  imports: [Icon],
  host: { '[class.masked]': 'reveal.hidden()' },
  template: `
    <ng-content />
    @if (streamer.enabled()) {
      <button type="button" class="btn ghost icon-only eye focusable" [title]="reveal.hidden() ? t('streamer.hidden') : t('streamer.hide')"
              [attr.aria-label]="reveal.hidden() ? t('streamer.hidden') : t('streamer.hide')" (click)="reveal.toggle()">
        <gtt-icon [name]="reveal.hidden() ? 'eye' : 'eyeOff'" [size]="16" />
      </button>
    }
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 6px; min-width: 0; }
    .eye { flex: none; }
  `,
})
export class SecretField {
  protected readonly streamer = inject(StreamerMode);
  protected readonly t = inject(I18n).t;
  protected readonly reveal = new Reveal();
}

/** The warning before a hidden value is shown (one for the whole app, see StreamerMode.confirm). */
@Component({
  selector: 'gtt-reveal-dialog',
  imports: [Icon],
  template: `
    @if (streamer.asking(); as answer) {
      <div class="backdrop" (click)="answer(false)"></div>
      <section class="dialog" role="alertdialog" aria-modal="true" [attr.aria-label]="t('streamer.confirmTitle')">
        <div class="head">
          <div class="card-icon accent"><gtt-icon name="eye" /></div>
          <h2>{{ t('streamer.confirmTitle') }}</h2>
        </div>
        <p class="muted">{{ t('streamer.confirmText', { s: seconds }) }}</p>
        <div class="foot">
          <button type="button" class="btn ghost" (click)="answer(false)">{{ t('common.cancel') }}</button>
          <span class="spacer"></span>
          <button type="button" class="btn primary" (click)="answer(true)"><gtt-icon name="eye" [size]="16" />{{ t('streamer.confirmShow') }}</button>
        </div>
      </section>
    }
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 28px; pointer-events: none; }
    :host:has(.dialog) { pointer-events: auto; }
    .backdrop { position: absolute; inset: 0; background: rgba(var(--shade-rgb), .7); backdrop-filter: blur(4px); }
    .dialog {
      position: relative; width: min(440px, 100%); padding: 20px; display: flex; flex-direction: column; gap: 14px;
      border-radius: 18px; border: 1px solid var(--border-strong); background: linear-gradient(180deg, var(--surface-2), var(--surface));
      box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
    }
    .head { display: flex; align-items: center; gap: 12px; }
    .foot { display: flex; align-items: center; gap: 10px; }
  `,
})
export class RevealDialog {
  protected readonly streamer = inject(StreamerMode);
  protected readonly t = inject(I18n).t;
  protected readonly seconds = REVEAL_SECONDS;
}
