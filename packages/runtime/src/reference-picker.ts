// Picks the reference for the track being driven (docs/dev/telemetry.md; the user, 2026-10-21: track and car class): the
// saved references of the car's class are watched like the ghost in races (GhostWatch), and of those that fit, the
// one used last is taken (the user, 2026-10-25), else the fastest lap.

import type { ReferenceLap } from '@gt-toolz/coach';
import type { TelemetryFrame } from '@gt-toolz/telemetry';
import { modeBop, type ReferenceMode, type ReferenceSummary } from './app-api';
import { GhostWatch } from './ghost';
import { listReferences, readReference, referenceUsage } from './references';

/** A car's class: GT7's category (Gr.3, Gr.4 …, packet C); without one (older data), the car itself. */
export interface CarClass {
  code: number;
  category?: string;
}

/** A reference's (or a summary's) class. */
export function classOf(ref: { carCode: number; carCategory?: string }): CarClass {
  return { code: ref.carCode, category: ref.carCategory || undefined };
}

/** The same class: the same category, or the same car when one of them has none. */
export function sameClass(a: CarClass, b: CarClass): boolean {
  if (a.category && b.category) return a.category === b.category;
  return a.code === b.code;
}

/** What the driver drives right now (the Cockpit's switch, docs/dev/telemetry.md). */
export interface DriveMode {
  mode: ReferenceMode;
  bop: boolean;
}

/**
 * A reference is for what the driver drives: the same mode and BoP. One the user has not put in a mode yet (older
 * ones, or the app's guess right after learning) fits any, until the user says what it is.
 */
export function fitsMode(ref: { mode?: ReferenceMode; bop?: boolean; modeConfirmed?: boolean }, drive: DriveMode): boolean {
  if (!ref.mode || !ref.modeConfirmed) return true;
  return ref.mode === drive.mode && modeBop(ref.mode, ref.bop) === drive.bop;
}

export class ReferencePicker {
  private readonly candidates: { summary: ReferenceSummary; watch: GhostWatch; usedAt: number }[] = [];
  private firstAt: number | undefined;
  private lastAt = 0;

  /** The saved references of the car's class and what the driver drives, except the one given (it does not fit). */
  constructor(dir: string, readonly car: CarClass, readonly drive: DriveMode, exclude?: string) {
    const usage = referenceUsage(dir);
    for (const summary of listReferences(dir)) {
      if (summary.file === exclude || !sameClass(classOf(summary), car) || !fitsMode(summary, drive)) continue;
      try {
        this.candidates.push({ summary, watch: new GhostWatch(readReference(summary.file)), usedAt: (Object.hasOwn(usage, summary.id) ? usage[summary.id] : undefined) ?? 0 });
      } catch {
        // A broken file is no candidate.
      }
    }
  }

  get count(): number {
    return this.candidates.length;
  }

  /** Every driving frame. */
  observe(frame: TelemetryFrame): void {
    this.firstAt ??= frame.time;
    this.lastAt = frame.time;
    for (const candidate of this.candidates) candidate.watch.observe(frame);
  }

  /** How long it has watched (ms of driving). */
  get watchedMs(): number {
    return this.firstAt === undefined ? 0 : this.lastAt - this.firstAt;
  }

  /** The reference that fits the track, once one does: the one used last, else the fastest. */
  pick(): { summary: ReferenceSummary; reference: ReferenceLap } | undefined {
    const best = this.candidates.filter((c) => c.watch.fits).sort((a, b) => b.usedAt - a.usedAt || a.summary.lapTimeMs - b.summary.lapTimeMs)[0];
    return best && { summary: best.summary, reference: best.watch.reference };
  }
}
