// The shell's voices (packages/runtime/src/shell-voices.ts, docs/dev/modules.md): which voice speaks a role in the
// language it speaks, the recorded packs, and the driver's name in front of a sentence.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { RunnerSettings, VoiceChoice } from '../packages/runtime/src/app-api';
import { normalizeSettings } from '../packages/runtime/src/settings';
import { ShellVoices } from '../packages/runtime/src/shell-voices';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-voices-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const CHOICES: VoiceChoice[] = [
  { id: 'Microsoft Katja', engine: 'onecore', language: 'de-DE', gender: 'female', installed: true },
  { id: 'piper:de_DE-thorsten-medium', engine: 'piper', language: 'de-DE', gender: 'male', installed: true },
  { id: 'piper:de_DE-kerstin-low', engine: 'piper', language: 'de-DE', gender: 'female', installed: true },
  { id: 'piper:de_DE-ramona-low', engine: 'piper', language: 'de-DE', gender: 'female', installed: false },
  { id: 'piper:en_GB-alan-medium', engine: 'piper', language: 'en-GB', gender: 'male', installed: true },
];

/** The voices with a known list (the system's is not asked) and settings that can be changed. */
function voices(change: Partial<RunnerSettings> = {}) {
  let settings = normalizeSettings({ language: 'de', ...change });
  const shell = new ShellVoices({ dirs: { voices: path.join(dir, 'voices'), voiceCache: path.join(dir, 'cache'), voicePacks: path.join(dir, 'packs') }, settings: () => settings });
  (shell as unknown as { choices: VoiceChoice[] }).choices = CHOICES;
  return { shell, set: (next: Partial<RunnerSettings>) => (settings = normalizeSettings({ ...settings, ...next })), settings: () => settings };
}

test('without a choice: a neural coach, another male neural voice for the crew, the stand-in of the other gender', () => {
  const { shell, settings } = voices();
  const coach = shell.resolve(settings(), 'coach');
  assert.equal(coach, 'piper:de_DE-thorsten-medium');
  // No other male neural voice: the crew takes the coach's (the radio filter sets it apart).
  assert.equal(shell.resolve(settings(), 'crew'), coach);
  // The other gender, neural first.
  assert.equal(shell.resolve(settings(), 'standin'), 'piper:de_DE-kerstin-low');
  const more = voices();
  (more.shell as unknown as { choices: VoiceChoice[] }).choices = [...CHOICES, { id: 'piper:de_DE-karlsson-low', engine: 'piper', language: 'de-DE', gender: 'male', installed: true }];
  assert.equal(more.shell.resolve(more.settings(), 'crew'), 'piper:de_DE-karlsson-low');
});

test('the user\'s choice wins while it is installed; an uninstalled one falls back', () => {
  const { shell, settings } = voices();
  const roleVoice = (id: string) => ({ ...settings().voices.coach, byLanguage: { de: id } });
  const chosen = voices({ voices: { ...settings().voices, coach: roleVoice('Microsoft Katja') } });
  assert.equal(chosen.shell.resolve(chosen.settings(), 'coach'), 'Microsoft Katja');
  const gone = voices({ voices: { ...settings().voices, coach: roleVoice('piper:de_DE-ramona-low') } });
  assert.equal(gone.shell.resolve(gone.settings(), 'coach'), shell.resolve(settings(), 'coach'));
});

test('the crew speaks its own language; the team boss takes the stand-in\'s voice in it', () => {
  const { shell, settings } = voices({ crewLanguage: 'en' });
  assert.equal(shell.languageOf(settings(), 'crew'), 'en');
  assert.equal(shell.resolve(settings(), 'crew'), 'piper:en_GB-alan-medium');
  const s = settings();
  const boss = voices({ crewLanguage: 'en', voices: { ...s.voices, standin: { ...s.voices.standin, byLanguage: { en: 'piper:en_GB-alan-medium' } } } });
  assert.equal(boss.shell.resolve(boss.settings(), 'boss'), 'piper:en_GB-alan-medium');
  // A language without a pack: the app's.
  const unknown = voices({ coachLanguage: 'fr' });
  assert.equal(unknown.shell.languageOf(unknown.settings(), 'coach'), 'de');
});

test('a recorded pack counts only in its own language', () => {
  const { shell, settings, set } = voices();
  const pack = shell.packs.create({ name: 'Meine Stimme', language: 'de' });
  const s = settings();
  set({ voices: { ...s.voices, coach: { ...s.voices.coach, recordings: { de: pack.id } }, standin: { ...s.voices.standin, recordings: { en: pack.id } } } });
  assert.equal(shell.packId(settings(), 'coach'), pack.id);
  assert.equal(shell.packId({ ...settings(), crewLanguage: 'en' }, 'boss'), undefined, 'a German pack does not speak English');
  assert.equal(shell.packId(settings(), 'crew'), undefined);
});

test('the name in front: always, or "sometimes" for every third sentence and every important one', () => {
  const { shell, set } = voices({ driverName: 'Maldö', addressing: 'always' });
  const phrases = shell.phrases('de');
  assert.match(shell.address('Gut gemacht.', false, phrases), /Maldö/);
  set({ addressing: 'sometimes' });
  const named = [1, 2, 3, 4, 5, 6].map(() => /Maldö/.test(shell.address('Gut gemacht.', false, phrases)));
  assert.deepEqual(named, [true, false, false, true, false, false]);
  assert.match(shell.address('Wichtig.', true, phrases), /Maldö/);
  set({ driverName: '' });
  assert.equal(shell.address('Ohne Namen.', true, phrases), 'Ohne Namen.');
});
