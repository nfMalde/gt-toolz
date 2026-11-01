import { Component, inject } from '@angular/core';
import { PRODUCT_BYLINE, PRODUCT_NAME } from '@gtt/api';
import { I18n, type TextKey } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { Icon, type IconName } from '../../ui/icon';

const HOW: { title: TextKey; text: TextKey; important?: boolean }[] = [
  { title: 'welcome.how1', text: 'welcome.how1Text' },
  { title: 'welcome.how2', text: 'welcome.how2Text' },
  { title: 'welcome.howCalibrate', text: 'welcome.howCalibrateText', important: true },
  { title: 'welcome.how3', text: 'welcome.how3Text' },
];

const TRUST: { icon: IconName; title: TextKey; text: TextKey }[] = [
  { icon: 'heart', title: 'welcome.free', text: 'welcome.freeText' },
  { icon: 'users', title: 'welcome.noAccount', text: 'welcome.noAccountText' },
  { icon: 'shield', title: 'welcome.noTracking', text: 'welcome.noTrackingText' },
];

/** First start: how it works and what it does not do; from here the setup assistant starts (there is no "later"). */
@Component({
  selector: 'gtt-welcome',
  imports: [Icon],
  host: { role: 'dialog', 'aria-modal': 'true', '[attr.aria-label]': "t('welcome.title', { product: product })" },
  template: `
    <div class="backdrop"></div>
    <div class="scroller">
    <div class="welcome">
      <div class="lang-switch" role="radiogroup" [attr.aria-label]="t('settings.language')">
        @for (language of settings.languages(); track language.id) {
          <button type="button" role="radio" class="focusable" [class.active]="settings.language() === language.id"
                  [attr.aria-checked]="settings.language() === language.id" [title]="language.name" (click)="setLanguage(language.id)">
            {{ language.id.toUpperCase() }}
          </button>
        }
      </div>

      <img class="logo" src="maldoe-256.png" alt="" width="96" height="96" />
      <h1>{{ t('welcome.title', { product: product }) }}</h1>
      <p class="byline">{{ byline }}</p>
      <p class="lead muted">{{ t('welcome.lead') }}</p>

      <ol class="how">
        @for (item of how; track item.title; let i = $index) {
          <li [class.important]="item.important">
            <span class="num">{{ i + 1 }}</span>
            <div>
              <b>{{ t(item.title) }}</b>
              @if (item.important) {
                <span class="chip warn">{{ t('welcome.important') }}</span>
              }
              <p class="muted small">{{ t(item.text) }}</p>
            </div>
          </li>
        }
      </ol>

      <div class="a11y">
        <div class="a11y-icon"><gtt-icon name="vibrate" [size]="30" /></div>
        <div class="a11y-text">
          <b>{{ t('welcome.haptics') }}</b>
          <span class="chip warn">{{ t('haptics.experimental') }}</span>
          <p class="muted small">{{ t('welcome.hapticsText') }}</p>
        </div>
        <button type="button" class="btn" (click)="setupHaptics()"><gtt-icon name="vibrate" [size]="16" />{{ t('welcome.hapticsButton') }}</button>
      </div>

      <div class="feature">
        <div class="feature-icon"><gtt-icon name="cast" [size]="28" /></div>
        <div class="a11y-text">
          <b>{{ t('welcome.overlays') }}</b>
          <span class="chip">{{ t('welcome.overlaysChip') }}</span>
          <p class="muted small">{{ t('welcome.overlaysText') }}</p>
        </div>
      </div>

      <div class="trust">
        @for (item of trust; track item.title) {
          <div class="badge">
            <div class="card-icon accent"><gtt-icon [name]="item.icon" /></div>
            <div>
              <b>{{ t(item.title) }}</b>
              <p class="faint small">{{ t(item.text) }}</p>
            </div>
          </div>
        }
      </div>

      <div class="footer">
        <div class="actions">
          <button type="button" class="btn primary lg" (click)="startSetup()">{{ t('welcome.setup') }}<gtt-icon name="chevronRight" [size]="18" /></button>
        </div>
        <p class="faint small hint">{{ t('welcome.setupHint') }}</p>
      </div>
    </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: var(--titlebar-height) 0 0 0;
      z-index: 60;
    }
    /*
     * Its own scrolling layer above the backdrop (alpha 0.0.3): when the host itself scrolled, the backdrop, a
     * positioned child, was painted over the host's scrollbar, so there was none to see on any system.
     */
    .scroller {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      overflow: auto;
    }
    .backdrop {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(900px 520px at 80% 0%, rgba(var(--accent-rgb), 0.16), transparent 60%),
        radial-gradient(800px 520px at 0% 100%, rgba(34, 211, 238, 0.08), transparent 60%),
        rgba(var(--shade-rgb), 0.92);
      backdrop-filter: blur(10px);
    }
    .welcome {
      position: relative;
      width: min(860px, 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 32px 36px 24px;
      border-radius: 24px;
      border: 1px solid var(--border-strong);
      background: linear-gradient(180deg, rgba(26, 30, 40, 0.97) 0%, rgba(16, 19, 26, 0.98) 100%);
      box-shadow: 0 40px 120px -40px rgba(0, 0, 0, 0.9);
      text-align: center;
    }
    .lang-switch {
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      gap: 2px;
      padding: 2px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }
    .lang-switch button {
      appearance: none;
      border: 0;
      border-radius: 6px;
      padding: 3px 9px;
      background: transparent;
      color: var(--text-3);
      font: inherit;
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.06em;
      cursor: pointer;
    }
    .lang-switch button.active { background: var(--accent-soft); color: var(--text); }
    h1 { margin: 0; font-size: 26px; }
    .byline { margin: -10px 0 0; color: var(--text-3); font-size: 13px; }
    .lead { margin: 0; max-width: 560px; }
    .how {
      list-style: none;
      margin: 8px 0 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      width: 100%;
      text-align: left;
    }
    .how li { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
    .how p { margin: 4px 0 0; }
    .how li.important { border-color: rgba(251, 191, 36, 0.45); background: rgba(251, 191, 36, 0.07); }
    .how .chip { margin-left: 6px; vertical-align: 1px; }
    .num {
      flex: none;
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--text);
      font-size: 12px;
      font-weight: 700;
    }
    .a11y {
      display: flex; align-items: center; gap: 16px; width: 100%; padding: 16px 18px; text-align: left; border-radius: 16px;
      border: 1px solid rgba(var(--accent-rgb), 0.45);
      background: radial-gradient(500px 160px at 0% 0%, rgba(var(--accent-rgb), 0.2), transparent 70%), var(--surface);
    }
    .a11y-icon {
      flex: none; width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; color: var(--on-accent);
      background: var(--accent-gradient); box-shadow: 0 12px 30px -12px rgba(var(--accent-rgb), 0.7);
    }
    /* For streamers: the OBS overlays, in the cyan of the backdrop so it does not compete with accessibility. */
    .feature {
      display: flex; align-items: center; gap: 16px; width: 100%; padding: 16px 18px; text-align: left; border-radius: 16px;
      border: 1px solid rgba(34, 211, 238, 0.35);
      background: radial-gradient(500px 160px at 0% 0%, rgba(34, 211, 238, 0.12), transparent 70%), var(--surface);
    }
    .feature-icon {
      flex: none; width: 56px; height: 56px; border-radius: 16px; display: grid; place-items: center; color: #22d3ee;
      background: rgba(34, 211, 238, 0.12); border: 1px solid rgba(34, 211, 238, 0.35);
    }
    .a11y-text { flex: 1; min-width: 0; }
    .a11y-text b { font-size: 15.5px; }
    .a11y-text .chip { margin-left: 8px; vertical-align: 1px; }
    .a11y-text p { margin: 4px 0 0; }
    .trust { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; width: 100%; text-align: left; }
    .badge { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 14px; border: 1px solid rgba(52, 211, 153, 0.25); background: rgba(52, 211, 153, 0.06); }
    .badge p { margin: 4px 0 0; }
    /*
     * The only way on stays in sight at the bottom, also when the window is too small for the card (alpha 0.0.3:
     * on a Mac the start button was below the edge, and nothing showed that the page scrolls).
     */
    .footer {
      position: sticky;
      bottom: -24px;
      align-self: stretch;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      margin: 0 -36px -24px;
      padding: 18px 36px 24px;
      border-radius: 0 0 24px 24px;
      background: linear-gradient(180deg, rgba(16, 19, 26, 0) 0%, rgb(16, 19, 26) 28px);
    }
    .actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .hint { margin: 0; }
  `,
})
export class Welcome {
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;
  protected readonly product = PRODUCT_NAME;
  protected readonly byline = PRODUCT_BYLINE;
  protected readonly how = HOW;
  protected readonly trust = TRUST;

  protected setLanguage(language: string): void {
    if (language !== this.settings.language()) void this.settings.update({ language });
  }

  /** Accessibility: the setup assistant right at the vibration step. */
  protected setupHaptics(): void {
    this.settings.startSetup('haptics');
  }

  /** The only way on: the setup, finished once before the app opens (the welcome comes back until then). */
  protected startSetup(): void {
    this.settings.startSetup();
  }
}
