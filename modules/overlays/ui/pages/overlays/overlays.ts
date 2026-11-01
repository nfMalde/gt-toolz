import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { DEFAULT_OVERLAY_LAYOUT, OVERLAY_CANVASES, type OverlayLayout, type OverlayLook, type OverlaysSettings } from '@gt-toolz/overlays/api';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { OverlaysStore } from '../../stores/overlays.store';
import { OverlayEditor } from './overlay-editor';

/**
 * Browser source for OBS: a web server on this PC only, one address, and the overlay put together right here
 * (stream feedback 2026-10-23: drag in what you want, lighter looks).
 */
@Component({
  selector: 'gtt-overlays',
  imports: [Icon, OverlayEditor, Segmented, Slider, Toggle],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('overlays.eyebrow') }}</div>
          <h1>{{ t('overlays.title') }}</h1>
        </div>
      </div>

      @if (store.settings(); as s) {
        <div class="grid">
          <section class="card span-5">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon name="pc" /></div>
              <h2>{{ t('overlays.server') }}</h2>
            </div>
            <!-- On and off: the module's switch (Modules page); this page is there only while it is on. -->
            <p class="muted small">{{ t('overlays.enableHint') }}</p>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('overlays.autoHide') }}</div>
                <div class="hint">{{ t('overlays.autoHideHint') }}</div>
              </div>
              <div class="control">
                <gtt-toggle [checked]="s.overlayAutoHide" [label]="t('overlays.autoHide')" (checkedChange)="set({ overlayAutoHide: $event })" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('overlays.port') }}</div>
                <div class="hint">{{ t('overlays.portHint') }}</div>
                @if (!portValid()) {
                  <div class="error-text">{{ t('overlays.portInvalid') }}</div>
                }
              </div>
              <div class="control port-row">
                <input class="input port mono" inputmode="numeric" [class.invalid]="!portValid()" [value]="port()" spellcheck="false"
                       [attr.aria-label]="t('overlays.port')" (input)="port.set(inputValue($event))" (keydown.enter)="savePort()" />
                <button type="button" class="btn" [disabled]="!portChanged() || !portValid()" (click)="savePort()">{{ t('common.save') }}</button>
              </div>
            </div>
            @if (store.status(); as o) {
              @if (o.running) {
                <p class="small state ok"><gtt-icon name="check" [size]="14" />{{ t('overlays.running', { port: o.port }) }}</p>
              } @else if (o.error) {
                <p class="small state bad"><gtt-icon name="alert" [size]="14" />{{ o.error === 'EADDRINUSE' ? t('overlays.portBusy', { port: o.port }) : t('overlays.failed', { error: o.error }) }}</p>
              }
            }
          </section>

          <section class="card span-7">
            <div class="card-header">
              <div class="card-icon"><gtt-icon name="guide" /></div>
              <h2>{{ t('overlays.howTo') }}</h2>
            </div>
            <ol class="steps">
              <li>{{ t('overlays.step1') }}</li>
              <li>{{ t('overlays.step2') }}</li>
              <li>{{ t('overlays.step3', { w: s.overlayLayout.width, h: s.overlayLayout.height }) }}</li>
              <li>{{ t('overlays.step4') }}</li>
            </ol>
            <div class="link" [class.off]="!running()">
              <div class="url mono selectable" [title]="url()">{{ url() }}</div>
              <button type="button" class="btn sm copy" [disabled]="!running()" (click)="copy()">
                <gtt-icon [name]="copied() ? 'check' : 'copy'" [size]="14" />{{ copied() ? t('overlays.copied') : t('overlays.copy') }}
              </button>
              <button type="button" class="btn sm ghost" [disabled]="!running()" (click)="open()">
                <gtt-icon name="external" [size]="14" />{{ t('overlays.open') }}
              </button>
            </div>
          </section>

          <section class="card span-12">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon name="cast" /></div>
              <h2>{{ t('overlays.editor') }}</h2>
              <div class="spacer"></div>
              <button type="button" class="btn sm ghost" (click)="reset()"><gtt-icon name="refresh" [size]="14" />{{ t('overlays.reset') }}</button>
              <button type="button" class="btn sm ghost" [disabled]="!s.overlayLayout.widgets.length" (click)="clear()"><gtt-icon name="trash" [size]="14" />{{ t('overlays.clear') }}</button>
            </div>
            <div class="looks">
              <div class="look">
                <div class="label">{{ t('overlays.look') }}</div>
                <gtt-segmented [options]="lookOptions()" [value]="s.overlayLayout.look" (valueChange)="setLook($event)" />
              </div>
              <div class="look slider" [class.disabled]="s.overlayLayout.look === 'clean'">
                <div class="label">{{ t('overlays.background') }}</div>
                <gtt-slider [value]="s.overlayLayout.background * 100" [min]="0" [max]="100" [step]="5" [label]="t('overlays.background')"
                            [format]="percent" (changed)="setBackground($event / 100)" />
              </div>
              <div class="look">
                <div class="label">{{ t('overlays.canvas') }}</div>
                <gtt-segmented [options]="canvasOptions" [value]="canvasKey(s.overlayLayout)" (valueChange)="setCanvas($event)" />
              </div>
            </div>
            <gtt-overlay-editor [layout]="s.overlayLayout" [liveFrame]="store.preview()" (changed)="setLayout($event)" />
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .port { width: 90px; }
    .port-row { display: flex; gap: 8px; align-items: center; }
    .error-text { color: #ff8aa0; font-size: 12px; }
    .state { display: flex; align-items: center; gap: 6px; margin: 10px 0 0; color: var(--text-2); }
    .state.ok { color: var(--ok); }
    .state.bad { color: #ff8aa0; }
    .link { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
    .link .url {
      flex: 1; min-width: 0; padding: 8px 12px; border-radius: 9px; background: var(--surface-3); color: var(--text); font-size: 13px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .link.off .url { opacity: 0.45; }
    .link .copy { min-width: 112px; justify-content: center; }
    .looks { display: flex; flex-wrap: wrap; gap: 14px 28px; align-items: flex-end; margin-bottom: 14px; }
    .look { display: flex; flex-direction: column; gap: 6px; }
    .look .label { font-size: 12px; color: var(--text-2); }
    .look.slider { min-width: 240px; flex: 1; max-width: 360px; }
    .look.disabled { opacity: 0.45; pointer-events: none; }
  `,
})
export class Overlays {
  protected readonly store = inject(OverlaysStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly running = computed(() => !!this.store.status()?.running);
  protected readonly url = computed(() => `http://127.0.0.1:${this.store.status()?.port ?? this.store.settings()?.overlayPort}/overlay`);

  /** The port field: edited locally, saved with the button. */
  protected readonly port = linkedSignal(() => String(this.store.settings()?.overlayPort ?? ''));
  protected readonly portValid = computed(() => /^\d{4,5}$/.test(this.port().trim()) && Number(this.port()) >= 1024 && Number(this.port()) <= 65535);
  protected readonly portChanged = computed(() => Number(this.port()) !== this.store.settings()?.overlayPort);

  protected readonly copied = signal(false);
  private copiedTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly lookOptions = computed<SegmentOption<OverlayLook>[]>(() => [
    { value: 'panel', label: this.t('overlays.look.panel') },
    { value: 'light', label: this.t('overlays.look.light') },
    { value: 'clean', label: this.t('overlays.look.clean') },
  ]);
  protected readonly canvasOptions: SegmentOption<string>[] = OVERLAY_CANVASES.map((c) => ({ value: `${c.width}x${c.height}`, label: `${c.height}p` }));
  protected readonly percent = (value: number) => `${Math.round(value)} %`;

  constructor() {
    // Up to date also after the module was switched off and on again.
    void this.store.load();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  /** Saved at once; the server tells how it went when it moves (the status line). */
  protected set(change: Partial<OverlaysSettings>): Promise<void> {
    return this.store.update(change);
  }

  protected savePort(): void {
    if (this.portValid() && this.portChanged()) void this.set({ overlayPort: Number(this.port()) });
  }

  protected async copy(): Promise<void> {
    if (!(await this.store.copyLink())) return;
    this.copied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  protected open(): void {
    void this.store.openLink();
  }

  // --- The layout: every change shows in OBS at once ---

  protected setLayout(overlayLayout: OverlayLayout): void {
    void this.store.update({ overlayLayout });
  }

  private change(change: Partial<OverlayLayout>): void {
    const layout = this.store.settings()?.overlayLayout;
    if (layout) this.setLayout({ ...layout, ...change });
  }

  protected setLook(look: OverlayLook): void {
    this.change({ look });
  }

  protected setBackground(background: number): void {
    this.change({ background: Math.round(background * 100) / 100 });
  }

  protected canvasKey(layout: OverlayLayout): string {
    return `${layout.width}x${layout.height}`;
  }

  /** Another canvas size: the elements keep their place and size relative to it. */
  protected setCanvas(key: string): void {
    const layout = this.store.settings()?.overlayLayout;
    const canvas = OVERLAY_CANVASES.find((c) => `${c.width}x${c.height}` === key);
    if (!layout || !canvas || canvas.width === layout.width) return;
    const factor = canvas.width / layout.width;
    const widgets = layout.widgets.map((w) => ({
      ...w,
      x: Math.round(w.x * factor),
      y: Math.round(w.y * factor),
      scale: Math.min(4, Math.max(0.5, Math.round(w.scale * factor * 20) / 20)),
    }));
    this.setLayout({ ...layout, ...canvas, widgets });
  }

  protected reset(): void {
    this.setLayout(DEFAULT_OVERLAY_LAYOUT);
  }

  protected clear(): void {
    this.change({ widgets: [] });
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
