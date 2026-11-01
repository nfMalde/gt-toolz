// The OBS overlays in the UI: the browser sources and their editor, a tip in the setup assistant and its stop in the
// tour (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { computed, inject } from '@angular/core';
import type { ModuleGuide, ModuleUi } from '@shell/core/module-ui';
import { I18n } from '@shell/i18n/i18n';

function guide(): ModuleGuide {
  const t = inject(I18n).t;
  return { tips: [{ order: 50, icon: 'cast', text: computed(() => t('overlays.guide.done.tipOverlays')) }] };
}

export const overlaysUi: ModuleUi = {
  id: 'overlays',
  name: 'overlays.module.name',
  description: 'overlays.module.description',
  icon: 'cast',
  pages: [{ path: 'sources', label: 'overlays.nav.sources', icon: 'cast' }],
  routes: [{ path: 'sources', loadComponent: () => import('./pages/overlays/overlays').then((m) => m.Overlays) }],
  guide,
  tour: [{ target: 'nav-overlays-sources', order: 100, title: 'overlays.tour.overlays', text: 'overlays.tour.overlaysText' }],
};
