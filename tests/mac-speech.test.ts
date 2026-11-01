// macOS voices (packages/runtime/src/mac-speech.ts): reading `say -v '?'`. Runs on every platform; the voices
// themselves are tried on the Mac (docs/dev/testing.md).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseMacVoices } from '../packages/runtime/src/mac-speech';

const LISTING = `Albert              en_US    # Hello! My name is Albert.
Anna                de_DE    # Hallo! Ich heiße Anna.
Bad News            en_US    # Hello! My name is Bad News.
Daniel (Enhanced)   en_GB    # Hello! My name is Daniel.
Eddy (German (Germany)) de_DE    # Hallo! Ich heiße Eddy.
Anna (Premium)      de_DE    # Hallo! Ich heiße Anna.
Mónica              es_ES    # ¡Hola! Me llamo Mónica.
Paulina             es_419   # ¡Hola! Me llamo Paulina.
Zarvox              en_US    # Hello! My name is Zarvox.
`;

test('macOS voices: names with spaces and brackets, languages as tags, Premium first, no joke voices', () => {
  const voices = parseMacVoices(LISTING);
  assert.deepEqual(
    voices.map((v) => `${v.name}|${v.language}`),
    ['Anna (Premium)|de-DE', 'Daniel (Enhanced)|en-GB', 'Anna|de-DE', 'Eddy (German (Germany))|de-DE', 'Mónica|es-ES', 'Paulina|es-419'],
  );
  assert.ok(voices.every((v) => v.engine === 'macos'));
});

test('an empty or unexpected listing gives no voices', () => {
  assert.deepEqual(parseMacVoices(''), []);
  assert.deepEqual(parseMacVoices('say: unknown option\n'), []);
});
