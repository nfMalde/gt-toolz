// Voice output: texts are rendered to WAV clips (Windows voices, Piper, sherpa-onnx), cached on disk and played
// on an AudioOutput (the app plays them itself; the console tools use the system's player). No network.
//
// Two kinds of Windows voices can be chosen (on macOS its own voices, mac-speech.ts; everywhere Piper and sherpa-onnx):
// - OneCore voices (e.g. "Microsoft Katja", "Microsoft Hedda", "Microsoft Stefan"), newer, with native pitch.
// - SAPI desktop voices (e.g. "Microsoft Hedda Desktop"); their pitch is raised by playing the clip faster.
//
// Timing-critical words ("drei", "zwei", "eins", "jetzt", ...) are rendered to WAV once, trimmed of
// leading silence and played as clips, so they start right away. Sentences use the same clip path.

import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { listMacVoices } from './mac-speech';
import { RECORDING_RATE, type RecordedVoice, type Segment } from './voice-pack';
import { joinWithPauses, parseWav, toMonoWav, trimSilence, wavDuration, wavFile, withLeadingSilence, withPlaybackRate } from './wav';

/** Between two recordings: no mark (a building block like "eins Komma sieben"), and a comma between short parts ("Maldö, ..."). */
const WORD_GAP_SECONDS = 0.03;
const SHORT_COMMA_SECONDS = 0.2;

const fail = (message: string): never => {
  throw new Error(message);
};

/**
 * A text as it goes into an engine. A lone surrogate (a name cut in the middle of an emoji) became "\ud83c" in Piper's
 * JSON input, and Piper ended with a parse error (release check 2026-10-28).
 */
export function engineText(text: string): string {
  return text.replace(/\p{Cs}/gu, '');
}

/** A work file of its own: two voices with the same style may render the same text at the same time. */
function partFile(file: string, part: string): string {
  return `${file}.${crypto.randomBytes(4).toString('hex')}.${part}`;
}

/** A clip into the cache under its final name only when complete (a crash leaves no half clip that counts as done). */
function writeClip(file: string, data: Buffer): void {
  const temp = partFile(file, 'tmp');
  try {
    fs.writeFileSync(temp, data);
    fs.renameSync(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    // Another voice wrote the same clip at the same time (and it may be playing): that one is as good.
    if (!fs.existsSync(file)) throw err;
  }
}

/** An engine's raw output: rendered, read and removed (also when the render failed half way). */
/** Tries to read a file the engine just wrote; Windows' virus scanner or indexer may hold it for a moment. */
const FRESH_FILE_ATTEMPTS = 6;
const FRESH_FILE_WAIT_MS = 50;

async function rawClip(raw: string, render: () => Promise<void>): Promise<Buffer> {
  try {
    await render();
    for (let attempt = 1; ; attempt++) {
      try {
        return fs.readFileSync(raw);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt >= FRESH_FILE_ATTEMPTS || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
        await new Promise((resolve) => setTimeout(resolve, FRESH_FILE_WAIT_MS * attempt));
      }
    }
  } finally {
    // Never at the clip's cost (alpha 0.0.5, the user's PC: "EPERM, Permission denied" on a fresh .raw.wav cost a
    // corner its plan): retried a moment, else left in the cache folder.
    try {
      fs.rmSync(raw, { force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // A leftover part file in the cache does no harm.
    }
  }
}

/** Part of every clip's cache key: raise it when rendering changes (e.g. sentence pauses), so clips are rendered again. */
// 3: parts joined with fixed pauses, a final period, soft clip ends. 4: no one-word parts, soft starts,
// pitch without tempo change (older clips sound different). 5: sherpa-onnx clips as loud as Piper's (sherpa.ts).
const CLIP_CACHE_VERSION = 5;

export interface Voice {
  /** Plays a prepared clip, cutting off whatever is playing. */
  play(clip: string): void;
  /** Stops the clip that is playing. */
  stop(): void;
  /** Speaks a sentence (not timing-critical). */
  say(text: string): void;
  close(): void;
}

export class SilentVoice implements Voice {
  play(): void {}
  stop(): void {}
  say(): void {}
  close(): void {}
}

/** An offline engine that writes a WAV file per text. */
export interface ExternalRenderer {
  render(text: string, outputFile: string): Promise<void>;
  /** The driver's name on its own: slower by the factor, and the same every time (docs/dev/voices.md). */
  renderName?(text: string, outputFile: string, slower: number): Promise<void>;
  close(): void;
}

export interface VoiceInfo {
  engine: 'onecore' | 'sapi' | 'macos' | 'piper' | 'sherpa';
  name: string;
  language: string;
}

export interface VoiceOptions {
  /** Voice name as listed by listVoices(). Default: the first desktop voice for the locale. */
  voice?: string;
  /** Language of the texts ("de-DE"); picks the default voice. */
  locale?: string;
  /** -10 (slow) .. 10 (fast). */
  rate?: number;
  /** 1 = normal, 1.1 = 10 % higher. */
  pitch?: number;
  /** Generated sounds (e.g. a tone) to load as clips. */
  sounds?: Record<string, Buffer>;
  /** Seconds of silence after a comma and after a sentence (sherpa-onnx keeps its own pauses). */
  pauses?: SpeechPauses;
  /** The text as the engine should read it (pronunciations from the language pack); the clip cache uses it too. */
  spoken?: (text: string) => string;
  /** Where the clips are played (the app: its own player; default: the system's player). */
  output?: AudioOutput;
  /** Render with another engine (Piper, sherpa-onnx, macOS) instead of a Windows voice; playback stays the same. */
  external?: { engine: 'piper' | 'sherpa' | 'macos'; name: string; renderer: ExternalRenderer };
  /** Called after each prepared clip (rendering new clips can take a while with neural voices). */
  onProgress?: (done: number, total: number) => void;
  /** Sound effect on every rendered clip: 'radio' for the race crew's team radio. */
  effect?: 'radio';
  /** The user's own recordings: sentences they cover completely are put together from them. */
  recordings?: RecordedVoice;
}

const SCRIPT = `
[Console]::InputEncoding = [Text.Encoding]::UTF8
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$wanted = [string]$env:GTT_VOICE
$lang = '__LANG__'
$rate = __RATE__
$pitch = __PITCH__
$players = @{}
$current = $null
$name = 'player'
$engine = 'player'
$oneCore = $null

# '*player*': only plays clips (the console tools on Windows), no speech engine to load.
if ($wanted -ne '*player*') {
  $oneCoreVoices = @()
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
    $null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
    $oneCoreVoices = @([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices)
  } catch { }
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $sapiVoices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled })

  if ($wanted -eq '*list*') {
    foreach ($v in $oneCoreVoices) { [Console]::Out.WriteLine('voice|onecore|' + $v.DisplayName + '|' + $v.Language) }
    foreach ($v in $sapiVoices) { [Console]::Out.WriteLine('voice|sapi|' + $v.VoiceInfo.Name + '|' + $v.VoiceInfo.Culture.Name) }
    [Console]::Out.WriteLine('listed|')
    exit
  }

  $engine = 'sapi'
  $match = $oneCoreVoices | Where-Object { $_.DisplayName -eq $wanted } | Select-Object -First 1
  if ($match) {
    $engine = 'onecore'
    $oneCore = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $oneCore.Voice = $match
    $oneCore.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(3.0, 1.0 + $rate * 0.1))
    $oneCore.Options.AudioPitch = [Math]::Max(0.0, [Math]::Min(2.0, $pitch))
    # AsTask<TResult>(IAsyncOperation<TResult>): one type argument and one parameter. It turns the WinRT
    # speech operations into .NET tasks the script can wait for.
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
      $_.Name -eq 'AsTask' -and $_.GetGenericArguments().Length -eq 1 -and $_.GetParameters().Length -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -like 'IAsyncOperation*'
    } | Select-Object -First 1
    $name = $match.DisplayName
  } else {
    $voice = $sapiVoices | Where-Object { $_.VoiceInfo.Name -eq $wanted } | Select-Object -First 1
    if (-not $voice) { $voice = $sapiVoices | Where-Object { $_.VoiceInfo.Culture.Name.StartsWith($lang) } | Select-Object -First 1 }
    if (-not $voice) { $voice = $sapiVoices | Select-Object -First 1 }
    if ($voice) { $s.SelectVoice($voice.VoiceInfo.Name) }
    $s.Rate = $rate
    $name = $s.Voice.Name
  }
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(22050, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
}

function Render($text, $file) {
  if ($oneCore) {
    $synthesis = $asTask.MakeGenericMethod([Windows.Media.SpeechSynthesis.SpeechSynthesisStream]).Invoke($null, @($oneCore.SynthesizeTextToStreamAsync($text)))
    $stream = $synthesis.GetAwaiter().GetResult()
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    $size = [uint32]$stream.Size
    $null = $asTask.MakeGenericMethod([uint32]).Invoke($null, @($reader.LoadAsync($size))).GetAwaiter().GetResult()
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($file, $bytes)
  } else {
    $s.SetOutputToWaveFile($file, $fmt); $s.Speak($text); $s.SetOutputToNull()
  }
}

[Console]::Out.WriteLine('ready|' + $name + '|' + $engine)
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split('|', 3)
  switch ($parts[0]) {
    'render' { Render $parts[1] $parts[2]; [Console]::Out.WriteLine('rendered|' + $parts[2]) }
    'load'   { $p = New-Object System.Media.SoundPlayer($parts[2]); $p.Load(); $players[$parts[1]] = $p; [Console]::Out.WriteLine('loaded|' + $parts[1]) }
    'play'   { $p = $players[$parts[1]]; if ($p) { $p.Play(); $current = $p } }
    'stop'   { if ($current) { $current.Stop(); $current = $null } }
  }
}
`;

/**
 * The PowerShell script for a voice. The voice's name goes in an environment variable, never into the script: put in
 * as text, a name with $' or a curly quote became PowerShell code (release check 2026-10-28). The rest are numbers
 * and letters.
 */
export function speechScript(rate: number, pitch: number, locale = 'de-DE'): string {
  const language = (locale.split('-')[0] ?? 'de').replace(/[^a-zA-Z]/g, '');
  const number = (value: number, fallback: number) => String(Number.isFinite(value) ? value : fallback);
  return SCRIPT.replace('__LANG__', () => language)
    .replace('__RATE__', () => number(Math.max(-10, Math.min(10, Math.round(rate))), 0))
    .replace('__PITCH__', () => number(pitch, 1));
}

/** The environment of the speech process: the voice's name without control characters. */
export function speechEnv(voice: string): NodeJS.ProcessEnv {
  return { ...process.env, GTT_VOICE: voice.replace(/[\u0000-\u001f\u007f]/g, '') };
}

function startScript(voice: string, rate: number, pitch: number, locale = 'de-DE'): ChildProcessWithoutNullStreams {
  const script = speechScript(rate, pitch, locale);
  // Windows PowerShell 5.1 ships System.Speech and the WinRT bridge; PowerShell 7 does not.
  // Full path: never a powershell.exe that happens to be first on the PATH.
  const exe = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env: speechEnv(voice),
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  // Read always: an error output nobody reads fills its pipe and the script stops.
  child.stderr.resume();
  return child;
}

/** Listing the voices takes a few seconds at most; one that hangs is ended with what it found. */
const LIST_TIMEOUT_MS = 30_000;

/** Lists the system's voices: Windows (OneCore first, then SAPI) or macOS; none on Linux. */
export function listVoices(): Promise<VoiceInfo[]> {
  if (process.platform === 'darwin') return listMacVoices();
  if (process.platform !== 'win32') return Promise.resolve([]);
  return new Promise((resolve) => {
    const child = startScript('*list*', 0, 1);
    let output = '';
    const timer = setTimeout(() => child.kill(), LIST_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.on('error', () => resolve([]));
    child.on('exit', () => clearTimeout(timer));
    child.on('close', () => {
      resolve(
        output
          .split(/\r?\n/)
          .filter((line) => line.startsWith('voice|'))
          .map((line) => {
            const [, engine, name, language] = line.split('|');
            return { engine: engine as VoiceInfo['engine'], name: name ?? '', language: language ?? '' };
          }),
      );
    });
  });
}

/** One Windows PowerShell process running SCRIPT; answers come back line by line. */
class PowerShellProcess {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = '';
  private readonly waiters: { prefix: string; resolve: (rest: string) => void; reject: (err: Error) => void }[] = [];
  private closed = false;

  constructor(voice: string, rate: number, pitch: number, locale?: string) {
    this.child = startScript(voice, rate, pitch, locale);
    this.child.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        const index = this.waiters.findIndex((w) => line.startsWith(w.prefix));
        if (index >= 0) this.waiters.splice(index, 1)[0]!.resolve(line.slice(line.indexOf('|') + 1));
      }
    });
    // A dead process must not leave anyone waiting, nor crash the host with a write error.
    const ended = (reason: string) => {
      this.closed = true;
      for (const waiter of this.waiters.splice(0)) waiter.reject(new Error(`Speech process ${reason}`));
    };
    this.child.on('error', (err) => ended(`could not be started: ${err.message}`));
    this.child.on('exit', (code) => ended(`ended (exit code ${code})`));
    this.child.stdin.on('error', () => ended('closed its input'));
  }

  send(line: string): void {
    if (!this.closed) this.child.stdin.write(`${line}\n`, 'utf8');
  }

  get ended(): boolean {
    return this.closed;
  }

  /** The answer with this prefix; after timeoutMs (a hung voice) the process is ended and every wait fails. */
  waitFor(prefix: string, timeoutMs?: number): Promise<string> {
    if (this.closed) return Promise.reject(new Error('Speech process closed'));
    const answer = new Promise<string>((resolve, reject) => this.waiters.push({ prefix, resolve, reject }));
    if (!timeoutMs) return answer;
    const timer = setTimeout(() => this.child.kill(), timeoutMs);
    return answer.finally(() => clearTimeout(timer));
  }

  close(): void {
    if (!this.closed) this.child.stdin.end();
    this.closed = true;
  }
}

/** Starting a voice (PowerShell, the WinRT bridge) and rendering one clip: a minute is far more than either takes. */
const SPEECH_TIMEOUT_MS = 60_000;

/** Speech with a Windows voice (OneCore or SAPI), rendered to WAV files. Windows only. */
class WindowsSpeech implements ExternalRenderer {
  private constructor(
    private ps: PowerShellProcess,
    readonly name: string,
    readonly engine: 'onecore' | 'sapi',
    private readonly restart: () => PowerShellProcess,
  ) {}

  static async start(voice: string, rate: number, pitch: number, locale?: string): Promise<WindowsSpeech> {
    if (process.platform !== 'win32') throw new Error('No system voice on this platform: install a voice package (e.g. Piper) under Voices');
    const open = () => new PowerShellProcess(voice, rate, pitch, locale);
    const ps = open();
    const [name, engine] = (await ps.waitFor('ready|', SPEECH_TIMEOUT_MS)).split('|');
    return new WindowsSpeech(ps, name ?? '', engine === 'onecore' ? 'onecore' : 'sapi', open);
  }

  async render(text: string, file: string): Promise<void> {
    // A voice that hung (and was ended) starts again for the next clip, so the queue goes on.
    if (this.ps.ended) {
      this.ps = this.restart();
      await this.ps.waitFor('ready|', SPEECH_TIMEOUT_MS);
    }
    this.ps.send(`render|${text.replace(/[|\r\n]+/g, ' ')}|${file}`);
    await this.ps.waitFor('rendered|', SPEECH_TIMEOUT_MS);
  }

  close(): void {
    this.ps.close();
  }
}

/**
 * Where clips are played. The app plays them itself (Electron, the same on every platform); the console
 * tools use the system's player. One channel per voice: a new clip cuts off only the clip playing on the
 * same channel, so coach and crew can talk at the same time like before.
 */
export interface AudioOutput {
  openChannel(): AudioChannel;
}

export interface AudioChannel {
  load(name: string, file: string): Promise<void>;
  play(name: string): void;
  stop(): void;
  close(): void;
  /** Playback volume, 0 (silent) to 1 (as rendered); also for clips already playing. The console players have none. */
  setVolume?(gain: number): void;
}

/** No playback: rendering into the clip cache only (e.g. preparing another language in the background). */
export const NO_AUDIO: AudioOutput = {
  openChannel: () => ({ load: async () => undefined, play: () => undefined, stop: () => undefined, close: () => undefined }),
};

/** The system's player for the console tools: SoundPlayer (Windows), afplay (macOS), paplay or aplay (Linux). */
export const SYSTEM_AUDIO: AudioOutput = {
  openChannel: () => (process.platform === 'win32' ? new PowerShellChannel() : new CommandChannel()),
};

class PowerShellChannel implements AudioChannel {
  private readonly ps = new PowerShellProcess('*player*', 0, 1);
  private readonly ready = this.ps.waitFor('ready|');

  async load(name: string, file: string): Promise<void> {
    await this.ready;
    this.ps.send(`load|${name}|${file}`);
    await this.ps.waitFor(`loaded|${name}`);
  }

  play(name: string): void {
    this.ps.send(`play|${name}`);
  }

  stop(): void {
    this.ps.send('stop');
  }

  close(): void {
    this.ps.close();
  }
}

/** One player process per clip (macOS, Linux). */
class CommandChannel implements AudioChannel {
  private readonly files = new Map<string, string>();
  private playing: ChildProcess | undefined;

  async load(name: string, file: string): Promise<void> {
    this.files.set(name, file);
  }

  play(name: string): void {
    const file = this.files.get(name);
    const player = systemPlayer();
    if (!file || !player) return;
    this.stop();
    const child = spawn(player.command, [...player.args, file], { stdio: 'ignore' });
    child.on('error', () => undefined);
    child.on('exit', () => {
      if (this.playing === child) this.playing = undefined;
    });
    this.playing = child;
  }

  stop(): void {
    this.playing?.kill();
    this.playing = undefined;
  }

  close(): void {
    this.stop();
  }
}

let player: { command: string; args: string[] } | null | undefined;

function systemPlayer(): { command: string; args: string[] } | null {
  if (player !== undefined) return player;
  const candidates = process.platform === 'darwin' ? [{ command: 'afplay', args: [] }] : [{ command: 'paplay', args: [] }, { command: 'aplay', args: ['-q'] }];
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  player = candidates.find((c) => dirs.some((dir) => fs.existsSync(path.join(dir, c.command)))) ?? null;
  if (!player) console.error('No audio player found (install pulseaudio-utils or alsa-utils)');
  return player;
}

/**
 * A voice: renders texts to WAV clips (a Windows voice or an external engine like Piper), caches them on
 * disk and plays them on its own audio channel.
 */
export class ClipVoice implements Voice {
  readonly durations = new Map<string, number>();
  voiceName = '';
  engine: VoiceInfo['engine'] = 'sapi';
  private renderer: ExternalRenderer | undefined;
  private channel: AudioChannel | undefined;
  private rate = 0;
  private pitch = 1;
  private cacheDir = '.';
  private effect: VoiceOptions['effect'];
  private pauses: SpeechPauses = { comma: 0.5, sentence: 0.7 };
  private spoken: (text: string) => string = (text) => text;
  private recordings: RecordedVoice | undefined;
  /** Every clip prepared so far, so they can be prepared again when the recordings change. */
  private readonly texts = new Map<string, string>();
  private sentences = 0;
  /** Rendering and loading run one after another. */
  private queue: Promise<unknown> = Promise.resolve();

  private constructor() {}

  /** The recorded voice pack in use, if any. */
  get recordingPack(): string | undefined {
    return this.recordings?.packId;
  }

  /** Starts the engine and prepares all clips (cached on disk by text, voice, rate, pitch, pauses and effect). */
  static async create(clips: Record<string, string>, cacheDir: string, options: VoiceOptions = {}): Promise<{ voice: ClipVoice; voiceName: string }> {
    const voice = new ClipVoice();
    voice.rate = options.rate ?? 0;
    voice.pitch = options.pitch ?? 1;
    voice.cacheDir = cacheDir;
    voice.effect = options.effect;
    if (options.pauses) voice.pauses = options.pauses;
    if (options.spoken) voice.spoken = options.spoken;
    voice.recordings = options.recordings;
    try {
      if (options.external) {
        voice.renderer = options.external.renderer;
        voice.engine = options.external.engine;
        voice.voiceName = options.external.name;
      } else {
        const speech = await WindowsSpeech.start(options.voice ?? '', voice.rate, voice.pitch, options.locale);
        voice.renderer = speech;
        voice.engine = speech.engine;
        voice.voiceName = speech.name;
      }
      voice.channel = (options.output ?? SYSTEM_AUDIO).openChannel();
      fs.mkdirSync(cacheDir, { recursive: true });
      for (const [clip, wav] of Object.entries(options.sounds ?? {})) await voice.loadWav(clip, wav);
      const entries = Object.entries(clips);
      for (const [i, [clip, text]] of entries.entries()) {
        await voice.prepare(clip, text);
        options.onProgress?.(i + 1, entries.length);
      }
    } catch (err) {
      voice.close();
      throw err;
    }
    return { voice, voiceName: voice.voiceName };
  }

  /** Renders (or takes from the cache) a spoken clip and loads it. Resolves with its length in seconds. */
  prepare(name: string, text: string): Promise<number> {
    this.texts.set(name, text);
    return this.enqueue(async () => {
      const plan = this.recordings?.plan(text);
      let file: string | undefined;
      if (plan) {
        try {
          file = await this.composed(plan, splitAddress(text, this.pauses.address?.name));
        } catch {
          // A recording that cannot be read: the voice says the whole text.
        }
      }
      return this.load(name, file ?? (await this.rendered(text)));
    });
  }

  /** The driver's name or its pauses changed: every clip that starts with the name is prepared again. */
  setAddress(address: AddressPauses | undefined): Promise<void> {
    this.pauses = { ...this.pauses, address };
    return Promise.all([...this.texts].map(([name, text]) => this.prepare(name, text).catch(() => 0))).then(() => undefined);
  }

  /** Part of the cache key of a clip that starts with the name. */
  private addressKey(): string {
    const a = this.pauses.address;
    return a ? `address ${a.name}~${a.before}/${a.after}/${a.slower}|` : '';
  }

  /**
   * Uses other recordings from now on (a take was added, the pack or the name changed) and prepares every
   * clip again. Clips that did not change come from the cache.
   */
  setRecordings(recordings: RecordedVoice | undefined): Promise<void> {
    this.recordings = recordings;
    return Promise.all([...this.texts].map(([name, text]) => this.prepare(name, text).catch(() => 0))).then(() => undefined);
  }

  private styleKey(): string {
    return `${CLIP_CACHE_VERSION}|${this.engine}|${this.voiceName}|${this.rate}|${this.pitch}|${this.pauses.comma}/${this.pauses.sentence}|${this.effect ?? ''}`;
  }

  private cacheFile(key: string): string {
    return path.resolve(this.cacheDir, `${crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)}.wav`);
  }

  /** A text spoken by the voice (cached by text, voice, rate, pitch, pauses and effect). */
  private async rendered(text: string): Promise<string> {
    const address = splitAddress(text, this.pauses.address?.name);
    const spoken = this.spoken(text);
    const file = this.cacheFile(`${this.styleKey()}|${address ? this.addressKey() : ''}${spoken}`);
    if (!fs.existsSync(file)) {
      const speech = (address && (await this.addressed(address, file))) || (await this.speech(spoken, file));
      writeClip(file, this.effect === 'radio' ? radioFilter(speech) : speech);
    }
    return file;
  }

  /**
   * "<pause> Maldö: <pause pause> Referenz geladen." (the user, 2026-10-21): the name on its own, with a colon,
   * so the pauses can go around it. Measured with Piper (Ramona): "Maldö!" alone came out higher than "Maldö:",
   * and within the sentence the engine leaves no pause after the name. Undefined if the parts cannot be joined.
   */
  private async addressed(address: { name: string; rest: string }, file: string): Promise<Buffer | undefined> {
    const pauses = this.pauses.address!;
    const name = await this.nameSpeech(address.name, partFile(file, 'name'));
    const rest = await this.speech(this.spoken(address.rest), partFile(file, 'rest'));
    const joined = joinWithPauses([name, rest], [pauses.after]);
    return joined && withLeadingSilence(joined, pauses.before);
  }

  /**
   * Recordings and sentences of the voice, joined with the voice's pauses. Recordings keep their own
   * pitch and speed; the radio filter goes over all of it. Cached by the recordings' files (a new take has
   * a new file) and the texts the voice speaks.
   */
  private async composed(plan: Segment[], address?: { name: string }): Promise<string> {
    const parts = plan.map((s) => (s.kind === 'recording' ? `@${path.basename(s.file)}` : this.spoken(s.text)));
    // The name is the first segment (not left out): the address pauses go around it.
    const named = !!address && plan.length > 1 && plan[0]!.text.replace(/[!,.:;]+$/u, '') === address.name;
    const file = this.cacheFile(`${this.styleKey()}|recorded|${named ? this.addressKey() : ''}${plan.map((s, i) => `${parts[i]}~${s.pause}${s.words}`).join('|')}`);
    if (!fs.existsSync(file)) {
      const clips: Buffer[] = [];
      for (const [i, segment] of plan.entries()) {
        // A name the pack lacks is said by the voice as in addressed().
        const audio =
          segment.kind === 'recording'
            ? fs.readFileSync(segment.file)
            : named && i === 0
              ? await this.nameSpeech(address.name, partFile(file, String(i)))
              : await this.speech(parts[i]!, partFile(file, String(i)));
        clips.push(toMonoWav(audio, RECORDING_RATE));
      }
      const gaps = plan.slice(0, -1).map((segment, i) => {
        if (named && i === 0) return this.pauses.address!.after;
        if (segment.pause === 'sentence') return this.pauses.sentence;
        if (segment.pause === 'comma') {
          const next = plan[i + 1]!;
          return segment.words >= MIN_WORDS_FOR_COMMA_PAUSE && next.words >= MIN_WORDS_FOR_COMMA_PAUSE ? this.pauses.comma : SHORT_COMMA_SECONDS;
        }
        return WORD_GAP_SECONDS;
      });
      const all = joinWithPauses(clips, gaps) ?? fail('Recordings could not be joined');
      const joined = named ? withLeadingSilence(all, this.pauses.address!.before) : all;
      writeClip(file, this.effect === 'radio' ? radioFilter(joined) : joined);
    }
    return file;
  }

  /**
   * The driver's name on its own with a colon ("Maldö:"), slower than the rest where the engine can (Piper, sherpa-onnx):
   * Piper said "Maldö" alone in about 0.2 s, "zu kurz und zu schnell" (the user, 2026-10-22).
   */
  private async nameSpeech(name: string, file: string): Promise<Buffer> {
    const text = `${this.spoken(name)}:`;
    if (!this.renderer?.renderName) return this.speech(text, file);
    const raw = `${file}.raw.wav`;
    const renderName = this.renderer.renderName.bind(this.renderer);
    const clip = trimSilence(await rawClip(raw, () => renderName(engineText(text), raw, this.pauses.address?.slower ?? 1)));
    return withPlaybackRate(clip, this.pitch);
  }

  /** The voice speaks a text: every part on its own, joined with fixed pauses, at the voice's pitch. */
  private async speech(spoken: string, file: string): Promise<Buffer> {
    // Every part on its own, joined with fixed pauses: the engines' own pause after a comma varies a lot
    // (120 to 470 ms for the same text). sherpa-onnx starts a process per text and keeps its own pauses.
    const parts = this.engine === 'sherpa' ? [{ text: withFinalMark(spoken), end: 'none' as const }] : speechParts(spoken);
    const rendered: Buffer[] = [];
    for (const [i, part] of parts.entries()) {
      const raw = partFile(file, `${i}.raw.wav`);
      rendered.push(trimSilence(await rawClip(raw, () => this.renderRaw(part.text, raw))));
    }
    const pauses = parts.map((p) => (p.end === 'comma' ? this.pauses.comma : p.end === 'sentence' ? this.pauses.sentence : 0));
    let joined = joinWithPauses(rendered, pauses);
    if (!joined) {
      // Unexpected audio format: the whole text in one go.
      const raw = partFile(file, 'raw.wav');
      joined = trimSilence(await rawClip(raw, () => this.renderRaw(withFinalMark(spoken), raw)));
    }
    // OneCore voices change pitch themselves; SAPI and Piper voices get it by faster playback.
    return this.engine === 'onecore' ? joined : withPlaybackRate(joined, this.pitch);
  }

  private async renderRaw(text: string, raw: string): Promise<void> {
    if (!this.renderer) throw new Error('Voice closed');
    await this.renderer.render(engineText(text), raw);
  }

  /** Loads a generated sound (e.g. a tone) as clip. */
  loadWav(name: string, wav: Buffer): Promise<number> {
    return this.enqueue(async () => {
      const hash = crypto.createHash('sha256').update(wav).digest('hex').slice(0, 16);
      const file = path.resolve(this.cacheDir, `sound-${hash}.wav`);
      if (!fs.existsSync(file)) writeClip(file, wav);
      return this.load(name, file);
    });
  }

  private async load(name: string, file: string): Promise<number> {
    const seconds = wavDuration(fs.readFileSync(file));
    this.durations.set(name, seconds);
    await this.channel?.load(name, file);
    return seconds;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  play(clip: string): void {
    this.channel?.play(clip);
  }

  stop(): void {
    this.channel?.stop();
  }

  /** Sentences go through the same clip path, so they sound like the cues (same pitch). */
  say(text: string): void {
    const name = `say-${this.sentences++ % 20}`;
    this.prepare(name, text).then(
      () => this.play(name),
      () => undefined,
    );
  }

  close(): void {
    this.renderer?.close();
    this.renderer = undefined;
    this.channel?.close();
    this.channel = undefined;
  }
}

/** A short rising two-note chime as attention signal (16-bit PCM mono WAV). */
export function attentionTone(sampleRate = 22050): Buffer {
  const notes = [
    { hz: 880, seconds: 0.09 },
    { hz: 1320, seconds: 0.13 },
  ];
  const samples: number[] = [];
  for (const { hz, seconds } of notes) {
    const count = Math.round(sampleRate * seconds);
    const fade = Math.round(sampleRate * 0.008);
    for (let i = 0; i < count; i++) {
      const envelope = Math.min(1, i / fade, (count - i) / fade);
      samples.push(Math.round(Math.sin((2 * Math.PI * hz * i) / sampleRate) * envelope * 0.45 * 32767));
    }
  }
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(value, i * 2));
  return wavFile(data, sampleRate);
}

/**
 * Team radio: a squelch burst when the button is pressed and released, band-limited speech (320 to 3000 Hz),
 * slightly overdriven, with a little hiss. For 16-bit mono clips; others are returned unchanged.
 */
export function radioFilter(buffer: Buffer): Buffer {
  const wav = parseWav(buffer);
  if (wav.bitsPerSample !== 16 || wav.channels !== 1) return buffer;
  const rate = wav.sampleRate;
  const speech = wav.dataLength / 2;
  const pre = Math.round(rate * 0.07);
  const post = Math.round(rate * 0.09);
  const signal = new Float32Array(pre + speech + post);
  const noise = () => Math.random() * 2 - 1;
  for (let i = 0; i < pre; i++) signal[i] = noise() * 0.3 * Math.min(1, (pre - i) / (pre * 0.4));
  for (let i = 0; i < speech; i++) signal[pre + i] = buffer.readInt16LE(wav.dataStart + i * 2) / 32768 + noise() * 0.012;
  for (let i = 0; i < post; i++) signal[pre + speech + i] = noise() * 0.35 * Math.min(1, (post - i) / (post * 0.6));

  // Two high-pass and two low-pass stages (24 dB per octave each side).
  const high = biquad('highpass', 320, rate);
  const low = biquad('lowpass', Math.min(3000, rate * 0.45), rate);
  let out = applyBiquad(applyBiquad(applyBiquad(applyBiquad(signal, high), high), low), low);
  const drive = 2.4;
  const norm = Math.tanh(drive);
  out = out.map((v) => Math.tanh(v * drive) / norm);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? 0.9 / peak : 1;
  const data = Buffer.alloc(out.length * 2);
  out.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * gain * 32767))), i * 2));
  return wavFile(data, rate);
}

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Second-order filter (Robert Bristow-Johnson's cookbook), Q = 1/sqrt(2). */
function biquad(type: 'lowpass' | 'highpass', frequency: number, rate: number): Biquad {
  const w = (2 * Math.PI * frequency) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const a0 = 1 + alpha;
  const [b0, b1, b2] = type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

function applyBiquad(x: Float32Array, c: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    y[i] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return y;
}

export interface SpeechPauses {
  comma: number;
  sentence: number;
  /** The driver's name at the start of a sentence, with its pauses (none: no name). */
  address?: AddressPauses;
}

/** "<pause> Maldö: <pause pause> Referenz geladen." (the user, 2026-10-21; docs/dev/voices.md). */
export interface AddressPauses {
  name: string;
  /** Seconds of silence before the name. */
  before: number;
  /** Seconds of silence between the name and the sentence. */
  after: number;
  /** How much slower the name is spoken than the rest (Piper and sherpa-onnx voices). */
  slower: number;
}

/**
 * A text that starts with the driver's name ("Maldö! Referenz geladen."): the name and the rest. The name must
 * be a whole word ("Max" is not in "Maximilian").
 */
export function splitAddress(text: string, name: string | undefined): { name: string; rest: string } | undefined {
  const trimmed = text.trim();
  if (!name || !trimmed.startsWith(name)) return undefined;
  const rest = /^[!,.:;]?\s+(\S[\s\S]*)$/u.exec(trimmed.slice(name.length))?.[1];
  return rest ? { name, rest } : undefined;
}

/** A text without a final mark gets a period, so it sounds finished ("drei" alone sounded cut off). */
export function withFinalMark(text: string): string {
  const trimmed = text.trim();
  return /[.!?,;:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** A comma gets its own pause only between parts of at least this many words. */
const MIN_WORDS_FOR_COMMA_PAUSE = 3;

/**
 * Splits a text after sentence ends and commas; the mark stays with its part, so the intonation fits
 * ("Rein im ersten Gang," goes on, "Curb außen voll." ends). "1,7" has no space and stays together.
 * Short pieces stay with their neighbours: a name or "ja?" spoken alone came out clipped or oddly
 * stressed ("Maö", "Maldö!").
 */
export function speechParts(text: string): { text: string; end: 'comma' | 'sentence' | 'none' }[] {
  const pieces = withFinalMark(text)
    .split(/(?<=[,;:.!?])\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const words = (piece: string) => piece.split(/\s+/).length;
  const parts: { text: string; end: 'comma' | 'sentence' | 'none' }[] = [];
  let current = '';
  for (const [i, piece] of pieces.entries()) {
    current = current ? `${current} ${piece}` : piece;
    const next = pieces[i + 1];
    if (next === undefined) parts.push({ text: current, end: 'none' });
    else if (/[.!?]$/.test(piece)) parts.push({ text: current, end: 'sentence' });
    else if (words(current) >= MIN_WORDS_FOR_COMMA_PAUSE && words(next) >= MIN_WORDS_FOR_COMMA_PAUSE) parts.push({ text: current, end: 'comma' });
    else continue;
    current = '';
  }
  return parts;
}
