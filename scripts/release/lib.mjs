// Shared parts of the release steps (docs/dev/building.md): paths, version, running commands, step output.
// Plain Node, no packages: the steps run the same on a developer PC and in GitHub Actions.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RELEASE = path.join(ROOT, 'release');
/** What goes into the installers: the app (package.json + bundled main process) and the built UI. */
export const STAGE = path.join(RELEASE, 'stage');
export const STAGE_APP = path.join(STAGE, 'app');
export const STAGE_UI = path.join(STAGE, 'ui');
/** Icons and other build resources for electron-builder. */
export const STAGE_BUILD = path.join(STAGE, 'build');
/** Installer check results. */
export const TEST_OUT = path.join(RELEASE, 'test');

export const PRODUCT_NAME = 'GT Toolz';
export const APP_ID = 'com.maldoe.gttoolz';

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The app version: the root package.json is the one place it is set. */
export const VERSION = readJson(path.join(ROOT, 'package.json')).version;
/** Installers of this version. */
export const OUT = path.join(RELEASE, VERSION);
export const ELECTRON_VERSION = readJson(path.join(ROOT, 'node_modules', 'electron', 'package.json')).version;

export const HOST = { win32: 'windows', linux: 'linux', darwin: 'mac' }[process.platform] ?? process.platform;

/** "▶ Build (Prod)" and the time it took. */
export function heading(text) {
  console.log(`\n▶ ${text}`);
}

export function info(text) {
  console.log(`  ${text}`);
}

export class StepError extends Error {}

let failed = false;

/**
 * Makes the process end with exit code 1. A package electron-builder uses (temp-file, through async-exit-hook) ends
 * the process with process.exit(0) once the work is done, which would turn a failed release green in CI; the
 * 'exit' listener sets the code back, and process.exit reads it after its listeners.
 */
export function markFailed() {
  failed = true;
  process.exitCode = 1;
}
process.on('exit', () => {
  if (failed) process.exitCode = 1;
});

/** Fails the step with a message meant for a person (no stack trace). */
export function fail(text) {
  throw new StepError(text);
}

/** A thing that cannot run here, e.g. the Mac installer on Windows: the orchestrator reports it as skipped. */
export class SkipStep extends Error {}

export function requireHost(host, why) {
  if (HOST !== host) throw new SkipStep(why);
}

/**
 * Runs a program and waits for it. Output goes straight to this console. npm and npx are .cmd files on Windows,
 * which Node starts only through the shell: they get one fixed command line, never user input.
 */
export function run(command, args = [], options = {}) {
  const viaShell = process.platform === 'win32' && /^(npm|npx)$/.test(command);
  const line = [command, ...args].join(' ');
  if (!options.quiet) info(`$ ${line}`);
  return new Promise((resolve, reject) => {
    const child = viaShell
      ? spawn(line, { cwd: options.cwd ?? ROOT, env: options.env ?? process.env, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', shell: true })
      : spawn(command, args, { cwd: options.cwd ?? ROOT, env: options.env ?? process.env, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => (stdout += d));
    child.stderr?.on('data', (d) => (stderr += d));
    const timer = options.timeout ? setTimeout(() => child.kill(), options.timeout) : undefined;
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new StepError(`${command}: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || options.allowFail) resolve({ code, stdout, stderr });
      else reject(new StepError(`${line} failed (exit code ${code})${stderr.trim() ? `\n${stderr.trim().split('\n').slice(-15).join('\n')}` : ''}`));
    });
  });
}

/** True if a program can be started (e.g. dpkg-deb, xvfb-run). */
export async function hasProgram(name) {
  const probe = process.platform === 'win32' ? ['where', [name]] : ['sh', ['-c', `command -v ${name}`]];
  const { code } = await run(probe[0], probe[1], { quiet: true, capture: true, allowFail: true });
  return code === 0;
}

export function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function formatBytes(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Writes a ZIP of a folder (Node's own zlib, no package), with Unix file modes, so a start script stays executable
 * when it is packed on Windows. executable: paths (relative, with /) that get mode 755.
 */
export function writeZip(zipFile, dir, { root = path.basename(dir), executable = [] } = {}) {
  const entries = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).split(path.sep).join('/');
      entries.push({ name: `${root}/${rel}${entry.isDirectory() ? '/' : ''}`, full, dir: entry.isDirectory(), rel });
      if (entry.isDirectory()) walk(full);
    }
  };
  walk(dir);
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = e.dir ? Buffer.alloc(0) : fs.readFileSync(e.full);
    const packed = e.dir ? data : zlib.deflateRawSync(data, { level: 9 });
    const crc = e.dir ? 0 : zlib.crc32(data);
    const mode = e.dir ? 0o040755 : executable.includes(e.rel) ? 0o100755 : 0o100644;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(e.dir ? 0 : 8, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4); // made on Unix: the external attributes carry the mode
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(e.dir ? 0 : 8, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((mode << 16) | (e.dir ? 0x10 : 0)) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + packed.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipFile, Buffer.concat([...locals, ...centrals, end]));
  return entries.filter((e) => !e.dir).length;
}

/** The installers of this version for a platform, by file name. */
export function installers(kind) {
  if (!fs.existsSync(OUT)) return [];
  const match = { windows: /Setup.*\.exe$/, linux: /\.deb$/, mac: /\.dmg$/, 'mac-package': /-mac\.zip$/ }[kind];
  return fs
    .readdirSync(OUT)
    .filter((f) => match.test(f))
    .map((f) => path.join(OUT, f));
}

/** SHA256SUMS.txt next to the installers, for the testers and the release page (all installers of this version). */
export function writeChecksums() {
  const files = ['windows', 'linux', 'mac', 'mac-package'].flatMap(installers);
  const lines = files.map((f) => `${sha256(f)}  ${path.basename(f)}`);
  fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  for (const f of files) info(`${path.basename(f)}  ${formatBytes(fs.statSync(f).size)}`);
}

/**
 * Lets a step file run on its own (`node scripts/release/1-build.mjs`) as well as from release.mjs, which imports
 * its default export.
 */
export async function runIfMain(metaUrl, step) {
  if (!process.argv[1] || pathToFileURL(path.resolve(process.argv[1])).href !== metaUrl) return;
  try {
    await step(parseArgs(process.argv.slice(2)));
  } catch (err) {
    if (err instanceof SkipStep) {
      console.log(`\n– skipped: ${err.message}`);
      return;
    }
    console.error(`\n✗ ${err instanceof StepError ? err.message : err.stack}`);
    markFailed();
  }
}

/** --flag and --key=value. */
export function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    args[key] = value ?? true;
  }
  return args;
}
