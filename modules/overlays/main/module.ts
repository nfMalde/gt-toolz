// The OBS overlays in the main process: the browser sources' web server on this PC, fed by the shell's telemetry, and
// their calls from the UI (window.gtt.overlays). Everything it uses comes from its host (packages/core/src/module.ts);
// the shell takes handlers and listeners back when it stops.

import type { ModuleDefinition } from '@gt-toolz/core';
import type { TelemetryFrame } from '@gt-toolz/telemetry';
import { OVERLAYS, type OverlayFrame, type OverlaysSettings } from '../src/api';
import { AfterFlag, overlayFrame } from '../src/frame';
import { defaultSettings, normalizeSettings } from '../src/settings';
import { OverlayServer } from './server';

/** OBS: smooth pedal bars need more than the app's 10 updates a second. */
const FRAME_INTERVAL_MS = 33;
/** The editor's preview, as often as the app's other live values. */
const PREVIEW_INTERVAL_MS = 100;

/** clientFile: the overlay page's script, bundled next to the main process (dist/overlay-client.js). */
export function overlaysModule(clientFile: string): ModuleDefinition<OverlaysSettings> {
  return {
    id: OVERLAYS,
    enabledByDefault: false,
    settings: { defaults: defaultSettings, normalize: normalizeSettings },

    start(host) {
      const { telemetry } = host;
      const settings = () => host.settings();
      const afterFlag = new AfterFlag();
      const toOverlay = (frame: TelemetryFrame): OverlayFrame => {
        const mode = telemetry.mode();
        return overlayFrame(frame, mode, telemetry.lastLap(), afterFlag.update(frame, mode));
      };
      const language = () => {
        const value = host.app().language;
        return typeof value === 'string' ? value : 'en';
      };
      /** Every frame after the interval, until the returned function stops it. */
      const every = (intervalMs: number, listener: (frame: OverlayFrame) => void) => {
        let lastAt = 0;
        return telemetry.onFrame((frame) => {
          if (frame.time - lastAt < intervalMs) return;
          lastAt = frame.time;
          listener(toOverlay(frame));
        });
      };

      // This PC only; it shows the editor's layout, the labels in the app's language.
      const server = new OverlayServer((listener) => every(FRAME_INTERVAL_MS, listener), clientFile, () => ({
        layout: settings().overlayLayout,
        language: language(),
        autoHide: settings().overlayAutoHide,
      }));
      const { handle, send } = host.bridge;
      const listen = async () => {
        const status = await server.apply(true, settings().overlayPort);
        host.log(status.running ? `OVERLAYS  on http://127.0.0.1:${status.port}/overlay` : `OVERLAYS  port ${status.port} not available (${status.error})`);
        send('status', status);
      };
      const link = () => {
        const status = server.status();
        return status.running ? `http://127.0.0.1:${status.port}/overlay` : undefined;
      };

      // --- Calls from the UI and events to it ---
      every(PREVIEW_INTERVAL_MS, (frame) => send('preview', frame));
      handle('status', () => server.status());
      handle('copyLink', () => {
        const url = link();
        if (url) host.desktop.copyText(url);
        return !!url;
      });
      handle('openLink', async () => {
        const url = link();
        if (url) await host.desktop.openLocalPage(url);
      });

      void listen();

      return {
        settingsChanged(next, before) {
          if (next.overlayPort !== before.overlayPort) void listen();
          // A layout from the editor shows in OBS at once.
          server.refresh();
        },
        // Another language: the labels change.
        appChanged: () => server.refresh(),
        stop: () => server.stop(),
      };
    },
  };
}
