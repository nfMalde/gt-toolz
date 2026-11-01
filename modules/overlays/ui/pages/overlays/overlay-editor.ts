import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, input, linkedSignal, output, signal, viewChild } from '@angular/core';
import { MAX_OVERLAY_WIDGETS, type OverlayFrame, type OverlayLayout, type OverlaySteeringStyle, type OverlayWidget, type OverlayWidgetKind } from '@gt-toolz/overlays/api';
import { demoOverlayFrame, OVERLAY_CSS, OverlayView } from '@gt-toolz/overlays/view';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { Icon, type IconName } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';

/** The elements on offer, in the palette's order. */
const WIDGETS: { kind: OverlayWidgetKind; icon: IconName }[] = [
  { kind: 'speed', icon: 'cockpit' },
  { kind: 'gear', icon: 'sliders' },
  { kind: 'pedals', icon: 'vibrate' },
  { kind: 'trace', icon: 'wave' },
  { kind: 'tyres', icon: 'gamepad' },
  { kind: 'lap', icon: 'flag' },
  { kind: 'times', icon: 'timer' },
  { kind: 'delta', icon: 'clock' },
  { kind: 'position', icon: 'users' },
  { kind: 'steering', icon: 'steering' },
];
/** Positions snap to this grid (canvas pixels); Alt places freely. */
const SNAP = 10;
/** The preview's refresh: about as often as OBS gets frames. */
const PREVIEW_MS = 50;
/** Live values count while they are this fresh; else the made-up lap runs. */
const LIVE_FRESH_MS = 1500;
const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
/** + and − change the selected element's size by this much. */
const SCALE_STEP = 0.1;

/** A move or a resize in progress: where the pointer and the element started. */
interface Drag {
  id: string;
  resize: boolean;
  pointerX: number;
  pointerY: number;
  x: number;
  y: number;
  scale: number;
  /** The element's size at scale 1. */
  width: number;
  height: number;
  moved: boolean;
}

/**
 * The overlay editor (stream feedback 2026-10-23: drag in what you want, one link): the canvas as OBS shows it,
 * drawn by the same view as the overlay page, with live values from GT7 (or a made-up lap). Elements are dragged in
 * from the palette (or clicked), moved, resized (at the corner, with the size slider, + and −) and removed; every
 * finished change is saved and shows in OBS at once.
 */
@Component({
  selector: 'gtt-overlay-editor',
  imports: [Icon, Segmented, Slider],
  template: `
    <div class="palette" role="toolbar" [attr.aria-label]="t('overlays.palette')">
      @for (item of widgets; track item.kind) {
        <button type="button" class="tile" draggable="true" [disabled]="full()" [title]="t('overlays.paletteHint')"
                (dragstart)="dragStart($event, item.kind)" (click)="add(item.kind)">
          <gtt-icon [name]="item.icon" [size]="15" />{{ t(name(item.kind)) }}
        </button>
      }
    </div>
    <div class="sizing" [class.off]="!draft().widgets.length">
      <span class="label">
        @if (selectedWidget(); as w) {
          {{ t('overlays.sizeOne', { name: t(name(w.kind)) }) }}
        } @else {
          {{ t('overlays.sizeAll') }}
        }
      </span>
      <gtt-slider [value]="sizeValue()" [min]="50" [max]="300" [step]="5" [label]="t('overlays.size')" [format]="percent" (changed)="setSize($event / 100)" />
    </div>
    @if (selectedWidget(); as w) {
      @if (w.kind === 'steering') {
        <div class="sizing">
          <span class="label">{{ t('overlays.variant') }}</span>
          <gtt-segmented [options]="steeringOptions()" [value]="w.variant ?? 'bar'" (valueChange)="setVariant($event)" />
        </div>
      }
    }
    <div class="frame" #frame [style.height.px]="draft().height * fit()" (dragover)="dragOver($event)" (drop)="drop($event)">
      <div class="stage" #stage tabindex="0" [attr.aria-label]="t('overlays.stage')"
           [style.width.px]="draft().width" [style.height.px]="draft().height" [style.transform]="'scale(' + fit() + ')'" [style.--inv]="1 / fit()"
           (pointerdown)="pointerDown($event)" (pointermove)="pointerMove($event)" (pointerup)="pointerUp($event)" (pointercancel)="pointerUp($event)"
           (keydown)="key($event)">
        <div #view></div>
        @if (box(); as b) {
          <div class="selection" [style.left.px]="b.x" [style.top.px]="b.y" [style.width.px]="b.w" [style.height.px]="b.h">
            <button type="button" class="remove" [title]="t('overlays.remove')" [attr.aria-label]="t('overlays.remove')"
                    (pointerdown)="$event.stopPropagation()" (click)="remove()">×</button>
            <div class="handle" data-handle="resize" [title]="t('overlays.resize')"></div>
          </div>
        }
        @if (!draft().widgets.length) {
          <div class="empty-note">{{ t('overlays.emptyCanvas') }}</div>
        }
      </div>
    </div>
    <div class="status small">
      <span class="dot" [class.live]="isLive()"></span>{{ isLive() ? t('overlays.previewLive') : t('overlays.previewDemo') }}
      <span class="faint">· {{ t('overlays.editHint') }}</span>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    .palette { display: flex; flex-wrap: wrap; gap: 8px; }
    .tile {
      display: inline-flex; align-items: center; gap: 6px; padding: 7px 11px; border-radius: 10px; cursor: grab;
      border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-size: 13px;
    }
    .tile:hover:not(:disabled) { border-color: var(--accent); }
    .tile:disabled { opacity: 0.45; cursor: not-allowed; }
    .sizing { display: flex; align-items: center; gap: 14px; }
    .sizing .label { font-size: 12px; color: var(--text-2); min-width: 160px; }
    .sizing gtt-slider { flex: 1; max-width: 420px; }
    .sizing.off { opacity: 0.45; pointer-events: none; }
    .frame {
      position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--border);
      background-color: #17120d;
      background-image: linear-gradient(45deg, #1f1912 25%, transparent 25%), linear-gradient(-45deg, #1f1912 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #1f1912 75%), linear-gradient(-45deg, transparent 75%, #1f1912 75%);
      background-size: 32px 32px; background-position: 0 0, 0 16px, 16px -16px, -16px 0;
    }
    .stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; outline: none; touch-action: none; }
    .stage ::ng-deep .w { cursor: move; }
    .selection { position: absolute; pointer-events: none; outline: calc(2px * var(--inv)) solid var(--accent); outline-offset: calc(3px * var(--inv)); border-radius: 6px; }
    .remove {
      pointer-events: auto; position: absolute; right: 0; top: 0; transform: scale(var(--inv)); transform-origin: 100% 0;
      width: 24px; height: 24px; border-radius: 50%; border: none; background: var(--accent); color: var(--on-accent); font: 700 16px/1 sans-serif; cursor: pointer;
    }
    .handle {
      pointer-events: auto; position: absolute; right: 0; bottom: 0; transform: scale(var(--inv)); transform-origin: 100% 100%;
      width: 16px; height: 16px; border-radius: 4px; background: var(--accent); border: 2px solid #160f09; cursor: nwse-resize;
    }
    .empty-note {
      position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-3); font-size: calc(15px * var(--inv)); pointer-events: none;
    }
    .status { display: flex; align-items: center; gap: 6px; color: var(--text-2); }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
    .dot.live { background: var(--ok); }
  `,
})
export class OverlayEditor {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  /** The saved layout; the editor works on a copy while dragging. */
  readonly layout = input.required<OverlayLayout>();
  /** The latest frame as the overlay shows it (the preview while it is fresh). */
  readonly liveFrame = input<OverlayFrame | null>(null);
  /** A finished change: saved by the page. */
  readonly changed = output<OverlayLayout>();

  protected readonly widgets = WIDGETS;
  protected readonly draft = linkedSignal(() => this.layout());
  protected readonly full = computed(() => this.draft().widgets.length >= MAX_OVERLAY_WIDGETS);
  protected readonly selected = signal<string | null>(null);
  protected readonly box = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  protected readonly isLive = signal(false);
  protected readonly selectedWidget = computed(() => this.draft().widgets.find((w) => w.id === this.selected()));
  /** The slider: the selected element's size, else the size most elements have. */
  protected readonly sizeValue = computed(() => {
    const widgets = this.draft().widgets;
    const one = this.selectedWidget();
    if (one) return Math.round(one.scale * 100);
    if (!widgets.length) return 100;
    const counts = new Map<number, number>();
    for (const w of widgets) counts.set(w.scale, (counts.get(w.scale) ?? 0) + 1);
    return Math.round([...counts].sort((a, b) => b[1] - a[1])[0]![0] * 100);
  });
  protected readonly percent = (value: number) => `${Math.round(value)} %`;
  protected readonly steeringOptions = computed<SegmentOption<OverlaySteeringStyle>[]>(() => [
    { value: 'bar', label: this.t('overlays.variant.bar') },
    { value: 'wheel', label: this.t('overlays.variant.wheel') },
    { value: 'both', label: this.t('overlays.variant.both') },
  ]);
  private readonly frameWidth = signal(0);
  protected readonly fit = computed(() => (this.frameWidth() > 0 ? this.frameWidth() / this.draft().width : 0.4));

  private readonly frame = viewChild.required<ElementRef<HTMLDivElement>>('frame');
  private readonly stage = viewChild.required<ElementRef<HTMLDivElement>>('stage');
  private readonly viewRoot = viewChild.required<ElementRef<HTMLDivElement>>('view');
  private readonly view = signal<OverlayView | undefined>(undefined);
  private drag: Drag | undefined;

  constructor() {
    // The overlay's looks, once for the whole app (the app's CSP allows inline styles).
    if (!document.getElementById('gtt-overlay-css')) {
      const style = document.createElement('style');
      style.id = 'gtt-overlay-css';
      style.textContent = OVERLAY_CSS;
      document.head.appendChild(style);
    }
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.view.set(new OverlayView(this.viewRoot().nativeElement, this.i18n.lang()));
      const observer = new ResizeObserver(() => this.frameWidth.set(this.frame().nativeElement.clientWidth));
      observer.observe(this.frame().nativeElement);
      const timer = setInterval(() => this.preview(), PREVIEW_MS);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        clearInterval(timer);
      });
    });
    effect(() => {
      const view = this.view();
      const layout = this.draft();
      if (!view) return;
      view.setLanguage(this.i18n.lang(), layout);
      view.setLayout(layout);
      this.measure();
    });
    effect(() => {
      this.selected();
      this.measure();
    });
  }

  protected name(kind: OverlayWidgetKind): TextKey {
    return `overlays.widget.${kind}` as TextKey;
  }

  // --- Adding: drag from the palette, or a click ---

  protected dragStart(event: DragEvent, kind: OverlayWidgetKind): void {
    event.dataTransfer?.setData('application/x-gtt-overlay', kind);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  protected dragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('application/x-gtt-overlay')) event.preventDefault();
  }

  protected drop(event: DragEvent): void {
    const kind = event.dataTransfer?.getData('application/x-gtt-overlay') as OverlayWidgetKind | undefined;
    if (!kind || !WIDGETS.some((w) => w.kind === kind)) return;
    event.preventDefault();
    const point = this.canvasPoint(event);
    this.add(kind, { x: point.x - 30, y: point.y - 20 }, event.altKey);
  }

  protected add(kind: OverlayWidgetKind, at?: { x: number; y: number }, free = false): void {
    const layout = this.draft();
    if (layout.widgets.length >= MAX_OVERLAY_WIDGETS) return;
    let id: string = kind;
    for (let n = 2; layout.widgets.some((w) => w.id === id); n++) id = `${kind}${n}`;
    // A click: near the middle, a little apart from the last one added.
    const offset = (layout.widgets.length % 8) * 24;
    const place = at ?? { x: layout.width / 2 - 120 + offset, y: layout.height / 2 - 60 + offset };
    const widget: OverlayWidget = { id, kind, ...this.clampTo(layout, place, free), scale: 1, ...(kind === 'steering' ? { variant: 'bar' as const } : {}) };
    this.commit({ ...layout, widgets: [...layout.widgets, widget] });
    this.selected.set(id);
    this.stage().nativeElement.focus();
  }

  protected remove(): void {
    const id = this.selected();
    if (!id) return;
    const layout = this.draft();
    this.commit({ ...layout, widgets: layout.widgets.filter((w) => w.id !== id) });
    this.selected.set(null);
  }

  // --- Moving and resizing ---

  protected pointerDown(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    const stage = this.stage().nativeElement;
    stage.focus();
    const selectedId = this.selected();
    const id = target.closest('[data-handle]') && selectedId ? selectedId : target.closest<HTMLElement>('.w')?.dataset['id'];
    const widget = id ? this.draft().widgets.find((w) => w.id === id) : undefined;
    if (!widget) {
      this.selected.set(null);
      return;
    }
    this.selected.set(widget.id);
    const element = this.view()?.element(widget.id);
    this.drag = {
      id: widget.id,
      resize: !!target.closest('[data-handle]'),
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: widget.x,
      y: widget.y,
      scale: widget.scale,
      width: element?.offsetWidth || 100,
      height: element?.offsetHeight || 60,
      moved: false,
    };
    stage.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  protected pointerMove(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const fit = this.fit();
    const dx = (event.clientX - drag.pointerX) / fit;
    const dy = (event.clientY - drag.pointerY) / fit;
    if (!drag.moved && Math.hypot(dx, dy) < 2) return;
    drag.moved = true;
    const layout = this.draft();
    const widgets = layout.widgets.map((w) => {
      if (w.id !== drag.id) return w;
      if (drag.resize) {
        // Not past the canvas's right or bottom edge.
        const most = Math.min(MAX_SCALE, (layout.width - w.x) / drag.width, (layout.height - w.y) / drag.height);
        const scale = Math.min(most, Math.max(MIN_SCALE, (drag.width * drag.scale + dx) / drag.width));
        return { ...w, scale: Math.floor(scale * 20) / 20 };
      }
      const size = { w: drag.width * drag.scale, h: drag.height * drag.scale };
      return { ...w, ...this.clampTo(layout, { x: drag.x + dx, y: drag.y + dy }, event.altKey, size) };
    });
    this.draft.set({ ...layout, widgets });
  }

  protected pointerUp(event: PointerEvent): void {
    const drag = this.drag;
    this.drag = undefined;
    const stage = this.stage().nativeElement;
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (drag?.moved) this.commit(this.draft());
  }

  /** The size slider: the selected element, or all of them. */
  protected setSize(scale: number): void {
    const layout = this.draft();
    const id = this.selected();
    this.commit({ ...layout, widgets: layout.widgets.map((w) => (id && w.id !== id ? w : this.resized(layout, w, scale))) });
  }

  /** The steering element's look; a larger one stays wholly on the canvas. */
  protected setVariant(variant: OverlaySteeringStyle): void {
    const id = this.selected();
    const layout = this.draft();
    const changed = { ...layout, widgets: layout.widgets.map((w) => (w.id === id ? { ...w, variant } : w)) };
    // Built at once, so its new size can be measured.
    this.view()?.setLayout(changed);
    this.commit({ ...changed, widgets: changed.widgets.map((w) => (w.id === id ? { ...w, ...this.clampTo(changed, w, true, this.size(w)) } : w)) });
  }

  /** Delete removes the selected element, + and − resize it, the arrows move it (Shift: 10 pixels). */
  protected key(event: KeyboardEvent): void {
    const id = this.selected();
    if (!id) return;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.remove();
      return;
    }
    const grow = event.key === '+' || event.key === '=' ? SCALE_STEP : event.key === '-' ? -SCALE_STEP : 0;
    const widget = this.selectedWidget();
    if (grow && widget) {
      event.preventDefault();
      this.setSize(widget.scale + grow);
      return;
    }
    const step = event.shiftKey ? SNAP : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const layout = this.draft();
    const widgets = layout.widgets.map((w) => (w.id === id ? { ...w, ...this.clampTo(layout, { x: w.x + move[0], y: w.y + move[1] }, true, this.size(w)) } : w));
    this.commit({ ...layout, widgets });
  }

  // --- Helpers ---

  private commit(layout: OverlayLayout): void {
    this.draft.set(layout);
    this.changed.emit(layout);
  }

  /** Wholly inside the canvas (size: the element's, as drawn), on the grid unless placed freely. */
  private clampTo(layout: OverlayLayout, point: { x: number; y: number }, free: boolean, size = { w: 20, h: 20 }): { x: number; y: number } {
    const snap = (v: number) => (free ? Math.round(v) : Math.round(v / SNAP) * SNAP);
    return {
      x: Math.max(0, Math.min(Math.floor(layout.width - size.w), snap(point.x))),
      y: Math.max(0, Math.min(Math.floor(layout.height - size.h), snap(point.y))),
    };
  }

  /**
   * An element at another size: it grows away from the canvas edges it sits nearest to (bottom left grows up and to
   * the right), so a layout keeps its corners, and stays wholly on the canvas.
   */
  private resized(layout: OverlayLayout, widget: OverlayWidget, scale: number): OverlayWidget {
    const element = this.view()?.element(widget.id);
    const width = element?.offsetWidth || 100;
    const height = element?.offsetHeight || 60;
    const s = Math.round(Math.min(MAX_SCALE, layout.width / width, layout.height / height, Math.max(MIN_SCALE, scale)) * 100) / 100;
    const right = widget.x + (width * widget.scale) / 2 > layout.width / 2;
    const bottom = widget.y + (height * widget.scale) / 2 > layout.height / 2;
    const x = right ? widget.x + width * widget.scale - width * s : widget.x;
    const y = bottom ? widget.y + height * widget.scale - height * s : widget.y;
    return { ...widget, scale: s, ...this.clampTo(layout, { x, y }, true, { w: width * s, h: height * s }) };
  }

  /** An element's size as drawn (canvas pixels). */
  private size(widget: OverlayWidget): { w: number; h: number } {
    const element = this.view()?.element(widget.id);
    return { w: (element?.offsetWidth ?? 20) * widget.scale, h: (element?.offsetHeight ?? 20) * widget.scale };
  }

  /** A pointer position in canvas pixels. */
  private canvasPoint(event: MouseEvent): { x: number; y: number } {
    const rect = this.stage().nativeElement.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / this.fit(), y: (event.clientY - rect.top) / this.fit() };
  }

  /** The selection frame around the selected element, in canvas pixels. */
  private measure(): void {
    const id = this.selected();
    const widget = id ? this.draft().widgets.find((w) => w.id === id) : undefined;
    const element = widget ? this.view()?.element(widget.id) : undefined;
    if (!widget || !element) {
      if (this.box()) this.box.set(null);
      return;
    }
    const box = { x: widget.x, y: widget.y, w: element.offsetWidth * widget.scale, h: element.offsetHeight * widget.scale };
    const old = this.box();
    if (!old || old.x !== box.x || old.y !== box.y || Math.abs(old.w - box.w) > 0.5 || Math.abs(old.h - box.h) > 0.5) this.box.set(box);
  }

  /** Live values while GT7 sends, else the made-up lap; the selection follows elements that change size. */
  private preview(): void {
    const view = this.view();
    if (!view) return;
    const live = this.liveFrame();
    const fresh = !!live?.at && Date.now() - live.at < LIVE_FRESH_MS;
    if (fresh !== this.isLive()) this.isLive.set(fresh);
    view.update(fresh && live ? live : demoOverlayFrame(Date.now()), performance.now(), true);
    if (this.selected()) this.measure();
  }
}
