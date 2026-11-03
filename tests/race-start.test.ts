// The user, 2026-10-28: in daily races the debrief started while everyone was still loading in, like the position
// calls before. The debrief now only comes from the app (the handbrake is an option, in practice after driving there),
// and the crew says nothing until the race runs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import { buildDebrief, type CoachHistory } from '../packages/coach/src/briefing';
import { builtInPhrases } from '../packages/coach/src/i18n';
import type { ReferenceLap } from '../packages/coach/src/reference';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { RaceCrew } from '../modules/crew/src/crew';
import { normalizeSettings } from '../packages/runtime/src/settings';
import { testRunner } from './runner';

const en = builtInPhrases('en');

function frame(time: number, values: Partial<TelemetryFrame>): TelemetryFrame {
  return {
    time, packetId: time, flags: Flags.CarOnTrack, x: 0, y: 0, z: 0, speed: 0, throttle: 0, brake: 0, gear: 1,
    lapCount: 0, lapsInRace: 5, bestLapMs: -1, lastLapMs: -1, carCode: 1, racePosition: 8, carsInRace: 12,
    fuelLevel: 100, fuelCapacity: 100, tyreTemps: [80, 80, 80, 80], currentLapMs: 0, ...values,
  } as TelemetryFrame;
}

test('the crew says nothing while the race loads, then the radio check first', () => {
  const crew = new RaceCrew(en, { pitLossSeconds: 25, strategy: true, cheeky: false, patience: 'normal', sectors: 1, talk: 'normal' });
  crew.start(frame(0, {}));
  const said: { at: number; text: string }[] = [];
  const run = (from: number, to: number, values: (t: number) => Partial<TelemetryFrame>) => {
    for (let t = from; t < to; t += 100) for (const text of crew.frame(frame(t, values(t)), t)) said.push({ at: t, text });
  };
  // Not the tyres (the crew may say they are up to temperature once moving).
  const calls = () => said.filter((call) => !/tyre/i.test(call.text));
  // Players join: the position jumps, GT7 may already count lap 1, the car stands or rolls onto the grid while loading.
  run(100, 20_000, (t) => ({ racePosition: t % 4000 < 2000 ? 8 : 11, lapCount: t > 10_000 ? 1 : 0 }));
  run(20_000, 24_000, () => ({ racePosition: 11, lapCount: 1, speed: 20, flags: Flags.CarOnTrack | Flags.Loading }));
  run(24_000, 26_000, () => ({ racePosition: 11, lapCount: 1, speed: 20, flags: Flags.CarOnTrack | Flags.Paused }));
  assert.equal(said.length, 0, 'nothing before the start');
  // Lights out: moving in lap 1, from 11th.
  run(26_000, 40_000, () => ({ racePosition: 11, lapCount: 1, speed: 30 }));
  assert.equal(calls().length, 1);
  assert.equal(said[0]!.text, en.crewRaceStart, 'the radio check first');
  assert.ok(said[0]!.at >= 27_500 && said[0]!.at < 28_000, 'once the car has moved for a moment');
  // Up to 9th: the first position call, against the place at the start.
  run(40_000, 50_000, () => ({ racePosition: 9, lapCount: 1, speed: 30 }));
  assert.equal(calls().length, 2);
  assert.match(calls()[1]!.text, /9/);
});

// The user's race of 2026-11-03, in the log at the flag: "Fuel for 0 laps, 19.6 liters per lap. Box this lap!"
test('the fuel call: none at the chequered flag; short of fuel on the last lap it still says to box, one lap in the singular', () => {
  const crew = new RaceCrew(en, { pitLossSeconds: 25, strategy: true, cheeky: false, patience: 'normal', sectors: 1, talk: 'normal' });
  // Three laps, 20 liters each, the tank nearly empty at the flag.
  const fuelInLap = [60, 40, 20, 0.5];
  let t = 0;
  const at = (lapCount: number, lastLapMs: number) => frame(t, { lapCount, lastLapMs, lapsInRace: 3, speed: 30, x: t * 0.03, fuelLevel: fuelInLap[lapCount - 1] ?? 60 });
  crew.start(frame(0, { lapsInRace: 3, fuelLevel: 60 }));
  const said: string[] = [];
  let last = -1;
  for (let lap = 1; lap <= 3; lap++) {
    const ms = 60_000 + lap * 100;
    for (const end = t + ms; t < end; t += 100) said.push(...crew.frame(at(lap, last), t));
    last = ms;
  }
  // Over the line, GT7 counting on.
  for (const end = t + 2000; t < end; t += 100) said.push(...crew.frame(at(4, last), t));
  const fuel = said.filter((text) => /Fuel|Box/.test(text));
  assert.equal(fuel.length, 2, said.join(' | '));
  assert.match(fuel[0]!, /^Fuel for 2 laps, 20\.0 liters per lap\. Box for fuel in lap 3 at the latest\.$/);
  assert.match(fuel[1]!, /^Fuel for one lap, 20\.0 liters per lap\. Box this lap!$/);
  assert.equal(said.at(-1), en.crewFinish, 'the flag ends it');
});

test('one lap of fuel in the singular, in both languages; more laps as before', () => {
  const de = builtInPhrases('de');
  assert.equal(en.crewFuel({ lapsLeft: 1.4, perLap: 2.5, toFinish: true }), 'Fuel for one lap, 2.5 liters per lap. Enough to the finish.');
  assert.equal(de.crewFuel({ lapsLeft: 1.4, perLap: 2.5, toFinish: true }), 'Sprit für eine Runde, 2,5 Liter pro Runde. Reicht bis ins Ziel.');
  assert.equal(en.crewFuel({ lapsLeft: 2.4, perLap: 2.5, toFinish: true }), 'Fuel for 2 laps, 2.5 liters per lap. Enough to the finish.');
});

test('the debrief started in the app does not end with "release the handbrake"', () => {
  const reference = { corners: [{ index: 1, name: 'La Source' }] } as unknown as ReferenceLap;
  const history: CoachHistory = { version: 1, corners: { '1': { problems: [{ kind: 'brake-early', meters: 20 }], timeLossS: 0.5, at: '2026-10-28' } } };
  assert.equal(buildDebrief(reference, history, en, 4, false, true).at(-1), en.debriefEnd);
  const fromApp = buildDebrief(reference, history, en, 4, false, false);
  assert.equal(fromApp.includes(en.debriefEnd), false);
  assert.match(fromApp.at(-1)!, /La Source/);
});

/** The runner's debrief parts, with the coach, the reference and the speaking stubbed. */
function debriefRunner(settings: Record<string, unknown>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-debrief-'));
  const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };
  // Nothing but the mode, driving and the debrief: no crew, tyres, slides or picking of references.
  const { runner, telemetry, inside } = testRunner({ settings: normalizeSettings({ crew: false, practiceTyres: false, slides: false, ...settings }), dirs }, { autoReference: false });
  const r = runner as unknown as {
    coach: unknown;
    status: { mode: string; debrief: string };
    runDebrief(handbrake: boolean): Promise<void>;
    updateSpeechStatus(): void;
  };
  const started: boolean[] = [];
  // A coach that says nothing: its frames reach the debrief check, as on track.
  r.coach = { update: () => [], quietSeconds: () => Infinity, holdUntil: () => undefined, currentLap: 0, isStarted: false };
  inside.ref = {};
  r.runDebrief = async (handbrake) => void started.push(handbrake);
  r.updateSpeechStatus();
  /** Standing with the handbrake pulled for 4 s (GT7's mode counts after 3 s). */
  const holdHandbrake = (from: number) => {
    for (let t = from; t <= from + 4000; t += 100) {
      mock.timers.setTime(t);
      telemetry.handleFrame(frame(t, { flags: Flags.CarOnTrack | Flags.Handbrake, lapsInRace: 0, carsInRace: 1 }));
    }
  };
  const drive = (from: number) => {
    for (let t = from; t <= from + 3000; t += 100) {
      mock.timers.setTime(t);
      telemetry.handleFrame(frame(t, { speed: 30, lapsInRace: 0, carsInRace: 1, x: t / 10 }));
    }
  };
  return { runner, r, started, holdHandbrake, drive, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test('the debrief comes from the app only; the handbrake is off by default', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const { runner, r, started, holdHandbrake, drive, done } = debriefRunner({});
    drive(0);
    holdHandbrake(10_000);
    assert.deepEqual(started, [], 'no handbrake debrief');
    assert.equal(r.status.debrief, 'available');
    runner.startDebrief();
    assert.deepEqual(started, [false], 'from the app');
    done();
  } finally {
    mock.timers.reset();
  }
});

test('the handbrake debrief (an option) needs driving in practice first: not while a race loads or after it', () => {
  mock.timers.enable({ apis: ['Date'], now: 0 });
  try {
    const { r, started, holdHandbrake, drive, done } = debriefRunner({ debriefHandbrake: true });
    // A daily race loads: GT7 shows practice for a moment with the handbrake pulled.
    holdHandbrake(0);
    assert.equal(r.status.mode, 'practice');
    assert.deepEqual(started, [], 'not before driving');
    // A time trial: driven, then stopped with the handbrake.
    drive(10_000);
    holdHandbrake(20_000);
    assert.deepEqual(started, [true]);
    done();
  } finally {
    mock.timers.reset();
  }
});
