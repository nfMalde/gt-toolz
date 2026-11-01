import { computed, inject, type Signal } from '@angular/core';
import { CoachStore } from '@shell/stores/coach.store';
import { SettingsStore } from '@shell/stores/settings.store';

/**
 * Races and menus (preparation screen, results), and replays while the coach is quiet there (docs/dev/telemetry.md): no
 * briefing, mood or debrief. Called in an injection context.
 */
export function soloQuiet(): Signal<boolean> {
  const status = inject(CoachStore).status;
  const settings = inject(SettingsStore).settings;
  return computed(() => {
    const mode = status()?.mode;
    return mode === 'race' || mode === 'menu' || (mode === 'replay' && !settings()?.replayCalls);
  });
}
