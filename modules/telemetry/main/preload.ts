// The telemetry's part of the preload (window.gtt.telemetry): a fixed set of calls within its own namespace. Bundled
// into the sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@gt-toolz/core/api';
import type { TelemetryApi, TelemetryModuleSettings } from '../src/api';

export function telemetryBridge(scope: BridgeScope): TelemetryApi {
  const { invoke } = scope;
  return {
    ...settingsBridge<TelemetryModuleSettings>(scope),
    listReferences: () => invoke('listReferences'),
    activateReference: (id, learn) => invoke('activateReference', id, learn),
    updateReference: (id, details) => invoke('updateReference', id, details),
    deleteReference: (id) => invoke('deleteReference', id),
  };
}
