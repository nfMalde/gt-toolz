// The overlays' part of the preload (window.gtt.overlays): a fixed set of calls within their own namespace. Bundled
// into the sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@gt-toolz/core/api';
import type { OverlaysApi, OverlaysSettings } from '../src/api';

export function overlaysBridge(scope: BridgeScope): OverlaysApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<OverlaysSettings>(scope),
    status: () => invoke('status'),
    onStatus: subscribe('status'),
    copyLink: () => invoke('copyLink'),
    openLink: () => invoke('openLink'),
    onPreview: subscribe('preview'),
  };
}
