// A Piper voice for sherpa-onnx, put together on the user's computer from the original Piper files (the user,
// 2026-10-28: Jan, the male German voice, on the Mac too; Piper's own macOS build does not start, and sherpa-onnx
// packages no MLS voice). sherpa-onnx needs two things Piper's files do not have, made here as its own conversion
// makes them: tokens.txt from the model's phoneme table, and the model's settings as ONNX metadata in the .onnx file.

import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic } from './atomic-file';

/** What a Piper voice's .onnx.json holds, as far as sherpa-onnx needs it. */
export interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  language?: { name_english?: string };
  num_speakers: number;
  phoneme_id_map: Record<string, number[]>;
}

/** ModelProto field 14: metadata_props, repeated key/value pairs (onnx.proto). */
const METADATA_FIELD = 14;

/** tokens.txt as sherpa-onnx reads it: one "symbol id" per line, in the order of the phoneme table. */
export function piperTokens(config: PiperConfig): string {
  return Object.entries(config.phoneme_id_map)
    .map(([symbol, ids]) => `${symbol} ${ids[0]}\n`)
    .join('');
}

/** The settings sherpa-onnx reads from a Piper model's metadata. */
export function piperMetadata(config: PiperConfig): Record<string, string> {
  return {
    model_type: 'vits',
    comment: 'piper',
    language: config.language?.name_english ?? '',
    voice: config.espeak.voice,
    has_espeak: '1',
    n_speakers: String(config.num_speakers),
    sample_rate: String(config.audio.sample_rate),
  };
}

function varint(value: number): Buffer {
  const bytes: number[] = [];
  let rest = value;
  while (rest >= 0x80) {
    bytes.push((rest % 0x80) | 0x80);
    rest = Math.floor(rest / 0x80);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

function field(number: number, data: Buffer): Buffer {
  return Buffer.concat([varint((number << 3) | 2), varint(data.length), data]);
}

/**
 * The model with metadata entries added. A protobuf message may be continued at its end, and repeated fields
 * there are added to the ones before: so the model itself stays byte for byte as it was.
 */
export function withOnnxMetadata(model: Buffer, metadata: Record<string, string>): Buffer {
  const entries = Object.entries(metadata).map(([key, value]) =>
    field(METADATA_FIELD, Buffer.concat([field(1, Buffer.from(key, 'utf8')), field(2, Buffer.from(value, 'utf8'))])),
  );
  return Buffer.concat([model, ...entries]);
}

/** The metadata entries of an ONNX model (its top level only; the graph is skipped, not read). */
export function readOnnxMetadata(model: Buffer): Record<string, string> {
  const metadata: Record<string, string> = {};
  let at = 0;
  const readVarint = (buffer: Buffer): number => {
    let value = 0;
    let scale = 1;
    for (;;) {
      if (at >= buffer.length) throw new Error('Not an ONNX model (truncated)');
      const byte = buffer[at++]!;
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) return value;
      scale *= 0x80;
    }
  };
  const entry = (bytes: Buffer): [string, string] => {
    const saved = at;
    at = 0;
    let key = '';
    let value = '';
    while (at < bytes.length) {
      const tag = readVarint(bytes);
      const length = readVarint(bytes);
      const text = bytes.toString('utf8', at, at + length);
      at += length;
      if (tag === ((1 << 3) | 2)) key = text;
      if (tag === ((2 << 3) | 2)) value = text;
    }
    at = saved;
    return [key, value];
  };
  while (at < model.length) {
    const tag = readVarint(model);
    const wire = tag & 7;
    if (wire === 0) readVarint(model);
    else if (wire === 1) at += 8;
    else if (wire === 5) at += 4;
    else if (wire === 2) {
      const length = readVarint(model);
      if (tag >>> 3 === METADATA_FIELD) {
        const [key, value] = entry(model.subarray(at, at + length));
        metadata[key] = value;
      }
      at += length;
    } else throw new Error(`Not an ONNX model (wire type ${wire})`);
  }
  return metadata;
}

function isPiperConfig(value: unknown): value is PiperConfig {
  const config = value as Partial<PiperConfig>;
  return (
    !!config &&
    typeof config.audio?.sample_rate === 'number' &&
    typeof config.espeak?.voice === 'string' &&
    typeof config.num_speakers === 'number' &&
    !!config.phoneme_id_map &&
    typeof config.phoneme_id_map === 'object' &&
    Object.values(config.phoneme_id_map).every((ids) => Array.isArray(ids) && Number.isInteger(ids[0]))
  );
}

/**
 * Makes a downloaded Piper voice (model and its .onnx.json in dir) ready for sherpa-onnx: the metadata into the model
 * (once), then tokens.txt, which marks it as done. Both are written in one step each (atomic-file.ts).
 */
export function preparePiperForSherpa(dir: string, modelFile: string): void {
  const model = path.join(dir, modelFile);
  const config: unknown = JSON.parse(fs.readFileSync(`${model}.json`, 'utf8'));
  if (!isPiperConfig(config)) throw new Error(`${modelFile}.json is not a Piper voice configuration`);
  const bytes = fs.readFileSync(model);
  if (readOnnxMetadata(bytes).comment !== 'piper') writeFileAtomic(model, withOnnxMetadata(bytes, piperMetadata(config)));
  writeFileAtomic(path.join(dir, 'tokens.txt'), piperTokens(config));
}
