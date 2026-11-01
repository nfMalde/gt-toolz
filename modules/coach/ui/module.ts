// The coach in the UI: its settings, the calibration button, its part of the Cockpit, the calibration step and tips in
// the setup assistant and its stop in the tour (the shell's extension points are in apps/ui/src/app/core/module-ui.ts).

import { computed, DestroyRef, inject } from '@angular/core';
import type { ModuleAction, ModuleCockpit, ModuleGuide, ModuleUi } from '@shell/core/module-ui';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';
import { CalloutCard } from './cockpit/callout-card';
import { CoachBanners } from './cockpit/coach-banners';
import { CoachChips } from './cockpit/coach-chips';
import { FeedbackCard } from './cockpit/feedback-card';
import { ZonesCard } from './cockpit/zones-card';
import { calibrating, CalibrateStep } from './guide/calibrate-step';

function actions(): ModuleAction[] {
  const settings = inject(SettingsStore);
  return [
    {
      id: 'calibrate',
      label: 'coach.nav.calibrate',
      icon: 'timer',
      run: () => settings.openGuide('calibrate'),
      // Not calibrated yet: the app reminds the driver (navigation, cockpit).
      attention: settings.needsCalibration,
      attentionTitle: 'coach.cockpit.calibrate.title',
    },
  ];
}

function cockpit(): ModuleCockpit {
  const coach = inject(CoachStore);
  // While learning there are no zones yet: the telemetry's learning card stands there.
  const zones = computed(() => !coach.learning());
  return {
    cards: [
      { id: 'callout', area: 'top', order: 30, weight: 3, component: CalloutCard },
      { id: 'zones', area: 'main', order: 10, weight: 8, component: ZonesCard, shown: zones },
      { id: 'feedback', area: 'side', order: 10, component: FeedbackCard, shown: zones },
    ],
    chips: CoachChips,
    banners: CoachBanners,
  };
}

function guide(): ModuleGuide {
  const coach = inject(CoachStore);
  const settings = inject(SettingsStore);
  const t = inject(I18n).t;
  const calibrated = computed(() => !settings.needsCalibration());
  // Closing the assistant ends a running calibration (coaching would stay paused otherwise).
  inject(DestroyRef).onDestroy(() => {
    if (calibrating(coach.status()?.calibration ?? null)) void coach.stopCalibration();
  });
  return {
    steps: [
      {
        id: 'calibrate',
        order: 70,
        label: 'coach.guide.step.calibrate',
        icon: 'timer',
        component: CalibrateStep,
        done: calibrated,
        missing: computed(() => (calibrated() ? undefined : 'coach.guide.required.calibrate')),
      },
    ],
    checks: [{ order: 40, label: 'coach.guide.done.calibration', icon: 'timer', ok: calibrated }],
    warning: { text: 'coach.guide.done.notCalibrated', icon: 'timer', shown: settings.needsCalibration },
    tips: [
      { order: 10, icon: 'flag', text: computed(() => t('coach.guide.done.tip1')) },
      { order: 20, icon: 'alert', text: computed(() => t('coach.guide.done.tip2')) },
      { order: 30, icon: { key: 'Pause' }, text: computed(() => t('coach.guide.done.tip3')) },
      {
        order: 40,
        icon: 'steering',
        text: computed(() => t('coach.guide.done.tip5', { n: settings.settings()?.debriefZones ?? 4 })),
        shown: computed(() => (settings.settings()?.debriefZones ?? 0) > 0),
      },
    ],
  };
}

export const coachUi: ModuleUi = {
  id: 'coach',
  name: 'coach.module.name',
  description: 'coach.module.description',
  icon: 'steering',
  pages: [{ path: 'settings', label: 'coach.nav.settings', icon: 'sliders' }],
  routes: [{ path: 'settings', loadComponent: () => import('./pages/settings/settings').then((m) => m.CoachSettings) }],
  actions,
  cockpit,
  guide,
  tour: [{ target: 'cockpit-callout', order: 40, route: '/telemetry/cockpit', title: 'coach.tour.callout', text: 'coach.tour.calloutText' }],
};
