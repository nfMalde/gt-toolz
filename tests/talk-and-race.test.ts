// Stream feedback 2026-10-25: how much coach and crew say (talk levels), a countdown from two, positions only once
// the race runs, and the reference used last when several fit.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { builtInPhrases } from '../packages/coach/src/i18n';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { RaceCrew } from '../modules/crew/src/crew';
import { defaultSettings as crewDefaults, normalizeSettings as normalizeCrew, withTalk as withCrewTalk } from '../modules/crew/src/settings';
import { listReferences, markReferenceUsed, referenceUsage } from '../packages/runtime/src/references';
import { DEFAULT_RUNNER_SETTINGS, migrateSettings, normalizeSettings, withTalk } from '../packages/runtime/src/settings';

test('the talk levels switch calls off on top of the settings, which stay as set', () => {
  const user = normalizeSettings({ coachTalk: 'little' });
  const s = withTalk(user);
  assert.deepEqual([s.plan, s.cornerShape, s.fastCorners, s.guideCorners, s.lapDelta, s.immediateFeedback, s.ghostSectors, s.style, s.feedback], [false, false, false, false, false, false, 0, 'neutral', 1]);
  // The crew's own: at "little" no sector times (its radio takes no corner calls then either, crew.test.ts).
  const crew = normalizeCrew({ crewTalk: 'little' }, crewDefaults());
  assert.deepEqual([withCrewTalk(crew).crewSectors, crew.crewSectors], [1, crewDefaults().crewSectors]);
  // The braking calls stay.
  assert.deepEqual([s.tone, s.intro, s.countdownSeconds], [user.tone, user.intro, user.countdownSeconds]);
  // The user's settings are not changed.
  assert.equal(user.plan, DEFAULT_RUNNER_SETTINGS.plan);
  assert.equal(user.ghostSectors, DEFAULT_RUNNER_SETTINGS.ghostSectors);

  const normal = withTalk(normalizeSettings({}));
  assert.deepEqual([normal.coachTalk, crewDefaults().crewTalk], ['normal', 'normal']);
  assert.deepEqual([normal.ghostSectors, normal.immediateFeedback, withCrewTalk(crewDefaults()).crewSectors, normal.plan], [0, false, 1, true]);
  const much = withTalk(normalizeSettings({ coachTalk: 'much' }));
  const crewMuch = withCrewTalk(normalizeCrew({ crewTalk: 'much' }, crewDefaults()));
  assert.deepEqual([much.ghostSectors, crewMuch.crewSectors], [DEFAULT_RUNNER_SETTINGS.ghostSectors, crewDefaults().crewSectors]);
});

test('the countdown starts at two; an old default of three becomes two once, another choice stays', () => {
  assert.equal(DEFAULT_RUNNER_SETTINGS.countdownSeconds, 2);
  assert.equal((migrateSettings({ settingsVersion: 2, countdownSeconds: 3 }) as { countdownSeconds: number }).countdownSeconds, 2);
  assert.equal((migrateSettings({ settingsVersion: 2, countdownSeconds: 4 }) as { countdownSeconds: number }).countdownSeconds, 4);
  assert.equal((migrateSettings({ settingsVersion: 3, countdownSeconds: 3 }) as { countdownSeconds: number }).countdownSeconds, 3);
});

/** A race frame: standing on the grid, or driving in lap 1. */
function frame(time: number, racePosition: number, driving: boolean): TelemetryFrame {
  return {
    time, packetId: time, flags: 1, x: driving ? time / 100 : 0, y: 0, z: 0, speed: driving ? 30 : 0, throttle: 0, brake: 0, gear: 1,
    lapCount: driving ? 1 : 0, lapsInRace: 5, bestLapMs: -1, lastLapMs: -1, carCode: 1, racePosition, carsInRace: 12,
    fuelLevel: 100, fuelCapacity: 100, tyreTemps: [80, 80, 80, 80], currentLapMs: 0,
  } as TelemetryFrame;
}

test('position calls only once the race runs, not while players join on the grid', () => {
  const crew = new RaceCrew(builtInPhrases('en'), { pitLossSeconds: 25, strategy: true, cheeky: false, patience: 'normal', sectors: 1, talk: 'normal' });
  crew.start(frame(0, 8, false));
  const said: string[] = [];
  // Only what is about the position (the crew may say the tyres are warm; the radio check comes at the start).
  const positions = () => said.filter((text) => !/tyre/i.test(text) && text !== builtInPhrases('en').crewRaceStart);
  // On the grid: players join, the position changes every few seconds.
  for (let t = 100, p = 8; t < 30_000; t += 100) {
    if (t % 5_000 === 0) p = p === 8 ? 11 : 8;
    said.push(...crew.frame(frame(t, p, false), t));
  }
  assert.equal(positions().length, 0, 'nothing on the grid');
  // The race runs: from 11th, then up to 9th and holding there.
  for (let t = 30_000; t < 40_000; t += 100) said.push(...crew.frame(frame(t, 11, true), t));
  assert.equal(positions().length, 0, 'the start position is no change');
  for (let t = 40_000; t < 50_000; t += 100) said.push(...crew.frame(frame(t, 9, true), t));
  assert.equal(positions().length, 1);
  assert.match(positions()[0]!, /9/);
});

test('the last used reference is remembered next to the references, which it does not join', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-usage-'));
  markReferenceUsed(dir, 'spa-gr3', 1000);
  markReferenceUsed(dir, 'suzuka-gr2', 2000);
  markReferenceUsed(dir, '../evil', 3000);
  assert.deepEqual(referenceUsage(dir), { 'spa-gr3': 1000, 'suzuka-gr2': 2000 });
  assert.deepEqual(listReferences(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
