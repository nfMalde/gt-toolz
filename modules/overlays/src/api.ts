// The OBS overlays' part of the contract between the UI and the main process (window.gtt.overlays): their settings,
// the server's state, what an overlay shows and its layout. Types and constants only: the UI, the overlay page and
// the main process import this.

import type { ModuleSettingsApi, Unsubscribe } from '@gt-toolz/core/api';

export const OVERLAYS = 'overlays';

/** Off by default (a module switched on on the Modules page): the server listens only while the module is on. */
export interface OverlaysSettings {
  /** The server's port on this PC (127.0.0.1). */
  overlayPort: number;
  /** What the overlay shows and where, put together on the "Browser sources" page (one link for everything). */
  overlayLayout: OverlayLayout;
  /** The overlay disappears outside races, time trials and qualifying: in menus, loading screens and replays (the user, 2026-10-25). */
  overlayAutoHide: boolean;
}

export interface OverlaysApi extends ModuleSettingsApi<OverlaysSettings> {
  status(): Promise<OverlayStatus>;
  /** The server started, stopped or moved to another port. */
  onStatus(listener: (status: OverlayStatus) => void): Unsubscribe;
  /** The overlay's address to the clipboard; false: the server is not running. */
  copyLink(): Promise<boolean>;
  /** The overlay in the browser, for a look (only while the server runs). */
  openLink(): Promise<void>;
  /** What the overlay shows, about 10 times a second while GT7 sends: the editor's preview shows the real values. */
  onPreview(listener: (frame: OverlayFrame) => void): Unsubscribe;
}

/** What the OBS overlays show, about 30 times a second while one is open (docs/dev/architecture.md). */
export interface OverlayFrame {
  /** When the packet arrived (ms since 1970, this PC's clock): the overlay can tell how fresh a frame is. */
  at?: number;
  /** What GT7 shows: on track (race, or time trial / qualifying / free run), a replay or a menu; for hiding the overlay. */
  mode?: 'race' | 'practice' | 'replay' | 'menu';
  /** After the chequered flag: GT7 drives the car round itself, then shows its results; for hiding the overlay. */
  raceOver?: boolean;
  speedKmh: number;
  gear: number;
  /** 0..1 */
  throttle: number;
  brake: number;
  /** °C: front left, front right, rear left, rear right. */
  tyreTemps: [number, number, number, number];
  lap: number;
  /** Laps of the race; 0 without a lap count (time trial, free run). */
  laps: number;
  currentLapMs?: number;
  lastLapMs?: number;
  bestLapMs?: number;
  /** The last lap against the target time (ms, positive: slower). */
  lastLapDeltaMs?: number;
  /** Race position, in races with other cars. */
  position?: number;
  /** The steering wheel's angle in degrees, positive to the left; without it in the PS5's packet (type A), undefined. */
  steerDeg?: number;
  cars?: number;
  paused: boolean;
  onTrack: boolean;
}

/** The overlay server (main process): switched on, listening, or why not ("EADDRINUSE" …). */
export interface OverlayStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  error?: string;
}

/**
 * The overlay's elements (stream feedback 2026-10-23: one link, put together by drag and drop): speed, gear, the
 * pedal bars, the pedal trace, the tyre temperatures, the lap with its running time, the last and best lap, the last
 * lap against the target, the race position, the steering angle (the user, 2026-10-26).
 */
export type OverlayWidgetKind = 'speed' | 'gear' | 'pedals' | 'trace' | 'tyres' | 'lap' | 'times' | 'delta' | 'position' | 'steering';
export const OVERLAY_WIDGET_KINDS: readonly OverlayWidgetKind[] = ['speed', 'gear', 'pedals', 'trace', 'tyres', 'lap', 'times', 'delta', 'position', 'steering'];
/**
 * How the steering element shows the angle (the user, 2026-10-26: "---- 0° ----", a wheel, or a mix): a bar that fills
 * from the middle to the side the wheel turns to, with the angle in the middle; a wheel that turns, the angle under
 * it; or the wheel over the bar.
 */
export type OverlaySteeringStyle = 'bar' | 'wheel' | 'both';
export const OVERLAY_STEERING_STYLES: readonly OverlaySteeringStyle[] = ['bar', 'wheel', 'both'];
/** How the elements look: a panel with a frame, light (thin, no frame), or the values alone with a shadow. */
export type OverlayLook = 'panel' | 'light' | 'clean';
export const OVERLAY_LOOKS: readonly OverlayLook[] = ['panel', 'light', 'clean'];
/** The browser source's size, as OBS's canvas: the overlay covers the whole scene. */
export const OVERLAY_CANVASES: readonly { width: number; height: number }[] = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
];
export const MAX_OVERLAY_WIDGETS = 24;

/** One element on the overlay: top left corner in canvas pixels, and its size (1 = as designed). */
export interface OverlayWidget {
  id: string;
  kind: OverlayWidgetKind;
  x: number;
  y: number;
  scale: number;
  /** The steering element's look (only there; "bar" when missing). */
  variant?: OverlaySteeringStyle;
}

/** The overlay as the user put it together on the "Browser sources" page. background: the panels' opacity (0..1). */
export interface OverlayLayout {
  width: number;
  height: number;
  look: OverlayLook;
  background: number;
  widgets: OverlayWidget[];
}

/**
 * The overlay to start from (1920 × 1080, OBS's usual canvas): speed, gear, pedals and tyres bottom left, the lap
 * and its times top right. Light, because the first design was too heavy for the stream (2026-10-23).
 */
export const DEFAULT_OVERLAY_LAYOUT: OverlayLayout = {
  width: 1920,
  height: 1080,
  look: 'light',
  background: 0.5,
  widgets: [
    { id: 'speed', kind: 'speed', x: 40, y: 960, scale: 1 },
    { id: 'gear', kind: 'gear', x: 170, y: 960, scale: 1 },
    { id: 'pedals', kind: 'pedals', x: 250, y: 920, scale: 1 },
    { id: 'tyres', kind: 'tyres', x: 400, y: 940, scale: 1 },
    { id: 'lap', kind: 'lap', x: 1700, y: 40, scale: 1 },
    { id: 'times', kind: 'times', x: 1700, y: 120, scale: 1 },
    { id: 'delta', kind: 'delta', x: 1700, y: 200, scale: 1 },
  ],
};
