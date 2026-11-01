// Which voices exist (the system's voices on Windows and macOS, plus the allowed optional ones) and how to open one.

import { MacSpeech } from './mac-speech';
import { commonDir, PiperRenderer } from './piper';
import { SherpaRenderer } from './sherpa';
import { allowedVoiceIds, installedVoices } from './voice-packages';
import { attentionTone, ClipVoice, listVoices, type AudioOutput, type ExternalRenderer, type SpeechPauses, type VoiceInfo } from './voice';
import type { RecordedVoice } from './voice-pack';

import type { VoiceChoice } from './app-api';

export type { VoiceChoice } from './app-api';

const EXTERNAL = /^(piper|vits):/;

export function isExternalVoice(id: string): boolean {
  return EXTERNAL.test(id);
}

let systemVoices: Promise<VoiceInfo[]> | undefined;

/** macOS voices carry this prefix in the settings ("macos:Anna (Premium)"); Windows voices are their bare name. */
const MAC_PREFIX = 'macos:';

/** The system's voices, listed once per process (installing new ones needs a restart anyway). */
function listSystemVoices(): Promise<VoiceInfo[]> {
  // None found (the listing hung and was ended): asked again next time.
  systemVoices ??= listVoices().then((voices) => {
    if (!voices.length) systemVoices = undefined;
    return voices;
  });
  return systemVoices;
}

/** The system's voices (Windows, macOS) and the allowed optional voices. */
export async function availableVoices(voicesDir: string): Promise<VoiceChoice[]> {
  const installed = new Set(installedVoices(voicesDir).map((v) => v.id));
  return [
    ...(await listSystemVoices()).map((v) => ({ id: v.engine === 'macos' ? `${MAC_PREFIX}${v.name}` : v.name, engine: v.engine, language: v.language, installed: true })),
    ...allowedVoiceIds().map((v) => ({
      id: v.id,
      engine: (v.id.startsWith('piper:') ? 'piper' : 'sherpa') as VoiceChoice['engine'],
      language: v.language,
      gender: v.gender,
      installed: installed.has(v.id),
      packageId: v.packageId,
      label: v.name,
    })),
  ];
}

/**
 * The voice used when the user picked none for a language: an installed optional voice first (the user
 * chose to download it), then a OneCore voice, then whatever Windows picks for the language.
 */
export function defaultVoiceId(language: string, voices: VoiceChoice[]): string {
  const lang = language.split('-')[0]!.toLowerCase();
  const matching = voices.filter((v) => v.installed && v.language.toLowerCase().startsWith(lang));
  return (
    matching.find((v) => v.engine === 'piper' || v.engine === 'sherpa')?.id ??
    matching.find((v) => v.engine === 'onecore')?.id ??
    matching[0]?.id ??
    ''
  );
}

/**
 * The crew's voice when the user picked none. Intelligible first (over the radio filter a Windows voice was
 * hard to understand): a male neural voice, else the coach's own voice if it is neural (the radio filter and
 * a lower pitch set the crew apart), else another neural voice, and only then a Windows voice.
 */
export function defaultCrewVoiceId(language: string, voices: VoiceChoice[], coachId: string): string {
  const lang = language.split('-')[0]!.toLowerCase();
  const neural = (v: VoiceChoice) => v.engine === 'piper' || v.engine === 'sherpa';
  const usable = voices.filter((v) => v.installed && v.language.toLowerCase().startsWith(lang));
  const others = usable.filter((v) => v.id !== coachId);
  const coach = usable.find((v) => v.id === coachId);
  return (
    others.find((v) => neural(v) && v.gender === 'male')?.id ??
    (coach && neural(coach) ? coach.id : undefined) ??
    others.find(neural)?.id ??
    others.find((v) => v.engine === 'onecore')?.id ??
    others[0]?.id ??
    coachId
  );
}

/**
 * The stand-in's voice when the user picked none: clearly another voice than the coach's (the other gender
 * first); neural before Windows. The crew's voice is fine if nothing else fits: over the radio filter the
 * crew sounds different anyway, and an intelligible voice beats a distinct one.
 */
export function defaultStandInVoiceId(language: string, voices: VoiceChoice[], coachId: string, crewId: string): string {
  const lang = language.split('-')[0]!.toLowerCase();
  const neural = (v: VoiceChoice) => v.engine === 'piper' || v.engine === 'sherpa';
  const usable = voices.filter((v) => v.installed && v.language.toLowerCase().startsWith(lang));
  const coach = usable.find((v) => v.id === coachId);
  const others = usable.filter((v) => v.id !== coachId && v.id !== crewId);
  const otherGender = (v: VoiceChoice) => !!coach?.gender && !!v.gender && v.gender !== coach.gender;
  const crew = usable.find((v) => v.id === crewId && v.id !== coachId);
  return (
    others.find((v) => neural(v) && otherGender(v))?.id ??
    (crew && neural(crew) && otherGender(crew) ? crew.id : undefined) ??
    others.find(neural)?.id ??
    others.find((v) => v.engine === 'onecore')?.id ??
    others[0]?.id ??
    (crewId !== coachId ? crewId : '')
  );
}

export type VoiceProblem = { problem: 'not-allowed' } | { problem: 'not-installed'; packageId: string };

/** Optional voices must be allowed (license) and installed; Windows voices are always fine. */
export function checkVoice(id: string, voicesDir: string): VoiceProblem | undefined {
  if (!isExternalVoice(id)) return undefined;
  const allowed = allowedVoiceIds().find((v) => v.id === id);
  if (!allowed) return { problem: 'not-allowed' };
  if (!installedVoices(voicesDir).some((v) => v.id === id)) return { problem: 'not-installed', packageId: allowed.packageId };
  return undefined;
}

export interface OpenVoiceOptions {
  /** Voice id; empty = Windows default for the locale. */
  id: string;
  locale: string;
  clips: Record<string, string>;
  cacheDir: string;
  voicesDir: string;
  rate: number;
  /** Percent above normal. */
  pitch: number;
  onProgress?: (done: number, total: number) => void;
  effect?: 'radio';
  /** Seconds after a comma and after a sentence. */
  pauses?: SpeechPauses;
  /** Where the clips are played (default: the system's player). */
  output?: AudioOutput;
  /** The text as the engine should read it (the language pack's pronunciations). */
  spoken?: (text: string) => string;
  /** The user's own recordings for this role and language; the voice speaks what they lack. */
  recordings?: RecordedVoice;
}

/** Starts the speech process for a voice and prepares the clips (plus the attention tone). */
export async function openVoice(options: OpenVoiceOptions): Promise<ClipVoice> {
  const problem = checkVoice(options.id, options.voicesDir);
  if (problem) throw new Error(problem.problem === 'not-allowed' ? `Voice "${options.id}" is not allowed (license)` : `Voice "${options.id}" is not installed`);

  let external: { engine: 'piper' | 'sherpa' | 'macos'; name: string; renderer: ExternalRenderer } | undefined;
  const chosen = installedVoices(options.voicesDir).find((v) => v.id === options.id);
  // Rate: 0 = normal; each step about 8 % faster or slower. Neural voices get their pitch by faster playback,
  // so they speak slower by the same factor: the pitch no longer changes the tempo ("Wörter zu schnell").
  const pitch = 1 + Math.max(-30, Math.min(50, options.pitch)) / 100;
  const lengthScale = Math.max(0.5, Math.min(2, (1 - options.rate * 0.08) * pitch));
  // The engines run in the data folder that holds the voices and the clips: every path they get is relative and
  // ASCII, also below a profile like C:\Users\Jörg (piper.ts, enginePath).
  const base = commonDir(options.voicesDir, options.cacheDir);
  if (chosen?.engine === 'piper') {
    external = { engine: 'piper', name: chosen.id, renderer: new PiperRenderer(chosen.exe, chosen.model, lengthScale, chosen.speaker, chosen.inference, base) };
  }
  if (chosen?.engine === 'sherpa') {
    external = { engine: 'sherpa', name: chosen.id, renderer: new SherpaRenderer(chosen.exe, { dir: chosen.modelDir, file: chosen.modelFile, format: chosen.format, inference: chosen.inference }, chosen.sid, lengthScale, base) };
  }
  // macOS: its own voices through `say`; without a choice the first one for the language (Premium voices first).
  if (!external && process.platform === 'darwin') {
    const lang = options.locale.split('-')[0]!.toLowerCase();
    const name = options.id.startsWith(MAC_PREFIX)
      ? options.id.slice(MAC_PREFIX.length)
      : (await listSystemVoices()).find((v) => v.language.toLowerCase().startsWith(lang))?.name;
    if (!name) throw new Error(`No macOS voice for ${options.locale}: add one in System Settings → Accessibility → Spoken Content, or install a voice under Voices`);
    external = { engine: 'macos', name: `${MAC_PREFIX}${name}`, renderer: new MacSpeech(name, lengthScale) };
  }

  const { voice } = await ClipVoice.create(options.clips, options.cacheDir, {
    voice: external ? undefined : options.id || undefined,
    locale: options.locale,
    external,
    rate: options.rate,
    pitch,
    sounds: { tone: attentionTone() },
    onProgress: options.onProgress,
    effect: options.effect,
    pauses: options.pauses,
    spoken: options.spoken,
    output: options.output,
    recordings: options.recordings,
  });
  return voice;
}
