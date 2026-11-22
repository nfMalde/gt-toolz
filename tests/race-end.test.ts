// The user, 2026-10-30: after the chequered flag the overlay stayed for three minutes, and the race corner calls went
// on while GT7 drove the car round itself. A race over laps is over from the flag until the session ends (RaceEnd in
// packages/telemetry/src/mode.ts): the coach calls and keeps nothing, the overlay hides.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoachSession, DEFAULT_COACH_SETTINGS, type CoachEvent } from '../packages/coach/src/coach';
import { buildReference } from '../packages/coach/src/reference';
import { RaceEnd, RaceRunning } from '../packages/telemetry/src/mode';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

const at = (values: Partial<TelemetryFrame>): TelemetryFrame => ({ ...ovalLap(1, 0)[0]!, ...values });

test('a race over laps is over from the flag, through the results, until a menu or a restart', () => {
  const end = new RaceEnd();
  const race = { lapsInRace: 5, carsInRace: 8, racePosition: 6 };
  assert.equal(end.update(at({ ...race, lapCount: 5 })), false, 'the last lap');
  assert.equal(end.update(at({ ...race, lapCount: 6 })), true, 'the flag: lap 6 of 5, GT7 drives');
  assert.equal(end.update(at({ ...race, lapsInRace: 0, lapCount: 0, speed: 0 })), true, 'the results: lap 0 of 0, still on track');
  assert.equal(end.update(at({ flags: 0, lapsInRace: -1, lapCount: -1, carsInRace: -1 })), false, 'a menu');
  end.update(at({ ...race, lapCount: 6 }));
  assert.equal(end.update(at({ ...race, lapCount: 0 })), false, 'a restart: lap 0 of 5');
  assert.equal(new RaceEnd().update(at({ lapsInRace: 0, lapCount: 12 })), false, 'no laps to race: never over');
});

// The user, 2026-11-01: the crew still called positions while players joined the lobby and in qualifying. GT7 reports
// both like a race over a time (the Manufacturers Cup of 2026-10-31); only a race that runs counts (RaceRunning).
test('a race runs from its grid over laps, a race over a time once it has started; a lobby and its qualifying do not', () => {
  const running = new RaceRunning();
  const lobby = { lapsInRace: 0, carsInRace: 16, racePosition: 8, speed: 0 };
  assert.equal(running.update(at({ ...lobby, lapCount: 0 })), false, 'the lobby, players joining');
  assert.equal(running.update(at({ ...lobby, lapCount: 1, flags: Flags.CarOnTrack | Flags.Loading })), false, 'loading the qualifying');
  assert.equal(running.update(at({ ...lobby, lapCount: 1 })), false, 'in the pits at lap 1');
  assert.equal(running.update(at({ ...lobby, lapCount: 1, speed: 60 })), false, 'out of the pits');
  assert.equal(running.update(at({ ...lobby, lapCount: 4, speed: 70 })), false, 'qualifying laps of 0');
  assert.equal(running.update(at({ ...lobby, lapCount: 0 })), false, 'the lobby again');
  const grid = { lapsInRace: 15, carsInRace: 16, racePosition: 5, speed: 0, lapCount: 0 };
  assert.equal(running.update(at(grid)), true, 'the grid of a race over 15 laps');
  assert.equal(running.update(at({ ...grid, lapCount: 1, speed: 37 })), true, 'the start');
  assert.equal(running.update(at({ ...grid, lapCount: 16, speed: 22 })), true, "GT7's lap after the flag");
  assert.equal(running.update(at({ ...grid, lapCount: 16, lapsInRace: 0, speed: 22 })), false, 'its end: lap 16 of 0');
  assert.equal(running.update(at({ ...lobby, lapCount: 0 })), false, 'the results');

  // A race over a time (the 24h race at Red Bull Ring, 2026-10-20: 0 laps, 20 cars): from its grid over the line.
  const timed = new RaceRunning();
  const race = { lapsInRace: 0, carsInRace: 20, racePosition: 7 };
  assert.equal(timed.update(at({ ...race, lapCount: 0, speed: 0 })), false, 'its grid');
  assert.equal(timed.update(at({ ...race, lapCount: 0, speed: 12 })), false, 'started, before the line');
  assert.equal(timed.update(at({ ...race, lapCount: 0, speed: 10, flags: Flags.CarOnTrack | Flags.Paused })), false, 'paused');
  assert.equal(timed.update(at({ ...race, lapCount: 1, speed: 15 })), true, 'over the line');
  assert.equal(timed.update(at({ ...race, lapCount: 2, speed: 60, flags: Flags.CarOnTrack | Flags.Paused })), true, 'a pause changes nothing');
  assert.equal(timed.update(at({ ...race, lapCount: 9, speed: 60 })), true);
  assert.equal(timed.update(at({ ...race, lapCount: 0, speed: 0 })), false, 'its results');
  assert.equal(timed.update(at({ flags: 0, lapCount: -1, lapsInRace: -1, carsInRace: -1, speed: 0 })), false, 'a menu');
});

// The user, 2026-11-03: a licence test or a mission, reported as a race of one lap with one car, got the radio check, the
// tyres and the chequered flag on every try.
// Issue #15, the cups of 7, 14 and 21 November: the qualifying started at lap 0 in the pits and went to lap 1 a few seconds
// after the pit exit, like the start of a race over a time. The race over a time of 22 November had a rolling start.
test('a qualifying from the pit box is no race over a time; a race over a time starts from the grid or rolling', () => {
  const quali = { lapsInRace: 0, carsInRace: 16, racePosition: 16 };
  const running = new RaceRunning();
  const step = (time: number, values: Partial<TelemetryFrame>) => running.update(at({ ...quali, time, ...values }));
  // Waiting in the pit box with the handbrake held, moving off the moment it is let go.
  for (let t = 0; t < 2000; t += 100) assert.equal(step(t, { lapCount: 0, speed: 0, flags: Flags.CarOnTrack | Flags.Handbrake }), false, 'the pit box');
  assert.equal(step(2000, { lapCount: 0, speed: 0 }), false, 'the handbrake let go');
  assert.equal(step(2100, { lapCount: 0, speed: 8 }), false, 'out of the pit box');
  assert.equal(step(5500, { lapCount: 1, speed: 22 }), false, 'over the line after the pit exit: still the qualifying');
  assert.equal(step(90_000, { lapCount: 2, speed: 50 }), false, 'its laps');
  assert.equal(step(300_000, { lapCount: 0, speed: 0 }), false, 'its results');
  assert.equal(step(400_000, { lapCount: 0, lapsInRace: 15, speed: 0 }), true, 'the race over laps after it');

  // A race over a time, rolling start: on track already moving, over the line.
  const rolling = new RaceRunning();
  const timed = { lapsInRace: 0, carsInRace: 20, racePosition: 10 };
  assert.equal(rolling.update(at({ ...timed, time: 0, lapCount: 0, speed: 22 })), false, 'the rolling start');
  assert.equal(rolling.update(at({ ...timed, time: 6000, lapCount: 1, speed: 28 })), true, 'over the line');

  // A race over a time from the grid: the handbrake was held in the lobby, but long before the start.
  const grid = new RaceRunning();
  grid.update(at({ ...timed, time: 0, lapCount: 0, speed: 0, flags: Flags.CarOnTrack | Flags.Handbrake }));
  for (let t = 1000; t <= 70_000; t += 1000) grid.update(at({ ...timed, time: t, lapCount: 0, speed: 0 }));
  assert.equal(grid.update(at({ ...timed, time: 71_000, lapCount: 0, speed: 5 })), false, 'the start');
  assert.equal(grid.update(at({ ...timed, time: 73_000, lapCount: 1, speed: 20 })), true, 'over the line');
});

test('a single car over a single lap is no race; with other cars, or alone over more laps, it is', () => {
  const alone = { lapsInRace: 1, carsInRace: 1, racePosition: 1, lapCount: 1, speed: 40 };
  assert.equal(new RaceRunning().update(at(alone)), false, 'a licence test');
  assert.equal(new RaceRunning().update(at({ ...alone, carsInRace: 8 })), true, 'a sprint of one lap against others');
  assert.equal(new RaceRunning().update(at({ ...alone, lapsInRace: 10 })), true, 'ten laps alone: fuel and tyres count');
});

test('after the flag the coach makes no race corner calls and keeps nothing GT7 drives', () => {
  const lap = ovalLap(1, 0);
  const reference = buildReference({ lapNumber: 1, frames: lap, lapTimeMs: lap.at(-1)!.time, clean: true, live: true }, 'test');
  const coach = new CoachSession(reference, { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: false, raceCalls: 'all' });
  const lapMs = lap.at(-1)!.time + 1000 / 60;
  // A race of two laps against seven others.
  const drive = (n: number) => {
    const events: CoachEvent[] = [];
    for (const f of ovalLap(n, (n - 1) * lapMs)) events.push(...coach.update({ ...f, lapsInRace: 2, carsInRace: 8, racePosition: 3 }));
    return { cues: events.filter((e) => e.type === 'cue').length, results: events.filter((e) => e.type === 'corner-result').length };
  };
  drive(1);
  const second = drive(2);
  assert.ok(second.cues > 0 && second.results > 0, `calls and results while racing (${JSON.stringify(second)})`);
  assert.deepEqual(drive(3), { cues: 0, results: 0 }, 'lap 3 of 2: nothing');
});
