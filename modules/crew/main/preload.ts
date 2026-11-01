// The race crew's part of the preload (window.gtt.crew): its settings, within its own namespace. Bundled into the
// sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@gt-toolz/core/api';
import type { CrewApi, CrewModuleSettings } from '../src/api';

export function crewBridge(scope: BridgeScope): CrewApi {
  return settingsBridge<CrewModuleSettings>(scope);
}
