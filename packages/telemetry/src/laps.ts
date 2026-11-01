import { Flags, type TelemetryFrame } from './packet';

/** Consecutive positions further apart than this mean a cut (replay skipped, reset, teleport). */
const MAX_STEP_METERS = 25;

/** GT7 sends 60 packets a second. */
const FRAME_MS = 1000 / 60;

export interface Lap {
  lapNumber: number;
  /** A replay's frames after a pause are moved back by it (their time). */
  frames: TelemetryFrame[];
  /** Official lap time if GT7 reported one, otherwise measured from timestamps (without a replay's pauses). */
  lapTimeMs: number;
  /** False if the lap has a cut, a loading screen or (own driving) a pause in it. */
  clean: boolean;
  /** True if GT7 marked the car as on track (live), false for replays. */
  live: boolean;
}

/**
 * Splits frames into complete laps. A lap starts when lapCount goes up by one to N (N >= 1), at the line,
 * and ends when it goes up to N + 1. Laps already running when the recording started are skipped, and so are
 * laps that began with a jump: a replay that starts again, or one out of a menu (lap -1 to 2), starts somewhere
 * on the track (the user's Manufacturers Cup, 2026-10-31: 2.6 s of a looping replay were learned as a lap).
 */
export function splitLaps(frames: TelemetryFrame[]): Lap[] {
  const laps: Lap[] = [];
  let current: TelemetryFrame[] | undefined;
  let currentLap = Number.NaN;
  let clean = true;
  let previous: TelemetryFrame | undefined;
  /** The pauses of the replay lap so far, and whether it is paused right now. */
  let pausedMs = 0;
  let paused = false;

  for (const frame of frames) {
    if (frame.flags & Flags.Loading) {
      if (current) clean = false;
      continue;
    }
    if (frame.flags & Flags.Paused) {
      // A replay the viewer pauses goes on where it stopped (the same Manufacturers Cup: a full replay lap was lost
      // to a pause of 10 s); a pause in one's own driving stays a break in the lap.
      if (current && frame.flags & Flags.CarOnTrack) clean = false;
      paused = !!current;
      continue;
    }

    if (previous && frame.lapCount !== previous.lapCount) {
      if (current && frame.lapCount === currentLap + 1) {
        laps.push(finishLap(currentLap, current, clean, frame));
      }
      current = frame.lapCount >= 1 && frame.lapCount === previous.lapCount + 1 ? [] : undefined;
      currentLap = frame.lapCount;
      clean = true;
      pausedMs = 0;
      paused = false;
    }

    if (current) {
      if (paused && previous) pausedMs += Math.max(0, frame.time - previous.time - FRAME_MS);
      paused = false;
      const last = current.at(-1);
      if (last && distance(last, frame) > MAX_STEP_METERS) clean = false;
      current.push(pausedMs ? { ...frame, time: frame.time - pausedMs } : frame);
    }
    previous = frame;
  }
  return laps;
}

function finishLap(lapNumber: number, frames: TelemetryFrame[], clean: boolean, next: TelemetryFrame): Lap {
  const first = frames[0]!;
  const last = frames.at(-1)!;
  const measured = last.time - first.time;
  // GT7 updates lastLapMs when the line is crossed; accept it if it is close to what we measured.
  const official = next.lastLapMs > 0 && Math.abs(next.lastLapMs - measured) < 2000 ? next.lastLapMs : undefined;
  return {
    lapNumber,
    frames,
    lapTimeMs: official ?? measured,
    clean,
    live: (first.flags & Flags.CarOnTrack) !== 0,
  };
}

/** Laps of one's own driving that learning waits for; the fastest clean one becomes the reference. */
export const OWN_LAPS = 3;

/**
 * The lap a reference is learned from: a replay's first clean lap (a ghost), or from one's own driving the
 * fastest clean lap once OWN_LAPS laps are complete (the user, 2026-10-21: "Beste der 3 Runden"). Undefined: not
 * yet (fewer laps, or none of them clean: then the next clean one counts too).
 */
export function lapToLearn(laps: readonly Lap[], ownLaps = OWN_LAPS): Lap | undefined {
  const replay = laps.find((lap) => !lap.live && lap.clean);
  if (replay) return replay;
  const own = laps.filter((lap) => lap.live);
  if (own.length < ownLaps) return undefined;
  return own.filter((lap) => lap.clean).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0];
}

export function distance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function formatLapTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = (ms % 60000) / 1000;
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}
