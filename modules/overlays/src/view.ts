/// <reference lib="dom" />
// The OBS overlay's elements, drawn the same way in OBS (the overlay page, modules/overlays/page/client.ts) and in
// the app's editor on the "Browser sources" page: what the editor shows is what the stream shows (stream feedback,
// 2026-10-23). Plain DOM, no framework, no inline code: the overlay page runs under a strict CSP. Values are set as
// text only.

import type { OverlayFrame, OverlayLayout, OverlayWidget } from './api';

/** No frame for this long: the overlay dims (GT7 closed, PS5 off). */
export const OVERLAY_STALE_MS = 2000;
/** The pedal trace shows this many seconds. */
const TRACE_MS = 6000;
/** Tyre colours, as the crew judges them (cold below 55 °C, hot above 100 °C). */
const TYRE_COLD_C = 55;
const TYRE_HOT_C = 100;
/** The steering bar is full at this angle: GT7's wheel turns half a turn to each side (recordings: ±180°). */
const STEER_FULL_DEG = 180;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LABELS = {
  de: { throttle: 'Gas', brake: 'Bremse', gear: 'Gang', lap: 'Runde', last: 'Letzte', best: 'Beste', delta: 'Δ Ziel', position: 'Platz' },
  en: { throttle: 'Throttle', brake: 'Brake', gear: 'Gear', lap: 'Lap', last: 'Last', best: 'Best', delta: 'Δ target', position: 'Pos' },
};
type Labels = (typeof LABELS)['de'];

/** The labels on the stream follow the app's language. */
function labelsFor(language: string): Labels {
  return language.startsWith('de') ? LABELS.de : LABELS.en;
}

/**
 * The looks, all in Maldö's colours: "panel" with a frame, "light" thinner and without a frame, "clean" the values
 * alone with a shadow. --bg is the panels' opacity (the user's slider).
 */
export const OVERLAY_CSS = `
.gtt-overlay {
  --accent: #ff8a3d; --text: #f1ebe5; --muted: #c9bdb1; --bg: 0.5;
  --track: rgba(255, 255, 255, 0.12); --throttle: #34d399; --brake: #fb4868; --cold: #60a5fa; --ok: #34d399; --hot: #fb4868;
  position: relative; overflow: hidden; color: var(--text);
  font: 600 14px/1.15 'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif;
}
.gtt-overlay .w { position: absolute; left: 0; top: 0; transform-origin: 0 0; transition: opacity 0.4s; }
.gtt-overlay.stale .w { opacity: 0.3; }
.gtt-overlay .box {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px; white-space: nowrap;
  background: rgba(13, 10, 7, var(--bg)); border: 1px solid rgba(255, 228, 200, 0.14); border-radius: 14px;
}
.gtt-overlay .value { font-variant-numeric: tabular-nums; font-weight: 750; line-height: 1; }
.gtt-overlay .big { font-size: 40px; }
.gtt-overlay .unit, .gtt-overlay .label { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.gtt-overlay .stack { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.gtt-overlay .w-gear .value { color: var(--accent); min-width: 0.7em; text-align: center; }
.gtt-overlay .w-speed .value { min-width: 2.2em; text-align: right; }
.gtt-overlay .pedal { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.gtt-overlay .bar { width: 20px; height: 80px; background: var(--track); border-radius: 6px; overflow: hidden; }
.gtt-overlay .fill { width: 100%; height: 100%; transform: scaleY(0); transform-origin: bottom; transition: transform 40ms linear; }
.gtt-overlay .throttle .fill { background: var(--throttle); }
.gtt-overlay .brake .fill { background: var(--brake); }
.gtt-overlay canvas { display: block; width: 300px; height: 90px; }
.gtt-overlay .tyres { display: grid; grid-template-columns: repeat(2, 46px); gap: 6px; }
.gtt-overlay .tyre {
  height: 34px; border-radius: 9px; display: grid; place-items: center; font-variant-numeric: tabular-nums;
  background: var(--track); border: 2px solid transparent; transition: border-color 0.3s, color 0.3s;
}
.gtt-overlay .tyre.cold { border-color: var(--cold); color: var(--cold); }
.gtt-overlay .tyre.ok { border-color: var(--ok); }
.gtt-overlay .tyre.hot { border-color: var(--hot); color: var(--hot); }
.gtt-overlay .rows { display: grid; grid-template-columns: auto auto; gap: 4px 14px; align-items: baseline; }
.gtt-overlay .rows .value { font-size: 18px; text-align: right; }
.gtt-overlay .mid { font-size: 26px; }
.gtt-overlay .faster { color: var(--ok); }
.gtt-overlay .slower { color: var(--hot); }
.gtt-overlay .w.hidden { display: none; }
.gtt-overlay .w-steering .box { flex-direction: column; gap: 8px; }
.gtt-overlay .steer-bar { display: flex; align-items: center; gap: 8px; }
.gtt-overlay .steer-half { width: 110px; height: 14px; background: var(--track); border-radius: 7px; overflow: hidden; }
.gtt-overlay .steer-half .fill { background: var(--accent); transform: scaleX(0); }
.gtt-overlay .steer-half.left .fill { transform-origin: right; }
.gtt-overlay .steer-half.right .fill { transform-origin: left; }
.gtt-overlay .steer-deg { font-size: 18px; min-width: 3em; text-align: center; }
.gtt-overlay .wheel { display: block; width: 88px; height: 88px; transition: transform 40ms linear; }
.gtt-overlay .wheel .rim, .gtt-overlay .wheel .spoke, .gtt-overlay .wheel .hub { fill: none; stroke: var(--text); stroke-linecap: round; }
.gtt-overlay .wheel .rim { stroke-width: 9; }
.gtt-overlay .wheel .spoke, .gtt-overlay .wheel .hub { stroke-width: 7; }
.gtt-overlay .wheel .mark { fill: none; stroke: var(--accent); stroke-width: 9; }

.gtt-overlay.look-light .box { border-color: transparent; border-radius: 10px; padding: 8px 12px; gap: 10px; }
.gtt-overlay.look-light .value { font-weight: 600; }
.gtt-overlay.look-light .bar { width: 12px; border-radius: 4px; }
.gtt-overlay.look-light .tyre { border-width: 0 0 2px; border-radius: 6px; background: rgba(255, 255, 255, 0.06); }
.gtt-overlay.look-light .steer-half { height: 10px; border-radius: 4px; }
.gtt-overlay.look-light .wheel .rim, .gtt-overlay.look-light .wheel .mark { stroke-width: 7; }
.gtt-overlay.look-light .wheel .spoke, .gtt-overlay.look-light .wheel .hub { stroke-width: 5; }

.gtt-overlay.look-clean .box { background: none; border-color: transparent; padding: 6px 8px; }
.gtt-overlay.look-clean .value, .gtt-overlay.look-clean .unit, .gtt-overlay.look-clean .label, .gtt-overlay.look-clean .tyre {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.95), 0 0 8px rgba(0, 0, 0, 0.7);
}
.gtt-overlay.look-clean .value { font-weight: 650; }
.gtt-overlay.look-clean .bar { width: 12px; background: rgba(0, 0, 0, 0.35); }
.gtt-overlay.look-clean .tyre { background: rgba(0, 0, 0, 0.3); border-width: 0 0 2px; border-radius: 6px; }
.gtt-overlay.look-clean .steer-half { height: 10px; background: rgba(0, 0, 0, 0.35); }
.gtt-overlay.look-clean .wheel { filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.95)); }
`;

/** One element's parts that change with the values. */
interface WidgetParts {
  widget: OverlayWidget;
  root: HTMLElement;
  fields: Partial<Record<Field, HTMLElement>>;
  canvas?: HTMLCanvasElement;
  wheel?: SVGSVGElement;
}
type TraceSample = { at: number; throttle: number; brake: number };
type Field = 'speed' | 'gear' | 'throttle' | 'brake' | 'tyre0' | 'tyre1' | 'tyre2' | 'tyre3' | 'lap' | 'current' | 'last' | 'best' | 'delta' | 'position' | 'steer' | 'steerLeft' | 'steerRight';

const el = (tag: string, className = '', text = ''): HTMLElement => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const time = (ms: number | undefined) =>
  ms === undefined || ms <= 0 ? '–:––.–––' : `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;

/** The overlay in a root element: setLayout builds the elements, update fills them, setStale dims them. */
export class OverlayView {
  private parts: WidgetParts[] = [];
  private labels: Labels;
  private readonly samples: TraceSample[] = [];

  constructor(
    private readonly root: HTMLElement,
    language: string,
  ) {
    this.labels = labelsFor(language);
    root.classList.add('gtt-overlay');
  }

  setLanguage(language: string, layout: OverlayLayout): void {
    const labels = labelsFor(language);
    if (labels === this.labels) return;
    this.labels = labels;
    for (const parts of this.parts) parts.root.remove();
    this.parts = [];
    this.setLayout(layout);
  }

  /** Builds the elements anew where they changed; the canvas takes the layout's size. */
  setLayout(layout: OverlayLayout): void {
    const root = this.root;
    root.style.width = `${layout.width}px`;
    root.style.height = `${layout.height}px`;
    root.style.setProperty('--bg', String(layout.background));
    for (const look of ['panel', 'light', 'clean']) root.classList.toggle(`look-${look}`, layout.look === look);
    const kept = new Map(this.parts.map((p) => [p.widget.id, p]));
    this.parts = layout.widgets.map((widget) => {
      const old = kept.get(widget.id);
      kept.delete(widget.id);
      const parts = old && old.widget.kind === widget.kind && old.widget.variant === widget.variant ? old : this.build(widget);
      if (old && parts !== old) old.root.remove();
      parts.widget = widget;
      parts.root.style.transform = `translate(${widget.x}px, ${widget.y}px) scale(${widget.scale})`;
      if (!parts.root.isConnected || parts !== old) root.appendChild(parts.root);
      return parts;
    });
    for (const old of kept.values()) old.root.remove();
  }

  /** The element of a widget (the editor measures and selects it). */
  element(id: string): HTMLElement | undefined {
    return this.parts.find((p) => p.widget.id === id)?.root;
  }

  setStale(stale: boolean): void {
    this.root.classList.toggle('stale', stale);
  }

  /** Fills every element with a frame; now (ms) times the pedal trace. alwaysShow: the editor shows the position outside races too. */
  update(f: OverlayFrame, now: number, alwaysShow = false): void {
    this.samples.push({ at: now, throttle: f.throttle, brake: f.brake });
    while (this.samples.length && now - this.samples[0]!.at > TRACE_MS) this.samples.shift();
    for (const parts of this.parts) {
      const { fields } = parts;
      set(fields.speed, String(Math.round(f.speedKmh)));
      set(fields.gear, f.gear > 0 ? String(f.gear) : 'N');
      if (fields.throttle) fields.throttle.style.transform = `scaleY(${f.throttle})`;
      if (fields.brake) fields.brake.style.transform = `scaleY(${f.brake})`;
      f.tyreTemps.forEach((temp, i) => {
        const tyre = fields[`tyre${i}` as Field];
        if (!tyre) return;
        set(tyre, `${Math.round(temp)}°`);
        tyre.className = `tyre ${temp < TYRE_COLD_C ? 'cold' : temp > TYRE_HOT_C ? 'hot' : 'ok'}`;
      });
      set(fields.lap, f.laps > 0 ? `${Math.max(1, f.lap)}/${f.laps}` : f.lap > 0 ? String(f.lap) : '–');
      set(fields.current, time(f.currentLapMs));
      set(fields.last, time(f.lastLapMs));
      set(fields.best, time(f.bestLapMs));
      if (fields.delta) {
        const d = f.lastLapDeltaMs;
        set(fields.delta, d === undefined ? '–' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${(Math.abs(d) / 1000).toFixed(3)}`);
        fields.delta.className = `value mid${d === undefined ? '' : d < 0 ? ' faster' : d > 0 ? ' slower' : ''}`;
      }
      if (parts.widget.kind === 'position') {
        parts.root.classList.toggle('hidden', f.position === undefined && !alwaysShow);
        set(fields.position, f.position !== undefined ? `${f.position}/${f.cars ?? '–'}` : '–');
      }
      if (parts.widget.kind === 'steering') steer(parts, f.steerDeg);
      if (parts.canvas) this.drawTrace(parts.canvas, now);
    }
  }

  private build(widget: OverlayWidget): WidgetParts {
    const l = this.labels;
    const root = el('div', `w w-${widget.kind}`);
    root.dataset['id'] = widget.id;
    const box = el('div', 'box');
    root.appendChild(box);
    const fields: WidgetParts['fields'] = {};
    let canvas: HTMLCanvasElement | undefined;
    let wheel: SVGSVGElement | undefined;
    const value = (field: Field, className: string, text = '–') => (fields[field] = el('div', `value ${className}`, text));
    const stack = (field: Field, unit: string) => {
      const s = el('div', 'stack');
      s.append(value(field, 'big'), el('div', 'unit', unit));
      box.appendChild(s);
    };
    const row = (label: string, field: Field) => box.append(el('div', 'label', label), value(field, ''));
    switch (widget.kind) {
      case 'speed':
        stack('speed', 'km/h');
        break;
      case 'gear':
        stack('gear', l.gear);
        break;
      case 'pedals':
        for (const [field, label] of [['throttle', l.throttle], ['brake', l.brake]] as const) {
          const pedal = el('div', `pedal ${field}`);
          const bar = el('div', 'bar');
          bar.appendChild((fields[field] = el('div', 'fill')));
          pedal.append(bar, el('div', 'unit', label));
          box.appendChild(pedal);
        }
        break;
      case 'trace':
        canvas = document.createElement('canvas');
        canvas.width = 300;
        canvas.height = 90;
        box.appendChild(canvas);
        break;
      case 'tyres': {
        const grid = el('div', 'tyres');
        for (const i of [0, 1, 2, 3]) grid.appendChild((fields[`tyre${i}` as Field] = el('div', 'tyre', '–')));
        box.appendChild(grid);
        break;
      }
      case 'lap': {
        const s = el('div', 'stack');
        s.append(value('lap', 'mid'), el('div', 'unit', l.lap));
        box.append(s, value('current', 'mid', time(undefined)));
        break;
      }
      case 'times':
        box.classList.add('rows');
        row(l.last, 'last');
        row(l.best, 'best');
        break;
      case 'delta':
      case 'position': {
        const s = el('div', 'stack');
        s.append(value(widget.kind, 'mid'), el('div', 'unit', widget.kind === 'delta' ? l.delta : l.position));
        box.appendChild(s);
        break;
      }
      case 'steering': {
        const variant = widget.variant ?? 'bar';
        if (variant !== 'bar') box.appendChild((wheel = steeringWheel()));
        if (variant === 'wheel') box.appendChild(value('steer', 'steer-deg'));
        else {
          const bar = el('div', 'steer-bar');
          for (const side of ['left', 'right'] as const) {
            const half = el('div', `steer-half ${side}`);
            half.appendChild((fields[side === 'left' ? 'steerLeft' : 'steerRight'] = el('div', 'fill')));
            bar.appendChild(half);
          }
          bar.insertBefore(value('steer', 'steer-deg'), bar.lastChild);
          box.appendChild(bar);
        }
        break;
      }
    }
    return { widget, root, fields, canvas, wheel };
  }

  /** Throttle (green) and brake (red) of the last seconds, newest on the right. */
  private drawTrace(canvas: HTMLCanvasElement, now: number): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (const y of [0.25, 0.5, 0.75]) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(height * y) + 0.5);
      ctx.lineTo(width, Math.round(height * y) + 0.5);
      ctx.stroke();
    }
    const line = (value: (s: TraceSample) => number, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.samples.forEach((s, i) => {
        const x = width - ((now - s.at) / TRACE_MS) * width;
        const y = height - 2 - value(s) * (height - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    line((s) => s.throttle, '#34d399');
    line((s) => s.brake, '#fb4868');
  }
}

function set(node: HTMLElement | undefined, text: string): void {
  if (node && node.textContent !== text) node.textContent = text;
}

/** The steering element: the bar fills from the middle to the side the wheel turns to, the wheel turns with it. */
function steer(parts: WidgetParts, deg: number | undefined): void {
  const { fields } = parts;
  const share = deg === undefined ? 0 : Math.min(1, Math.abs(deg) / STEER_FULL_DEG);
  if (fields.steerLeft) fields.steerLeft.style.transform = `scaleX(${deg !== undefined && deg > 0 ? share : 0})`;
  if (fields.steerRight) fields.steerRight.style.transform = `scaleX(${deg !== undefined && deg < 0 ? share : 0})`;
  if (parts.wheel) parts.wheel.style.transform = `rotate(${-(deg ?? 0)}deg)`;
  set(fields.steer, deg === undefined ? '–' : `${Math.round(Math.abs(deg))}°`);
}

/** A steering wheel (SVG, drawn by the CSS): rim, three spokes, the hub and the mark at the top. */
function steeringWheel(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'wheel');
  svg.setAttribute('viewBox', '0 0 100 100');
  const shape = (tag: string, className: string, attributes: Record<string, string | number>) => {
    const node = document.createElementNS(SVG_NS, tag);
    node.setAttribute('class', className);
    for (const [name, v] of Object.entries(attributes)) node.setAttribute(name, String(v));
    svg.appendChild(node);
  };
  shape('circle', 'rim', { cx: 50, cy: 50, r: 44 });
  shape('path', 'spoke', { d: 'M8 50H38M62 50H92M50 62V92' });
  shape('circle', 'hub', { cx: 50, cy: 50, r: 12 });
  // The top of the rim, 30° wide: where the wheel points.
  shape('path', 'mark', { d: 'M38.6 7.5A44 44 0 0 1 61.4 7.5' });
  return svg;
}

/**
 * Made-up values for the editor while GT7 sends nothing: a lap of 20 s with a straight, a braking zone and a corner,
 * so every element moves as on track.
 */
export function demoOverlayFrame(now: number): OverlayFrame {
  const t = (now / 1000) % 20;
  const braking = t >= 9 && t < 11;
  const corner = t >= 11 && t < 13;
  const throttle = braking ? 0 : corner ? Math.min(1, (t - 11) / 2) : 1;
  const speedKmh = braking ? 260 - (t - 9) * 85 : corner ? 90 + (t - 11) * 25 : Math.min(265, 140 + (t < 9 ? t + 11 : t - 13) * 9);
  const gear = Math.max(2, Math.min(6, Math.ceil(speedKmh / 45)));
  const wave = Math.sin(now / 3000);
  // The corner is a right-hander: turned in at the end of the braking zone, straight again on the way out.
  const steerDeg = t >= 10.4 && t < 14.4 ? -95 * Math.sin(((t - 10.4) / 4) * Math.PI) : 4 * Math.sin(now / 700);
  return {
    speedKmh,
    gear,
    throttle,
    brake: braking ? Math.max(0.2, 1 - (t - 9) / 2.2) : 0,
    tyreTemps: [78 + wave * 3, 81 + wave * 3, 74 + wave * 2, 76 + wave * 2],
    lap: 3,
    laps: 10,
    currentLapMs: 34_000 + t * 1000,
    lastLapMs: 101_482,
    bestLapMs: 100_504,
    lastLapDeltaMs: 412,
    position: 4,
    cars: 12,
    steerDeg,
    paused: false,
    onTrack: true,
  };
}
