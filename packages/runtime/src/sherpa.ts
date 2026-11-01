// sherpa-onnx (Apache-2.0) with VITS models: CSS10 German (from ReadMyChat) and, on macOS, the Piper voices as
// sherpa-onnx packages them (Piper's own macOS build does not start, rhasspy/piper#404). Runs as a separate program
// per clip: the engine contains espeak-ng (GPL), so GT Toolz never loads it into its own process. (Kokoro models
// were run here too until the audit of 2026-10-24 removed them: training data of unknown origin.)

import { execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { commonDir, enginePath, RENDER_TIMEOUT_MS, withLibraryPath, type PiperInference } from './piper';
import { withPeak } from './wav';

/**
 * sherpa-onnx writes its clips as they come out of the model, about 11 dB quieter than Piper, which brings every
 * sentence to full scale (alpha 0.0.4: Jan through sherpa-onnx peaked at 0.28, through Piper at 1.0). The clips are
 * brought to this peak, so a voice sounds as loud on the Mac as on Windows.
 */
const PEAK = 0.95;

/**
 * The model kinds sherpa-onnx gets from the voice catalogue: 'vits' reads characters (CSS10: model.onnx and
 * tokens.txt); 'piper' reads phonemes from espeak-ng, whose data comes with the model (espeak-ng-data).
 */
export type SherpaFormat = 'vits' | 'piper';

/** Where a model's files are. file: the .onnx file, model.onnx unless the catalogue names another. */
export interface SherpaModel {
  dir: string;
  format: SherpaFormat;
  file?: string;
  /** A Piper model's settings, as Piper gets them (Jan: noiseW 0, phoneme lengths without randomness). */
  inference?: PiperInference;
}

/**
 * The text as an argument the engine reads intact. On Windows the command line arrives in the ANSI code page, where a
 * fullwidth quote (U+FF02) became a plain one and split the text, so sherpa-onnx ended with an error (release check
 * 2026-10-28): compatibility forms are folded (NFKC) and only letters, digits, spaces and plain punctuation remain.
 * Lone surrogates (a name cut in half) go too.
 */
export function sherpaText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[^\p{L}\p{M}\p{N}\s.,!?;:'()\-–—…%°/]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The command line for one clip. The text goes after a lone "--": sherpa-onnx reads every argument starting with "--"
 * before it as an option, so a text that starts with "--" (a driver's name typed that way) is never taken as one.
 * base: the folder sherpa-onnx runs in (enginePath); paths below it go relative.
 */
export function sherpaArgs(model: SherpaModel, options: { sid: number; lengthScale: number; outputFile: string; base?: string }, text: string): string[] {
  const at = (target: string) => (options.base ? enginePath(options.base, path.resolve(target)) : target);
  return [
    `--vits-model=${at(path.join(model.dir, model.file ?? 'model.onnx'))}`,
    `--vits-tokens=${at(path.join(model.dir, 'tokens.txt'))}`,
    ...(model.format === 'piper' ? [`--vits-data-dir=${at(path.join(model.dir, 'espeak-ng-data'))}`] : []),
    `--vits-length-scale=${options.lengthScale}`,
    ...(model.inference?.noiseScale !== undefined ? [`--vits-noise-scale=${model.inference.noiseScale}`] : []),
    ...(model.inference?.noiseW !== undefined ? [`--vits-noise-scale-w=${model.inference.noiseW}`] : []),
    `--sid=${options.sid}`,
    '--num-threads=4',
    `--output-filename=${at(options.outputFile)}`,
    '--',
    sherpaText(text),
  ];
}

export class SherpaRenderer {
  private readonly exe: string;
  private readonly model: SherpaModel;
  private readonly base: string;
  /** Clips being rendered: ended with the voice (its files must be free for removing the package). */
  private readonly running = new Set<ChildProcess>();

  /** lengthScale: > 1 speaks slower, < 1 faster. base: the folder the engine runs in (the data folder, enginePath). */
  constructor(
    exe: string,
    model: SherpaModel,
    private readonly sid: number,
    private readonly lengthScale = 1,
    base?: string,
  ) {
    this.exe = path.resolve(exe);
    this.model = { ...model, dir: path.resolve(model.dir) };
    this.base = path.resolve(base ?? commonDir(path.dirname(this.exe), this.model.dir));
  }

  render(text: string, outputFile: string, lengthScale = this.lengthScale, model = this.model): Promise<void> {
    const windows = process.platform === 'win32';
    const args = sherpaArgs(model, { sid: this.sid, lengthScale, outputFile: path.resolve(outputFile), base: windows ? this.base : undefined }, text);
    return new Promise((resolve, reject) => {
      // A clip that takes a minute has hung: it is killed, and the next clip starts a new process anyway.
      const child = execFile(
        this.exe,
        args,
        { cwd: windows ? this.base : path.dirname(this.exe), env: withLibraryPath(path.join(path.dirname(this.exe), '..', 'lib')), windowsHide: true, timeout: RENDER_TIMEOUT_MS },
        (err) => {
          this.running.delete(child);
          if (err) return reject(err);
          try {
            fs.writeFileSync(outputFile, withPeak(fs.readFileSync(outputFile), PEAK));
            resolve();
          } catch (normalizeErr) {
            reject(normalizeErr as Error);
          }
        },
      );
      this.running.add(child);
    });
  }

  /** The driver's name alone, slower by the factor (docs/dev/voices.md). */
  renderName(text: string, outputFile: string, slower: number): Promise<void> {
    // Fixed phoneme lengths, as Piper's name renderer has them (noise_w 0): stretched three times with the random
    // ones, a name came out as "Aaaaaanjaaaa" and noise on the Mac (the user, 2026-10-29; "Anja" took 0.95 to 1.59 s,
    // now always 1.01 s).
    return this.render(text, outputFile, this.lengthScale * slower, { ...this.model, inference: { ...this.model.inference, noiseW: 0 } });
  }

  close(): void {
    for (const child of this.running) child.kill();
    this.running.clear();
  }
}
