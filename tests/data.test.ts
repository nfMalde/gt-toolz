// Vendored data matches what packages/telemetry/data/SOURCE.md (track signatures, car names) and
// packages/coach/data/SOURCE.md (corner names) document (source, commit, SHA-256).

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const TELEMETRY = path.resolve(import.meta.dirname, '..', 'packages', 'telemetry', 'data');
const COACH = path.resolve(import.meta.dirname, '..', 'packages', 'coach', 'data');
const telemetrySource = fs.readFileSync(path.join(TELEMETRY, 'SOURCE.md'), 'utf8');
const coachSource = fs.readFileSync(path.join(COACH, 'SOURCE.md'), 'utf8');
const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('the vendored data files have the documented checksums', () => {
  const documented: Record<string, string | undefined> = {
    [path.join(TELEMETRY, 'track-signatures.json')]: /# Track signatures[\s\S]*?\| SHA-256 \| `([0-9a-f]{64})`/.exec(telemetrySource)?.[1],
    [path.join(TELEMETRY, 'cars.json')]: /`cars\.json` `([0-9a-f]{64})`/.exec(telemetrySource)?.[1],
    [path.join(COACH, 'corner-names.json')]: /# Corner names[\s\S]*?\| SHA-256 \| `([0-9a-f]{64})`/.exec(coachSource)?.[1],
  };
  for (const [file, hash] of Object.entries(documented)) {
    assert.ok(hash, `${file}: no SHA-256 in its SOURCE.md`);
    assert.equal(sha256(file), hash, `${file} differs from its SOURCE.md`);
  }
});

test('the licence files of the vendored data are present', () => {
  for (const file of ['track-signatures.LICENSE', 'gt-telemetry.LICENSE', 'gt7info.LICENSE']) assert.ok(fs.existsSync(path.join(TELEMETRY, file)), file);
  assert.ok(fs.existsSync(path.join(COACH, 'corner-names.LICENSE')), 'corner-names.LICENSE');
});
