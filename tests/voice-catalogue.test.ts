// The voice catalogue (packages/runtime/voice-packages.json): every download pinned and checked, every platform
// offered only what runs there (docs/dev/security.md).

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import manifest from '../packages/runtime/voice-packages.json' with { type: 'json' };
import { insideDir, readVoicePackages, type VoicePackage } from '../packages/runtime/src/voice-packages';
import { sherpaArgs } from '../packages/runtime/src/sherpa';

const packages = manifest.packages as VoicePackage[];
const PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-arm64', 'darwin-x64'];

test('every package is complete and pinned', () => {
  const ids = new Set<string>();
  for (const pkg of packages) {
    assert.ok(!ids.has(pkg.id), `duplicate id ${pkg.id}`);
    ids.add(pkg.id);
    assert.ok(pkg.name && pkg.license && pkg.source, `${pkg.id}: name, license and source`);
    assert.ok(pkg.files.length > 0, `${pkg.id}: files`);
    for (const file of pkg.files) {
      assert.match(file.url, /^https:\/\/(github\.com|huggingface\.co)\//, `${pkg.id}: only GitHub and Hugging Face`);
      assert.doesNotMatch(file.url, /\/(latest|main|master)\//, `${pkg.id}: pinned to a release or commit, not a moving name`);
      assert.match(file.sha256, /^[0-9a-f]{64}$/, `${pkg.id}: SHA-256`);
      assert.ok(Number.isInteger(file.size) && file.size > 0, `${pkg.id}: size`);
      assert.ok(file.to || file.extract, `${pkg.id}: where it goes`);
      if (file.platform) assert.ok(PLATFORMS.includes(file.platform), `${pkg.id}: platform ${file.platform}`);
      for (const name of file.extract?.keep ?? []) assert.match(name, /^[\w][\w.-]*$/, `${pkg.id}: keep ${name}`);
    }
    if (pkg.requires) assert.ok(packages.some((p) => p.id === pkg.requires), `${pkg.id}: requires ${pkg.requires}`);
  }
});

test('every target stays inside the voices folder (release check 2026-10-28)', () => {
  const voices = path.resolve('/gtt/voices');
  // Resolved, not split: "a\..\b" and "a/../.." must not pass.
  const below = (root: string, relative: string | undefined) => {
    assert.ok(relative, 'not empty');
    const rest = path.relative(root, path.resolve(root, relative));
    return !!rest && !rest.startsWith('..') && !path.isAbsolute(rest);
  };
  for (const pkg of packages) {
    for (const file of pkg.files) {
      const target = file.extract?.to ?? file.to;
      assert.ok(below(voices, target), `${pkg.id}: target ${target}`);
      assert.doesNotThrow(() => insideDir(voices, target), `${pkg.id}: ${target}`);
      if (file.extract) {
        assert.ok(below(path.join(voices, 'download', 'unpacked'), file.extract.from), `${pkg.id}: from ${file.extract.from}`);
        if (pkg.model) assert.ok(below(path.join(voices, file.extract.to), pkg.model), `${pkg.id}: model ${pkg.model}`);
      }
    }
  }
  // Backslashes separate folders only on Windows (elsewhere they are part of a name).
  const windows = process.platform === 'win32' ? ['a\\..\\..', 'C:\\Windows'] : [];
  for (const bad of ['', '.', '..', 'a/../..', '../tts', '/etc', ...windows]) {
    assert.throws(() => insideDir(voices, bad), /is not inside/, `refused: "${bad}"`);
  }
  assert.equal(insideDir(voices, 'piper/engine'), path.join(voices, 'piper', 'engine'));
});

test('each platform is offered only packages that run there', () => {
  for (const platform of PLATFORMS) {
    const offered = readVoicePackages(platform).packages;
    for (const pkg of offered) {
      assert.ok(pkg.files.every((f) => !f.platform || f.platform === platform), `${platform}: ${pkg.id} has files of another platform`);
      if (pkg.requires) assert.ok(offered.some((p) => p.id === pkg.requires), `${platform}: ${pkg.id} without its engine`);
    }
  }
  // Piper's own build does not start on macOS (rhasspy/piper#404): no Piper engine there.
  for (const platform of ['darwin-arm64', 'darwin-x64']) assert.ok(!readVoicePackages(platform).packages.some((p) => p.engine === 'piper'), platform);
});

test('sherpa-onnx gets the model, its tokens and the text last', () => {
  const args = sherpaArgs({ dir: '/voices/css10', format: 'vits' }, { sid: 0, lengthScale: 1.2, outputFile: '/tmp/out.wav' }, 'Bremse jetzt.');
  assert.equal(args.at(-1), 'Bremse jetzt.');
  assert.equal(args.at(-2), '--', 'the text can never be read as an option');
  assert.ok(args.some((a) => a.startsWith('--vits-model=') && a.endsWith('model.onnx')));
  assert.ok(args.includes('--vits-length-scale=1.2') && args.includes('--sid=0'));
  assert.ok(!args.some((a) => a.startsWith('--vits-data-dir')), 'CSS10 reads characters, no espeak-ng');
  // A Piper voice (macOS): its own .onnx name and the phoneme data of espeak-ng.
  const piper = sherpaArgs({ dir: '/voices/ramona', format: 'piper', file: 'de_DE-ramona-low.onnx' }, { sid: 0, lengthScale: 1, outputFile: 'x.wav' }, 'Gas!');
  assert.ok(piper.some((a) => a.startsWith('--vits-model=') && a.endsWith('de_DE-ramona-low.onnx')));
  assert.ok(piper.some((a) => a.startsWith('--vits-data-dir=') && a.endsWith('espeak-ng-data')));
});
