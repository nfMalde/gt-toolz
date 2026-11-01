// The telemetry in the UI: the Cockpit, the references and its settings, the connection in the title bar, the question
// after learning, the PlayStation and the first reference in the setup assistant, and its stops in the tour (the
// shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { computed, effect, inject, signal } from '@angular/core';
import type { ModuleCockpit, ModuleGuide, ModuleUi } from '@shell/core/module-ui';
import { CoachStore } from '@shell/stores/coach.store';
import { LearningCard } from './cockpit/learning-card';
import { LiveCard } from './cockpit/live-card';
import { SessionCard } from './cockpit/session-card';
import { TimelineCard } from './cockpit/timeline-card';
import { ConnectStep } from './guide/connect-step';
import { ReferenceStep } from './guide/reference-step';
import { ModeDialog } from './pages/references/mode-dialog';
import { ConnectionPill } from './title-bar/connection-pill';

function cockpit(): ModuleCockpit {
  const coach = inject(CoachStore);
  return {
    cards: [
      { id: 'session', area: 'top', order: 10, weight: 5, component: SessionCard },
      { id: 'live', area: 'top', order: 20, weight: 4, component: LiveCard },
      // While learning: how to get a reference, in place of the zones and the timeline.
      { id: 'learning', area: 'wide', order: 20, component: LearningCard, shown: coach.learning },
      { id: 'timeline', area: 'side', order: 20, component: TimelineCard, shown: computed(() => !coach.learning()) },
    ],
  };
}

function guide(): ModuleGuide {
  const coach = inject(CoachStore);
  /** GT7 sent telemetry while the assistant was open (it may pause later, e.g. in a menu). */
  const connected = signal(false);
  effect(() => {
    if (coach.isLive()) connected.set(true);
  });
  /** A reference learned while the assistant is open. */
  const learned = signal(false);
  let before: string | undefined | null = null;
  effect(() => {
    const id = coach.reference()?.id;
    if (before !== null && id && id !== before) learned.set(true);
    before = id;
  });
  const hasReference = computed(() => !!coach.reference());
  return {
    steps: [
      {
        id: 'connect',
        order: 30,
        label: 'telemetry.guide.step.connect',
        icon: 'gamepad',
        component: ConnectStep,
        done: computed(() => coach.isLive() || connected()),
        missing: computed(() => (connected() ? undefined : 'telemetry.guide.required.connect')),
      },
      {
        id: 'reference',
        order: 60,
        label: 'telemetry.guide.step.reference',
        icon: 'flag',
        component: ReferenceStep,
        inputs: { learned },
        done: hasReference,
        missing: computed(() => (hasReference() ? undefined : 'telemetry.guide.required.reference')),
      },
    ],
    checks: [
      { order: 10, label: 'telemetry.guide.done.connection', icon: 'gamepad', ok: coach.isLive },
      { order: 30, label: 'telemetry.guide.done.reference', icon: 'flag', ok: hasReference },
    ],
  };
}

export const telemetryUi: ModuleUi = {
  id: 'telemetry',
  name: 'telemetry.module.name',
  description: 'telemetry.module.description',
  icon: 'gamepad',
  required: true,
  pages: [
    { path: 'cockpit', label: 'telemetry.nav.cockpit', icon: 'cockpit' },
    { path: 'references', label: 'telemetry.nav.references', icon: 'flag' },
    { path: 'settings', label: 'telemetry.nav.settings', icon: 'sliders' },
  ],
  routes: [
    { path: 'cockpit', loadComponent: () => import('./pages/cockpit/cockpit').then((m) => m.Cockpit) },
    { path: 'references', loadComponent: () => import('./pages/references/references').then((m) => m.References) },
    { path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.TelemetrySettings) },
  ],
  // After learning (and once for a reference without a mode): what the reference is.
  dialogs: [ModeDialog],
  titleBar: ConnectionPill,
  cockpit,
  guide,
  tour: [
    { target: 'nav-telemetry-cockpit', order: 10, route: '/telemetry/cockpit', title: 'telemetry.tour.cockpit', text: 'telemetry.tour.cockpitText' },
    { target: 'cockpit-session', order: 20, route: '/telemetry/cockpit', title: 'telemetry.tour.session', text: 'telemetry.tour.sessionText' },
    { target: 'cockpit-drive', order: 30, route: '/telemetry/cockpit', title: 'telemetry.tour.drive', text: 'telemetry.tour.driveText' },
    { target: 'refs-learn', order: 50, route: '/telemetry/references', title: 'telemetry.tour.references', text: 'telemetry.tour.referencesText' },
  ],
};
