// The overlays' settings: their defaults and the check of everything that comes from the UI or config.json.

import { bool, clamp } from '@gt-toolz/core';
import {
  DEFAULT_OVERLAY_LAYOUT,
  MAX_OVERLAY_WIDGETS,
  OVERLAY_CANVASES,
  OVERLAY_LOOKS,
  OVERLAY_STEERING_STYLES,
  OVERLAY_WIDGET_KINDS,
  type OverlayLayout,
  type OverlayLook,
  type OverlaysSettings,
  type OverlaySteeringStyle,
  type OverlayWidget,
  type OverlayWidgetKind,
} from './api';

export function defaultSettings(): OverlaysSettings {
  return { overlayPort: 4790, overlayLayout: DEFAULT_OVERLAY_LAYOUT, overlayAutoHide: true };
}

export function normalizeSettings(value: unknown, base: OverlaysSettings): OverlaysSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof OverlaysSettings, unknown>>;
  return {
    overlayPort: Math.round(clamp(v.overlayPort, 1024, 65535, base.overlayPort)),
    overlayLayout: normalizeLayout(v.overlayLayout, base.overlayLayout),
    overlayAutoHide: bool(v.overlayAutoHide, base.overlayAutoHide),
  };
}

/**
 * The overlay's layout from the UI or the file: a known canvas size, known elements (at most 24, ids of letters and
 * digits) inside the canvas, sizes from half to four times, the steering element's look; anything broken is dropped.
 */
function normalizeLayout(value: unknown, base: OverlayLayout): OverlayLayout {
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<Record<keyof OverlayLayout, unknown>>;
  const canvas = OVERLAY_CANVASES.find((c) => c.width === v.width && c.height === v.height) ?? { width: base.width, height: base.height };
  const widgets: OverlayWidget[] = [];
  for (const item of Array.isArray(v.widgets) ? v.widgets.slice(0, MAX_OVERLAY_WIDGETS) : base.widgets) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Partial<Record<keyof OverlayWidget, unknown>>;
    if (typeof w.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(w.id) || widgets.some((other) => other.id === w.id)) continue;
    if (!OVERLAY_WIDGET_KINDS.includes(w.kind as OverlayWidgetKind)) continue;
    widgets.push({
      id: w.id,
      kind: w.kind as OverlayWidgetKind,
      x: Math.round(clamp(w.x, 0, canvas.width - 20, 0)),
      y: Math.round(clamp(w.y, 0, canvas.height - 20, 0)),
      scale: Math.round(clamp(w.scale, 0.5, 4, 1) * 100) / 100,
      ...(w.kind === 'steering' ? { variant: OVERLAY_STEERING_STYLES.includes(w.variant as OverlaySteeringStyle) ? (w.variant as OverlaySteeringStyle) : 'bar' } : {}),
    });
  }
  return {
    ...canvas,
    look: OVERLAY_LOOKS.includes(v.look as OverlayLook) ? (v.look as OverlayLook) : base.look,
    background: Math.round(clamp(v.background, 0, 1, base.background) * 100) / 100,
    widgets,
  };
}
