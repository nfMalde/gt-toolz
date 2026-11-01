// Speech engines and voice downloads (release check 2026-10-28): broken WAV headers, cut names, the Windows voice's
// name, non-ASCII folders, and downloads that go to other hosts, grow too big or fail half way.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, mock, test } from 'node:test';
import { commonDir, enginePath } from '../packages/runtime/src/piper';
import { sherpaText } from '../packages/runtime/src/sherpa';
import { engineText, speechEnv, speechScript } from '../packages/runtime/src/voice';
import { allowedDownloadUrl, installPackages, isInstalled, type VoicePackage, type VoicePackageManifest } from '../packages/runtime/src/voice-packages';
import { joinWithPauses, monoSamples, parseWav, trimSilence, wavDuration, wavFile, withLeadingSilence } from '../packages/runtime/src/wav';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-speech-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A WAV with its header fields set by hand. */
function header(fields: { rate?: number; channels?: number; bits?: number }, data = Buffer.alloc(100)): Buffer {
  const wav = wavFile(data, 22050);
  if (fields.channels !== undefined) wav.writeUInt16LE(fields.channels, 22);
  if (fields.rate !== undefined) wav.writeUInt32LE(fields.rate, 24);
  if (fields.bits !== undefined) wav.writeUInt16LE(fields.bits, 34);
  return wav;
}

test('a broken WAV header is refused instead of an endless clip', () => {
  assert.throws(() => wavDuration(header({ rate: 0 })), /Unsupported WAV header/);
  assert.throws(() => parseWav(header({ channels: 0 })), /Unsupported WAV header/);
  assert.throws(() => parseWav(header({ channels: 9 })), /Unsupported WAV header/);
  assert.throws(() => parseWav(header({ bits: 0 })), /Unsupported WAV header/);
  assert.ok(Number.isFinite(wavDuration(wavFile(Buffer.alloc(44100), 22050))));
  assert.equal(wavDuration(wavFile(Buffer.alloc(44100), 22050)), 1);
});

test('an odd byte at the end of the data is no problem', () => {
  const odd = wavFile(Buffer.alloc(101, 7), 22050);
  assert.equal(parseWav(odd).dataLength, 100);
  assert.doesNotThrow(() => trimSilence(odd));
  assert.equal(monoSamples(odd).samples.length, 50);
});

test('pauses that are negative, missing or huge do not break joining', () => {
  const clip = wavFile(Buffer.alloc(200), 22050);
  for (const pause of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const joined = joinWithPauses([clip, clip], [pause]);
    assert.ok(joined, String(pause));
    assert.ok(wavDuration(joined) <= 10.1, `${pause}: at most 10 s of silence`);
  }
  assert.equal(withLeadingSilence(clip, Number.NaN), clip);
  assert.equal(withLeadingSilence(clip, -2), clip);
});

test('a name cut inside an emoji never reaches an engine as a lone surrogate', () => {
  const cut = 'Maldö 🏁'.slice(0, -1); // the high surrogate of the flag stays
  assert.match(cut, /\p{Cs}/u);
  const clean = engineText(cut);
  assert.equal(clean, 'Maldö ');
  assert.doesNotMatch(JSON.stringify({ text: clean }), /\\ud[89ab]/i, 'Piper reads JSON');
  assert.equal(engineText('Bremse 🏁 jetzt'), 'Bremse 🏁 jetzt', 'whole emoji stay');
});

test('sherpa-onnx gets a text that survives the ANSI command line', () => {
  // A fullwidth quote became a plain one and split the argument.
  assert.equal(sherpaText('Größe ＂Zitat＂ 𝐌.'), 'Größe Zitat M.');
  assert.equal(sherpaText('Nicht "so" und\u0000 \ud83c so'), 'Nicht so und so');
  assert.equal(sherpaText('Gang zwei, 1,7 Sekunden – gut!'), 'Gang zwei, 1,7 Sekunden – gut!');
});

test('the Windows voice name never becomes part of the PowerShell script', () => {
  const evil = "x$'; Start-Process calc; #\u2019; New-Item pwned; '\r\n";
  const script = speechScript(Number.NaN, Number.NaN, "de-DE'; evil");
  assert.ok(!script.includes('Start-Process') && !script.includes('evil'));
  assert.match(script, /\$wanted = \[string\]\$env:GTT_VOICE/);
  assert.match(script, /\$rate = 0\n/);
  assert.match(script, /\$pitch = 1\n/);
  assert.match(script, /\$lang = 'de'\n/);
  assert.equal(speechEnv(evil).GTT_VOICE, "x$'; Start-Process calc; #\u2019; New-Item pwned; '");
});

test('a crafted voice name runs no code in the real speech process', { skip: process.platform !== 'win32', timeout: 60_000 }, () => {
  const marker = path.join(tmp, 'pwned.txt');
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const name = `x'; New-Item -ItemType File -Path '${marker}'; '\u2019; New-Item -ItemType File -Path '${marker}'; '`;
  const result = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(speechScript(0, 1), 'utf16le').toString('base64')], {
    env: speechEnv(name),
    input: '',
    encoding: 'utf8',
    timeout: 50_000,
    windowsHide: true,
  });
  assert.match(result.stdout, /^ready\|/m, result.stderr);
  assert.ok(!fs.existsSync(marker), 'no file created by the voice name');
});

test('engines get paths they can open below a non-ASCII profile', () => {
  const base = path.resolve('/Users/Jörg Ł/AppData/Roaming/GT Toolz');
  assert.equal(commonDir(path.join(base, 'voices'), path.join(base, 'cache', 'voice')), base);
  const model = path.join(base, 'voices', 'piper', 'voices', 'de_DE-ramona-low.onnx');
  if (process.platform === 'win32') {
    assert.equal(enginePath(base, model), path.join('voices', 'piper', 'voices', 'de_DE-ramona-low.onnx'));
    assert.equal(enginePath(base, path.join(base, 'cache', 'voice', 'ab12.0.raw.wav')), path.join('cache', 'voice', 'ab12.0.raw.wav'));
    // Another drive: an ASCII path goes as it is.
    assert.equal(enginePath(base, 'Z:\\voices\\x.onnx'), 'Z:\\voices\\x.onnx');
  } else {
    assert.equal(enginePath(base, model), model, 'UTF-8 paths elsewhere');
  }
});

test('a non-ASCII folder on another drive gets its short name, if the drive has one', { skip: process.platform !== 'win32', timeout: 30_000 }, () => {
  const folder = path.join(tmp, 'Jörg Ł');
  fs.mkdirSync(folder, { recursive: true });
  const result = enginePath('Q:\\elsewhere', folder);
  // 8.3 names can be switched off per drive: then the long name stays.
  if (result !== folder) {
    assert.match(result, /^[\x20-\x7e]+$/);
    assert.ok(fs.existsSync(result), result);
    assert.equal(fs.realpathSync.native(result).toLowerCase(), fs.realpathSync.native(folder).toLowerCase());
  }
  // A file that does not exist yet: its folder's short name and its own (ASCII) name.
  const file = enginePath('Q:\\elsewhere', path.join(folder, 'ab12.raw.wav'));
  assert.equal(path.basename(file), 'ab12.raw.wav');
});

test('downloads go only to the catalogue sources, over https', () => {
  for (const url of [
    'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip',
    'https://release-assets.githubusercontent.com/github-production-release-asset/1',
    'https://huggingface.co/rhasspy/piper-voices/resolve/abc/x.onnx',
    'https://us.aws.cdn.hf.co/xet-bridge-us/1',
  ]) {
    assert.ok(allowedDownloadUrl(url), url);
  }
  for (const url of ['http://github.com/x', 'https://github.com.evil.example/x', 'https://evilgithubusercontent.com/x', 'https://example.com/x', 'file:///C:/x', 'not a url']) {
    assert.ok(!allowedDownloadUrl(url), url);
  }
});

/** A catalogue with one plain file, downloaded from GitHub (fetch is replaced). */
function oneFile(size: number, sha256 = '0'.repeat(64)): VoicePackageManifest {
  const pkg: VoicePackage = {
    id: 'test-voice',
    kind: 'voice',
    engine: 'piper',
    name: 'Test',
    license: 'MIT',
    source: 'test',
    files: [{ url: 'https://github.com/test/test/releases/download/1/test.onnx', sha256, size, to: 'piper/voices/test.onnx' }],
  };
  return { format: 'gt-toolz-voice-packages', version: 1, notes: [], packages: [pkg] };
}

const leftovers = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.part')) : []);

test('a download bigger than the catalogue says is stopped and leaves nothing', async () => {
  const dir = path.join(tmp, 'too-big');
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(Buffer.alloc(5000, 1)));
  try {
    const manifest = oneFile(1000);
    await assert.rejects(installPackages(['test-voice'], dir, {}, manifest), /more than the expected 1000 bytes/);
    assert.ok(!isInstalled(dir, manifest.packages[0]!));
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fetchMock.mock.restore();
  }
});

test('a redirect to another host is refused', async () => {
  const dir = path.join(tmp, 'redirect');
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(null, { status: 302, headers: { location: 'https://downloads.example.com/test.onnx' } }));
  try {
    await assert.rejects(installPackages(['test-voice'], dir, {}, oneFile(10)), /downloads\.example\.com refused/);
    assert.equal(fetchMock.mock.callCount(), 1, 'the other host is never asked');
  } finally {
    fetchMock.mock.restore();
  }
});

test('a disk error ends the download instead of hanging', { timeout: 10_000 }, async () => {
  const dir = path.join(tmp, 'disk-error');
  // The target's folder is a file: the write stream fails like a full disk would.
  fs.mkdirSync(path.join(dir, 'piper'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'piper', 'voices'), 'not a folder');
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(Buffer.alloc(1000, 1)));
  try {
    await assert.rejects(installPackages(['test-voice'], dir, {}, oneFile(1000)));
  } finally {
    fetchMock.mock.restore();
  }
});

test('a download with the right bytes and hash is installed', async () => {
  const dir = path.join(tmp, 'good');
  const body = Buffer.alloc(1000, 3);
  const hash = (await import('node:crypto')).createHash('sha256').update(body).digest('hex');
  const fetchMock = mock.method(globalThis, 'fetch', async (url: string) =>
    url.startsWith('https://github.com/')
      ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/asset/1' } })
      : new Response(body),
  );
  try {
    const manifest = oneFile(1000, hash);
    await installPackages(['test-voice'], dir, {}, manifest);
    assert.ok(isInstalled(dir, manifest.packages[0]!));
    assert.deepEqual(fs.readFileSync(path.join(dir, 'piper', 'voices', 'test.onnx')), body);
    assert.deepEqual(leftovers(dir), []);
  } finally {
    fetchMock.mock.restore();
  }
});
