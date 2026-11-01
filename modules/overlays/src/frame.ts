// What the overlay shows of a telemetry frame (also the editor's preview, with the live data).

import type { LapTime, SessionMode } from '@gt-toolz/core';
import { detectMode, Flags, RaceEnd, type TelemetryFrame } from '@gt-toolz/telemetry';
import type { OverlayFrame } from './api';

/** Faster than this (m/s) on track is driving again (as in the telemetry session). */
const DRIVING_MS = 2;

/**
 * From the chequered flag until the session is left: no overlay on GT7's lap after the flag, its results and what
 * follows (the user, 2026-11-01: "ab Zielflagge keine Overlays mehr"). RaceEnd lets go on the first frame off the
 * track, but the session's mode holds on to the race for 3 s after it: the overlay came back for them on every way
 * out of the results (both recordings, eight races). Over until the mode has left the session (a menu, a replay), a
 * race runs again (a restart, the next race: lap 0 of 5) or the car drives again.
 */
export class AfterFlag {
  private readonly raceEnd = new RaceEnd();
  private over = false;

  /** Every frame the overlay gets; mode: the session's mode now. True while the race is over. */
  update(frame: TelemetryFrame, mode: SessionMode): boolean {
    if (this.raceEnd.update(frame)) this.over = true;
    else if (mode === 'menu' || mode === 'replay') this.over = false;
    else if (frame.flags & Flags.CarOnTrack && (frame.lapsInRace > 0 || frame.speed > DRIVING_MS)) this.over = false;
    return this.over;
  }
}

/** mode: the session as the telemetry has settled it; lastLap: the last lap against the target; raceOver: after the flag (RaceEnd). */
export function overlayFrame(frame: TelemetryFrame, mode: SessionMode, lastLap: LapTime | undefined, raceOver = false): OverlayFrame {
  // A time trial's ghosts count as cars ("1 of 3"): a position only in a race.
  const racing = frame.racePosition > 0 && detectMode(frame) === 'race';
  return {
    at: frame.time,
    mode,
    raceOver,
    speedKmh: frame.speed * 3.6,
    gear: frame.gear,
    throttle: frame.throttle,
    brake: frame.brake,
    tyreTemps: frame.tyreTemps,
    lap: frame.lapCount,
    laps: frame.lapsInRace > 0 ? frame.lapsInRace : 0,
    currentLapMs: frame.currentLapMs,
    lastLapMs: frame.lastLapMs > 0 ? frame.lastLapMs : undefined,
    bestLapMs: frame.bestLapMs > 0 ? frame.bestLapMs : undefined,
    lastLapDeltaMs: lastLap?.deltaMs,
    position: racing ? frame.racePosition : undefined,
    cars: racing ? frame.carsInRace : undefined,
    steerDeg: frame.steeringWheel !== undefined ? (frame.steeringWheel * 180) / Math.PI : undefined,
    paused: (frame.flags & Flags.Paused) !== 0,
    onTrack: (frame.flags & Flags.CarOnTrack) !== 0,
  };
}
