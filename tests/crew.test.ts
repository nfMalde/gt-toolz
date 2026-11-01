// The race crew as the driver hears it (docs/user/crew.md, docs/dev/modules.md), driven through the telemetry frame
// by frame with voices that only count: it starts with the race and keeps quiet until it runs, then the radio check
// comes first; it stops after the race; the practice tyre calls come on its radio; at the end of its patience the
// race engineer quits, the team boss takes the radio on his own voice and hands it back after his laps; the coach
// makes its race corner calls and says a spin's cause on the radio, whoever has it; and as a module on the host the
// crew is on the radio only while it runs.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, mock, test } from 'node:test';
import { Modules, type Shell } from '../apps/desktop/src/modules';
import { crewModule } from '../modules/crew/main/module';
import type { CrewModuleSettings } from '../modules/crew/src/api';
import type { Slide } from '../packages/coach/src/slides';
import type { CrewStatus, RunnerSettings, VoiceStatus } from '../packages/runtime/src/app-api';
import { normalizeSettings } from '../packages/runtime/src/settings';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';
import { testRunner } from './runner';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-crew-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
afterEach(() => mock.timers.reset());
let folders = 0;

const START = 1_790_000_000_000;
const FRAME_MS = 1000 / 60;

/** A voice that renders every sentence in 0.05 s per character and only counts what it says. */
function fakeVoice(name: string) {
  const texts = new Map<string, string>();
  const heard: string[] = [];
  return {
    name,
    voiceName: name,
    heard,
    /** The clips rendered with it. */
    texts,
    durations: new Map<string, number>(),
    prepare: async (clip: string, text: string) => {
      texts.set(clip, text);
      return text.length * 0.05;
    },
    play: (clip: string) => void heard.push(texts.get(clip) ?? clip),
    say: () => undefined,
    stop: () => undefined,
    close: () => undefined,
  };
}

interface Inside {
  voice: unknown;
}

/** The crew alone (no coach, no reference), with its voice, the team boss's waiting to be opened, and the log. */
function setup(settings: Partial<RunnerSettings> = {}, crewSettings: Partial<CrewModuleSettings> = {}) {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: START });
  const dir = path.join(root, String(folders++));
  const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };
  const { runner, telemetry, voices, crew: session, setCrewVoice } = testRunner(
    { settings: normalizeSettings({ coach: false, slides: false, ...settings }), dirs },
    { autoReference: false },
    { practiceTyres: false, ...crewSettings },
  );
  const r = runner as unknown as Inside & { crew?: { setAnnoyance(value: number): void; lostItSaid: boolean; status: { active: boolean; lap: number } } };
  // The race in progress, as the crew session holds it.
  Object.defineProperty(r, 'crew', { get: () => session!.race });
  const coach = fakeVoice('coach');
  const crew = fakeVoice('crew');
  const boss = fakeVoice('boss');
  r.voice = coach;
  setCrewVoice(crew);
  (voices as unknown as { open: () => Promise<unknown> }).open = async () => boss;
  const lines: string[] = [];
  runner.on('log', (line) => void lines.push(line));
  /** Frames one after another, the clock running with them (sentences end, voices get ready). */
  const drive = async (frames: TelemetryFrame[]) => {
    for (const frame of frames) {
      mock.timers.tick(FRAME_MS);
      telemetry.handleFrame({ ...frame, time: Date.now() });
      await Promise.resolve();
    }
  };
  return { runner, r, telemetry, voices, coach, crew, boss, lines, drive };
}

/** Every promise that is waiting goes on (a voice rendering many clips one after another). */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A race: five laps, twelve cars, third place. */
const race = (frames: TelemetryFrame[]) => frames.map((f) => ({ ...f, lapsInRace: 5, carsInRace: 12, racePosition: 3 }));

/** Standing on the grid while the race loads, for this long. */
function grid(ms: number): TelemetryFrame[] {
  const first = ovalLap(0, 0)[0]!;
  return race(Array.from({ length: Math.round(ms / FRAME_MS) }, () => ({ ...first, speed: 0, lapCount: 0, flags: Flags.CarOnTrack })));
}

/** Laps of the oval from lap `from` on. */
function laps(from: number, count: number): TelemetryFrame[] {
  const frames: TelemetryFrame[] = [];
  for (let lap = from; lap < from + count; lap++) frames.push(...ovalLap(lap, 0));
  return frames;
}

test('the crew starts with the race, keeps quiet while it loads, then the radio check comes first, on its voice', async () => {
  const { r, coach, crew, drive } = setup();
  await drive(grid(5000));
  assert.equal(r.crew?.status.active, true, 'started with the race');
  assert.deepEqual(crew.heard, [], 'quiet while the race loads');
  await drive(race(laps(1, 1)).slice(0, 300));
  assert.ok(crew.heard.length > 0, 'the radio check');
  assert.deepEqual(coach.heard, [], 'not on the coach\'s voice');
});

test('after the race the crew stops', async () => {
  const { r, drive } = setup();
  await drive(grid(5000));
  await drive(race(laps(1, 1)).slice(0, 300));
  assert.equal(r.crew?.status.active, true);
  await drive(laps(2, 1).slice(0, 300));
  assert.equal(r.crew?.status.active, false);
});

// The user, 2026-11-01: "Keine Ansagen außerhalb des Rennens". In the Manufacturers Cup of 2026-10-31 the crew started
// in the lobby, called positions while players joined and through the qualifying (GT7 reports both like a race over a
// time: no laps, many cars), and went into the race with the qualifying's laps.
test('no crew in a lobby or its qualifying, only the tyre calls; it starts afresh on the grid and after a restart', async () => {
  const { r, crew, lines, drive } = setup({}, { practiceTyres: true });
  const noLaps = (frames: TelemetryFrame[], cars: number) => frames.map((f) => ({ ...f, lapsInRace: 0, carsInRace: cars, racePosition: cars }));
  // The lobby while players join, the qualifying loaded at lap 1 in the pits, its laps (the ranking changes), the lobby.
  await drive([...noLaps(grid(4000), 8), ...noLaps(grid(4000), 12), ...noLaps(grid(4000), 16)]);
  const pits = { ...ovalLap(1, 0)[0]!, speed: 0, lapCount: 1 };
  await drive(noLaps([{ ...pits, flags: Flags.CarOnTrack | Flags.Loading }, ...Array.from({ length: 120 }, () => pits)], 16));
  await drive(laps(1, 3).map((f, i) => ({ ...f, lapsInRace: 0, carsInRace: 16, racePosition: Math.max(1, 16 - Math.floor(i / 300)) })));
  await drive(noLaps(grid(4000), 16));
  assert.equal(r.crew?.status.active ?? false, false, 'no race yet');
  assert.ok(!lines.some((line) => line.startsWith('CREW      race:')), 'the crew did not start');
  assert.ok(crew.heard.length > 0 && crew.heard.every((text) => /Reifen/.test(text)), `only the qualifying's tyres (${crew.heard.join(' | ')})`);
  const before = crew.heard.length;

  // The grid of a race over five laps: the crew starts and keeps quiet until the race runs, the radio check first.
  await drive(grid(5000));
  assert.equal(r.crew?.status.active, true, 'started on the grid');
  assert.equal(crew.heard.length, before, 'quiet on the grid');
  await drive(race(laps(1, 2)));
  assert.match(crew.heard[before] ?? '', /Funkcheck/);

  // A restart: on the grid again, a race from scratch.
  await drive(grid(5000));
  await drive(race(laps(1, 1)).slice(0, 300));
  assert.equal(lines.filter((line) => line.startsWith('CREW      race:')).length, 2, 'the crew started twice');
  assert.equal(crew.heard.filter((text) => /Funkcheck/.test(text)).length, 2, 'a radio check for each');
});

test('practice tyre calls come on the crew\'s radio', async () => {
  const { coach, crew, drive } = setup({}, { practiceTyres: true });
  await drive(laps(1, 1));
  assert.ok(crew.heard.some((text) => /Reifen/.test(text)), `tyres (${crew.heard.join(' | ')})`);
  assert.deepEqual(coach.heard, []);
});

test('the race engineer quits, the team boss takes the radio on his own voice and hands it back after his laps', async () => {
  const s = normalizeSettings({});
  // The boss sounds different from the race engineer: the stand-in's voice of the crew's language.
  const { r, crew, boss, lines, drive } = setup({ style: 'cheeky', voices: { ...s.voices, standin: { ...s.voices.standin, byLanguage: { de: 'boss-voice' } } } }, { bossTakesOver: true, bossLaps: 1 });
  await drive(grid(5000));
  await drive(race(laps(1, 1)).slice(0, 300));
  // Lost it, and it keeps going.
  r.crew!.setAnnoyance(50);
  r.crew!.lostItSaid = true;
  await drive(race(laps(1, 1)).slice(300, 900));
  assert.ok(lines.some((line) => line.startsWith('QUIT      race engineer')), 'the quit line');
  assert.ok(lines.some((line) => line.startsWith('TAKEOVER  team boss')), 'the boss takes over');
  assert.ok(boss.heard.length > 0, `the boss speaks on his voice (${boss.heard.join(' | ')})`);
  const engineerBefore = crew.heard.length;
  // His lap: then the race engineer is back.
  await drive(race(laps(2, 2)));
  assert.ok(lines.some((line) => line.startsWith('TAKEOVER  race engineer')), 'the engineer is back');
  assert.ok(crew.heard.length > engineerBefore, 'on his own voice again');
});

test('in a race the cause of a spin is said on the radio, in the crew\'s voice', async () => {
  const { r, coach, crew, drive } = setup({ slides: true, slidesInRace: true });
  await drive(grid(5000));
  const spin: Slide = { kind: 'spin', cause: 'throttle', maxDeg: 180, time: Date.now(), x: 0, z: 0, speedKmh: 80, gear: 3, throttle: 90, brake: 0, rearSpin: 0.3, rearLock: 0, pendulum: false };
  // Standing after it: said at once.
  (r as unknown as { reportSlide(slide: Slide, speed: number): void }).reportSlide(spin, 0);
  await settle();
  assert.ok(crew.heard.some((text) => /Dreher/.test(text)), `on the radio (${crew.heard.join(' | ')})`);
  assert.ok(!coach.heard.some((text) => /Dreher/.test(text)), 'not by the coach');
});

test('the coach makes its race corner calls on the radio: the race engineer\'s voice, the team boss\'s while he has it', async () => {
  const s = normalizeSettings({});
  const { r, crew, boss, lines, drive } = setup(
    { coach: true, raceCalls: true, raceCallsScope: 'all', style: 'cheeky', voices: { ...s.voices, standin: { ...s.voices.standin, byLanguage: { de: 'boss-voice' } } } },
    { bossTakesOver: true, bossLaps: 2 },
  );
  // A reference first: the driver's own laps in practice.
  await drive(laps(1, 5));
  assert.ok(lines.some((line) => line.startsWith('REFERENCE') || line.includes('learned')), 'a reference learned');
  await drive(grid(5000));
  await settle();
  await drive(grid(200));
  assert.ok(lines.some((line) => line.startsWith('CREW      calls the corners')), `the race calls start (${lines.filter((l) => l.startsWith('CREW')).join(' | ')})`);
  assert.ok(crew.texts.has('now'), 'rendered with the race engineer\'s voice');
  assert.ok(!boss.texts.has('now'));
  // The race runs; the race engineer loses it and the team boss takes the radio.
  await drive(race(laps(1, 1)).slice(0, 300));
  r.crew!.setAnnoyance(50);
  r.crew!.lostItSaid = true;
  const frames = race(laps(1, 2)).slice(300);
  for (let i = 0; i < frames.length && !lines.some((line) => line.startsWith('TAKEOVER  team boss')); i += 60) await drive(frames.slice(i, i + 60));
  assert.ok(lines.some((line) => line.startsWith('TAKEOVER  team boss')), 'the boss takes over');
  await settle();
  await drive(race(laps(2, 1)).slice(0, 120));
  assert.ok(lines.some((line) => line.startsWith('CREW      hands the corner calls back')), 'the calls rendered with the engineer\'s voice are gone');
  assert.ok(boss.texts.has('now'), 'rendered anew with the boss\'s voice');
});

test('as a module on the host: on the radio while it runs, its own settings checked, off the air when switched off', async () => {
  const { runner, telemetry, voices } = testRunner(
    { settings: normalizeSettings({ coach: false, slides: false }), dirs: { references: path.join(root, 'm', 'references'), sessions: path.join(root, 'm', 'sessions'), voiceCache: path.join(root, 'm', 'cache'), voices: path.join(root, 'm', 'voices') } },
    { autoReference: false },
  );
  // No voice list or engine: the crew's voice is one that only counts.
  const radioVoice = fakeVoice('crew');
  const inside = voices as unknown as { ensureListed(): Promise<void>; open(): Promise<unknown> };
  inside.ensureListed = async () => undefined;
  inside.open = async () => radioVoice;
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const statuses: [CrewStatus | undefined, VoiceStatus | undefined][] = [];
  const shell: Shell = {
    dev: false,
    app: () => runner.currentSettings as unknown as Record<string, unknown>,
    stored: () => undefined,
    save: () => undefined,
    telemetry: { onFrame: () => () => undefined, mode: () => 'menu', lastLap: () => undefined },
    desktop: { copyText: () => undefined, openLocalPage: async () => undefined },
    handle: (channel, handler) => {
      handlers.set(channel, handler);
      return () => void handlers.delete(channel);
    },
    log: () => undefined,
    send: () => undefined,
  };
  const modules = new Modules(shell, [
    crewModule({ telemetry, floor: runner.speechFloor, voices, activity: () => undefined, status: (crew, voice) => void statuses.push([crew, voice]) }),
  ]);
  // Read anew every time (an assertion narrows a property it has seen empty).
  const radio = () => voices.radio;
  modules.startEnabled();
  await settle();
  assert.equal(radio()?.voice, radioVoice, 'on the radio');
  assert.equal(radio()?.takesCalls, true);
  assert.equal(statuses.at(-1)?.[1]?.state, 'ready');
  // Its settings, checked; at "little" its radio takes no corner calls.
  const set = handlers.get('gtt:crew:setSettings')!;
  const checked = (await set({ crewTalk: 'little', bossLaps: 99, crewSectors: 'many' })) as CrewModuleSettings;
  assert.deepEqual([checked.crewTalk, checked.bossLaps, checked.crewSectors], ['little', 5, 3]);
  assert.equal(radio()?.takesCalls, false);
  // Voice packages being removed: off the air meanwhile, back after.
  modules.voicesChanged('removing');
  assert.equal(radio(), undefined);
  modules.voicesChanged('changed');
  await settle();
  assert.equal(radio()?.voice, radioVoice);
  // Switched off: off the air, nothing left on the page.
  await modules.setEnabled('crew', false);
  assert.equal(radio(), undefined);
  assert.deepEqual(statuses.at(-1), [undefined, undefined]);
  assert.equal(handlers.has('gtt:crew:settings'), true, 'its settings still answered while off');
});
