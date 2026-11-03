// Tyre temperatures (docs/user/crew.md, in quali 4.18b): the state of all four (cold, up to temperature, hot) when it
// changes, cold and hot again now and then, fast changes, and a single tyre that ran hot over a lap. The race crew uses it, and
// outside races the runner (the user, 2026-10-22: since a GT7 update the temperature matters in quali too).

import type { Phrases } from '@gt-toolz/coach';
import type { TelemetryFrame } from '@gt-toolz/telemetry';

/** A tyre hotter than this (°C, average over the lap) gets a warning; at most every few laps. */
const TYRE_HOT_C = 105;
const TYRE_HOT_EVERY_LAPS = 3;
/** Below this speed (m/s) the car stands: no tyre state calls. */
const MOVING_MS = 5;
/**
 * Tyre state from the mean temperature of all four (°C), with some room so it does not flip back and forth:
 * cold below COLD, warm from WARM, hot above HOT (back to warm below HOT_BACK).
 */
const TYRE_COLD_C = 55;
const TYRE_WARM_C = 62;
const TYRE_HOT_ALL_C = 100;
const TYRE_HOT_BACK_C = 95;
/** A new tyre state is said once it holds this long; cold and hot are repeated after this time. */
const TYRE_STATE_STABLE_MS = 5000;
const TYRE_STATE_REMINDER_MS = 5 * 60_000;
/** Mean temperature change within the window that counts as fast (rising or falling). */
const TYRE_TREND_C = 10;
const TYRE_TREND_WINDOW_MS = 20_000;
const TYRE_TREND_GAP_MS = 60_000;

export type Temps = [number, number, number, number];

export class TyreWatch {
  private sum: Temps = [0, 0, 0, 0];
  private samples = 0;
  /** Mean temperature once per second, for fast changes. */
  private history: { at: number; mean: number }[] = [];
  private state: 'cold' | 'warm' | 'hot' | undefined;
  private candidate: { state: 'cold' | 'warm' | 'hot'; since: number } | undefined;
  private stateSaidAt = 0;
  private trendSaidAt = 0;
  private lastHotLap = -Infinity;

  constructor(private phrases: Phrases) {}

  /** Speaks the crew's language, which can change during a session. */
  setPhrases(phrases: Phrases): void {
    this.phrases = phrases;
  }

  /** Every frame: adds up the lap's temperatures. speak: the calls due now (none while standing). */
  frame(frame: TelemetryFrame, now: number, speak: boolean): string[] {
    const t = frame.tyreTemps;
    const sum = this.sum;
    this.sum = [sum[0] + t[0], sum[1] + t[1], sum[2] + t[2], sum[3] + t[3]];
    this.samples++;
    // Standing (grid, waiting for rain, the pits): no calls, the tyres only cool down.
    if (!speak || frame.speed < MOVING_MS) return [];
    return this.calls((t[0] + t[1] + t[2] + t[3]) / 4, now);
  }

  /** A lap is done: its mean temperatures, and a warning for a tyre that ran hot (at most every few laps). */
  lap(completed: number, speak: boolean): { temps?: Temps; hot?: string } {
    const temps = this.samples ? (this.sum.map((t) => t / this.samples) as Temps) : undefined;
    this.sum = [0, 0, 0, 0];
    this.samples = 0;
    if (!temps || !speak || completed - this.lastHotLap < TYRE_HOT_EVERY_LAPS) return { temps };
    const hottest = temps.indexOf(Math.max(...temps)) as 0 | 1 | 2 | 3;
    if (temps[hottest] < TYRE_HOT_C) return { temps };
    this.lastHotLap = completed;
    return { temps, hot: this.phrases.crewTyreHot(hottest, Math.round(temps[hottest])) };
  }

  /** Tyre state when it changes (cold and hot now and then; the user, 2026-11-03: "up to temperature" once is enough), and fast temperature changes. */
  private calls(mean: number, now: number): string[] {
    const last = this.history.at(-1);
    if (!last || now - last.at >= 1000) {
      this.history.push({ at: now, mean });
      this.history = this.history.filter((h) => now - h.at <= TYRE_TREND_WINDOW_MS);
    }

    // Fast change: compared with the start of the window.
    const oldest = this.history[0];
    if (oldest && now - oldest.at >= TYRE_TREND_WINDOW_MS * 0.9 && now - this.trendSaidAt >= TYRE_TREND_GAP_MS) {
      const change = mean - oldest.mean;
      if (Math.abs(change) >= TYRE_TREND_C) {
        this.trendSaidAt = now;
        this.history = [{ at: now, mean }];
        return [this.phrases.crewTyreTrend(change > 0 ? 'rising' : 'falling', Math.round(mean))];
      }
    }

    // State with room between the thresholds.
    const current = this.state;
    const state: 'cold' | 'warm' | 'hot' =
      mean > TYRE_HOT_ALL_C || (current === 'hot' && mean >= TYRE_HOT_BACK_C)
        ? 'hot'
        : mean < TYRE_COLD_C || (current === 'cold' && mean < TYRE_WARM_C)
          ? 'cold'
          : 'warm';
    if (state !== this.candidate?.state) this.candidate = { state, since: now };
    const holds = now - this.candidate.since >= TYRE_STATE_STABLE_MS;
    const changed = holds && state !== current;
    const reminder = holds && state === current && state !== 'warm' && now - this.stateSaidAt >= TYRE_STATE_REMINDER_MS;
    if (!changed && !reminder) return [];
    this.state = state;
    this.stateSaidAt = now;
    return [this.phrases.crewTyreState(state)];
  }
}
