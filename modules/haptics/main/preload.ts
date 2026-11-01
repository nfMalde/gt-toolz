// The vibration's part of the preload (window.gtt.haptics): a fixed set of calls within its own namespace. Bundled into
// the sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@gt-toolz/core/api';
import type { HapticSettings, HapticsApi } from '../src/api';

export function hapticsBridge(scope: BridgeScope): HapticsApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<HapticSettings>(scope),
    onHaptic: subscribe('haptic'),
    test: (cue) => invoke('test', cue),
  };
}
