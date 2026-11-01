// Piper: offline neural text-to-speech (https://github.com/rhasspy/piper, MIT).
// Installed as an optional voice package (see voice-packages.ts); runs fully offline.

import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** A render that takes longer has hung (a clip takes well under a second): the engine is ended. */
export const RENDER_TIMEOUT_MS = 60_000;
/** The last bytes of an engine's error output, kept for the error message. */
const ERROR_TAIL = 2048;
/** Piper started this often without one clip in between: it is not started again. */
const MAX_RESTARTS = 3;

/** Linux: the engine's shared libraries come with it (macOS and Windows find them next to the program). */
export function withLibraryPath(dir: string): NodeJS.ProcessEnv {
  if (process.platform !== 'linux') return process.env;
  const current = process.env.LD_LIBRARY_PATH;
  return { ...process.env, LD_LIBRARY_PATH: current ? `${dir}${path.delimiter}${current}` : dir };
}

/** The folder both paths are in (the data folder: the voices and the clip cache). */
export function commonDir(a: string, b: string): string {
  const left = path.resolve(a).split(path.sep);
  const right = path.resolve(b).split(path.sep);
  let same = 0;
  const equal = process.platform === 'win32' ? (x: string, y: string) => x.toLowerCase() === y.toLowerCase() : (x: string, y: string) => x === y;
  while (same < left.length && same < right.length && equal(left[same]!, right[same]!)) same++;
  // Another drive: no common folder; the paths then go as they are (or as short names, enginePath).
  return same === 0 ? path.resolve(a) : left.slice(0, same).join(path.sep) || path.sep;
}

const isAscii = (text: string) => /^[\x20-\x7e]*$/.test(text);

/**
 * A path as the engines can open it. Piper and sherpa-onnx read their command line and file names in the Windows ANSI
 * code page: below a profile like "C:\Users\Jörg" Piper wrote nothing and sherpa found no model (release check
 * 2026-10-28). They run in `base` (the data folder), so a path below it goes relative, in the app's own ASCII names;
 * anything else as its 8.3 short name. Elsewhere paths are UTF-8 and go as they are.
 */
export function enginePath(base: string, target: string): string {
  if (process.platform !== 'win32') return target;
  const relative = path.relative(base, target);
  if (!path.isAbsolute(relative) && isAscii(relative)) return relative || '.';
  return isAscii(target) ? target : shortPath(target);
}

const shortNames = new Map<string, string>();

/** The 8.3 name of a path (Windows), for a file that does not exist yet its folder's. Unchanged if there is none. */
function shortPath(target: string): string {
  const known = shortNames.get(target);
  if (known) return known;
  if (!fs.existsSync(target)) {
    const name = path.basename(target);
    return isAscii(name) ? path.join(shortPath(path.dirname(target)), name) : target;
  }
  let short = target;
  try {
    // The path goes in an environment variable, never into the script.
    const script = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$fso = New-Object -ComObject Scripting.FileSystemObject
$p = $env:GTT_SHORT_PATH
if (Test-Path -LiteralPath $p -PathType Container) { $fso.GetFolder($p).ShortPath } else { $fso.GetFile($p).ShortPath }`;
    const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const out = execFileSync(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      env: { ...process.env, GTT_SHORT_PATH: target },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
      windowsHide: true,
    }).trim();
    // 8.3 names can be switched off per drive: then the long name comes back and stays.
    if (out && isAscii(out)) short = out;
  } catch {
    // No short name: the engine gets the long path (and may fail as before).
  }
  shortNames.set(target, short);
  return short;
}

/** Model settings from the voice catalogue (voice-packages.json), e.g. no random phoneme lengths for MLS. */
export interface PiperInference {
  noiseScale?: number;
  noiseW?: number;
}

interface Waiting {
  resolve: () => void;
  reject: (err: Error) => void;
}

/** One long-running piper.exe per voice; renders texts to WAV files one after another. */
export class PiperRenderer {
  private process: ChildProcessWithoutNullStreams | undefined;
  private buffer = '';
  private errors = '';
  private readonly waiting: Waiting[] = [];
  private timer: NodeJS.Timeout | undefined;
  private closed = false;
  /** Starts without a finished clip in between (a Piper that crashes on start is not started for ever). */
  private restarts = 0;
  private readonly base: string;
  /** A second process for the driver's name, slower and with fixed phoneme lengths. */
  private name: { slower: number; renderer: PiperRenderer } | undefined;

  /**
   * lengthScale: > 1 speaks slower, < 1 faster. speaker: for models with several speakers. base: the folder Piper
   * runs in, holding the engine, the model and the output files (the data folder, see enginePath).
   */
  constructor(
    private readonly exe: string,
    private readonly model: string,
    private readonly lengthScale = 1,
    private readonly speaker?: number,
    private readonly inference: PiperInference = {},
    base?: string,
  ) {
    this.base = path.resolve(base ?? commonDir(path.dirname(exe), path.dirname(model)));
  }

  private start(): ChildProcessWithoutNullStreams {
    const exePath = path.resolve(this.exe);
    const inference = this.inference;
    // No pause of its own: texts come in parts and are joined with the configured pauses (voice.ts).
    const tuning = [
      ...(inference.noiseScale !== undefined ? ['--noise_scale', String(inference.noiseScale)] : []),
      ...(inference.noiseW !== undefined ? ['--noise_w', String(inference.noiseW)] : []),
    ];
    // espeak-ng-data named explicitly: Piper's default is built from its own path, in the ANSI code page.
    const espeak = path.join(path.dirname(exePath), 'espeak-ng-data');
    const args = [
      '--model',
      enginePath(this.base, path.resolve(this.model)),
      '--espeak_data',
      enginePath(this.base, espeak),
      '--json-input',
      '--length_scale',
      String(this.lengthScale),
      '--sentence_silence',
      '0',
      ...tuning,
      ...(this.speaker !== undefined ? ['--speaker', String(this.speaker)] : []),
    ];
    const child = spawn(exePath, args, {
      cwd: process.platform === 'win32' ? this.base : path.dirname(exePath),
      env: withLibraryPath(path.dirname(exePath)),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.restarts++;
    this.buffer = '';
    this.errors = '';
    // Waiting renders fail with what Piper said last.
    const ended = (reason: string) => {
      if (this.process !== child) return;
      this.process = undefined;
      clearTimeout(this.timer);
      const detail = this.errors.trim().split(/\r?\n/).slice(-2).join(' ');
      for (const waiter of this.waiting.splice(0)) waiter.reject(new Error(`Piper ${reason}${detail ? `: ${detail}` : ''}`));
    };
    child.on('error', (err) => {
      console.error(`Piper could not be started: ${err.message}`);
      ended(`could not be started (${err.message})`);
    });
    child.on('exit', (code) => ended(`ended (exit code ${code})`));
    child.stdin.on('error', () => ended('closed its input'));
    // Read always: an error output nobody reads fills its pipe, and Piper stops on its next log line.
    child.stderr.on('data', (chunk: Buffer) => (this.errors = (this.errors + chunk.toString('utf8')).slice(-ERROR_TAIL)));
    // Piper prints the path of every finished WAV file on its own line.
    child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        this.buffer = this.buffer.slice(newline + 1);
        this.restarts = 0;
        this.waiting.shift()?.resolve();
        this.watch();
      }
    });
    this.process = child;
    return child;
  }

  /** The oldest waiting render gets RENDER_TIMEOUT_MS; a Piper that hangs is ended and starts again next time. */
  private watch(): void {
    clearTimeout(this.timer);
    if (!this.waiting.length) return;
    const child = this.process;
    this.timer = setTimeout(() => {
      this.errors += `\nno clip within ${RENDER_TIMEOUT_MS / 1000} s`;
      child?.kill();
    }, RENDER_TIMEOUT_MS);
  }

  render(text: string, outputFile: string): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Piper closed'));
    // Ended (crashed, hung): started again, unless it never got as far as one clip.
    if (!this.process && this.restarts >= MAX_RESTARTS) return Promise.reject(new Error(`Piper failed to start ${MAX_RESTARTS} times`));
    const child = this.process ?? this.start();
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      if (this.waiting.length === 1) this.watch();
      child.stdin.write(`${JSON.stringify({ text, output_file: enginePath(this.base, path.resolve(outputFile)) })}\n`, 'utf8');
    });
  }

  /**
   * The driver's name alone (docs/dev/voices.md): Piper says a single word in about 0.2 s, so it gets its own length
   * scale; noise_w 0 keeps its length the same every time (the user chose 3 times slower, 2026-10-22).
   */
  renderName(text: string, outputFile: string, slower: number): Promise<void> {
    if (this.closed) return Promise.reject(new Error('Piper closed'));
    if (this.name?.slower !== slower) {
      this.name?.renderer.close();
      const renderer = new PiperRenderer(this.exe, this.model, this.lengthScale * slower, this.speaker, { ...this.inference, noiseW: 0 }, this.base);
      this.name = { slower, renderer };
    }
    return this.name.renderer.render(text, outputFile);
  }

  /** Ends Piper; one that does not end within 2 s is killed (its files must be free for removing the voice). */
  close(): void {
    this.closed = true;
    const child = this.process;
    if (child) {
      child.stdin.end();
      setTimeout(() => child.kill(), 2000).unref();
    }
    this.name?.renderer.close();
    this.name = undefined;
  }
}
