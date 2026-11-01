// Optional voice packages (engines, models, voices) from packages/runtime/voice-packages.json.
// Nothing is downloaded unless the user picks a package. Downloads come from the original sources,
// are pinned and checked against SHA-256. Windows voices need no package.

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import manifestFile from '../voice-packages.json' with { type: 'json' };
import type { InstallProgress } from './app-api';
import type { PiperInference } from './piper';
import { preparePiperForSherpa } from './piper-for-sherpa';
import type { SherpaFormat } from './sherpa';

export type { InstallProgress } from './app-api';

export type EngineId = 'piper' | 'sherpa';

export interface PackageFile {
  /** Only for this platform ("win32-x64", "linux-x64": Node's platform and arch); none: every platform. */
  platform?: string;
  url: string;
  sha256: string;
  /** Download size in bytes. */
  size: number;
  /** Plain file: target path below the voices directory. */
  to?: string;
  /** Archive: which folder inside it goes where; with keep, only these files of it (nothing else lands on disk). */
  archive?: 'zip' | 'tar.gz' | 'tar.bz2';
  extract?: { from: string; to: string; keep?: string[] };
}

/** One voice of a model (Piper MLS speakers, CSS10). */
export interface ModelVoice {
  id: string;
  /** Speaker id in the model. */
  sid: number;
  language: string;
  gender: string;
  /** Display name, if the id is not readable. */
  name?: string;
}

export interface VoicePackage {
  id: string;
  kind: 'engine' | 'model' | 'voice';
  engine: EngineId;
  requires?: string;
  name: string;
  license: string;
  source: string;
  language?: string;
  gender?: string;
  dataset?: string;
  files: PackageFile[];
  /** Voices a model provides (Piper MLS speakers, CSS10). */
  voices?: ModelVoice[];
  /** sherpa-onnx models: how the model is run ('vits' characters, 'piper' phonemes with espeak-ng-data). */
  format?: SherpaFormat;
  /** sherpa-onnx models: the .onnx file, if not model.onnx (the Piper voices keep their own name). */
  model?: string;
  /** A model put together from several files: its folder below the voices folder (Jan on the Mac). */
  dir?: string;
  /** Made ready after the download: a Piper voice for sherpa-onnx (piper-for-sherpa.ts). */
  prepare?: 'piper-for-sherpa';
  /** Piper model settings (e.g. noiseW 0: no random phoneme lengths). */
  inference?: PiperInference;
  /** App languages for which the first-start dialog preselects this package (the user can deselect it). */
  preselectedFor?: string[];
}

export interface VoicePackageManifest {
  format: 'gt-toolz-voice-packages';
  version: 1;
  notes: string[];
  packages: VoicePackage[];
}

/** Relative to the working directory (developer tools); the app passes its own folder. */
export const DEFAULT_VOICES_DIR = path.join('.cache', 'tts');

/** The running platform as the manifest names it ("win32-x64", "linux-x64", "darwin-arm64"). */
export function currentPlatform(): string {
  return `${process.platform}-${process.arch}`;
}

/**
 * The manifest for a platform: files for other platforms left out, and packages without a file for it
 * (or whose engine has none) not offered at all.
 */
export function readVoicePackages(platform = currentPlatform()): VoicePackageManifest {
  const manifest = manifestFile as VoicePackageManifest;
  const packages = manifest.packages
    .map((pkg) => ({ ...pkg, files: pkg.files.filter((f) => !f.platform || f.platform === platform) }))
    .filter((pkg) => pkg.files.length > 0);
  const available = new Set(packages.map((p) => p.id));
  return { ...manifest, packages: packages.filter((p) => !p.requires || available.has(p.requires)) };
}

/** An engine's program name: with ".exe" on Windows. */
function program(name: string): string {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

/**
 * A path from the catalogue below a folder: never empty, never outside it (release check 2026-10-28: an empty target
 * would have removed the whole voices folder, "a\..\.." would have left it).
 */
export function insideDir(dir: string, relative: string | undefined): string {
  const root = path.resolve(dir);
  const target = path.resolve(root, relative ?? '');
  const rest = path.relative(root, target);
  if (!relative || !rest || rest.startsWith('..') || path.isAbsolute(rest)) throw new Error(`Catalogue path "${relative ?? ''}" is not inside ${root}`);
  return target;
}

/** Where a file of a package goes, below the voices folder. */
function fileTarget(dir: string, file: PackageFile): string {
  return insideDir(dir, file.extract?.to ?? file.to);
}

/** Where a package lives once installed (its own folder, else the first file decides). */
function installedPath(dir: string, pkg: VoicePackage): string {
  return pkg.dir ? insideDir(dir, pkg.dir) : fileTarget(dir, pkg.files[0]!);
}

/**
 * Every file in place. An archive's folder appears in one rename, so a half-moved one never counts; a prepared
 * package also needs what the preparation writes last (tokens.txt).
 */
export function isInstalled(dir: string, pkg: VoicePackage): boolean {
  if (pkg.prepare && !fs.existsSync(path.join(installedPath(dir, pkg), 'tokens.txt'))) return false;
  return pkg.files.every((f) => fs.existsSync(fileTarget(dir, f)));
}

/** Download size of a package in bytes. */
export function packageSize(pkg: VoicePackage): number {
  return pkg.files.reduce((sum, f) => sum + f.size, 0);
}

/** A voice the coach can use, with what its renderer needs. */
export type ExternalVoice =
  | { engine: 'piper'; id: string; language: string; exe: string; model: string; speaker?: number; inference?: PiperInference }
  | { engine: 'sherpa'; id: string; language: string; exe: string; modelDir: string; modelFile?: string; format: SherpaFormat; sid: number; inference?: PiperInference };

/** All voices from installed packages ("piper:de_DE-ramona-low", "vits:css10-de"). */
export function installedVoices(dir: string, manifest = readVoicePackages()): ExternalVoice[] {
  const byId = new Map(manifest.packages.map((p) => [p.id, p]));
  const voices: ExternalVoice[] = [];
  for (const pkg of manifest.packages) {
    const engine = pkg.requires ? byId.get(pkg.requires) : undefined;
    if (!engine || !isInstalled(dir, pkg) || !isInstalled(dir, engine)) continue;
    if (pkg.engine === 'piper' && pkg.kind === 'model') {
      const onnx = pkg.files.find((f) => f.to?.endsWith('.onnx'));
      if (!onnx?.to) continue;
      for (const v of pkg.voices ?? []) {
        voices.push({ engine: 'piper', id: v.id, language: v.language, exe: path.join(installedPath(dir, engine), program('piper')), model: insideDir(dir, onnx.to), speaker: v.sid, inference: pkg.inference });
      }
    }
    if (pkg.engine === 'piper' && pkg.kind === 'voice') {
      const onnx = pkg.files.find((f) => f.to?.endsWith('.onnx'));
      if (!onnx?.to) continue;
      voices.push({ engine: 'piper', id: pkg.id, language: pkg.language ?? '', exe: path.join(installedPath(dir, engine), program('piper')), model: insideDir(dir, onnx.to), inference: pkg.inference });
    }
    if (pkg.engine === 'sherpa' && pkg.kind === 'model') {
      for (const v of pkg.voices ?? []) {
        voices.push({ engine: 'sherpa', id: v.id, language: v.language, exe: path.join(installedPath(dir, engine), 'bin', program('sherpa-onnx-offline-tts')), modelDir: installedPath(dir, pkg), modelFile: pkg.model, format: pkg.format ?? 'vits', sid: v.sid, inference: pkg.inference });
      }
    }
  }
  return voices;
}

export interface AllowedVoice {
  id: string;
  language: string;
  gender?: string;
  packageId: string;
  name?: string;
}

/** Every voice id the manifest allows, installed or not. */
export function allowedVoiceIds(manifest = readVoicePackages()): AllowedVoice[] {
  return manifest.packages.flatMap((pkg) => {
    if (pkg.kind === 'voice') return [{ id: pkg.id, language: pkg.language ?? '', gender: pkg.gender, packageId: pkg.id }];
    if (pkg.kind === 'model') return (pkg.voices ?? []).map((v) => ({ id: v.id, language: v.language, gender: v.gender, packageId: pkg.id, name: v.name }));
    return [];
  });
}

/** Packages the first-start dialog preselects for an app language ("de", "en"); the user decides. */
export function preselectedPackages(language: string, manifest = readVoicePackages()): VoicePackage[] {
  const lang = language.split('-')[0]!;
  return manifest.packages.filter((p) => p.preselectedFor?.includes(lang));
}

/** The packages to install for a selection: dependencies first, already installed ones left out. */
export function installOrder(ids: string[], dir: string, manifest = readVoicePackages()): VoicePackage[] {
  const byId = new Map(manifest.packages.map((p) => [p.id, p]));
  const order: VoicePackage[] = [];
  const add = (id: string) => {
    const pkg = byId.get(id);
    if (!pkg) throw new Error(`Unknown or not allowed package "${id}"`);
    if (pkg.requires) add(pkg.requires);
    if (!order.includes(pkg)) order.push(pkg);
  };
  ids.forEach(add);
  return order.filter((pkg) => !isInstalled(dir, pkg));
}

// --- Install / remove ---


export interface InstallOptions {
  log?: (line: string) => void;
  onProgress?: (progress: InstallProgress) => void;
  signal?: AbortSignal;
}

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * Hosts a download may come from or be redirected to: the catalogue's sources (GitHub releases, Hugging Face) and
 * their file servers, https only (release check 2026-10-28; the SHA-256 check stays the real guard).
 */
export function allowedDownloadUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' &&
    (host === 'github.com' || host.endsWith('.githubusercontent.com') || host === 'huggingface.co' || host.endsWith('.huggingface.co') || host.endsWith('.hf.co'))
  );
}

/** Redirects followed at most (GitHub and Hugging Face use one or two). */
const MAX_REDIRECTS = 5;
/** A download that receives nothing for this long has stalled: it is stopped. */
const IDLE_TIMEOUT_MS = 60_000;

/** The response for a catalogue URL, following redirects only to allowed hosts. */
async function fetchAllowed(url: string, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowedDownloadUrl(current)) throw new Error(`Download from ${new URL(current).host} refused: not a source of the voice catalogue`);
    const response = await fetch(current, { signal, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel();
    current = new URL(location, current).toString();
  }
  throw new Error(`${url}: too many redirects`);
}

/** Windows' own bsdtar (zip, tar.gz, tar.bz2), never one that happens to be first on the PATH; elsewhere the system's tar. */
function tarExe(): string {
  return process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
}

function extract(archive: string, target: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(tarExe(), ['-xf', archive, '-C', target], { windowsHide: true, signal }, (err) => (err ? reject(err) : resolve()));
  });
}

async function download(file: PackageFile, target: string, options: InstallOptions, onBytes: (bytes: number) => void): Promise<void> {
  if (fs.existsSync(target) && sha256(target) === file.sha256) {
    onBytes(file.size);
    return;
  }
  options.log?.(`download  ${file.url}`);
  // Stopped by the user or after IDLE_TIMEOUT_MS without data.
  const idle = new AbortController();
  const timer = setTimeout(() => idle.abort(new Error(`${file.url}: no data for ${IDLE_TIMEOUT_MS / 1000} s`)), IDLE_TIMEOUT_MS);
  const alive = () => timer.refresh();
  const signal = options.signal ? AbortSignal.any([options.signal, idle.signal]) : idle.signal;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  const hash = crypto.createHash('sha256');
  let received = 0;
  let out: fs.WriteStream | undefined;
  try {
    const response = await fetchAllowed(file.url, signal);
    if (!response.ok || !response.body) throw new Error(`${file.url}: HTTP ${response.status}`);
    out = fs.createWriteStream(partial);
    alive();
    // pipeline: waits while the disk is behind, and a write error (disk full) ends the download instead of
    // leaving it waiting for ever with the installation marked as running (release check 2026-10-28).
    await pipeline(
      response.body as unknown as AsyncIterable<Uint8Array>,
      async function* (source: AsyncIterable<Uint8Array>) {
        for await (const chunk of source) {
          received += chunk.length;
          // The catalogue knows the exact size: more is never the right file.
          if (received > file.size) throw new Error(`${path.basename(target)}: more than the expected ${file.size} bytes, stopped`);
          hash.update(chunk);
          onBytes(chunk.length);
          alive();
          yield chunk;
        }
      },
      out,
      { signal },
    );
  } catch (err) {
    // Removed once the stream has let go of it: it opens and closes the file on its own time, and Windows keeps an
    // open file (a .part file was left over now and then).
    const stream = out;
    if (stream && !stream.closed) {
      await new Promise<void>((resolve) => {
        stream.once('close', () => resolve());
        stream.destroy();
      });
    }
    fs.rmSync(partial, { force: true });
    throw signal.aborted && idle.signal.aborted ? idle.signal.reason : err;
  } finally {
    clearTimeout(timer);
  }
  const actual = hash.digest('hex');
  if (actual !== file.sha256) {
    fs.rmSync(partial, { force: true });
    throw new Error(`${path.basename(target)}: SHA-256 mismatch (expected ${file.sha256}, got ${actual}), file deleted`);
  }
  fs.renameSync(partial, target);
  options.log?.(`verified  ${path.basename(target)}`);
}

/** Installs packages (and what they require). Already installed packages are skipped. */
export async function installPackages(ids: string[], dir: string, options: InstallOptions = {}, manifest = readVoicePackages()): Promise<void> {
  clearLeftovers(dir);
  const order = installOrder(ids, dir, manifest);
  const totalBytes = order.reduce((sum, pkg) => sum + packageSize(pkg), 0);
  let receivedBytes = 0;
  const report = (packageId: string, phase: InstallProgress['phase']) => options.onProgress?.({ packageId, phase, receivedBytes, totalBytes });

  for (const pkg of order) {
    options.log?.(`install   ${pkg.id}: ${pkg.name} (${pkg.license})`);
    for (const file of pkg.files) {
      // Progress may differ a little from the manifest size; it never runs past the file's share.
      let fileBytes = 0;
      const onBytes = (bytes: number) => {
        const counted = Math.min(bytes, file.size - fileBytes);
        fileBytes += counted;
        receivedBytes += counted;
        report(pkg.id, 'download');
      };
      if (file.to) {
        await download(file, fileTarget(dir, file), options, onBytes);
        receivedBytes += file.size - fileBytes;
        continue;
      }
      const downloads = path.join(dir, 'download');
      const archive = insideDir(downloads, path.basename(new URL(file.url).pathname));
      const target = fileTarget(dir, file);
      const work = path.join(downloads, `unpacked-${pkg.id.replace(/[^a-z0-9]/gi, '_')}`);
      try {
        await download(file, archive, options, onBytes);
        receivedBytes += file.size - fileBytes;
        report(pkg.id, 'extract');
        fs.rmSync(work, { recursive: true, force: true });
        const unpacked = path.join(work, 'archive');
        fs.mkdirSync(unpacked, { recursive: true });
        await extract(archive, unpacked, options.signal);
        const from = insideDir(unpacked, file.extract!.from);
        // Put together beside it, then moved into place in one rename: a failure half way never leaves a folder
        // that counts as installed (release check 2026-10-28).
        let staged = from;
        const keep = file.extract!.keep;
        if (keep) {
          // Only the named files; scripts and other extras of the archive stay out.
          staged = path.join(work, 'staged');
          fs.mkdirSync(staged);
          for (const name of keep) {
            if (!/^[\w.-]+$/.test(name) || name.startsWith('.')) throw new Error(`${pkg.id}: invalid file name "${name}" in the catalogue`);
            fs.renameSync(path.join(from, name), path.join(staged, name));
          }
        }
        removeFolder(dir, target);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.renameSync(staged, target);
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
        fs.rmSync(archive, { force: true });
      }
    }
    if (pkg.prepare === 'piper-for-sherpa') {
      report(pkg.id, 'extract');
      if (!pkg.model) throw new Error(`${pkg.id}: no model file in the catalogue`);
      preparePiperForSherpa(installedPath(dir, pkg), pkg.model);
    }
    options.log?.(`installed ${pkg.id}`);
    report(pkg.id, 'installed');
  }
}

/** Removes packages; engines are only removed if nothing installed needs them. */
/**
 * Folders of packages that left the catalogue, removed once at start: the user installed them, nothing uses them any
 * more. Kokoro-82M (2026-10-24): training data of unknown origin (docs/dev/security.md).
 */
const RETIRED_PATHS = ['sherpa/kokoro-v1.0'];

export function removeRetiredPackages(dir: string, log: (line: string) => void = () => {}): void {
  for (const retired of RETIRED_PATHS) {
    const target = path.join(dir, retired);
    if (!fs.existsSync(target)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    log(`removed   ${retired} (no longer offered)`);
  }
}

/**
 * Removes an installed folder or file: first renamed out of the way in one step, then deleted. An engine still
 * running holds its files: then the rename fails and the package stays whole (it did count as installed with half of
 * it gone, release check 2026-10-28); what cannot be deleted after the rename is cleared on the next run.
 */
function removeFolder(dir: string, target: string): void {
  if (!fs.existsSync(target)) return;
  const trash = path.join(dir, 'download', `removed-${crypto.randomUUID()}`);
  fs.mkdirSync(path.dirname(trash), { recursive: true });
  fs.renameSync(target, trash);
  fs.rmSync(trash, { recursive: true, force: true, maxRetries: 3 });
}

/** Leftovers of an earlier removal or installation that could not be cleared then. */
export function clearLeftovers(dir: string): void {
  const downloads = path.join(dir, 'download');
  if (!fs.existsSync(downloads)) return;
  for (const name of fs.readdirSync(downloads)) {
    if (!/^(removed|unpacked)-/.test(name) && !name.endsWith('.part')) continue;
    try {
      fs.rmSync(path.join(downloads, name), { recursive: true, force: true });
    } catch {
      // Still held (an engine of the earlier run): next time.
    }
  }
}

export function removePackages(ids: string[], dir: string, log: (line: string) => void = () => {}, manifest = readVoicePackages()): void {
  clearLeftovers(dir);
  for (const id of ids) {
    const pkg = manifest.packages.find((p) => p.id === id);
    if (!pkg) throw new Error(`Unknown package "${id}"`);
    const dependents = manifest.packages.filter((p) => p.requires === id && isInstalled(dir, p) && !ids.includes(p.id));
    if (dependents.length) {
      log(`keep      ${id}: still needed by ${dependents.map((d) => d.id).join(', ')}`);
      continue;
    }
    for (const file of pkg.files) removeFolder(dir, fileTarget(dir, file));
    // What the preparation wrote goes with it (tokens.txt in the package's folder).
    if (pkg.dir) removeFolder(dir, installedPath(dir, pkg));
    log(`removed   ${id}`);
  }
}
