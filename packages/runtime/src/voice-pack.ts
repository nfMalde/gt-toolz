// Recorded voices: packs of a user's own recordings, one language per pack. A sentence the pack can say
// completely is put together from its recordings; every other sentence is spoken by the role's voice, so
// one sentence never mixes two voices. Packs are shared as one file (.gttvoice) by the users themselves:
// GT Toolz hosts nothing and uploads nothing.
//
// Recordings are matched by their words, not by their text: "Maldö, letzte Runde!" is the name plus
// "Letzte Runde!", and "1,7 Sekunden schneller" is "eins", "Komma", "sieben" and "Sekunden schneller".

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LanguagePack, Phrases } from '@gt-toolz/coach';
import { RECORDING_SECTIONS, type RecordingEntry, type RecordingPackInfo, type RecordingSection } from './app-api';
import { writeFileAtomic } from './atomic-file';
import { coachClips } from './clips';
import { monoSamples, resample, samplesToWav, trimSilence, wavDuration } from './wav';

export const VOICE_PACK_FORMAT = 'gt-toolz-voice-pack';
/**
 * Version of the file format (pack.json and shared files). Raise it only for changes older apps cannot read;
 * new optional fields do not need it. The app reads its own and older versions and refuses newer ones.
 * Which texts a pack covers is a separate number: textsVersion (the language pack's).
 */
export const VOICE_PACK_VERSION = 1;
/** File extension of a shared pack. */
export const VOICE_PACK_EXTENSION = 'gttvoice';
/** Recordings are stored as 16-bit mono WAV at this rate; clips put together from them use it too. */
export const RECORDING_RATE = 24_000;
export const MAX_RECORDING_SECONDS = 30;
/** A pack file larger than this is not read (about 20 minutes of recordings). */
export const MAX_PACK_FILE_BYTES = 120 * 1024 * 1024;
const MAX_RECORDINGS = 3000;
const MAX_TEXT_LENGTH = 400;
const MAX_NAME_LENGTH = 60;
/** One recording in a pack file, base64 (30 s of 48 kHz stereo and some headroom). */
const MAX_WAV_BASE64 = 8 * 1024 * 1024;
/**
 * An imported pack keeps at most this much audio (release check 2026-10-28: short takes at a low rate grow six times
 * when stored at RECORDING_RATE, so a full file could have taken gigabytes).
 */
const MAX_IMPORT_SECONDS = 40 * 60;
/** A recording's file in its pack's folder: named by its audio's hash, never a path. */
const RECORDING_FILE = /^[0-9a-f]{16}\.wav$/;
const PACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;
/** A sentence the voice has to speak costs this much; recordings cost 1 each, so they always win. */
const SPEECH_COST = 1000;
/** A name the pack lacks, left out (setting 'leave-out'). */
const SKIP_COST = 0.5;

/** Written into every exported file: what the person who exported it confirmed. */
export const EXPORT_CONSENT =
  'The person who exported this pack confirmed: the recordings are of their own voice, or every person who can be heard has explicitly agreed to be recorded and to the recordings being shared. They are responsible for sharing the file. GT Toolz does not host, check or distribute voice packs.';

// --- Words ---

/** How numbers are matched: as the pack language's words ("1,7" is "eins Komma sieben"). */
export interface Speller {
  locale: string;
  numbers: readonly string[];
  decimal: string;
}

export function spellerOf(phrases: Phrases): Speller {
  return { locale: phrases.locale, numbers: phrases.numberWords, decimal: phrases.decimalWord };
}

export type Pause = 'none' | 'comma' | 'sentence';

interface Token {
  word: string;
  /** Where the word is in the text, with its punctuation. */
  start: number;
  end: number;
  /** The pause after it. */
  pause: Pause;
}

const NUMBER = /^(\d+)(?:[.,](\d+))?$/;

/** The words of a text, lower case, numbers as words, with the pause after each. */
export function tokenize(text: string, spell: Speller): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const raw = match[0];
    const start = match.index;
    const lead = /^[^\p{L}\p{N}]+/u.exec(raw)?.[0].length ?? 0;
    const body = raw.slice(lead);
    const trail = /[^\p{L}\p{N}]+$/u.exec(body)?.[0] ?? '';
    const core = body.slice(0, body.length - trail.length);
    const pause: Pause = /[.!?…]/.test(trail) ? 'sentence' : /[,;:–—-]/.test(trail) ? 'comma' : 'none';
    const words = core ? wordsOf(core, spell) : [];
    if (!words.length) {
      // Only punctuation (a dash): a pause after the word before.
      const last = tokens.at(-1);
      if (last && pause !== 'none' && last.pause !== 'sentence') last.pause = pause;
      continue;
    }
    words.forEach((word, i) => tokens.push({ word, start, end: start + raw.length, pause: i === words.length - 1 ? pause : 'none' }));
  }
  return tokens;
}

function plainWords(text: string, spell: Speller): string[] {
  return text
    .toLocaleLowerCase(spell.locale)
    .replace(/[’‘`´]/g, "'")
    .split(/[^\p{L}\p{N}\p{M}'-]+/u)
    .filter(Boolean);
}

function wordsOf(core: string, spell: Speller): string[] {
  const number = NUMBER.exec(core);
  if (!number) return plainWords(core, spell);
  const word = (digits: string): string[] => {
    const n = Number(digits);
    const spelled = spell.numbers[n];
    return spelled ? plainWords(spelled, spell) : [String(n)];
  };
  const words = word(number[1]!);
  if (number[2] !== undefined) words.push(...plainWords(spell.decimal, spell), ...[...number[2]].flatMap(word));
  return words;
}

/** What a recording is found by: its words ("Letzte Runde! Bring ihn nach Hause." → "letzte runde bring ihn nach hause"). */
export function phraseKey(text: string, spell: Speller): string {
  return tokenize(text, spell)
    .map((t) => t.word)
    .join(' ');
}

// --- Putting sentences together ---

/** Part of a clip: a recording, or text the role's voice speaks. pause: after it; words: for the comma rule. */
export type Segment =
  | { kind: 'recording'; file: string; text: string; words: number; pause: Pause }
  | { kind: 'speech'; text: string; words: number; pause: Pause };

/** A pack, ready to say texts: finds the recordings that make up a text. */
export class RecordedVoice {
  private readonly byFirst = new Map<string, { words: string[]; file: string }[]>();
  private readonly skip: string[][];

  constructor(
    readonly packId: string,
    recordings: { key: string; file: string }[],
    private readonly spell: Speller,
    /** Names to leave out when the pack has no recording of them. */
    skipNames: string[] = [],
  ) {
    for (const { key, file } of recordings) {
      const words = key.split(' ').filter(Boolean);
      if (!words.length) continue;
      const list = this.byFirst.get(words[0]!) ?? [];
      list.push({ words, file });
      this.byFirst.set(words[0]!, list);
    }
    const keys = new Set(recordings.map((r) => r.key));
    this.skip = skipNames
      .map((name) => phraseKey(name, spell))
      .filter((key) => key && !keys.has(key))
      .map((key) => key.split(' '));
  }

  get size(): number {
    let n = 0;
    for (const list of this.byFirst.values()) n += list.length;
    return n;
  }

  /**
   * The parts a text is made of: as many recordings as possible, whole sentences spoken by the voice where
   * the pack lacks something. Undefined when the text has no recorded part at all (the voice says it as before).
   */
  plan(text: string): Segment[] | undefined {
    const tokens = tokenize(text, this.spell);
    const n = tokens.length;
    if (!n || !this.byFirst.size) return undefined;
    const sentenceStart = tokens.map((_, i) => i === 0 || tokens[i - 1]!.pause === 'sentence');
    const sentenceEnd = (i: number) => {
      let j = i;
      while (j < n - 1 && tokens[j]!.pause !== 'sentence') j++;
      return j + 1;
    };
    const matches = (i: number, words: string[]) => i + words.length <= n && words.every((w, k) => tokens[i + k]!.word === w);

    // Cheapest cover of the words: recordings (1 each), left-out names, whole sentences for the voice.
    const cost = new Array<number>(n + 1).fill(Infinity);
    const step: ({ from: number; kind: 'recording' | 'skip' | 'speech'; file?: string } | undefined)[] = new Array(n + 1);
    cost[0] = 0;
    const relax = (from: number, to: number, add: number, how: { kind: 'recording' | 'skip' | 'speech'; file?: string }) => {
      if (cost[from]! + add < cost[to]!) {
        cost[to] = cost[from]! + add;
        step[to] = { from, ...how };
      }
    };
    for (let i = 0; i < n; i++) {
      if (cost[i] === Infinity) continue;
      for (const phrase of this.byFirst.get(tokens[i]!.word) ?? []) {
        if (matches(i, phrase.words)) relax(i, i + phrase.words.length, 1, { kind: 'recording', file: phrase.file });
      }
      for (const name of this.skip) if (matches(i, name)) relax(i, i + name.length, SKIP_COST, { kind: 'skip' });
      // The voice only ever takes whole sentences.
      if (sentenceStart[i]) relax(i, sentenceEnd(i), SPEECH_COST, { kind: 'speech' });
    }
    if (cost[n] === Infinity) return undefined;

    const steps: { from: number; to: number; kind: 'recording' | 'skip' | 'speech'; file?: string }[] = [];
    for (let at = n; at > 0; ) {
      const s = step[at]!;
      steps.unshift({ ...s, to: at });
      at = s.from;
    }
    if (!steps.some((s) => s.kind === 'recording')) return undefined;
    const segments: Segment[] = [];
    let speechFrom: number | undefined;
    steps.forEach((s, i) => {
      if (s.kind === 'speech') {
        // Sentences next to each other are spoken in one go.
        speechFrom ??= s.from;
        if (steps[i + 1]?.kind === 'speech') return;
        const last = tokens[s.to - 1]!;
        segments.push({ kind: 'speech', text: text.slice(tokens[speechFrom]!.start, last.end), words: s.to - speechFrom, pause: last.pause });
        speechFrom = undefined;
      } else if (s.kind === 'recording') {
        const last = tokens[s.to - 1]!;
        segments.push({ kind: 'recording', file: s.file!, text: text.slice(tokens[s.from]!.start, last.end), words: s.to - s.from, pause: last.pause });
      }
    });
    return segments;
  }
}

// --- What there is to record ---

/** The fixed parts of a template without its placeholders ("{zone} läuft nicht weg." → "läuft nicht weg."). */
export function templatePieces(template: string): string[] {
  return template
    .split(/\{\w+\}/)
    .map((piece) => piece.replace(/^[\s,;:.!?–—-]+/u, '').trimEnd())
    .filter((piece) => /\p{L}/u.test(piece));
}

/** Pack texts that the cue section already has in full. */
const CUE_KEYS = new Set(['now', 'gear', 'brakeIntro.full', 'brakeIntro.percent', 'turn', 'direction.left', 'direction.right', 'strength.slight', 'strength.medium', 'strength.sharp']);
/** Lists of words that the number section has, and texts without fixed words. */
const SKIP_KEYS = new Set(['count', 'numbers', 'spell.numbers', 'spell.decimal', 'address']);

export interface CatalogInput {
  /** The pack language's texts and phrases. */
  pack: LanguagePack;
  phrases: Phrases;
  driverName: string;
  /** Corner names of the active reference. */
  corners: string[];
}

/**
 * Everything worth recording for a language, by section: the corner cues first (timing-critical, always
 * the same), the name, lap times with their building blocks, the remarks, and the rest. A text can be in
 * more than one section; it is one recording.
 */
export function recordingCatalog(input: CatalogInput, recorded: Record<string, StoredRecording>): RecordingEntry[] {
  const spell = spellerOf(input.phrases);
  const entries: RecordingEntry[] = [];
  const seen = new Set<string>();
  const used = new Set<string>();
  const add = (section: RecordingSection, text: string) => {
    const key = phraseKey(text, spell);
    if (!key || seen.has(`${section}|${key}`)) return;
    seen.add(`${section}|${key}`);
    used.add(key);
    const recording = recordingOf(recorded, key);
    entries.push({ key, text, section, recorded: !!recording, seconds: recording?.seconds });
  };
  const texts = input.pack.texts;
  const pieces = (key: string) => {
    const value = texts[key];
    return (Array.isArray(value) ? value : typeof value === 'string' ? [value] : []).flatMap(templatePieces);
  };
  const handled = new Set<string>([...CUE_KEYS, ...SKIP_KEYS]);
  const section = (name: RecordingSection, keys: string[]) => {
    for (const key of keys) {
      handled.add(key);
      for (const piece of pieces(key)) add(name, piece);
    }
  };

  for (const text of Object.values(coachClips(input.phrases))) add('cues', text);
  if (input.driverName) add('name', input.driverName);
  for (const recording of Object.values(recorded)) if (recording.section === 'name') add('name', recording.text);
  section('lap', ['lap.faster', 'lap.slower', 'lap.onTarget']);
  for (const word of input.phrases.numberWords) add('numbers', word);
  if (input.phrases.decimalWord) add('numbers', input.phrases.decimalWord);
  section('remarks', Object.keys(texts).filter((key) => key.startsWith('cheeky.')));
  section('corners', ['label.turn', 'label.brakingZone']);
  for (const corner of input.corners) add('corners', corner);
  for (const recording of Object.values(recorded)) if (recording.section === 'corners') add('corners', recording.text);
  section('crew', Object.keys(texts).filter((key) => key.startsWith('crew.')));
  section('more', Object.keys(texts).filter((key) => !handled.has(key)));
  // Recordings no section has (an older text, a removed corner): still used wherever their words fit.
  for (const [key, recording] of Object.entries(recorded)) if (!used.has(key)) add('other', recording.text);
  return entries;
}

// --- Packs on disk ---

export interface StoredRecording {
  text: string;
  section: RecordingSection;
  /** File name in the pack's folder. */
  file: string;
  seconds: number;
  at: string;
}

/** pack.json in a pack's folder. */
interface PackFile {
  format: typeof VOICE_PACK_FORMAT;
  version: number;
  id: string;
  name: string;
  language: string;
  /** The language pack's texts version the recordings were made against. */
  textsVersion: number;
  speaker: string;
  created: string;
  updated: string;
  /** Someone else's pack, imported from a file: what its exporter confirmed. */
  imported?: { at: string; consent?: string };
  /** By phrase key. */
  recordings: Record<string, StoredRecording>;
}

/** A shared pack (.gttvoice): JSON with the recordings as base64 WAV. Data only, never code. */
interface ExportFile {
  format: typeof VOICE_PACK_FORMAT;
  version: number;
  name: string;
  language: string;
  textsVersion: number;
  speaker: string;
  created: string;
  exported: string;
  consent: { confirmed: true; at: string; statement: string };
  recordings: { text: string; section: RecordingSection; wav: string }[];
}

/** Errors the app shows with its own text. */
export type VoicePackError =
  | 'pack-unknown'
  | 'pack-file-too-large'
  | 'pack-file-invalid'
  | 'pack-language-unknown'
  | 'pack-version-newer'
  | 'recording-silent'
  | 'recording-too-long'
  | 'recording-invalid'
  | 'text-invalid';

const fail = (code: VoicePackError): never => {
  throw new Error(code);
};

function cleanText(value: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

const isSection = (value: unknown): value is RecordingSection => RECORDING_SECTIONS.includes(value as RecordingSection);
/** A pack's recording by phrase key; words like "constructor" are phrases too, never Object's own members. */
const recordingOf = (recordings: Record<string, StoredRecording>, key: string): StoredRecording | undefined =>
  Object.hasOwn(recordings, key) ? recordings[key] : undefined;
const isVersion = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100_000;

/** What the store needs to know about a language. */
export interface PackLanguage {
  spell: Speller;
  textsVersion: number;
}

/**
 * A recording as stored: mono at RECORDING_RATE, without DC offset, silence cut off at both ends, peak at
 * -1 dBFS (microphones differ a lot in level).
 */
export function cleanRecording(wav: Buffer): Buffer {
  let mono: { samples: Float32Array; sampleRate: number };
  try {
    mono = monoSamples(wav);
  } catch {
    return fail('recording-invalid');
  }
  const { samples, sampleRate } = mono;
  if (samples.length > (MAX_RECORDING_SECONDS + 1) * sampleRate) fail('recording-too-long');
  let mean = 0;
  for (const v of samples) mean += v;
  mean /= samples.length || 1;
  const centred = resample(
    samples.map((v) => v - mean),
    sampleRate,
    RECORDING_RATE,
  );
  // Higher thresholds than for the voices: a microphone always hears the room.
  const trimmed = monoSamples(trimSilence(samplesToWav(centred, RECORDING_RATE), 300, 0.04, 0.03)).samples;
  let peak = 0;
  for (const v of trimmed) peak = Math.max(peak, Math.abs(v));
  if (peak < 0.01 || trimmed.length < RECORDING_RATE * 0.1) fail('recording-silent');
  const gain = 0.89 / peak;
  return samplesToWav(
    trimmed.map((v) => v * gain),
    RECORDING_RATE,
  );
}

/**
 * The recordings of a pack.json as written by the app: a file name that is not a hash name (a hand-edited
 * "..\..\x") would let export, playback and removal reach files outside the pack (release check 2026-10-28).
 */
function validRecordings(value: unknown): Record<string, StoredRecording> {
  const recordings: Record<string, StoredRecording> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return recordings;
  for (const [key, entry] of Object.entries(value as Record<string, Partial<StoredRecording>>)) {
    if (key === '__proto__' || !entry || typeof entry !== 'object') continue;
    if (typeof entry.file !== 'string' || !RECORDING_FILE.test(entry.file) || typeof entry.text !== 'string') continue;
    recordings[key] = {
      text: entry.text,
      section: isSection(entry.section) ? entry.section : 'other',
      file: entry.file,
      seconds: typeof entry.seconds === 'number' && Number.isFinite(entry.seconds) ? entry.seconds : 0,
      at: typeof entry.at === 'string' ? entry.at : '',
    };
  }
  return recordings;
}

/** The user's packs: one folder per pack (pack.json and the WAV files). */
export class VoicePackStore {
  constructor(
    readonly root: string,
    /** A language's words (to find recordings by) and its texts version. */
    private readonly language: (id: string) => PackLanguage,
  ) {}

  list(): RecordingPackInfo[] {
    if (!fs.existsSync(this.root)) return [];
    return fs
      .readdirSync(this.root)
      .filter((id) => PACK_ID.test(id))
      .map((id) => this.read(id))
      .filter((pack): pack is PackFile => !!pack)
      .map((pack) => this.info(pack))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id: string): RecordingPackInfo | undefined {
    const pack = this.read(id);
    return pack && this.info(pack);
  }

  create(details: { name: string; language: string; speaker?: string }): RecordingPackInfo {
    const name = cleanText(details.name, MAX_NAME_LENGTH);
    if (!name || !LANGUAGE.test(details.language)) fail('text-invalid');
    const now = new Date().toISOString();
    const pack: PackFile = {
      format: VOICE_PACK_FORMAT,
      version: VOICE_PACK_VERSION,
      id: crypto.randomUUID(),
      name,
      language: details.language,
      textsVersion: this.language(details.language).textsVersion,
      speaker: cleanText(details.speaker, MAX_NAME_LENGTH),
      created: now,
      updated: now,
      recordings: {},
    };
    fs.mkdirSync(this.dir(pack.id), { recursive: true });
    this.write(pack);
    return this.info(pack);
  }

  /** Name and speaker; the language of a pack never changes (one pack per language). */
  update(id: string, details: { name?: string; speaker?: string }): RecordingPackInfo {
    const pack = this.need(id);
    if (details.name !== undefined) pack.name = cleanText(details.name, MAX_NAME_LENGTH) || pack.name;
    if (details.speaker !== undefined) pack.speaker = cleanText(details.speaker, MAX_NAME_LENGTH);
    this.write(pack);
    return this.info(pack);
  }

  remove(id: string): void {
    this.need(id);
    this.cache.delete(id);
    fs.rmSync(this.dir(id), { recursive: true, force: true });
  }

  /** Stores a take (any 16-bit WAV) for a text; a new take of the same words replaces the old one. */
  saveRecording(id: string, text: string, section: RecordingSection, wav: Buffer): RecordingEntry {
    const pack = this.need(id);
    const clean = cleanText(text, MAX_TEXT_LENGTH);
    const language = this.language(pack.language);
    const key = phraseKey(clean, language.spell);
    if (!key || !isSection(section)) fail('text-invalid');
    const old = recordingOf(pack.recordings, key);
    if (!old && Object.keys(pack.recordings).length >= MAX_RECORDINGS) fail('text-invalid');
    const audio = cleanRecording(wav);
    const file = `${crypto.createHash('sha256').update(audio).digest('hex').slice(0, 16)}.wav`;
    writeFileAtomic(path.join(this.dir(id), file), audio);
    const recording: StoredRecording = { text: clean, section, file, seconds: Math.round(wavDuration(audio) * 100) / 100, at: new Date().toISOString() };
    pack.recordings[key] = recording;
    // The pack now knows the texts of this version (a text that came with it may have been recorded).
    pack.textsVersion = Math.max(pack.textsVersion, language.textsVersion);
    this.write(pack);
    if (old && old.file !== file) this.dropFile(pack, old.file);
    return { key, text: clean, section, recorded: true, seconds: recording.seconds };
  }

  removeRecording(id: string, key: string): void {
    const pack = this.need(id);
    const old = recordingOf(pack.recordings, key);
    if (!old) return;
    delete pack.recordings[key];
    this.write(pack);
    this.dropFile(pack, old.file);
  }

  recordingWav(id: string, key: string): Buffer {
    const pack = this.need(id);
    const recording = recordingOf(pack.recordings, key) ?? fail('pack-unknown');
    return fs.readFileSync(path.join(this.dir(id), recording.file));
  }

  /** The recordings by phrase key, for the catalog. */
  recordings(id: string): Record<string, StoredRecording> {
    return this.need(id).recordings;
  }

  /** The pack, ready to speak; skipNames: names to leave out where the pack has no recording of them. */
  voice(id: string, skipNames: string[] = []): RecordedVoice | undefined {
    const pack = this.read(id);
    if (!pack) return undefined;
    const recordings = Object.entries(pack.recordings)
      .map(([key, r]) => ({ key, file: path.join(this.dir(id), r.file) }))
      .filter((r) => fs.existsSync(r.file));
    return new RecordedVoice(id, recordings, this.language(pack.language).spell, skipNames);
  }

  /** The pack as one file to share, with the exporter's confirmation in it. */
  exportPack(id: string): { fileName: string; data: Buffer } {
    const pack = this.need(id);
    const now = new Date().toISOString();
    const file: ExportFile = {
      format: VOICE_PACK_FORMAT,
      version: VOICE_PACK_VERSION,
      name: pack.name,
      language: pack.language,
      textsVersion: pack.textsVersion,
      speaker: pack.speaker,
      created: pack.created,
      exported: now,
      consent: { confirmed: true, at: now, statement: EXPORT_CONSENT },
      recordings: Object.values(pack.recordings).map((r) => ({
        text: r.text,
        section: r.section,
        wav: fs.readFileSync(path.join(this.dir(id), r.file)).toString('base64'),
      })),
    };
    const base = pack.name.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-') || 'voice-pack';
    return { fileName: `${base}.${pack.language}.${VOICE_PACK_EXTENSION}`, data: Buffer.from(JSON.stringify(file)) };
  }

  /**
   * Reads a shared pack as a new pack of the user's. Everything is checked and the audio is written anew,
   * so nothing from the file but texts and samples ends up on disk. languages: the ones the app speaks.
   */
  importPack(data: Buffer, languages: string[]): RecordingPackInfo {
    if (data.length > MAX_PACK_FILE_BYTES) fail('pack-file-too-large');
    let raw: Partial<ExportFile>;
    try {
      raw = JSON.parse(data.toString('utf8')) as Partial<ExportFile>;
    } catch {
      return fail('pack-file-invalid');
    }
    if (!raw || typeof raw !== 'object' || raw.format !== VOICE_PACK_FORMAT || !isVersion(raw.version)) fail('pack-file-invalid');
    // Made by a newer app: its structure may differ, so it is not guessed at.
    if (raw.version! > VOICE_PACK_VERSION) fail('pack-version-newer');
    if (!Array.isArray(raw.recordings)) fail('pack-file-invalid');
    const language = typeof raw.language === 'string' && LANGUAGE.test(raw.language) ? raw.language : fail('pack-file-invalid');
    if (!languages.includes(language)) fail('pack-language-unknown');
    if (raw.recordings!.length > MAX_RECORDINGS) fail('pack-file-invalid');
    const spell = this.language(language).spell;

    const now = new Date().toISOString();
    const pack: PackFile = {
      format: VOICE_PACK_FORMAT,
      version: VOICE_PACK_VERSION,
      id: crypto.randomUUID(),
      name: cleanText(raw.name, MAX_NAME_LENGTH) || 'Voice pack',
      language,
      textsVersion: isVersion(raw.textsVersion) ? raw.textsVersion : 1,
      speaker: cleanText(raw.speaker, MAX_NAME_LENGTH),
      created: typeof raw.created === 'string' && !Number.isNaN(Date.parse(raw.created)) ? new Date(raw.created).toISOString() : now,
      updated: now,
      imported: { at: now, consent: cleanText(raw.consent?.statement, 1000) || undefined },
      recordings: {},
    };
    const dir = this.dir(pack.id);
    fs.mkdirSync(dir, { recursive: true });
    try {
      // Each take is written as soon as it is clean: the whole pack is never held in memory at once.
      let seconds = 0;
      for (const item of raw.recordings!) {
        if (seconds >= MAX_IMPORT_SECONDS) break;
        if (!item || typeof item !== 'object') continue;
        const text = cleanText(item.text, MAX_TEXT_LENGTH);
        const key = phraseKey(text, spell);
        if (!key || typeof item.wav !== 'string' || item.wav.length > MAX_WAV_BASE64) continue;
        let audio: Buffer;
        try {
          audio = cleanRecording(Buffer.from(item.wav, 'base64'));
        } catch {
          // A broken or silent recording is left out; the rest of the pack is still usable.
          continue;
        }
        const file = `${crypto.createHash('sha256').update(audio).digest('hex').slice(0, 16)}.wav`;
        fs.writeFileSync(path.join(dir, file), audio);
        const old = recordingOf(pack.recordings, key);
        const recording: StoredRecording = { text, section: isSection(item.section) ? item.section : 'other', file, seconds: Math.round(wavDuration(audio) * 100) / 100, at: now };
        pack.recordings[key] = recording;
        seconds += recording.seconds - (old?.seconds ?? 0);
        if (old && old.file !== file) this.dropFile(pack, old.file);
      }
      if (!Object.keys(pack.recordings).length) fail('pack-file-invalid');
      this.write(pack);
    } catch (err) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw err;
    }
    return this.info(pack);
  }

  private dir(id: string): string {
    if (!PACK_ID.test(id)) fail('pack-unknown');
    return path.join(this.root, id);
  }

  /** Read packs by id, kept while their file is unchanged (the coach asks for its pack often). */
  private readonly cache = new Map<string, { changed: number; pack: PackFile }>();

  private read(id: string): PackFile | undefined {
    if (!PACK_ID.test(id)) return undefined;
    const file = path.join(this.dir(id), 'pack.json');
    try {
      const changed = fs.statSync(file).mtimeMs;
      const cached = this.cache.get(id);
      if (cached?.changed === changed) return structuredClone(cached.pack);
      const pack = JSON.parse(fs.readFileSync(file, 'utf8')) as PackFile;
      // A newer app's pack (after going back to an older version) is left alone.
      if (pack.format !== VOICE_PACK_FORMAT || !isVersion(pack.version) || pack.version > VOICE_PACK_VERSION || pack.id !== id || !LANGUAGE.test(pack.language)) return undefined;
      pack.recordings = validRecordings(pack.recordings);
      if (!isVersion(pack.textsVersion)) pack.textsVersion = 1;
      this.cache.set(id, { changed, pack: structuredClone(pack) });
      return pack;
    } catch {
      this.cache.delete(id);
      return undefined;
    }
  }

  private need(id: string): PackFile {
    return this.read(id) ?? fail('pack-unknown');
  }

  private write(pack: PackFile): void {
    pack.updated = new Date().toISOString();
    this.cache.delete(pack.id);
    writeFileAtomic(path.join(this.dir(pack.id), 'pack.json'), JSON.stringify(pack, null, 1));
  }

  /** Deletes a WAV file no recording of the pack uses any more. */
  private dropFile(pack: PackFile, file: string): void {
    if (Object.values(pack.recordings).some((r) => r.file === file)) return;
    fs.rmSync(path.join(this.dir(pack.id), file), { force: true });
  }

  private info(pack: PackFile): RecordingPackInfo {
    const recordings = Object.values(pack.recordings);
    return {
      id: pack.id,
      name: pack.name,
      language: pack.language,
      textsVersion: pack.textsVersion,
      speaker: pack.speaker,
      created: pack.created,
      updated: pack.updated,
      recordings: recordings.length,
      seconds: Math.round(recordings.reduce((sum, r) => sum + r.seconds, 0)),
      imported: !!pack.imported,
      consent: pack.imported?.consent,
    };
  }
}
