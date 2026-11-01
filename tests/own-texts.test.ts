// Own texts (docs/dev/coach-and-texts.md "Own texts"; the user, 2026-10-31: "Lift" or "Gas weg", "wie man das nennen
// soll, kann dann der Nutzer entscheiden"): any text in the user's words, checked like a pack's text, over the pack's;
// coach and crew say it from the next call on.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { CrewSessionSettings } from '../modules/crew/main/session';
import {
  BUILT_IN_PACKS,
  checkOwnText,
  FALLBACK_PACK,
  LanguageRegistry,
  QUICK_TEXTS,
  TEXT_KEYS,
  textGroup,
  textSamples,
  type Phrases,
} from '../packages/coach/src/i18n';
import { keysOf } from '../packages/runtime/src/settings-split';
import { DEFAULT_RUNNER_SETTINGS, normalizeSettings } from '../packages/runtime/src/settings';
import { ShellVoices } from '../packages/runtime/src/shell-voices';
import { testRunner } from './runner';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-own-texts-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };

const LIFT = 'auf {kmh} liften, {direction}';
const GAS_WEG = 'Gas weg auf {kmh}, {direction}';
const lift = { kind: 'lift' as const, direction: 'right' as const, kmh: 169, chained: false };
const kinds = (key: string, value: unknown, standard?: string | string[]) => checkOwnText(key, value, standard).problems.map((p) => p.kind);

test('an own text is checked like a pack text: its placeholders, the number of words, hints', () => {
  assert.deepEqual(checkOwnText('note.lift', GAS_WEG, LIFT), { value: GAS_WEG, problems: [] });
  // Placeholders the text cannot have keep it from being used; leaving out the standard's is only a hint.
  assert.deepEqual(kinds('note.lift', 'Gas weg auf {speed}', LIFT), ['placeholder', 'dropped']);
  assert.equal(checkOwnText('note.lift', 'Gas weg auf {speed}', LIFT).value, undefined);
  assert.equal(checkOwnText('note.lift', 'Gas weg, {direction}', LIFT).value, 'Gas weg, {direction}');
  assert.deepEqual(kinds('note.lift', '   ', LIFT), ['empty', 'dropped']);
  assert.deepEqual(kinds('note.flat', '{direction} voll, 200 km/h', '{direction} voll'), ['abbreviation']);
  assert.deepEqual(kinds('no.such.text', 'hallo'), ['unknown-key']);
  // The countdown counts five, in every language.
  const count = FALLBACK_PACK.texts.count as string[];
  assert.deepEqual(kinds('count', ['eins', 'zwei', 'drei'], count), ['count']);
  assert.deepEqual(checkOwnText('count', ['one', 'two', 'three', 'four', 'five'], count).value, ['one', 'two', 'three', 'four', 'five']);
  // A list of lines, one said at a time.
  assert.deepEqual(checkOwnText('cheeky.relief', ['Na also, {zone}.', 'Geht doch.']).value, ['Na also, {zone}.', 'Geht doch.']);
  assert.deepEqual(kinds('cheeky.relief', 'Geht doch.'), ['empty']);
});

test('own texts go over the pack: the call says them, the pack keeps its own', () => {
  const registry = new LanguageRegistry();
  const own = registry.phrases('de', { 'note.lift': GAS_WEG });
  assert.equal(own.fastNote(lift), 'Gas weg auf 170, rechts.');
  // Feathering is called like a lift, with the own word too.
  assert.equal(own.fastNote({ ...lift, kind: 'feather', chained: true }), 'Dann Gas weg auf 170, rechts.');
  assert.equal(registry.phrases('de').fastNote(lift), 'Auf 170 liften, rechts.');
});

test('the settings keep only own texts that can be used, per language', () => {
  assert.deepEqual(DEFAULT_RUNNER_SETTINGS.texts, {});
  assert.ok(keysOf('app').includes('texts'));
  const s = normalizeSettings({
    texts: {
      de: {
        'note.lift': { text: GAS_WEG, base: LIFT },
        'note.flat': { text: 'voll {nope}', base: '{direction} voll' },
        'no.such.text': { text: 'hallo' },
        count: { text: ['eins'] },
        now: { text: 'los' },
      },
      'not a language': { now: { text: 'los' } },
      en: {},
    },
  });
  // Without the pack's text it replaced, it counts as written against the text itself.
  assert.deepEqual(s.texts, { de: { 'note.lift': { text: GAS_WEG, base: LIFT }, now: { text: 'los', base: 'los' } } });
  assert.deepEqual(normalizeSettings({ texts: 'nonsense' }).texts, {});
});

test('the shell’s voices speak a language with its own texts, and tell when they changed', () => {
  let settings = normalizeSettings({ texts: { de: { now: { text: 'los', base: 'jetzt' } } } });
  const voices = new ShellVoices({ dirs, settings: () => settings });
  assert.equal(voices.phrases('de').now, 'los');
  assert.equal(voices.phrases('en').now, 'now');
  const before = settings;
  settings = normalizeSettings({ ...settings, texts: {} });
  assert.equal(voices.phrases('de').now, 'jetzt');
  // The coach speaks German (the app language): its texts changed; the English ones did not.
  assert.equal(voices.ownTextsChanged(settings, before, 'coach'), true);
  assert.equal(voices.ownTextsChanged(settings, settings, 'coach'), false);
  assert.equal(voices.ownTextsChanged({ ...settings, crewLanguage: 'en' }, { ...before, crewLanguage: 'en' }, 'crew'), false);
});

test('every text has an area, the short calls exist, and every placeholder has an example', () => {
  assert.deepEqual(QUICK_TEXTS.filter((key) => !Object.hasOwn(TEXT_KEYS, key)), []);
  assert.deepEqual(
    ['now', 'note.lift', 'plan.entry', 'crew.fuelLaps', 'cheeky.bossIntro', 'cheeky.level1', 'ghost.ahead', 'spell.decimal'].map(textGroup),
    ['basics', 'notes', 'plan', 'crew', 'crew', 'cheeky', 'lap', 'recordings'],
  );
  const names = new Set(Object.values(TEXT_KEYS).flat());
  for (const pack of BUILT_IN_PACKS) {
    const { values } = textSamples(pack, FALLBACK_PACK);
    assert.deepEqual([...names].filter((name) => !(name in values)), [], pack.id);
    for (const [name, value] of Object.entries(values)) assert.ok(value && !/\{\w+\}/.test(value), `${pack.id} ${name}: "${value}"`);
  }
  const de = textSamples(BUILT_IN_PACKS.find((p) => p.id === 'de')!, FALLBACK_PACK);
  assert.deepEqual([de.values.direction, de.values.gearWord, de.ordinals.gearWord], ['rechts', 'drei', 'dritten']);
});

test('the runner lists every text, and coach and crew say own texts from the next call on', async () => {
  const { runner, crew } = testRunner({ settings: normalizeSettings({}), dirs }, {}, {});
  const inside = runner as unknown as { prepareVoice(): Promise<void>; phrases: Phrases };
  // No voice is opened in the test.
  inside.prepareVoice = async () => undefined;

  const catalog = runner.textCatalog('de');
  assert.equal(catalog.language, 'de');
  assert.equal(catalog.entries.length, Object.keys(TEXT_KEYS).length);
  const entry = (key: string) => catalog.entries.find((e) => e.key === key)!;
  assert.deepEqual(entry('note.lift'), { key: 'note.lift', group: 'notes', kind: 'text', standard: LIFT, placeholders: ['kmh', 'direction'], speaker: 'coach' });
  assert.equal(entry('crew.fuelLaps').speaker, 'crew');
  assert.equal(entry('cheeky.relief').kind, 'list');
  assert.equal(entry('count').kind, 'words');
  // The corner plan says its gears as ordinals ("im dritten Gang").
  assert.equal(entry('plan.entry').samples?.gearWord, 'dritten');
  assert.deepEqual(runner.checkText('note.lift', 'Gas weg auf {speed}', 'de').map((p) => p.kind), ['placeholder', 'dropped']);

  const before = runner.currentSettings;
  const texts = { de: { 'note.lift': { text: GAS_WEG, base: LIFT }, 'crew.lastLap': { text: 'Letzte Runde, gib alles!', base: 'Letzte Runde!' } } };
  await runner.updateSettings(normalizeSettings({ ...before, texts }));
  assert.equal(inside.phrases.fastNote(lift), 'Gas weg auf 170, rechts.');
  // Recordings list what is said: the own words, not the pack's.
  const pack = runner.voicePacks.create({ name: 'Test', language: 'de' });
  const recordable = runner.recordingCatalog(pack.id).entries.map((e) => e.text);
  assert.ok(recordable.includes('Gas weg auf'), recordable.join(' | '));
  assert.ok(!recordable.includes('liften'));

  // The crew, as the shell tells the modules of a change of the app's settings (apps/desktop/src/ipc.ts).
  const own = crew as unknown as { options: { settings(): CrewSessionSettings }; phrases: Phrases; prepareVoice(): Promise<void> };
  const now = own.options.settings();
  crew!.settingsChanged(now, { ...now, texts: before.texts });
  assert.equal(own.phrases.crewLastLap, 'Letzte Runde, gib alles!');
  crew!.stop();
});
