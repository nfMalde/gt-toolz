// The files the app keeps (release check 2026-10-28, docs/dev/building.md): replaced in one step, read with
// suspicion (they may be copied or edited by hand), and "Reset data" empties only a folder the app owns.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { loadConfig } from '../apps/desktop/src/config';
import { applyPendingReset, claimDataFolder, ownsDataFolder, requestReset } from '../apps/desktop/src/reset';
import { writeFileAtomic } from '../packages/runtime/src/atomic-file';
import { listReferences, readReference } from '../packages/runtime/src/references';
import { VOICE_PACK_FORMAT, VoicePackStore } from '../packages/runtime/src/voice-pack';
import { wavFile } from '../packages/runtime/src/wav';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-files-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const folder = (name: string) => fs.mkdirSync(path.join(root, name), { recursive: true }) ?? path.join(root, name);

test('atomic writes replace the file and leave nothing behind', () => {
  const dir = folder('atomic');
  const file = path.join(dir, 'config.json');
  // A folder at the old fixed temp name made every save fail; a link there would have been followed.
  fs.mkdirSync(`${file}.tmp`);
  writeFileAtomic(file, '{"a":1}');
  writeFileAtomic(file, '{"a":2}');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"a":2}');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['config.json', 'config.json.tmp']);
  // A failed write keeps the old file and cleans up.
  assert.throws(() => writeFileAtomic(path.join(dir, 'config.json.tmp'), 'x'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['config.json', 'config.json.tmp']);
});

test('config.json that is valid JSON but no object gives the defaults', () => {
  const dir = folder('config');
  for (const text of ['null', '[]', '"text"', '42', '{"settings": null, "guideDone": "yes"}']) {
    fs.writeFileSync(path.join(dir, 'config.json'), text);
    const config = loadConfig(path.join(dir, 'config.json'));
    assert.equal(config.guideDone, false, text);
    assert.equal(typeof config.settings.language, 'string', text);
  }
});

function referenceJson(change: Record<string, unknown> = {}): string {
  const points = Array.from({ length: 20 }, (_, i) => ({ s: i * 10, t: i * 100, x: i, y: 0, z: 0, speed: 50, throttle: 1, brake: 0, gear: 4, steer: 0 }));
  return JSON.stringify({ version: 1, createdAt: '2026-10-28T10:00:00.000Z', source: 'test', carCode: 1, lapTimeMs: 90_000, lengthMeters: 200, steerSource: 'none', points, corners: [], ...change });
}

test('a broken reference file is refused and never breaks the list', () => {
  const dir = folder('references');
  fs.writeFileSync(path.join(dir, 'good.json'), referenceJson({ driver: 'Jörg \ud835' }));
  fs.writeFileSync(path.join(dir, 'no-date.json'), referenceJson({ createdAt: undefined }));
  fs.writeFileSync(path.join(dir, 'nan.json'), referenceJson({ points: Array.from({ length: 20 }, () => ({ s: 'x' })) }));
  fs.writeFileSync(path.join(dir, 'odd-name.json'), referenceJson({ driver: 42, label: { a: 1 } }));
  fs.writeFileSync(path.join(dir, 'last-used.json'), '{"good": 1}');
  assert.throws(() => readReference(path.join(dir, 'no-date.json')), /not a reference/);
  assert.throws(() => readReference(path.join(dir, 'nan.json')), /not a reference/);
  // Half of a character pair is no name (Piper stopped at it); a name that is no text is dropped.
  assert.equal(readReference(path.join(dir, 'good.json')).driver, 'Jörg');
  const odd = readReference(path.join(dir, 'odd-name.json'));
  assert.equal(odd.driver, undefined);
  assert.equal(odd.label, undefined);
  assert.deepEqual(listReferences(dir).map((r) => r.id).sort(), ['good', 'odd-name']);
});

test('a recorded voice pack never reaches files outside its folder', () => {
  const store = new VoicePackStore(folder('voice-packs'), () => ({ spell: { locale: 'de-DE', numbers: [], decimal: 'Komma' }, textsVersion: 1 }));
  const id = crypto.randomUUID();
  const dir = path.join(store.root, id);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(root, 'secret.txt'), 'private');
  fs.writeFileSync(path.join(dir, '0123456789abcdef.wav'), wavFile(Buffer.alloc(4800), 24_000));
  const recording = (file: string) => ({ text: 'Bremsen', section: 'other', file, seconds: 0.1, at: '2026-10-28T10:00:00.000Z' });
  fs.writeFileSync(
    path.join(dir, 'pack.json'),
    JSON.stringify({
      format: VOICE_PACK_FORMAT,
      version: 1,
      id,
      name: 'Test',
      language: 'de',
      textsVersion: 1,
      created: '2026-10-28T10:00:00.000Z',
      updated: '2026-10-28T10:00:00.000Z',
      recordings: { bremsen: recording('0123456789abcdef.wav'), geheim: recording('..\\..\\secret.txt'), auch: recording('../../secret.txt') },
    }),
  );
  assert.deepEqual(Object.keys(store.recordings(id)), ['bremsen']);
  assert.throws(() => store.recordingWav(id, 'geheim'), /pack-unknown/);
  // Words are phrases, never Object's own members.
  assert.throws(() => store.recordingWav(id, 'constructor'), /pack-unknown/);
  assert.throws(() => store.recordingWav(id, '__proto__'), /pack-unknown/);
  store.removeRecording(id, 'geheim');
  assert.equal(fs.readFileSync(path.join(root, 'secret.txt'), 'utf8'), 'private');
});

test('"Reset data" empties only a data folder the app created', () => {
  // A folder of the app's own (new or empty when first used).
  const own = path.join(root, 'own-data');
  claimDataFolder(own);
  assert.ok(ownsDataFolder(own));
  fs.mkdirSync(path.join(own, 'voices'));
  fs.writeFileSync(path.join(own, 'config.json'), '{}');
  requestReset(own, true);
  applyPendingReset(own, path.join(own, 'voices'));
  assert.deepEqual(fs.readdirSync(own).sort(), ['gt-toolz-data.txt', 'voices']);
  // A folder that held other things before is never the app's (GTT_DATA_DIR given by mistake).
  const games = folder('games');
  fs.writeFileSync(path.join(games, 'save.dat'), 'progress');
  claimDataFolder(games);
  assert.ok(!ownsDataFolder(games));
});
