// What GT7 shows, read from one frame: the coach, the runner and the overlays tell sessions apart the same way.

import { Flags, type TelemetryFrame } from './packet';

export type SessionMode = 'race' | 'practice' | 'replay' | 'menu';

/** A time trial counts its ghosts as cars: the driver, the own best lap's ghost and a leaderboard ghost. */
const TIME_TRIAL_MAX_CARS = 3;

/**
 * GT7 has no session type field. Races report the number of laps (lapsInRace > 0); time trials and
 * practice report 0, in single player and Sport Mode alike. Races over a time (24h) report 0 laps too, but
 * more cars than a time trial with its ghosts (1, with one ghost 2, with two 3: "1 of 3" on stream, 2026-10-23).
 * Replays don't set CarOnTrack; the race preparation screen's background video neither, and it has no session.
 */
export function detectMode(frame: TelemetryFrame): SessionMode {
  if (!(frame.flags & Flags.CarOnTrack)) {
    // The race preparation screen plays a video of the car in the background: no session (cars -1). A
    // replay belongs to a session (a time trial's ghost replay reports 1 of 1).
    return frame.speed > 1 && frame.carsInRace > 0 ? 'replay' : 'menu';
  }
  return frame.lapsInRace > 0 || frame.carsInRace > TIME_TRIAL_MAX_CARS ? 'race' : 'practice';
}

/**
 * A race over laps is over once its last lap is done (the user, 2026-10-30: the overlay stayed for three minutes
 * after the chequered flag, and the race corner calls went on). GT7 then counts on ("lap 6 of 5") and drives the car
 * round itself; its results screen follows: lap 0 of 0, standing, still on track, in a lobby until the players have
 * left. Over until the session ends (a menu) or a race starts again (a restart: lap 0 of 5). Races over a time report
 * no laps: never over.
 */
export class RaceEnd {
  private finished = false;

  /** Every frame goes through it; true while the race is over. */
  update(frame: TelemetryFrame): boolean {
    if (!(frame.flags & Flags.CarOnTrack)) this.finished = false;
    else if (frame.lapsInRace > 0) this.finished = frame.lapCount > frame.lapsInRace;
    return this.finished;
  }

  get over(): boolean {
    return this.finished;
  }
}

/** Faster than this (m/s) over the line from lap 0 to 1: a race over a time has started. */
const STARTED_MS = 2;

/**
 * Whether a race runs, not just its lobby or its qualifying (the user, 2026-11-01: the crew still called positions
 * while players joined the lobby and in qualifying). GT7 reports a lobby, its qualifying and a race over a time
 * alike: no laps, many cars (the Manufacturers Cup of 2026-10-31: the lobby lap 0 of 0 while players join,
 * qualifying laps 1 to 4 of 0, the grid lap 0 of 15). A race over laps runs while it reports them, from its grid on.
 * A race over a time runs once it has started, when the counter goes from 0 to 1 while the car moves (a qualifying
 * starts standing in the pits at lap 1), until the counter is back at 0 (its results, the lobby) or the session ends.
 * A single car over a single lap is no race: a licence test or a mission, tried again and again (the user, 2026-11-03:
 * each try got the radio check, the tyres and the chequered flag). A longer run alone stays one, for its fuel and tyres.
 */
export class RaceRunning {
  private timed = false;
  private lastLap: number | undefined;
  private running = false;

  /** Every frame goes through it; true while a race runs. */
  update(frame: TelemetryFrame): boolean {
    // A pause or a loading screen changes nothing (GT7 loads the qualifying at lap 1).
    if (frame.flags & (Flags.Paused | Flags.Loading)) return this.running;
    const onTrack = (frame.flags & Flags.CarOnTrack) !== 0;
    if (frame.lapCount <= 0 || frame.lapsInRace > 0) this.timed = false;
    else if (onTrack && this.lastLap === 0 && frame.lapCount === 1 && frame.speed > STARTED_MS) this.timed = true;
    this.lastLap = frame.lapCount;
    const alone = frame.lapsInRace === 1 && frame.carsInRace <= 1;
    this.running = onTrack && !alone && (frame.lapsInRace > 0 || this.timed);
    return this.running;
  }
}
