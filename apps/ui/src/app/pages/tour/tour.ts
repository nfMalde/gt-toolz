import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { TourStop } from '../../core/module-ui';
import { I18n } from '../../i18n/i18n';
import { MODULE_UIS } from '../../modules';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';

/**
 * The normal flow, in the order a driver meets it (the user, 2026-10-24: new users were swamped by the menus): the
 * modules' stops (the Cockpit while driving, the references for new tracks) and then the shell's, where voices,
 * settings and the rest live.
 */
const SHELL_STOPS: TourStop[] = [
  // Where the rest lives (the user, 2026-10-29: every part on its own, and each can be switched off).
  { target: 'nav-modules', order: 60, title: 'tour.modules', text: 'tour.modulesText' },
  { target: 'nav-voices', order: 70, title: 'tour.voices', text: 'tour.voicesText' },
  { target: 'nav-listen', order: 80, title: 'tour.listen', text: 'tour.listenText' },
  { target: 'nav-settings', order: 90, title: 'tour.settings', text: 'tour.settingsText' },
  { target: 'calls', order: 110, title: 'tour.calls', text: 'tour.callsText' },
  { target: 'nav-tour', order: 120, route: '/telemetry/cockpit', title: 'tour.again', text: 'tour.againText' },
];

const BUBBLE_WIDTH = 340;
const GAP = 14;

/**
 * The tour: dims the app, lights up one element at a time and explains it in a bubble next to it. Starts once after
 * the first setup and from "Tour" in the navigation. Esc ends it, the arrow keys step through.
 */
@Component({
  selector: 'gtt-tour',
  imports: [Icon],
  host: {
    role: 'dialog',
    'aria-modal': 'true',
    '[attr.aria-label]': "t('tour.title')",
    '(window:resize)': 'measure()',
    '(window:keydown)': 'key($event)',
  },
  template: `
    <div class="blocker"></div>
    @if (rect(); as r) {
      <div class="spot" [style.top.px]="r.top - 6" [style.left.px]="r.left - 6" [style.width.px]="r.width + 12" [style.height.px]="r.height + 12"></div>
    } @else {
      <div class="dim"></div>
    }
    <div class="bubble" [style.top.px]="bubble().top" [style.left.px]="bubble().left" [style.width.px]="width">
      <div class="counter eyebrow">{{ t('tour.counter', { n: index() + 1, total: stops.length }) }}</div>
      <b class="title">{{ t(stop().title) }}</b>
      <p class="muted small">{{ t(stop().text) }}</p>
      <div class="row">
        <button type="button" class="btn ghost sm" (click)="end()">{{ t('tour.skip') }}</button>
        <span class="spacer"></span>
        @if (index() > 0) {
          <button type="button" class="btn sm" (click)="back()"><gtt-icon name="chevronLeft" [size]="14" />{{ t('tour.back') }}</button>
        }
        <button type="button" class="btn primary sm" (click)="next()">
          {{ index() === stops.length - 1 ? t('tour.finish') : t('tour.next') }}<gtt-icon name="chevronRight" [size]="14" />
        </button>
      </div>
    </div>
  `,
  styles: `
    :host { position: fixed; inset: 0; z-index: 70; }
    .blocker { position: fixed; inset: 0; }
    .dim { position: fixed; inset: 0; background: rgba(var(--shade-rgb), 0.72); }
    /* The lit element: a hole in the dim layer, drawn by the shadow around it. */
    .spot {
      position: fixed;
      border-radius: 12px;
      box-shadow: 0 0 0 9999px rgba(var(--shade-rgb), 0.72), 0 0 0 2px var(--accent), 0 0 24px 4px rgba(var(--accent-rgb), 0.45);
      transition: top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease;
      pointer-events: none;
    }
    .bubble {
      position: fixed;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 16px 18px 14px;
      border-radius: 16px;
      border: 1px solid var(--border-strong);
      background: linear-gradient(180deg, rgba(26, 30, 40, 0.98) 0%, rgba(16, 19, 26, 0.99) 100%);
      box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.9);
      transition: top 0.25s ease, left 0.25s ease;
    }
    .title { font-size: 15.5px; }
    .bubble p { margin: 0 0 6px; line-height: 1.5; }
    .row { display: flex; align-items: center; gap: 8px; }
    .spacer { flex: 1; }
  `,
})
export class Tour {
  private readonly settings = inject(SettingsStore);
  private readonly router = inject(Router);
  protected readonly t = inject(I18n).t;

  /** The stops of the modules that are on (the others' pages are not there), and the shell's. */
  protected readonly stops = [...SHELL_STOPS, ...MODULE_UIS.filter((module) => this.settings.moduleEnabled(module.id)).flatMap((module) => module.tour ?? [])].sort(
    (a, b) => a.order - b.order,
  );
  protected readonly width = BUBBLE_WIDTH;
  protected readonly index = signal(0);
  protected readonly stop = computed(() => this.stops[this.index()]!);
  /** Where the lit element is; null: not found (the bubble stands in the middle). */
  protected readonly rect = signal<DOMRect | null>(null);
  private bubbleHeight = 190;

  /**
   * Next to the element: right of it (the navigation, narrow elements), left of it (on the right half), else below
   * or above it; always inside the window.
   */
  protected readonly bubble = computed(() => {
    const r = this.rect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clampTop = (top: number) => Math.max(GAP, Math.min(vh - this.bubbleHeight - GAP, top));
    const clampLeft = (left: number) => Math.max(GAP, Math.min(vw - BUBBLE_WIDTH - GAP, left));
    if (!r) return { top: clampTop((vh - this.bubbleHeight) / 2), left: clampLeft((vw - BUBBLE_WIDTH) / 2) };
    const beside = clampTop(r.top + r.height / 2 - this.bubbleHeight / 2);
    if (r.right + GAP + BUBBLE_WIDTH < vw && r.width < vw / 3 && r.left < vw / 2) return { top: beside, left: r.right + GAP };
    if (r.left - GAP - BUBBLE_WIDTH > 0 && r.left > vw / 2) return { top: beside, left: r.left - GAP - BUBBLE_WIDTH };
    if (r.bottom + GAP + this.bubbleHeight < vh) return { top: r.bottom + GAP, left: clampLeft(r.left) };
    return { top: clampTop(r.top - GAP - this.bubbleHeight), left: clampLeft(r.left) };
  });

  private frame = 0;

  constructor() {
    effect(() => {
      const stop = this.stop();
      untracked(() => void this.show(stop));
    });
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.frame);
      this.settling.forEach(clearTimeout);
    });
  }

  /** Opens the stop's page if needed, then finds the element (a page loads lazily: up to about a second). */
  private async show(stop: TourStop): Promise<void> {
    if (stop.route && this.router.url !== stop.route) await this.router.navigate([stop.route]);
    cancelAnimationFrame(this.frame);
    this.settling.forEach(clearTimeout);
    let tries = 0;
    const find = () => {
      const element = document.querySelector<HTMLElement>(`[data-tour="${stop.target}"]`);
      if (element) {
        element.scrollIntoView({ block: 'nearest' });
        this.place(element);
        // A page that just opened still lays itself out (fonts, cards): measure again shortly after.
        this.settling = [120, 350, 800].map((ms) => setTimeout(() => this.place(element), ms));
      } else if (tries++ < 60) {
        this.frame = requestAnimationFrame(find);
      } else {
        this.rect.set(null);
      }
    };
    find();
  }

  private settling: ReturnType<typeof setTimeout>[] = [];

  private place(element: HTMLElement): void {
    if (!element.isConnected) return;
    this.rect.set(element.getBoundingClientRect());
    this.measureBubble();
  }

  protected measure(): void {
    void this.show(this.stop());
  }

  private measureBubble(): void {
    requestAnimationFrame(() => {
      const height = document.querySelector('gtt-tour .bubble')?.getBoundingClientRect().height;
      if (height && Math.abs(height - this.bubbleHeight) > 2) {
        this.bubbleHeight = height;
        this.rect.set(this.rect() ? DOMRect.fromRect(this.rect()!) : null);
      }
    });
  }

  protected next(): void {
    if (this.index() === this.stops.length - 1) return this.end();
    this.index.update((i) => i + 1);
  }

  protected back(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  protected end(): void {
    this.settings.endTour();
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.end();
    else if (event.key === 'ArrowRight' || event.key === 'Enter') this.next();
    else if (event.key === 'ArrowLeft') this.back();
    else return;
    event.preventDefault();
  }
}
