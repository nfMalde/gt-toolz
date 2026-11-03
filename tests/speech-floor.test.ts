// The speech floor (docs/dev/modules.md): coach and crew speak one at a time. A sentence waiting for a quiet
// moment never talks over what is being said nor over the coach's next cue, waits while the game is paused or a
// briefing or debrief holds the floor, and is dropped when it comes too late. Driven through the runner, frame by
// frame, with voices that only count.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, mock, test } from 'node:test';
import { Flags } from '../packages/telemetry/src/packet';
import type { HapticCue } from '../packages/core/src/api';
import { normalizeSettings } from '../packages/runtime/src/settings';
import { SpeechFloor } from '../packages/runtime/src/speech-floor';
import type { RunnerSettings } from '../packages/runtime/src/app-api';
import { packet } from './packets';
import { testRunner } from './runner';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-floor-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
afterEach(() => mock.timers.reset());

/** A voice that renders every sentence in a fixed time per character and only counts what it plays. */
function fakeVoice(name: string, secondsPerChar = 0.1) {
  const played: { clip: string; at: number }[] = [];
  const texts = new Map<string, string>();
  return {
    name,
    played,
    /** The texts played, in order. */
    heard: () => played.map((p) => texts.get(p.clip) ?? p.clip),
    durations: new Map<string, number>(),
    prepare: async (clip: string, text: string) => {
      texts.set(clip, text);
      return text.length * secondsPerChar;
    },
    play: (clip: string) => void played.push({ clip, at: Date.now() }),
    say: () => undefined,
    stop: () => undefined,
    close: () => undefined,
  };
}

interface Inside {
  settings: RunnerSettings;
  voice: unknown;
  coach: unknown;
  briefing: { cancelled: boolean } | undefined;
  debrief: { cancelled: boolean; handbrake: boolean } | undefined;
  announce(text: string, maxAgeMs?: number, role?: 'coach' | 'crew', done?: () => void, haptic?: HapticCue): Promise<void>;
  say(text: string): void;
}

const START = 1_790_000_000_000;

/** A runner with a coach that only reports its quiet time (no reference: nothing of its own is said). */
function setup(options: { coach?: boolean; mute?: boolean } = {}) {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: START });
  const settings = normalizeSettings({ crew: false, practiceTyres: false, slides: false, mute: options.mute ?? false });
  const { runner, packetIn, inside, setCrewVoice } = testRunner({ settings, dirs: { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') } }, { autoReference: false });
  const r = runner as unknown as Inside;
  const coachVoice = fakeVoice('coach');
  const crewVoice = fakeVoice('crew');
  r.voice = coachVoice;
  setCrewVoice(crewVoice);
  // A coach on its reference that says nothing of its own (no events), but its quiet time counts. (It has to get
  // the frames: a coach without them, the reference lost, cannot cue, and the runner counts it as quiet.)
  const coach = { quiet: Infinity, holds: [] as number[], quietSeconds: () => coach.quiet, holdUntil: (until: number) => void coach.holds.push(until), update: () => [], currentLap: 1, isStarted: true };
  if (options.coach !== false) {
    r.coach = coach;
    inside.ref = {};
  }
  const felt: HapticCue[] = [];
  runner.on('feel', (cue) => void felt.push(cue));
  /** One frame at ms after the start (standing in a menu); paused: the game's pause menu. */
  const frame = (ms: number, paused = false) => {
    mock.timers.setTime(START + ms);
    packetIn(packet(START + ms, ms, { x: 0, speed: 0, flags: paused ? Flags.Paused : 0, lapCount: 1, lapsInRace: 0, carsInRace: 1 }));
  };
  return { r, coach, coachVoice, crewVoice, felt, frame };
}

test('a sentence waits while something is said, and 300 ms more', async () => {
  const { r, coachVoice, frame } = setup();
  frame(0);
  // "Hallo" counts 0.35 s until it is rendered (70 ms per character).
  r.say('Hallo');
  await r.announce('Gut gemacht.');
  frame(500);
  assert.deepEqual(coachVoice.heard(), []);
  frame(700);
  assert.deepEqual(coachVoice.heard(), ['Gut gemacht.']);
});

test('it waits for a quiet moment as long as itself and 0.6 s', async () => {
  const { r, coach, coachVoice, frame } = setup();
  // 1.2 s to say: needs 1.8 s before the next cue.
  await r.announce('Zwölf Zeichen');
  coach.quiet = 1.7;
  frame(0);
  assert.deepEqual(coachVoice.heard(), []);
  coach.quiet = 1.9;
  frame(16);
  assert.deepEqual(coachVoice.heard(), ['Zwölf Zeichen']);
});

test('the oldest one that fits goes first; a short one may go ahead of a long one', async () => {
  const { r, coach, coachVoice, frame } = setup();
  await r.announce('Ein langer Satz über die letzte Runde.');
  await r.announce('Kurz.');
  coach.quiet = 2;
  frame(0);
  assert.deepEqual(coachVoice.heard(), ['Kurz.']);
  coach.quiet = 10;
  // "Kurz." is 0.5 s, then 300 ms.
  frame(700);
  assert.deepEqual(coachVoice.heard(), ['Kurz.']);
  frame(900);
  assert.deepEqual(coachVoice.heard(), ['Kurz.', 'Ein langer Satz über die letzte Runde.']);
});

test('one at a time: coach and crew wait for each other', async () => {
  const { r, coachVoice, crewVoice, frame } = setup();
  await r.announce('Coach spricht.');
  await r.announce('Crew funkt.', undefined, 'crew');
  frame(0);
  assert.deepEqual([...coachVoice.heard(), ...crewVoice.heard()], ['Coach spricht.']);
  // 1.4 s, then 300 ms.
  frame(1600);
  assert.deepEqual(crewVoice.heard(), []);
  frame(1800);
  assert.deepEqual(crewVoice.heard(), ['Crew funkt.']);
});

test('nothing while the game is paused or a briefing or debrief holds the floor', async () => {
  const { r, coachVoice, frame } = setup();
  await r.announce('Warte.');
  frame(0, true);
  assert.deepEqual(coachVoice.heard(), []);
  r.briefing = { cancelled: false };
  frame(16);
  assert.deepEqual(coachVoice.heard(), []);
  r.briefing = undefined;
  r.debrief = { cancelled: false, handbrake: false };
  frame(32);
  assert.deepEqual(coachVoice.heard(), []);
  r.debrief = undefined;
  frame(48);
  assert.deepEqual(coachVoice.heard(), ['Warte.']);
});

test('one that comes too late is dropped and its caller told; one said tells its caller once it ended', async () => {
  const { r, coach, coachVoice, frame } = setup();
  const told: string[] = [];
  coach.quiet = 0;
  await r.announce('Zu spät.', 1000, 'coach', () => void told.push('late'));
  frame(500);
  frame(1100);
  assert.deepEqual(told, ['late']);
  assert.deepEqual(coachVoice.heard(), []);
  coach.quiet = Infinity;
  await r.announce('Gesagt.', 25_000, 'coach', () => void told.push('said'));
  frame(1200);
  assert.deepEqual(coachVoice.heard(), ['Gesagt.']);
  // 0.7 s to say, then 400 ms.
  mock.timers.tick(1000);
  assert.deepEqual(told, ['late']);
  mock.timers.tick(200);
  assert.deepEqual(told, ['late', 'said']);
});

test('muted: not heard, but felt, and the floor counts it as said', async () => {
  const { r, coachVoice, felt, frame } = setup({ mute: true });
  await r.announce('Schneller.', undefined, 'coach', undefined, 'faster');
  await r.announce('Danach.');
  frame(0);
  assert.deepEqual(coachVoice.heard(), []);
  assert.deepEqual(felt, ['faster']);
  // "Schneller." is 1.0 s, then 300 ms: the second waits as if it had been heard.
  frame(1200);
  assert.deepEqual(felt, ['faster']);
  frame(1400);
  assert.deepEqual(felt, ['faster', 'message']);
});

test('what is said holds the coach\'s next pace notes; without a coach every moment is quiet', async () => {
  const withCoach = setup();
  withCoach.frame(0);
  await withCoach.r.announce('Halt.');
  withCoach.frame(16);
  assert.ok(withCoach.coach.holds.some((until) => until >= START + 16 + 500), 'the coach waits for the sentence');
  mock.timers.reset();

  const without = setup({ coach: false });
  await without.r.announce('Ohne Coach ist immer Zeit, auch für einen sehr langen Satz.');
  without.frame(0);
  assert.equal(without.coachVoice.heard().length, 1);
});

/** The floor on its own: sentences of two speakers, what it says and logs. */
function floorAlone() {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: START });
  const said: string[] = [];
  const busy: number[] = [];
  const floor = new SpeechFloor({
    quietSeconds: () => Infinity,
    held: () => false,
    muted: () => false,
    feel: () => undefined,
    log: () => undefined,
    logToFile: () => undefined,
    busy: (until) => void busy.push(until),
  });
  const told: string[] = [];
  const add = (text: string, speaker: string) =>
    floor.announce({ text, seconds: 1, until: START + 25_000, speaker, haptic: 'message', play: () => void said.push(text), done: () => void told.push(text) });
  return { floor, said, busy, told, add };
}

test('a speaker that leaves takes its waiting sentences along; the others stay', () => {
  const { floor, said, told, add } = floorAlone();
  add('Coach eins', 'coach');
  add('Crew eins', 'crew');
  add('Coach zwei', 'coach');
  floor.drop('coach');
  assert.deepEqual(told, [], 'a voice swap tells nobody');
  add('Coach drei', 'coach');
  floor.drop('coach', true);
  assert.deepEqual(told, ['Coach drei'], 'switched off: the callers are told');
  floor.next();
  assert.deepEqual(said, ['Crew eins']);
});

test('clearing drops everything without a word; what is said never shortens the busy time', () => {
  const { floor, said, busy, told, add } = floorAlone();
  add('Weg', 'coach');
  floor.clear();
  floor.next();
  assert.deepEqual([said, told], [[], []]);
  floor.occupy(2000);
  floor.occupy(500);
  assert.equal(floor.busyUntil, START + 2000);
  assert.deepEqual(busy, [START + 2000, START + 2000]);
});
