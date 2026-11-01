// What a module adds to the shell's UI (docs/dev/modules.md, as in Stream Toolz): its pages in the navigation
// and their routes, buttons next to them, services started with the app, dialogs, a widget in the title bar, their
// part of the Cockpit, their steps in the setup assistant and their stops in the tour. The built-in modules are listed
// in ../modules.ts; each one's own part is modules/<id>/ui/module.ts.

import type { Signal, Type } from '@angular/core';
import type { Routes } from '@angular/router';
import type { ModuleId } from '@gtt/api';
import type { TextKey } from '../i18n/i18n';
import type { IconName } from '../ui/icon';

export interface ModuleUi {
  /** Its route (/<id>/…) and the start of its text keys ("<id>.…"). */
  id: ModuleId;
  name: TextKey;
  /** One sentence for the module overview. */
  description: TextKey;
  icon: IconName;
  /** Cannot be switched off (the telemetry: every other module reads it). */
  required?: boolean;
  /** Its pages in the navigation, in order; the first one opens when the module is chosen. */
  pages: ModulePage[];
  /** The routes of those pages, below /<id>/ (loaded when first opened). */
  routes: Routes;
  /** Buttons below its pages (the coach: calibration); called in an injection context. */
  actions?: () => ModuleAction[];
  /** Started with the app while the module is on (the vibration's player: patterns play on every page). */
  services?: Type<unknown>[];
  /** Shown over every page while the module is on (the telemetry: "What is this reference?"). */
  dialogs?: Type<unknown>[];
  /** In the middle of the title bar (the telemetry: the connection). */
  titleBar?: Type<unknown>;
  /** Its part of the Cockpit; called in the Cockpit's injection context. */
  cockpit?: () => ModuleCockpit;
  /** Its part of the setup assistant; called in the assistant's injection context (once each time it opens). */
  guide?: () => ModuleGuide;
  /** Its stops in the tour (only while the module is on). */
  tour?: TourStop[];
}

/** What a module adds to the setup assistant (as in Stream Toolz, with an order: the steps of all are mixed). */
export interface ModuleGuide {
  steps?: GuideStep[];
  /** Lines on the last step: what is ready and what comes later. */
  checks?: GuideCheck[];
  /** On the last step below "How it goes on the track". */
  tips?: GuideTip[];
  /** A warning on the last step while it is shown (the coach: not calibrated). */
  warning?: { text: TextKey; icon: IconName; shown: Signal<boolean> };
}

export interface GuideStep {
  /** Unique over all steps; SettingsStore.openGuide(id) opens the assistant there (the coach: "calibrate"). */
  id: string;
  /** Where it stands among all steps (the shell's: basics 10, voices 40, name 50; the last step is always last). */
  order: number;
  label: TextKey;
  icon: IconName;
  /** The step's content. */
  component: Type<unknown>;
  /** Its inputs: state the assistant keeps while it is open, not only while the step is shown (a signal is read). */
  inputs?: Record<string, unknown>;
  /** Its "Next" says "Later" until this is true (outside the first setup). */
  done?: Signal<boolean>;
  /** The first setup: what the step still needs before "Next"; undefined: nothing. */
  missing?: Signal<TextKey | undefined>;
  /**
   * Shown also while the module is off; the step itself switches it on (the vibration: drivers who hear badly find it
   * without knowing the modules).
   */
  offer?: boolean;
}

export interface GuideCheck {
  order: number;
  label: TextKey;
  icon: IconName;
  ok: Signal<boolean>;
}

export interface GuideTip {
  order: number;
  text: Signal<string>;
  /** An icon, or a key on the keyboard ("Pause"). */
  icon: IconName | { key: string };
  shown?: Signal<boolean>;
}

/** One stop of the tour: the element with data-tour="<target>" (on the page of route, if given) and what to say. */
export interface TourStop {
  target: string;
  /** Where it stands among all stops (the shell's: modules 60 to the last, 120). */
  order: number;
  route?: string;
  title: TextKey;
  text: TextKey;
}

/** What a module shows on the Cockpit: one screen while driving; a module that is off takes its part with it. */
export interface ModuleCockpit {
  cards?: CockpitCard[];
  /** In the page header, after the session's mode (the coach: briefing, mood, debrief). */
  chips?: Type<unknown>;
  /** Above the cards (the coach: calibration, its voice). */
  banners?: Type<unknown>;
}

/**
 * Where a card sits: "top" the row with the connection, "wide" the full width below it, "main" and "side" the row
 * below that (side: one column on the right, its cards stacked).
 */
export type CockpitArea = 'top' | 'wide' | 'main' | 'side';

export interface CockpitCard {
  id: string;
  area: CockpitArea;
  /** Left to right (top to bottom in "side"), over all modules. */
  order: number;
  /** Its share of the row's width ("top", "main"); the cards of a row fill it. */
  weight?: number;
  component: Type<unknown>;
  /** Shown only while true (the crew: in races). */
  shown?: Signal<boolean>;
}

export interface ModulePage {
  /** Below /<id>/. */
  path: string;
  label: TextKey;
  icon: IconName;
  /** Highlight ("New"). */
  badge?: TextKey;
}

export interface ModuleAction {
  /** Unique in the module (the tour finds it by data-tour="nav-<module>-<id>"). */
  id: string;
  label: TextKey;
  icon: IconName;
  run(): void;
  /** A dot that asks for attention (not calibrated yet). */
  attention?: Signal<boolean>;
  attentionTitle?: TextKey;
}
