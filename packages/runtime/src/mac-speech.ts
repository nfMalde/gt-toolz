// macOS voices (the user, 2026-10-24: on the Mac both the system voices and the neural ones): the voices of
// System Settings → Accessibility → Spoken Content, through /usr/bin/say. One process per clip, the text on stdin
// (never on the command line), written as 16-bit WAV. No download, no network.

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { RENDER_TIMEOUT_MS } from './piper';
import type { ExternalRenderer, VoiceInfo } from './voice';

const SAY = '/usr/bin/say';

/** Words per minute at rate 0; macOS speaks at about 175 to 200. */
const BASE_WPM = 185;

/** Sound effects and joke voices: not for a coach. */
const NOVELTY = new Set(['Albert', 'Bad News', 'Bahh', 'Bells', 'Boing', 'Bubbles', 'Cellos', 'Deranged', 'Good News', 'Hysterical', 'Jester', 'Organ', 'Pipe Organ', 'Superstar', 'Trinoids', 'Whisper', 'Wobble', 'Zarvox']);

/**
 * The installed voices, as `say -v '?'` lists them: "Anna (Premium)    de_DE    # Hallo, ich heiße Anna."
 * Premium and Enhanced voices first (the user can add them in System Settings); none on other platforms.
 */
export function listMacVoices(): Promise<VoiceInfo[]> {
  if (process.platform !== 'darwin') return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile(SAY, ['-v', '?'], { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([]);
      resolve(parseMacVoices(stdout));
    });
  });
}

export function parseMacVoices(listing: string): VoiceInfo[] {
  const quality = (name: string) => (/\((Premium)\)/i.test(name) ? 0 : /\((Enhanced|Erweitert)\)/i.test(name) ? 1 : 2);
  return listing
    .split(/\r?\n/)
    .map((line) => /^(.+?)\s+([a-z]{2,3})[_-]([A-Za-z0-9]{2,4})\s+#/.exec(line))
    .filter((m): m is RegExpExecArray => !!m && !NOVELTY.has(m[1]!.trim()))
    .map((m) => ({ engine: 'macos' as const, name: m[1]!.trim(), language: `${m[2]}-${m[3]}` }))
    .sort((a, b) => quality(a.name) - quality(b.name));
}

/** Renders with one macOS voice. lengthScale: speaking time, 1 = normal (as Piper's), 1.25 = slower. */
export class MacSpeech implements ExternalRenderer {
  /** Clips being rendered: ended with the voice. */
  private readonly running = new Set<ChildProcess>();

  constructor(
    readonly name: string,
    private readonly lengthScale = 1,
  ) {}

  render(text: string, outputFile: string): Promise<void> {
    return this.say(text, outputFile, Math.round(BASE_WPM / this.lengthScale));
  }

  renderName(text: string, outputFile: string, slower: number): Promise<void> {
    return this.say(text, outputFile, Math.round(BASE_WPM / (this.lengthScale * slower)));
  }

  close(): void {
    for (const child of this.running) child.kill();
    this.running.clear();
  }

  private say(text: string, outputFile: string, wpm: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = ['-v', this.name, '-r', String(Math.max(80, Math.min(400, wpm))), '-o', outputFile, '--file-format=WAVE', '--data-format=LEI16@22050', '-f', '-'];
      const child = spawn(SAY, args, { stdio: ['pipe', 'ignore', 'pipe'] });
      this.running.add(child);
      // A clip that takes a minute has hung: it is ended, the next one starts a new `say` (release check 2026-10-28).
      const timer = setTimeout(() => child.kill(), RENDER_TIMEOUT_MS);
      let error = '';
      child.stderr.on('data', (chunk: Buffer) => (error = (error + chunk.toString('utf8')).slice(-2048)));
      child.on('error', (err) => reject(new Error(`macOS speech could not be started: ${err.message}`)));
      child.on('close', (code, signal) => {
        clearTimeout(timer);
        this.running.delete(child);
        if (code === 0) resolve();
        else reject(new Error(`macOS speech failed (${signal ? `ended by ${signal}` : `exit code ${code}`}): ${error.trim()}`));
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(text, 'utf8');
    });
  }
}
