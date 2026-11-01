import { Component, computed, inject, input } from '@angular/core';
import { bytes, voiceName } from '../../core/format';
import { StreamerMode } from '../../core/streamer';
import { I18n } from '../../i18n/i18n';
import { VoicesStore, type OfferedPackage } from '../../stores/voices.store';
import { Icon } from '../../ui/icon';

/**
 * Optional voice packages: the user ticks what they want (the app language's packages come preselected),
 * nothing is downloaded before "Install". Shows license and source of every package.
 */
@Component({
  selector: 'gtt-voice-packages',
  imports: [Icon],
  template: `
    <div class="packages">
      @for (offer of shown(); track offer.pkg.id) {
        <div class="package" [class.checked]="isSelected(offer)" [class.installed]="offer.pkg.installed">
          @if (offer.pkg.installed) {
            <div class="check done"><gtt-icon name="check" [size]="14" [weight]="2.6" /></div>
          } @else {
            <button type="button" role="checkbox" class="check focusable" [attr.aria-checked]="isSelected(offer)"
                    [disabled]="store.installing()" (click)="store.toggle(offer.pkg.id)">
              @if (isSelected(offer)) { <gtt-icon name="check" [size]="14" [weight]="2.6" /> }
            </button>
          }
          <div class="info">
            <div class="row wrap title-row">
              <span class="name">{{ title(offer) }}</span>
              @for (language of offer.pkg.languages; track language) { <span class="chip">{{ language }}</span> }
              @if (offer.pkg.installed) { <span class="chip ok">{{ t('voices.installed') }}</span> }
            </div>
            @if (!compact()) {
              <div class="faint small" [title]="offer.pkg.license">{{ t('voices.license') }}: {{ license(offer.pkg.license) }}</div>
              <div class="faint small">{{ t('voices.source') }}: {{ offer.pkg.source }}</div>
            } @else {
              <div class="faint small">{{ engine(offer) }}</div>
            }
          </div>
          <div class="size">
            @if (offer.pkg.installed) {
              @if (!compact()) {
                <button type="button" class="btn sm ghost" [disabled]="store.installing()" (click)="store.remove(offer.pkg.id)">
                  <gtt-icon name="trash" [size]="14" />{{ t('voices.remove') }}
                </button>
              }
            } @else {
              <span class="num">{{ size(offer.sizeBytes) }}</span>
              @if (offer.engine && !offer.engine.installed) {
                <span class="faint small">{{ t('voices.withEngine') }}</span>
              }
            }
          </div>
        </div>
      }
    </div>

    @switch (store.install().state) {
      @case ('installing') {
        <div class="install-progress">
          <div class="row">
            <span class="small spacer">{{ progressText() }}</span>
            <span class="small num faint">{{ progressBytes() }}</span>
            <button type="button" class="btn sm ghost" (click)="store.cancel()">{{ t('common.cancel') }}</button>
          </div>
          <div class="progress" [class.indeterminate]="extracting()"><div [style.width.%]="percent()"></div></div>
        </div>
      }
      @case ('done') {
        <div class="banner info"><gtt-icon name="check" />{{ t('voices.installDone') }}</div>
      }
      @case ('cancelled') {
        <div class="banner warn"><gtt-icon name="x" />{{ t('voices.installCancelled') }}</div>
      }
      @case ('error') {
        <div class="banner danger"><gtt-icon name="alert" />{{ errorText() }}</div>
      }
    }

    <div class="footer">
      <p class="faint small hint"><gtt-icon name="shield" [size]="14" /> {{ t('voices.packagesHint') }}</p>
      @if (installable()) {
        <button type="button" class="btn primary" [disabled]="!store.selectedBytes() || store.installing()" (click)="store.installSelected()">
          <gtt-icon name="download" [size]="16" />{{ t('voices.install', { size: size(store.selectedBytes()) }) }}
        </button>
      }
    </div>
  `,
  styles: `
    .packages { display: flex; flex-direction: column; gap: 8px; }
    .package {
      display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--bg-elevated); transition: border-color .15s, background .15s;
    }
    .package.checked { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .07), transparent 70%); }
    .check {
      appearance: none; width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--border-strong);
      background: transparent; color: var(--on-accent); display: grid; place-items: center; cursor: pointer; flex: none; padding: 0;
    }
    .checked .check { background: var(--accent-gradient); border-color: transparent; }
    .check.done { background: var(--ok-soft); border-color: rgba(52,211,153,.4); color: var(--ok); cursor: default; }
    .check:disabled { cursor: default; opacity: .6; }
    .info { flex: 1; min-width: 0; }
    .info .faint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .title-row { gap: 8px; }
    .name { font-weight: 650; }
    .size { display: flex; flex-direction: column; align-items: flex-end; font-weight: 650; flex: none; }
    .install-progress { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; }
    .banner { margin-top: 14px; }
    .footer { display: flex; align-items: center; gap: 16px; margin-top: 16px; }
    .hint { flex: 1; display: flex; gap: 6px; align-items: flex-start; }
  `,
})
export class VoicePackages {
  /** Short version for the start guide (no license lines, no remove buttons). */
  readonly compact = input(false);

  protected readonly store = inject(VoicesStore);
  private readonly streamer = inject(StreamerMode);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  private readonly progress = computed(() => {
    const install = this.store.install();
    return install.state === 'installing' ? install.progress : undefined;
  });
  protected readonly extracting = computed(() => this.progress()?.phase === 'extract');
  protected readonly percent = computed(() => {
    const p = this.progress();
    return p && p.totalBytes ? (p.receivedBytes / p.totalBytes) * 100 : 0;
  });
  protected readonly progressText = computed(() => {
    const p = this.progress();
    if (!p) return this.t('voices.downloading', { name: '…' });
    const name = this.store.packages().find((pkg) => pkg.id === p.packageId)?.name ?? p.packageId;
    return this.t(p.phase === 'extract' ? 'voices.extracting' : 'voices.downloading', { name });
  });
  protected readonly progressBytes = computed(() => {
    const p = this.progress();
    return p ? `${this.size(p.receivedBytes)} / ${this.size(p.totalBytes)}` : '';
  });
  protected readonly errorText = computed(() => {
    const install = this.store.install();
    return install.state === 'error' ? this.t('voices.installError', { message: this.streamer.paths(install.message) }) : '';
  });

  /** The guide shows only packages for the app language; the voices page shows all. */
  protected readonly shown = computed(() => {
    const offered = this.store.offered();
    if (!this.compact()) return offered;
    const language = this.store.language();
    return offered.filter((o) => o.pkg.languages.some((l) => l.toLowerCase().startsWith(language)));
  });
  protected readonly installable = computed(() => this.shown().some((o) => !o.pkg.installed));

  /** The manifest's license note without the internal decision wording. */
  protected license(text: string): string {
    return text.replace(/^allowed:\s*/i, '').split(';')[0]!.trim();
  }

  protected isSelected(offer: OfferedPackage): boolean {
    return this.store.selected().includes(offer.pkg.id);
  }

  protected title(offer: OfferedPackage): string {
    const pkg = offer.pkg;
    if (pkg.kind === 'model') {
      const names = pkg.voices.map(voiceName);
      // "CSS10 German (Coqui VITS)" already names its one voice.
      return names.every((name) => pkg.name.includes(name)) ? pkg.name : `${pkg.name} · ${names.join(', ')}`;
    }
    return voiceName(pkg.id);
  }

  /** The engine a package runs in: Piper, or VITS in sherpa-onnx (CSS10 German). */
  protected engine(offer: OfferedPackage): string {
    const pkg = offer.pkg;
    if (pkg.engine === 'piper') return 'Piper';
    return 'VITS (sherpa-onnx)';
  }

  protected size(value: number): string {
    return bytes(value, this.i18n.locale());
  }
}
