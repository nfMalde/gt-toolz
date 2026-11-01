import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRODUCT_BYLINE, PRODUCT_NAME, type LinkId } from '@gtt/api';
import { LINK_ICONS, LINK_NAMES, Links } from '../../core/links';
import { I18n, type TextKey } from '../../i18n/i18n';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'gtt-about',
  imports: [Icon, RouterLink],
  template: `
    <div class="page">
      <section class="card hero">
        <img src="maldoe-512.png" alt="Maldö" width="132" height="132" />
        <div class="hero-text">
          <div class="eyebrow">{{ t('about.eyebrow') }}</div>
          <h1>{{ product }} <span class="byline">{{ byline }}</span></h1>
          <p class="muted">{{ t('about.tagline') }}</p>
          <div class="row wrap">
            <span class="chip accent">{{ t('about.version') }} {{ settings.info()?.version }}</span>
            <span class="chip ok"><gtt-icon name="heart" [size]="13" />{{ t('about.free') }}</span>
          </div>
        </div>
      </section>

      <div class="columns">
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="shield" /></div>
            <h2>{{ t('about.privacy') }}</h2>
          </div>
          <ul class="checks">
            @for (key of privacy; track key) {
              <li><gtt-icon name="check" [size]="16" [weight]="2.4" />{{ t(key) }}</li>
            }
          </ul>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="heart" /></div>
            <h2>{{ t('about.support') }}</h2>
          </div>
          <p class="muted">{{ t('about.supportText') }}</p>
          @if (links.support().length) {
            <div class="row wrap links">
              @for (id of links.support(); track id) {
                <button type="button" class="btn primary" (click)="links.open(id)"><gtt-icon [name]="icons[id]" [size]="15" />{{ t('links.donate', { name: names[id] }) }}</button>
              }
            </div>
          }
          @if (links.channels().length) {
            <div class="divider"></div>
            <p class="muted">{{ t('about.channelsText') }}</p>
            <div class="row wrap links">
              @for (id of links.channels(); track id) {
                <button type="button" class="btn" (click)="links.open(id)"><gtt-icon [name]="icons[id]" [size]="15" />{{ names[id] }}</button>
              }
            </div>
          }
          <div class="divider"></div>
          <p class="faint small">{{ t('about.disclaimer', { product: product }) }}</p>
        </section>
      </div>

      <section class="card open-source">
        <div class="card-header">
          <div class="card-icon accent"><gtt-icon name="code" /></div>
          <div>
            <h2>{{ t('about.openSource') }}</h2>
            <p class="muted">{{ t('about.openSourceText', { product: product }) }}</p>
          </div>
        </div>
        <p class="faint small">{{ t('about.beta') }}</p>
        @if (links.project().length) {
          <div class="row wrap">
            @for (id of links.project(); track id) {
              <button type="button" class="btn" (click)="links.open(id)"><gtt-icon [name]="icons[id]" [size]="15" />{{ t(projectLabel(id)) }}</button>
            }
          </div>
        }
      </section>
      <section class="card third-party">
        <div class="card-header">
          <div class="card-icon"><gtt-icon name="info" /></div>
          <div>
            <h2>{{ t('about.thirdParty') }}</h2>
            <p class="faint small">{{ t('about.thirdPartyText') }}</p>
          </div>
        </div>
        <a class="btn" routerLink="/licenses"><gtt-icon name="chevronRight" [size]="15" />{{ t('about.thirdPartyOpen') }}</a>
      </section>
    </div>
  `,
  styles: `
    .hero { display: flex; gap: 22px; align-items: center; padding: 26px; }
    .hero img { flex: none; filter: drop-shadow(0 12px 26px rgba(var(--accent-rgb), 0.3)); }
    .hero-text { display: flex; flex-direction: column; gap: 8px; }
    .hero-text .byline { font-size: 16px; font-weight: 500; color: var(--text-3); }
    .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    @media (max-width: 1100px) { .columns { grid-template-columns: 1fr; } }
    .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
    .checks li { display: flex; gap: 10px; align-items: flex-start; }
    .checks gtt-icon { color: var(--ok); margin-top: 2px; }
    .links { margin-top: 14px; }
    .open-source { display: flex; flex-direction: column; gap: 10px; }
    .third-party { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .third-party .btn { text-decoration: none; }
  `,
})
export class About {
  protected readonly settings = inject(SettingsStore);
  /** Donation and Maldö's channels (opened in the browser, only on a click). */
  protected readonly links = inject(Links);
  protected readonly names = LINK_NAMES;
  protected readonly icons = LINK_ICONS;
  protected readonly t = inject(I18n).t;
  protected readonly product = PRODUCT_NAME;
  protected readonly byline = PRODUCT_BYLINE;

  protected readonly privacy: TextKey[] = ['about.privacy1', 'about.privacy2', 'about.privacy3', 'about.privacy4'];
  /** The project's links on GitHub (PROJECT_LINKS). */
  protected projectLabel(id: LinkId): TextKey {
    return id === 'issues' ? 'about.reportBug' : id === 'releases' ? 'about.releases' : 'about.sourceCode';
  }
}
