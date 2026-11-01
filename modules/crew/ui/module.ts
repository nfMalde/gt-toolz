// The race crew in the UI: its settings and its card on the Cockpit in races (the shell's extension points are in
// apps/ui/src/app/core/module-ui.ts).

import { computed, inject } from '@angular/core';
import type { ModuleCockpit, ModuleUi } from '@shell/core/module-ui';
import { CoachStore } from '@shell/stores/coach.store';
import { RaceCard } from './cockpit/race-card';

function cockpit(): ModuleCockpit {
  const status = inject(CoachStore).status;
  return {
    cards: [{ id: 'race', area: 'wide', order: 10, component: RaceCard, shown: computed(() => !!status()?.crew.active) }],
  };
}

export const crewUi: ModuleUi = {
  id: 'crew',
  name: 'crew.module.name',
  description: 'crew.module.description',
  icon: 'users',
  pages: [{ path: 'settings', label: 'crew.nav.settings', icon: 'sliders' }],
  routes: [{ path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.CrewSettings) }],
  cockpit,
};
