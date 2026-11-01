// Texts: the app in German and English with the same keys and placeholders; the language packs valid; every
// licence notice on the licences page has its text.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { de as shellDe } from '../apps/ui/src/app/i18n/de';
import { en as shellEn } from '../apps/ui/src/app/i18n/en';
import { de as coachDe } from '../modules/coach/ui/i18n/de';
import { en as coachEn } from '../modules/coach/ui/i18n/en';
import { de as crewDe } from '../modules/crew/ui/i18n/de';
import { en as crewEn } from '../modules/crew/ui/i18n/en';
import { de as hapticsDe } from '../modules/haptics/ui/i18n/de';
import { en as hapticsEn } from '../modules/haptics/ui/i18n/en';
import { de as overlaysDe } from '../modules/overlays/ui/i18n/de';
import { en as overlaysEn } from '../modules/overlays/ui/i18n/en';
import { de as telemetryDe } from '../modules/telemetry/ui/i18n/de';
import { en as telemetryEn } from '../modules/telemetry/ui/i18n/en';
import dePack from '../packages/coach/language-packs/de.json' with { type: 'json' };
import enPack from '../packages/coach/language-packs/en.json' with { type: 'json' };
import { builtInPhrases } from '../packages/coach/src/i18n';
import { validateLanguagePack } from '../packages/coach/src/i18n/pack';

const ROOT = path.resolve(import.meta.dirname, '..');
/** The shell's texts and the modules' (each module's keys start with its id). */
const de: Record<string, string> = { ...shellDe, ...telemetryDe, ...coachDe, ...crewDe, ...overlaysDe, ...hapticsDe };
const en: Record<string, string> = { ...shellEn, ...telemetryEn, ...coachEn, ...crewEn, ...overlaysEn, ...hapticsEn };
/** {computer} and {os} name the platform; a translation may say it without them ("bei dir"). */
const OPTIONAL = new Set(['computer', 'os']);
const placeholders = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((p) => !OPTIONAL.has(p)))].sort();

test('the app texts have the same keys and placeholders in German and English', () => {
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
  const mismatched = Object.keys(en).filter((key) => {
    return placeholders(en[key]!).join() !== placeholders(de[key]!).join();
  });
  assert.deepEqual(mismatched, [], 'placeholders differ');
  const empty = Object.entries({ ...en }).filter(([, v]) => !v.trim()).map(([k]) => k);
  assert.deepEqual(empty, [], 'empty English texts');
});

test('the built-in language packs are valid and complete', () => {
  for (const pack of [dePack, enPack]) {
    const { warnings } = validateLanguagePack(pack);
    assert.deepEqual(warnings, [], `${pack.id}: warnings`);
  }
  assert.deepEqual(Object.keys(dePack.texts).sort(), Object.keys(enPack.texts).sort(), 'the same spoken texts in both packs');
});

test('a car name is spoken without its year and brackets, at once whatever the name', () => {
  const en = builtInPhrases('en');
  assert.equal(
    en.referenceLoaded('Suzuka', { car: "Mazda RX-7 Spirit R Type A (FD) '02", driver: 'fast_guy' }),
    'Reference loaded. Suzuka. Mazda RX-7 Spirit R Type A, driven by fast guy. You can start.',
  );
  assert.equal(en.referenceLoaded('Suzuka', { car: "Porsche 911 RSR (991) '17 Gr.3" }), 'Reference loaded. Suzuka. Porsche 911 RSR Group 3. You can start.');
  // A name from a copied reference file: long runs of spaces or brackets cost no noticeable time.
  const started = performance.now();
  en.referenceLoaded('Suzuka', { car: `${' '.repeat(50_000)}x'1` });
  en.referenceLoaded('Suzuka', { car: '('.repeat(50_000) });
  assert.ok(performance.now() - started < 1000, `${Math.round(performance.now() - started)} ms`);
});

test('every licence notice on the licences page has its text', () => {
  const source = fs.readFileSync(path.join(ROOT, 'apps', 'desktop', 'src', 'licenses.ts'), 'utf8');
  const notices = [...source.matchAll(/notice: '([\w-]+)'/g)].map((m) => m[1]!);
  assert.ok(notices.length > 10);
  const missing = notices.filter((n) => !(`about.notice.${n}` in en) || !(`about.notice.${n}` in de));
  assert.deepEqual(missing, []);
});

test("a module's texts start with its id", () => {
  const modules: [string, Record<string, string>][] = [
    ['telemetry', telemetryEn],
    ['coach', coachEn],
    ['crew', crewEn],
    ['overlays', overlaysEn],
    ['haptics', hapticsEn],
  ];
  for (const [id, texts] of modules) assert.deepEqual(Object.keys(texts).filter((key) => !key.startsWith(`${id}.`)), [], id);
});
