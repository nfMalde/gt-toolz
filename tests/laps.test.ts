// The user's Manufacturers Cup, 2026-10-31: GT7 looped a replay of the track before the practice. Its full lap was
// lost to a pause of 10 s, and when the replay started again (out of a menu, at lap 2 just before the line) those
// 2.6 s were learned as a lap: a reference without braking zones, so practice had no calls. Laps start at the line
// only (splitLaps in packages/telemetry/src/laps.ts), and a replay's pause is taken out of its lap.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lapToLearn, splitLaps } from '../packages/telemetry/src/laps';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';

const FRAME_MS = 1000 / 60;
const menu = (time: number): TelemetryFrame => ({ ...ovalLap(1, 0)[0]!, time, flags: 0, speed: 0, lapCount: -1, lapsInRace: -1, carsInRace: -1, racePosition: -1 });
/** The oval as a replay: the car moves, not on track. */
const replay = (lap: number, start: number) => ovalLap(lap, start).map((f) => ({ ...f, flags: f.flags & ~Flags.CarOnTrack }));
const after = (frames: TelemetryFrame[]) => frames.at(-1)!.time + FRAME_MS;

/** A lap paused for pauseMs halfway: the frames stand still with the pause flag, then go on. */
function paused(frames: TelemetryFrame[], pauseMs: number): TelemetryFrame[] {
  const half = Math.floor(frames.length / 2);
  const still = frames[half - 1]!;
  const pause = Array.from({ length: Math.round(pauseMs / FRAME_MS) }, (_, i) => ({ ...still, time: still.time + (i + 1) * FRAME_MS, flags: still.flags | Flags.Paused, speed: 0 }));
  return [...frames.slice(0, half), ...pause, ...frames.slice(half).map((f) => ({ ...f, time: f.time + pauseMs + FRAME_MS }))];
}

test('a replay that starts again just before the line gives no lap; its full lap counts, its pause taken out', () => {
  const lapMs = after(ovalLap(1, 0));
  // GT7's loop: from a menu into lap 2 for its last 3 s, the full lap 3 (paused for 10 s), the line, a menu, again.
  const tail = (start: number) => replay(2, start - lapMs).filter((f) => f.time >= start - 3000);
  const frames: TelemetryFrame[] = [menu(0), ...tail(1000)];
  frames.push(...paused(replay(3, after(frames)), 10_000));
  frames.push(...replay(4, after(frames)).slice(0, 30), menu(after(frames) + 500));
  frames.push(...tail(after(frames) + 500));
  frames.push(...replay(3, after(frames)).slice(0, 30));

  const laps = splitLaps(frames);
  assert.deepEqual(laps.map((l) => l.lapNumber), [3], 'only the lap begun at the line');
  const [lap] = laps;
  assert.equal(lap!.clean, true, 'a pause in a replay leaves its lap clean');
  assert.ok(Math.abs(lap!.lapTimeMs - lapMs) < 50, `the lap's time without the pause (${lap!.lapTimeMs.toFixed(0)} ms, the lap ${lapMs.toFixed(0)} ms)`);
  const steps = lap!.frames.slice(1).map((f, i) => f.time - lap!.frames[i]!.time);
  assert.ok(Math.max(...steps) < 2 * FRAME_MS, 'the frames after the pause go on without a gap');
  assert.equal(lapToLearn(laps)?.lapNumber, 3);
});

test("a ghost replay's flying lap and one's own laps still count; one's own pause makes a lap unclean", () => {
  // A ghost replay starts before the line: lap 0, then 1.
  const ghost = [menu(0), ...replay(0, 1000).slice(-120)];
  ghost.push(...replay(1, after(ghost)));
  ghost.push(...replay(2, after(ghost)).slice(0, 10));
  assert.deepEqual(splitLaps(ghost).map((l) => [l.lapNumber, l.clean]), [[1, true]]);

  // Practice: the out lap (0), then laps 1 and 2; lap 2 paused in the pause menu.
  const own = ovalLap(0, 0).slice(-120);
  own.push(...ovalLap(1, after(own)));
  own.push(...paused(ovalLap(2, after(own)), 5000));
  own.push(...ovalLap(3, after(own)).slice(0, 10));
  assert.deepEqual(splitLaps(own).map((l) => [l.lapNumber, l.clean]), [[1, true], [2, false]]);
});
