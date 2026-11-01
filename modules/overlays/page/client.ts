/// <reference lib="dom" />
// The script of the OBS overlay page (served as /overlay.js, bundled for the browser): one page for everything
// (stream feedback, 2026-10-23). The layout comes from the app's editor over the event stream (/events, event
// "layout"), the values as plain messages; the elements are drawn by the same view the editor uses.

import type { OverlayFrame, OverlayLayout } from '../src/api';
import { OVERLAY_STALE_MS, OverlayView } from '../src/view';

/** A browser source whose shape differs from the canvas by more than this gets the hint. */
const ASPECT_TOLERANCE = 0.02;

const NOTICE = {
  de: (w: number, h: number, iw: number, ih: number) => `GT Toolz: Browser-Quelle in OBS auf ${w} × ${h} stellen (jetzt ${iw} × ${ih}).`,
  en: (w: number, h: number, iw: number, ih: number) => `GT Toolz: set the OBS browser source to ${w} × ${h} (now ${iw} × ${ih}).`,
};

const stage = document.getElementById('stage');
const notice = document.getElementById('notice');
if (stage) {
  const view = new OverlayView(stage, document.documentElement.lang);
  let layout: OverlayLayout | undefined;
  let language = document.documentElement.lang;
  let lastAt = 0;
  let autoHide = false;
  /** The newest frame not drawn yet: drawn once per screen refresh, older ones are skipped (no backlog in OBS). */
  let pending: string | undefined;
  let drawing = false;
  /** Hidden outside races, time trials and qualifying (menus, loading screens, replays), if the editor says so. */
  const show = (visible: boolean) => stage.classList.toggle('hidden', !visible);

  /**
   * The canvas scaled to the browser source, whatever size it has (on stream it was left at OBS's 800 × 600, and
   * the overlay showed only its top left corner, too large). A source of another shape gets a hint: OBS would
   * stretch the overlay.
   */
  const fit = () => {
    if (!layout || innerWidth <= 0 || innerHeight <= 0) return;
    stage.style.transform = `scale(${Math.min(innerWidth / layout.width, innerHeight / layout.height)})`;
    const shapeDiffers = Math.abs(innerWidth / innerHeight / (layout.width / layout.height) - 1) > ASPECT_TOLERANCE;
    if (notice) {
      notice.hidden = !shapeDiffers;
      notice.textContent = shapeDiffers ? NOTICE[language.startsWith('de') ? 'de' : 'en'](layout.width, layout.height, innerWidth, innerHeight) : '';
    }
  };
  addEventListener('resize', fit);

  view.setStale(true);
  /** What the app built this page from (its script and style): another one after an update. */
  let build: string | undefined;
  const source = new EventSource('/events');
  // On connecting and whenever the editor changes it (or the app's language changes).
  source.addEventListener('layout', (event) => {
    const message = JSON.parse((event as MessageEvent<string>).data) as { layout: OverlayLayout; language: string; autoHide?: boolean; build?: string };
    // The app was updated while OBS kept the page open (only the stream connected again): this script is the old one.
    if (build && message.build && message.build !== build) {
      source.close();
      location.reload();
      return;
    }
    build = message.build;
    layout = message.layout;
    language = message.language;
    autoHide = message.autoHide === true;
    if (!autoHide) show(true);
    view.setLanguage(language, layout);
    view.setLayout(layout);
    fit();
  });
  const draw = () => {
    drawing = false;
    if (pending === undefined) return;
    const frame = JSON.parse(pending) as OverlayFrame;
    pending = undefined;
    view.update(frame, performance.now());
    if (autoHide) show((frame.mode === 'race' || frame.mode === 'practice') && !frame.raceOver);
  };
  source.onmessage = (event) => {
    lastAt = performance.now();
    view.setStale(false);
    pending = event.data as string;
    if (!drawing) {
      drawing = true;
      requestAnimationFrame(draw);
    }
  };
  setInterval(() => {
    if (performance.now() - lastAt <= OVERLAY_STALE_MS) return;
    view.setStale(true);
    // No telemetry (the app closed, GT7 in its main menu): nothing to show.
    if (autoHide) show(false);
  }, 500);
}
