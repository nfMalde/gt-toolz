// The modules built into the app, in the order of the navigation (MODULE_IDS in packages/runtime/src/app-api.ts).

import { coachUi } from '@modules/coach/ui/module';
import { crewUi } from '@modules/crew/ui/module';
import { hapticsUi } from '@modules/haptics/ui/module';
import { overlaysUi } from '@modules/overlays/ui/module';
import { telemetryUi } from '@modules/telemetry/ui/module';
import type { ModuleUi } from './core/module-ui';

export const MODULE_UIS: readonly ModuleUi[] = [telemetryUi, coachUi, crewUi, overlaysUi, hapticsUi];
