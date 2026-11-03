// The user's live test of 2026-11-03: "Turn sollte immer kommen, dass man weiß wann man einlenken soll", and a car in
// the wrong place where the steering starts (in the middle instead of on the right, over the curb) is said after the
// corner and when reaching it again.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { analyzeCorner, cornerSegments, type RunSample } from '../packages/coach/src/analysis';
import { CoachSession, DEFAULT_COACH_SETTINGS, type CoachEvent, type CoachSettings, type Cue, type CornerHelp } from '../packages/coach/src/coach';
import { builtInPhrases } from '../packages/coach/src/i18n';
import { buildReference, type Corner, type ReferenceLap } from '../packages/coach/src/reference';
import { clipFor, coachClips } from '../packages/runtime/src/clips';
import { hapticForClip } from '../packages/runtime/src/haptics';
import { coachSettingsFrom, DEFAULT_RUNNER_SETTINGS, normalizeSettings, withTalk } from '../packages/runtime/src/settings';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { ovalLap } from './oval';
import { testRunner } from './runner';

type MakeLap = (lap: number, start: number) => TelemetryFrame[];

const SETTINGS: CoachSettings = { ...DEFAULT_COACH_SETTINGS, waitForFirstLap: false, feedback: false, guideCorners: false, helpFirst: false };

function referenceOf(makeLap: MakeLap): ReferenceLap {
  const frames = makeLap(1, 0);
  return buildReference({ lapNumber: 1, frames, lapTimeMs: frames.at(-1)!.time, clean: true, live: true }, 'test');
}

/** Laps driven on the reference `of`, every coach event; of one corner its last pass. */
function drive(of: MakeLap, settings: Partial<CoachSettings> = {}, driven: MakeLap = of, prepare?: (coach: CoachSession, reference: ReferenceLap) => void) {
  const reference = referenceOf(of);
  const coach = new CoachSession(reference, { ...SETTINGS, ...settings });
  prepare?.(coach, reference);
  const lapMs = of(1, 0).at(-1)!.time + 1000 / 60;
  const events: CoachEvent[] = [];
  for (let lap = 1; lap <= 3; lap++) for (const frame of driven(lap, (lap - 1) * lapMs)) events.push(...(coach.update(frame) as CoachEvent[]));
  const cues = events.flatMap((e) => (e.type === 'cue' ? [e.cue] : []));
  const lastPass = (corner: number) => {
    const own = cues.filter((cue) => cue.corner.index === corner);
    const kinds = own.map((cue) => cue.kind);
    return own.slice(kinds.lastIndexOf('tone', kinds.lastIndexOf('now')));
  };
  return { reference, events, cues, lastPass, kinds: (corner: number) => lastPass(corner).map((cue) => cue.kind) };
}

/** The first curve's steering begins at z (the braking begins near z = 390). */
const steeringFrom = (z: number): MakeLap => (lap, start) => ovalLap(lap, start).map((f) => (f.x < 1 && f.z >= z ? { ...f, steeringWheel: -0.6, frontWheelAngle: -0.12 } : f));

// --- The turn-in always comes ---

test('the phrase where it fits, the direction alone where it does not', () => {
  const phrase = drive(ovalLap, { turnInSeconds: 1 }).lastPass(1).find((cue) => cue.kind === 'turn-in');
  assert.ok(phrase && !phrase.short, 'the phrase');
  const short = drive(ovalLap, { turnInSeconds: 8 }).lastPass(1).find((cue) => cue.kind === 'turn-in');
  assert.ok(short?.short, 'too long for this corner: the direction');
  assert.equal(clipFor(short), 'turn-right');
});

test('the phrase leaves the gear no room before the apex: the direction, then the gear', () => {
  // In second before the braking point, turning right from the braking point on, the other corner out in third.
  const shifting: MakeLap = (lap, start) => steeringFrom(395)(lap, start).map((f) => {
    if (f.x < 1 && f.z >= 300) return { ...f, gear: 2 };
    if (f.z < -30) return { ...f, gear: 3 };
    return f;
  });
  const { lastPass } = drive(shifting, { turnInSeconds: 1.8, gearSeconds: 0.8, nowSeconds: 0.5, brakeSeconds: 0.5, announceGear: true });
  const heard = lastPass(1);
  const turn = heard.find((cue) => cue.kind === 'turn-in');
  assert.ok(turn?.short, heard.map((cue) => cue.kind).join(', '));
  assert.deepEqual(heard.map((cue) => cue.kind).slice(-4), ['now', 'brake', 'turn-in', 'gear']);
});

test('never between the countdown and "now", even where the word would fit there', () => {
  const kinds = drive(steeringFrom(388), { turnInSeconds: 8 }).kinds(1);
  const now = kinds.indexOf('now');
  assert.ok(!kinds.slice(0, now).includes('turn-in'), kinds.join(', '));
  assert.deepEqual(kinds.slice(now, now + 3), ['now', 'brake', 'turn-in'], kinds.join(', '));
});

test('the apex right behind the braking point: the direction takes the place of the braking word', () => {
  const heard = drive(ovalLap, { nowSeconds: 2.8, brakeSeconds: 0.5, turnInShortSeconds: 0.5 }).lastPass(1);
  const kinds = heard.map((cue) => cue.kind);
  const now = kinds.indexOf('now');
  assert.deepEqual(kinds.slice(now, now + 2), ['now', 'turn-in'], kinds.join(', '));
  assert.ok(!kinds.includes('brake'), kinds.join(', '));
  assert.equal(heard[now + 1]!.short, true);
  assert.deepEqual(hapticForClip(clipFor(heard[now + 1]!), true), { cue: 'turn', side: 'right' });
});

test('a helping cue no longer takes its place; it follows', () => {
  const help: CornerHelp & { clean: number } = { cornerIndex: 1, kind: 'slow-apex', times: 3, step: 'assist', size: 8, improved: false, clean: 0 };
  const kinds = drive(ovalLap, { helpFirst: true, helpAssists: true }, ovalLap, (coach) => (coach as unknown as { help: Map<number, unknown> }).help.set(1, help));
  const heard = kinds.lastPass(1).map((cue) => cue.kind + (cue.assist ? `:${cue.assist}` : ''));
  assert.ok(heard.includes('turn-in'), heard.join(', '));
});

test('a second braking in the same bend has no turn-in of its own', () => {
  // A second, light braking in the first curve: steering since the zone before it, and through the pause between them.
  const dab: MakeLap = (lap, start) => {
    const frames = steeringFrom(400)(lap, start).map((f) => (f.x >= 1 && f.x < 60 && f.z > 400 ? { ...f, steeringWheel: -0.6, frontWheelAngle: -0.12 } : f));
    const end = frames.findLastIndex((f, i) => i < frames.length / 2 && f.brake > 0);
    return frames.map((f, i) => (i >= end + 40 && i < end + 70 ? { ...f, brake: 0.4, throttle: 0 } : f));
  };
  const { reference, kinds } = drive(dab);
  assert.equal(reference.corners.length, 3, 'the test: three zones');
  assert.equal(reference.corners[0]!.sameTurn, undefined);
  assert.equal(reference.corners[1]!.sameTurn, true);
  assert.ok(!kinds(2).includes('turn-in'), kinds(2).join(', '));
  assert.ok(kinds(1).includes('turn-in'), kinds(1).join(', '));
});

test('the setting still switches it off', () => {
  const { cues } = drive(ovalLap, { announceTurnIn: false });
  assert.ok(!cues.some((cue) => cue.kind === 'turn-in'));
});

test('the last corner of a lap that ends with a long way home keeps its turn-in', () => {
  // Both braking zones in the first half of the distance: the next corner comes across the line.
  const frames: MakeLap = (lap, start) => ovalLap(lap, start);
  const reference = referenceOf(frames);
  const coach = new CoachSession(reference, SETTINGS) as unknown as { nextCornerAt(corner: Corner): number; referenceTime(s: number): number };
  const [first, last] = reference.corners as [Corner, Corner];
  assert.ok(coach.nextCornerAt(last) > coach.referenceTime(last.brakeS), 'across the line, later than this corner');
  assert.equal(coach.nextCornerAt(first), coach.referenceTime(last.brakeS));
});

// --- Beside the reference at the turn-in ---

function runBeside(reference: ReferenceLap, corner: Corner, dx: number, dz = 0): RunSample[] {
  return reference.points.map((p) => ({ s: p.s, t: p.t, speed: p.speed, brake: p.brake, throttle: p.throttle, gear: p.gear, x: p.x + dx, z: p.z + dz }));
}

test('how far beside the reference, to which side; a metre or so is no mistake, nor a trip off the track', () => {
  const reference = referenceOf(ovalLap);
  const corner = reference.corners[0]!;
  const segment = cornerSegments(reference)[0]!;
  const line = (dx: number, c = corner) => analyzeCorner(reference, c, segment, runBeside(reference, c, dx))?.line;
  assert.equal(line(0), undefined);
  assert.equal(line(1.5), undefined, 'within what every lap differs by');
  assert.equal(line(12), undefined, 'not lined up for the corner at all');
  // Heading +z: to its right is -x (the sign of the game's track, where every right-hander bends that way).
  assert.deepEqual(line(-3), { meters: 3, side: 'right', curb: false });
  assert.deepEqual(line(4), { meters: 4, side: 'left', curb: false });
  assert.equal(line(-3, { ...corner, sameTurn: true }), undefined, 'the same bend: no line to line up for');
});

test('without the position (an older run) nothing is said', () => {
  const reference = referenceOf(ovalLap);
  const corner = reference.corners[0]!;
  const samples = runBeside(reference, corner, 5).map(({ x: _x, z: _z, ...rest }) => rest);
  assert.equal(analyzeCorner(reference, corner, cornerSegments(reference)[0]!, samples)?.line, undefined);
});

test('the curb only counts where it is on the side to go to: the outside of the corner', () => {
  const reference = referenceOf(ovalLap);
  const corner = { ...reference.corners[0]!, curbEntry: true, maxSteer: -0.2 };
  const segment = cornerSegments(reference)[0]!;
  // A right-hander: its outside is on the left. Too far right: go left, over the curb there.
  assert.deepEqual(analyzeCorner(reference, corner, segment, runBeside(reference, corner, -3))?.line, { meters: 3, side: 'right', curb: true });
  assert.deepEqual(analyzeCorner(reference, corner, segment, runBeside(reference, corner, 3))?.line, { meters: 3, side: 'left', curb: false });
});

/** Lap 1 three meters beside the reference through the first curve's approach, then on it. */
const besideOnFirstLap: MakeLap = (lap, start) => ovalLap(lap, start).map((f) => (lap === 1 && f.x < 1 && f.z > 200 ? { ...f, x: f.x - 3 } : f));

test('the next approach says where to line up, once; a good line afterwards ends it', () => {
  const { events, cues } = drive(ovalLap, {}, besideOnFirstLap);
  const results = events.flatMap((e) => (e.type === 'corner-result' && e.result.corner.index === 1 ? [e.result] : []));
  assert.deepEqual(results[0]?.line, { meters: 3, side: 'right', curb: false }, 'found on the run');
  const lines = cues.filter((cue: Cue) => cue.kind === 'line');
  assert.equal(lines.length, 1, cues.map((cue) => cue.kind).join(', '));
  assert.deepEqual(lines[0]!.line, { side: 'left', curb: false });
  assert.equal(lines[0]!.corner.index, 1);
  assert.equal(clipFor(lines[0]!), 'line-left');
  // Right before the numbers.
  const pass = cues.filter((cue) => cue.corner.index === 1).map((cue) => cue.kind);
  assert.equal(pass[pass.indexOf('line') + 1], 'count', pass.join(', '));
});

test('switched off: found, but not called', () => {
  const { events, cues } = drive(ovalLap, { announceLine: false }, besideOnFirstLap);
  assert.ok(events.some((e) => e.type === 'corner-result' && !!e.result.line));
  assert.ok(!cues.some((cue) => cue.kind === 'line'));
});

test('the numbers make way for it', () => {
  // The way to the first curve only leaves room for one of them beside it: 5 numbers wanted.
  const count = (lineSeconds: number) => {
    const pass = drive(ovalLap, { lineSeconds, countdownSeconds: 5 }, besideOnFirstLap).cues.filter((cue) => cue.corner.index === 1).map((cue) => cue.kind);
    // The pass with the call: from the tone before it to its "now".
    const line = pass.indexOf('line');
    assert.ok(line >= 0, pass.join(', '));
    return pass.slice(line, pass.indexOf('now', line)).filter((kind) => kind === 'count').length;
  };
  assert.ok(count(9) < count(1), `${count(9)} numbers beside a long call, ${count(1)} beside a short one`);
});

test('its words, in both languages, and the clips', () => {
  const en = builtInPhrases('en');
  const de = builtInPhrases('de');
  assert.equal(de.lineAfter(3, 'right', false), 'Beim Einlenken 3 Meter zu weit rechts.');
  assert.equal(de.lineAfter(3, 'right', true), 'Beim Einlenken 3 Meter zu weit rechts. Die Referenz ist weiter links, über dem Curb.');
  assert.equal(en.lineAfter(3, 'right', true), 'At the turn-in 3 meters too far right. The reference is further left, over the curb.');
  assert.equal(de.lineNext('left', false), 'Von weiter links einlenken.');
  assert.equal(de.lineNext('left', true), 'Vom linken Curb einlenken.');
  assert.equal(de.lineNext('right', true), 'Vom rechten Curb einlenken.');
  assert.equal(en.lineNext('left', true), 'Start steering from the left curb.');
  assert.equal(en.lineNext('right', false), 'Start steering from more right.');
  const clips = coachClips(de);
  assert.equal(clips['turn-right'], 'rechts');
  assert.equal(clips['line-left-curb'], 'Vom linken Curb einlenken.');
  assert.equal(hapticForClip('line-left', true), undefined, 'a sentence, nothing to feel');
});

test('the setting: on by default, off with the talk level "little", handed to the coach', () => {
  assert.equal(normalizeSettings({}).lineCalls, true);
  assert.equal(normalizeSettings({ lineCalls: false }).lineCalls, false);
  assert.equal(withTalk({ ...DEFAULT_RUNNER_SETTINGS, coachTalk: 'little' }).lineCalls, false);
  assert.equal(withTalk({ ...DEFAULT_RUNNER_SETTINGS, coachTalk: 'normal' }).lineCalls, true);
  const durations = { tone: 0.2, intro: 1, now: 0.4, brake: 0.5, brakeLight: 0.9, gear: 0.5, turnIn: 1, turnInShort: 0.5, line: 1.6, count: 0.5 };
  const settings = coachSettingsFrom({ ...DEFAULT_RUNNER_SETTINGS, lineCalls: false }, durations);
  assert.equal(settings.announceLine, false);
  assert.equal(settings.lineSeconds, 1.6);
  assert.equal(settings.turnInShortSeconds, 0.5);
});

test('after the corner the runner says it, in the coach\'s language, at a quiet moment; not with the setting off, not in races', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-line-'));
  const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };
  try {
    const reference = referenceOf(ovalLap);
    const corner = reference.corners[0]!;
    const segment = cornerSegments(reference)[0]!;
    const result = analyzeCorner(reference, corner, segment, runBeside(reference, corner, -3))!;
    const said = (settings: Record<string, unknown>, mode: string) => {
      const { runner, telemetry } = testRunner({ settings: normalizeSettings({ crew: false, slides: false, ...settings }), dirs }, { autoReference: false });
      Object.defineProperty(telemetry, 'mode', { get: () => mode });
      const r = runner as unknown as { handle(event: CoachEvent): void; announce(text: string): Promise<void>; saveHistorySoon(): void };
      const texts: string[] = [];
      r.announce = async (text) => void texts.push(text);
      r.saveHistorySoon = () => undefined;
      r.handle({ type: 'corner-result', result });
      return texts;
    };
    assert.deepEqual(said({}, 'practice'), ['Beim Einlenken 3 Meter zu weit rechts.']);
    assert.deepEqual(said({ lineCalls: false }, 'practice'), []);
    assert.deepEqual(said({}, 'race'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
