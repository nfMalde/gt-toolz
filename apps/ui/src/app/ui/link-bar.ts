import { Component, inject } from '@angular/core';
import { LINK_ICONS, LINK_NAMES, Links } from '../core/links';
import { I18n } from '../i18n/i18n';
import { Icon } from './icon';

/**
 * Small bar at the bottom right (the user, 2026-10-22: "rechts unten als Minibar"): donate and Maldö's channels,
 * besides the full links under About. Opens a page in the browser only on a click.
 */
@Component({
  selector: 'gtt-link-bar',
  imports: [Icon],
  template: `
    @if (links.support().length || links.channels().length) {
      <nav class="bar" [attr.aria-label]="t('links.bar')">
        @for (id of links.support(); track id) {
          <button type="button" class="donate focusable" [title]="t('links.donate', { name: names[id] })" (click)="links.open(id)">
            <gtt-icon [name]="icons[id]" [size]="13" />{{ t('links.donateShort') }}
          </button>
        }
        @if (links.support().length && links.channels().length) { <span class="sep"></span> }
        @for (id of links.channels(); track id) {
          <button type="button" class="channel focusable" [title]="t('links.follow', { name: names[id] })"
                  [attr.aria-label]="t('links.follow', { name: names[id] })" (click)="links.open(id)">
            <gtt-icon [name]="icons[id]" [size]="15" />
          </button>
        }
      </nav>
    }
  `,
  styles: `
    :host { position: fixed; right: 14px; bottom: 12px; z-index: 20; }
    .bar {
      display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 12px;
      border: 1px solid var(--border); background: rgba(var(--shade-rgb), 0.82); backdrop-filter: blur(8px);
      box-shadow: 0 10px 28px -14px rgba(0, 0, 0, 0.9);
    }
    button {
      appearance: none; border: 0; background: transparent; color: var(--text-3); font: inherit; cursor: pointer;
      display: inline-flex; align-items: center; gap: 5px; height: 26px; border-radius: 8px;
    }
    button:hover { color: var(--text); background: var(--surface-hover); }
    .channel { width: 28px; justify-content: center; }
    .donate { padding: 0 9px; font-size: 11.5px; font-weight: 650; color: var(--accent-text); }
    .donate:hover { color: var(--on-accent); background: var(--accent-gradient); }
    .sep { width: 1px; height: 14px; margin: 0 3px; background: var(--border-strong); }
  `,
})
export class LinkBar {
  protected readonly links = inject(Links);
  protected readonly t = inject(I18n).t;
  protected readonly names = LINK_NAMES;
  protected readonly icons = LINK_ICONS;
}
