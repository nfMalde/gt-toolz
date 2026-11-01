import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { Activity, CueEvent, LiveSample, RunnerStatus } from '@gtt/api';
import { BRIDGE_AVAILABLE, GTT } from '../core/gtt';

interface CoachState {
  status: RunnerStatus | null;
  live: LiveSample | null;
  lastCue: CueEvent | null;
  /** Counts cues, so the call display can replay its animation for the same text. */
  cueCount: number;
  activity: Activity[];
}

const MAX_ACTIVITY = 80;
/** Telemetry older than this counts as gone. */
const LIVE_STALE_MS = 2500;

/** Everything live from the coach: connection, session, telemetry, calls and the timeline. */
export const CoachStore = signalStore(
  { providedIn: 'root' },
  withState<CoachState>({ status: null, live: null, lastCue: null, cueCount: 0, activity: [] }),
  withComputed(({ status, live }) => {
    const connection = computed(() => status()?.connection ?? null);
    const stage = computed(() => connection()?.stage ?? 'ps5');
    return {
      connection,
      stage,
      isLive: computed(() => stage() === 'live'),
      learning: computed(() => status()?.coach === 'learning'),
      reference: computed(() => status()?.reference ?? null),
      zones: computed(() => status()?.zones ?? []),
      feedback: computed(() => status()?.feedback ?? []),
      coachVoice: computed(() => status()?.voices.coach ?? null),
      hasTelemetry: computed(() => {
        const sample = live();
        return !!sample && stage() === 'live' && Date.now() - sample.at < LIVE_STALE_MS;
      }),
    };
  }),
  withComputed(({ status, hasTelemetry }) => ({
    /**
     * While learning: recording only in a replay or while driving outside races. In GT7's menus and its intro the
     * game repeats one standing packet (alpha 0.0.5: the user's Mac said "Aufnahme läuft" during the intro, though
     * nothing was recorded); in races nothing is learned.
     */
    learnState: computed<'waiting' | 'recording' | 'menu' | 'race'>(() => {
      if (!hasTelemetry()) return 'waiting';
      const mode = status()?.mode;
      return mode === 'replay' || mode === 'practice' ? 'recording' : mode === 'race' ? 'race' : 'menu';
    }),
  })),
  withMethods((store, gtt = inject(GTT)) => ({
    async refresh(): Promise<void> {
      patchState(store, { status: await gtt.getStatus() });
    },
    testAudio(): Promise<void> {
      return gtt.testAudio();
    },
    startCalibration(): Promise<void> {
      return gtt.startCalibration();
    },
    stopCalibration(): Promise<void> {
      return gtt.stopCalibration();
    },
    clearActivity(): void {
      patchState(store, { activity: [] });
    },
  })),
  withHooks((store, gtt = inject(GTT)) => {
    const unsubscribe: (() => void)[] = [];
    return {
      onInit() {
        if (!BRIDGE_AVAILABLE) return;
        unsubscribe.push(
          gtt.onStatus((status) => patchState(store, { status })),
          gtt.onLive((live) => patchState(store, { live })),
          gtt.onCue((cue) => patchState(store, (state) => ({ lastCue: cue, cueCount: state.cueCount + 1 }))),
          gtt.onActivity((activity) => patchState(store, (state) => ({ activity: [activity, ...state.activity].slice(0, MAX_ACTIVITY) }))),
        );
        void store.refresh();
      },
      onDestroy() {
        unsubscribe.forEach((stop) => stop());
      },
    };
  }),
);
