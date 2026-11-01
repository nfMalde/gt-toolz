import { InjectionToken } from '@angular/core';
import type { GttApi } from '@gtt/api';
import type { CrewApi } from '@gt-toolz/crew/api';
import type { HapticsApi } from '@gt-toolz/haptics/api';
import type { OverlaysApi } from '@gt-toolz/overlays/api';
import type { TelemetryApi } from '@gt-toolz/telemetry-module/api';

/** window.gtt: the shell's calls and one namespace per module that moved into its folder (apps/desktop/src/preload.ts). */
export type GttBridge = GttApi & { telemetry: TelemetryApi; crew: CrewApi; overlays: OverlaysApi; haptics: HapticsApi };

declare global {
  interface Window {
    /** Provided by the desktop app's preload script. */
    gtt?: GttBridge;
  }
}

/** False when the UI is opened in a plain browser (ng serve without Electron). */
export const BRIDGE_AVAILABLE = typeof window !== 'undefined' && !!window.gtt;

/** The main process API (window.gtt). */
export const GTT = new InjectionToken<GttBridge>('gtt', {
  providedIn: 'root',
  factory: () => window.gtt ?? offlineBridge(),
});

/** Outside the desktop app every call fails and no event ever arrives, also in a module's namespace (gtt.<id>.…). */
function offlineBridge(): GttBridge {
  const member = (name: string): unknown => {
    const call = name.startsWith('on') ? () => () => undefined : () => Promise.reject(new Error('Only available in the desktop app'));
    return new Proxy(call, { get: (target, prop) => (prop in target ? Reflect.get(target, prop) : member(String(prop))) });
  };
  return new Proxy({} as GttBridge, { get: (_target, name) => member(String(name)) });
}
