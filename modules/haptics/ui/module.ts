// The vibration in the UI: its page, the player that makes the patterns felt on every page, and its step in the setup
// assistant (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { signal } from '@angular/core';
import type { ModuleGuide, ModuleUi } from '@shell/core/module-ui';
import { HapticPlayer } from './core/haptic-player';
import { HapticsStep } from './guide/haptics-step';

function guide(): ModuleGuide {
  return {
    // Early, and also while off: drivers who hear badly find it before the steps that need hearing (docs/user/haptics.md).
    steps: [{ id: 'haptics', order: 20, label: 'haptics.guide.step.haptics', icon: 'vibrate', component: HapticsStep, offer: true }],
    // On the last step only while on: then it is ready.
    checks: [{ order: 50, label: 'haptics.guide.done.haptics', icon: 'vibrate', ok: signal(true) }],
  };
}

export const hapticsUi: ModuleUi = {
  id: 'haptics',
  name: 'haptics.module.name',
  description: 'haptics.module.description',
  icon: 'vibrate',
  pages: [{ path: 'vibration', label: 'haptics.nav.vibration', icon: 'vibrate', badge: 'haptics.nav.new' }],
  routes: [{ path: 'vibration', loadComponent: () => import('./pages/vibration/vibration').then((m) => m.Accessibility) }],
  services: [HapticPlayer],
  guide,
};
