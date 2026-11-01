// WAV files as the voices and recordings use them: 16-bit PCM, mono. No dependencies.

export interface Wav {
  /** 1 = PCM. */
  format: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataStart: number;
  dataLength: number;
}

/** A 16-bit PCM mono WAV file around the samples. */
export function wavFile(data: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function parseWav(buffer: Buffer): Wav {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let pos = 12;
  let fmt: Omit<Wav, 'dataStart' | 'dataLength'> | undefined;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ' && pos + 24 <= buffer.length) {
      fmt = { format: buffer.readUInt16LE(pos + 8), channels: buffer.readUInt16LE(pos + 10), sampleRate: buffer.readUInt32LE(pos + 12), bitsPerSample: buffer.readUInt16LE(pos + 22) };
      // A broken header (sample rate 0) gave an endless duration, and every timer that waits for a clip misfired
      // (release check 2026-10-28).
      const { channels, sampleRate, bitsPerSample } = fmt;
      if (channels < 1 || channels > 8 || sampleRate < 1000 || sampleRate > 384_000 || bitsPerSample < 8 || bitsPerSample > 32 || bitsPerSample % 8) {
        throw new Error(`Unsupported WAV header (${sampleRate} Hz, ${bitsPerSample} bit, ${channels} channels)`);
      }
    } else if (id === 'data' && fmt) {
      // Whole frames only: an odd byte at the end made the sample readers run past the data.
      const frame = fmt.channels * (fmt.bitsPerSample / 8);
      const length = Math.min(size, buffer.length - pos - 8);
      return { ...fmt, dataStart: pos + 8, dataLength: length - (length % frame) };
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('WAV without fmt/data chunk');
}

export function wavDuration(buffer: Buffer): number {
  const wav = parseWav(buffer);
  return wav.dataLength / (wav.sampleRate * wav.channels * (wav.bitsPerSample / 8));
}

/** Plays a WAV faster (and higher) by raising the sample rate in its header. */
export function withPlaybackRate(buffer: Buffer, factor: number): Buffer {
  if (factor === 1 || !(factor > 0)) return buffer;
  const wav = parseWav(buffer);
  return wavFile(buffer.subarray(wav.dataStart, wav.dataStart + wav.dataLength), Math.round(wav.sampleRate * factor));
}

/** The samples of a 16-bit PCM WAV as -1..1, mixed down to mono. Throws for other formats. */
export function monoSamples(buffer: Buffer): { samples: Float32Array; sampleRate: number } {
  const wav = parseWav(buffer);
  // 0xFFFE: WAVE_FORMAT_EXTENSIBLE, as some engines write plain PCM.
  if ((wav.format !== 1 && wav.format !== 0xfffe) || wav.bitsPerSample !== 16 || wav.channels < 1 || wav.channels > 8) {
    throw new Error(`Unsupported WAV format (${wav.bitsPerSample} bit, ${wav.channels} channels)`);
  }
  if (wav.sampleRate < 4000 || wav.sampleRate > 192_000) throw new Error(`Unsupported sample rate ${wav.sampleRate}`);
  const frames = Math.floor(wav.dataLength / (2 * wav.channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < wav.channels; c++) sum += buffer.readInt16LE(wav.dataStart + (i * wav.channels + c) * 2);
    samples[i] = sum / wav.channels / 32768;
  }
  return { samples, sampleRate: wav.sampleRate };
}

/** -1..1 samples as a 16-bit PCM mono WAV. */
export function samplesToWav(samples: Float32Array, sampleRate: number): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  return wavFile(data, sampleRate);
}

/** A 16-bit clip made louder or softer as a whole, to the given peak (0..1), as mono at its rate; silence stays. */
export function withPeak(buffer: Buffer, peak: number): Buffer {
  const { samples, sampleRate } = monoSamples(buffer);
  let max = 0;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  if (max < 1e-4) return buffer;
  const gain = peak / max;
  return samplesToWav(
    samples.map((v) => v * gain),
    sampleRate,
  );
}

/**
 * The samples at another sample rate (linear interpolation). Good enough for speech: the voices are joined
 * at the recordings' rate, so engines mostly go up (16 or 22.05 kHz to 24 kHz).
 */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(length);
  const step = from / to;
  for (let i = 0; i < length; i++) {
    const at = i * step;
    const index = Math.floor(at);
    const a = samples[Math.min(index, samples.length - 1)] ?? 0;
    const b = samples[Math.min(index + 1, samples.length - 1)] ?? 0;
    out[i] = a + (b - a) * (at - index);
  }
  return out;
}

/** Any 16-bit PCM WAV as mono WAV at the given rate. */
export function toMonoWav(buffer: Buffer, sampleRate: number): Buffer {
  const { samples, sampleRate: from } = monoSamples(buffer);
  return samplesToWav(resample(samples, from, sampleRate), sampleRate);
}

/** Joins mono 16-bit clips with silence between them; undefined if the formats do not match. */
export function joinWithPauses(clips: Buffer[], pauses: number[]): Buffer | undefined {
  if (clips.length === 1) return clips[0];
  const wavs = clips.map(parseWav);
  const rate = wavs[0]!.sampleRate;
  if (wavs.some((w) => w.sampleRate !== rate || w.channels !== 1 || w.bitsPerSample !== 16)) return undefined;
  const chunks: Buffer[] = [];
  wavs.forEach((wav, i) => {
    chunks.push(clips[i]!.subarray(wav.dataStart, wav.dataStart + wav.dataLength));
    if (i < wavs.length - 1) chunks.push(silence(rate, pauses[i] ?? 0));
  });
  return wavFile(Buffer.concat(chunks), rate);
}

/** Pauses longer than this are cut: a pause is a breath, not a wait. */
const MAX_PAUSE_SECONDS = 10;

/** 16-bit mono silence; a negative or missing length is none. */
function silence(rate: number, seconds: number): Buffer {
  return Buffer.alloc(seconds > 0 ? Math.round(rate * Math.min(seconds, MAX_PAUSE_SECONDS)) * 2 : 0);
}

/** Silence in front of a mono 16-bit clip (before the driver's name); other formats stay as they are. */
export function withLeadingSilence(buffer: Buffer, seconds: number): Buffer {
  const wav = parseWav(buffer);
  if (!(seconds > 0) || wav.channels !== 1 || wav.bitsPerSample !== 16) return buffer;
  return wavFile(Buffer.concat([silence(wav.sampleRate, seconds), buffer.subarray(wav.dataStart, wav.dataStart + wav.dataLength)]), wav.sampleRate);
}

/**
 * Cuts leading and trailing silence, keeping soft starts ("M", "F", "S") and the fading end; short fades
 * in and out, so a clip never clicks. Thresholds are relative to the clip's peak: some voices fade out
 * with breath noise.
 */
export function trimSilence(buffer: Buffer, minThreshold = 200, startThreshold = 0.015, endThreshold = 0.015): Buffer {
  const wav = parseWav(buffer);
  if (wav.bitsPerSample !== 16 || wav.channels !== 1) return buffer;
  const samples = wav.dataLength / 2;
  const at = (i: number) => Math.abs(buffer.readInt16LE(wav.dataStart + i * 2));
  let peak = 0;
  for (let i = 0; i < samples; i++) peak = Math.max(peak, at(i));
  const threshold = Math.max(minThreshold, peak * startThreshold);
  let first = 0;
  while (first < samples && at(first) < threshold) first++;
  const endLevel = Math.max(minThreshold / 2, peak * endThreshold);
  let last = samples - 1;
  while (last > first && at(last) < endLevel) last--;
  const start = Math.max(0, first - Math.round(wav.sampleRate * 0.03));
  const end = Math.min(samples, last + Math.round(wav.sampleRate * 0.06));
  const data = Buffer.from(buffer.subarray(wav.dataStart + start * 2, wav.dataStart + end * 2));
  // Short fade in (5 ms) and out (30 ms).
  const count = data.length / 2;
  const fadeIn = Math.min(count, Math.round(wav.sampleRate * 0.005));
  const fadeOut = Math.min(count, Math.round(wav.sampleRate * 0.03));
  for (let i = 0; i < fadeIn; i++) data.writeInt16LE(Math.round(data.readInt16LE(i * 2) * (i / fadeIn)), i * 2);
  for (let i = 0; i < fadeOut; i++) {
    const at = count - 1 - i;
    data.writeInt16LE(Math.round(data.readInt16LE(at * 2) * (i / fadeOut)), at * 2);
  }
  return wavFile(data, wav.sampleRate);
}
