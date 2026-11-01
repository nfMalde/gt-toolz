// Jan on the Mac (alpha 0.0.4): a Piper voice made ready for sherpa-onnx on the user's computer, the same way
// sherpa-onnx packages Piper voices (checked against its own package of Ramona: identical tokens and settings).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { piperMetadata, piperTokens, preparePiperForSherpa, readOnnxMetadata, withOnnxMetadata, type PiperConfig } from '../packages/runtime/src/piper-for-sherpa';
import { sherpaArgs } from '../packages/runtime/src/sherpa';
import { isInstalled, readVoicePackages } from '../packages/runtime/src/voice-packages';
import { monoSamples, samplesToWav, withPeak } from '../packages/runtime/src/wav';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-piper-sherpa-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const config: PiperConfig = {
  audio: { sample_rate: 22050 },
  espeak: { voice: 'de' },
  language: { name_english: 'German' },
  num_speakers: 236,
  phoneme_id_map: { _: [0], '^': [1], $: [2], ' ': [3], a: [14], ʃ: [96] },
};

/** A stand-in for an ONNX model: ir_version (field 1) and a graph (field 7) as protobuf. */
const model = Buffer.from([0x08, 0x07, 0x3a, 0x03, 0x0a, 0x01, 0x78]);

test('tokens and settings as sherpa-onnx reads them', () => {
  assert.equal(piperTokens(config), '_ 0\n^ 1\n$ 2\n  3\na 14\nʃ 96\n');
  assert.deepEqual(piperMetadata(config), { model_type: 'vits', comment: 'piper', language: 'German', voice: 'de', has_espeak: '1', n_speakers: '236', sample_rate: '22050' });
});

test('the metadata is appended, the model itself stays byte for byte', () => {
  assert.deepEqual(readOnnxMetadata(model), {});
  const withMeta = withOnnxMetadata(model, { model_type: 'vits', voice: 'de', long: 'x'.repeat(300) });
  assert.deepEqual(withMeta.subarray(0, model.length), model);
  assert.deepEqual(readOnnxMetadata(withMeta), { model_type: 'vits', voice: 'de', long: 'x'.repeat(300) });
  assert.throws(() => readOnnxMetadata(Buffer.from([0x0b])), /Not an ONNX model/);
});

test('preparing a voice writes tokens.txt and the metadata once', () => {
  const voice = path.join(dir, 'jan');
  fs.mkdirSync(voice);
  fs.writeFileSync(path.join(voice, 'de_DE-mls-medium.onnx'), model);
  fs.writeFileSync(path.join(voice, 'de_DE-mls-medium.onnx.json'), JSON.stringify(config));
  preparePiperForSherpa(voice, 'de_DE-mls-medium.onnx');
  const size = fs.statSync(path.join(voice, 'de_DE-mls-medium.onnx')).size;
  preparePiperForSherpa(voice, 'de_DE-mls-medium.onnx');
  assert.equal(fs.statSync(path.join(voice, 'de_DE-mls-medium.onnx')).size, size, 'nothing added the second time');
  assert.equal(readOnnxMetadata(fs.readFileSync(path.join(voice, 'de_DE-mls-medium.onnx'))).n_speakers, '236');
  assert.equal(fs.readFileSync(path.join(voice, 'tokens.txt'), 'utf8'), piperTokens(config));
  fs.writeFileSync(path.join(voice, 'de_DE-mls-medium.onnx.json'), '{"audio": {}}');
  assert.throws(() => preparePiperForSherpa(voice, 'de_DE-mls-medium.onnx'), /not a Piper voice configuration/);
});

test('Jan is offered on the Mac only, made ready from the Windows files', () => {
  const mac = readVoicePackages('darwin-arm64').packages.find((p) => p.id === 'vits-piper-de_DE-mls-medium');
  assert.ok(mac, 'offered on Apple silicon');
  assert.ok(readVoicePackages('darwin-x64').packages.some((p) => p.id === mac.id), 'offered on Intel Macs');
  assert.ok(!readVoicePackages('win32-x64').packages.some((p) => p.id === mac.id), 'Windows has Piper itself');
  assert.deepEqual(mac.voices, [{ id: 'vits:piper-de_DE-mls-jan', sid: 53, language: 'de-DE', gender: 'male', name: 'Jan' }]);
  assert.equal(mac.prepare, 'piper-for-sherpa');
  assert.deepEqual(mac.inference, { noiseW: 0 });
  const windows = readVoicePackages('win32-x64').packages.find((p) => p.id === 'piper:de_DE-mls-medium')!;
  assert.deepEqual(
    mac.files.filter((f) => !f.archive).map((f) => f.sha256),
    windows.files.map((f) => f.sha256),
    'the same model files as on Windows',
  );
  // Downloaded but not yet prepared: not installed.
  const voices = path.join(dir, 'voices');
  for (const file of mac.files) {
    const target = path.join(voices, file.extract?.to ?? file.to!);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (file.extract) fs.mkdirSync(target, { recursive: true });
    else fs.writeFileSync(target, '');
  }
  assert.ok(!isInstalled(voices, mac));
  fs.writeFileSync(path.join(voices, mac.dir!, 'tokens.txt'), '');
  assert.ok(isInstalled(voices, mac));
});

test('sherpa-onnx gets the model settings Piper gets', () => {
  const args = sherpaArgs({ dir: '/v/jan', format: 'piper', file: 'de_DE-mls-medium.onnx', inference: { noiseW: 0 } }, { sid: 53, lengthScale: 1, outputFile: '/c/x.wav' }, 'Jetzt');
  assert.ok(args.includes('--vits-noise-scale-w=0'));
  assert.ok(args.includes('--sid=53'));
  assert.ok(!args.some((a) => a.startsWith('--vits-noise-scale=')), 'unset values stay the engine default');
});

test('quiet clips are brought to the same peak as Piper', () => {
  const quiet = samplesToWav(Float32Array.from({ length: 2205 }, (_, i) => 0.28 * Math.sin(i / 5)), 22050);
  const { samples } = monoSamples(withPeak(quiet, 0.95));
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  assert.ok(Math.abs(peak - 0.95) < 0.01, `peak ${peak}`);
  const silence = samplesToWav(new Float32Array(100), 22050);
  assert.equal(withPeak(silence, 0.95), silence);
});
