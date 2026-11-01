// The shell's voices (docs/dev/modules.md): which voice speaks a role in the language it speaks (the user's
// choice, else one picked so that coach, crew and stand-in sound different), the language packs, the recorded voice
// packs, the pauses and the driver's name in front of a sentence, and the role's audio output with its volume. Coach
// and crew open their voices here; which of their voices is speaking (the stand-in, the team boss) stays theirs. The
// crew puts the voice on its radio here: the coach makes its race corner calls on it (docs/dev/modules.md).

import { EventEmitter } from 'node:events';
import path from 'node:path';
import { LanguageRegistry, type Phrases } from '@gt-toolz/coach';
import type { LanguageInfo, RunnerSettings, VoiceChoice, VoiceRole } from './app-api';
import { ownTexts, speechLanguage, textsChanged } from './settings';
import { NO_AUDIO, SYSTEM_AUDIO, type AddressPauses, type AudioChannel, type AudioOutput, type ClipVoice, type SpeechPauses } from './voice';
import { spellerOf, VoicePackStore, type RecordedVoice } from './voice-pack';
import { availableVoices, defaultCrewVoiceId, defaultStandInVoiceId, defaultVoiceId, openVoice } from './voices';

/** Who speaks: the roles the user picks a voice for, and the team boss (the stand-in's voice in the crew's language). */
export type Speaker = VoiceRole | 'boss';
/** The coach (with the stand-in) and the crew (with the team boss) each have their volume. */
export type VoiceChannel = 'coach' | 'crew';

/** What the voices read of the settings: the app's (docs/dev/modules.md). */
export type VoiceSettings = Pick<
  RunnerSettings,
  | 'language'
  | 'coachLanguage'
  | 'crewLanguage'
  | 'voices'
  | 'driverName'
  | 'addressing'
  | 'nameNotRecorded'
  | 'namePauseBefore'
  | 'namePauseAfter'
  | 'nameSlower'
  | 'volume'
  | 'coachVolume'
  | 'crewVolume'
  | 'texts'
>;

/** The crew's radio while the crew runs: the race engineer's voice, or the team boss's while he has it. */
export interface Radio {
  voice: ClipVoice;
  /** The language it speaks. */
  phrases: Phrases;
  /** It takes the coach's corner calls in races (not at the crew's talk level "little"). */
  takesCalls: boolean;
}

interface ShellVoicesEvents {
  /** Another voice on the radio, or none: what was rendered with the old one is gone. */
  radio: [];
  /** A recorded pack's recordings changed: the voices using it put their clips together anew. */
  recordings: [string];
}

export interface ShellVoicesOptions {
  dirs: { voices: string; voiceCache: string; voicePacks?: string };
  /** Where the voices play; the system's player without it (console tools). */
  audio?: AudioOutput;
  /** The settings now (with the talk levels applied). */
  settings(): VoiceSettings;
}

/** A voice to open with a role's speed, pitch and pauses, on a channel's volume. */
export interface OpenRoleVoice {
  /** '' = the system's default voice for the locale. */
  id: string;
  /** Whose speed, pitch and pauses it takes. */
  role: VoiceRole;
  locale: string;
  /** The language pack's pronunciations ("Curb" as "Körb"). */
  spoken(text: string): string;
  clips: Record<string, string>;
  /** The volume it follows; silent: only into the clip cache. */
  channel: VoiceChannel | 'silent';
  effect?: 'radio';
  recordings?: RecordedVoice;
  onProgress?: (done: number, total: number) => void;
}

export class ShellVoices extends EventEmitter<ShellVoicesEvents> {
  readonly languages = new LanguageRegistry();
  /** The user's recorded voice packs. */
  readonly packs: VoicePackStore;
  private choices: VoiceChoice[] | undefined;
  private addressCount = 0;
  /** Every open channel of the coach (with the stand-in) and of the crew, for volume changes. */
  private readonly channels = { coach: new Set<AudioChannel>(), crew: new Set<AudioChannel>() };
  private onAir: Radio | undefined;

  constructor(private readonly options: ShellVoicesOptions) {
    super();
    const { dirs } = options;
    this.packs = new VoicePackStore(dirs.voicePacks ?? path.join(path.dirname(dirs.voiceCache), 'voice-packs'), (language) => ({
      spell: spellerOf(this.phrases(language)),
      textsVersion: this.languages.list().find((p) => p.id === language)?.textsVersion ?? 1,
    }));
  }

  private get settings(): VoiceSettings {
    return this.options.settings();
  }

  // --- The catalogue and the languages ---

  /** Voices offered in the app (Windows voices, optional voices with their install state). */
  async list(): Promise<VoiceChoice[]> {
    this.choices = await availableVoices(this.options.dirs.voices);
    return this.choices;
  }

  /** The list as last read; undefined before. */
  get listed(): VoiceChoice[] | undefined {
    return this.choices;
  }

  /** Reads the list once; one that cannot be read counts as empty (the default voice is picked). */
  async ensureListed(): Promise<void> {
    if (this.choices) return;
    try {
      await this.list();
    } catch {
      this.choices = [];
    }
  }

  languageList(): LanguageInfo[] {
    return this.languages.list().map((p) => ({ id: p.id, name: p.name, locale: p.locale }));
  }

  /** What is said in a language: its pack, with the user's own texts over it (docs/dev/coach-and-texts.md "Own texts"). */
  phrases(language: string): Phrases {
    return this.languages.phrases(language, ownTexts(this.settings, this.languages.get(language).id));
  }

  /** The user's own texts changed in the language a role speaks: its sentences and clips are made anew. */
  ownTextsChanged(settings: VoiceSettings, old: VoiceSettings, role: VoiceRole): boolean {
    return textsChanged(settings, old, this.languages.get(this.languageOf(settings, role)).id);
  }

  /** The language a role speaks (its own setting, else the app language); a missing pack: the app language. */
  languageOf(settings: VoiceSettings, role: VoiceRole): string {
    const language = speechLanguage(settings, role);
    return this.languages.list().some((p) => p.id === language) ? language : settings.language;
  }

  /** A voice's name for the page while it is prepared: "CSS10" or "Jan", not "vits:css10-de" (alpha 0.0.4). */
  label(id: string): string {
    const choice = this.choices?.find((v) => v.id === id);
    return choice?.label ?? (id.replace(/^(piper|vits|macos):/, '') || 'Windows');
  }

  // --- Which voice speaks ---

  /**
   * The user's voice for a role, if it still exists: a voice taken out of the catalogue (Lars, Bernd) or
   * uninstalled falls back to the automatic choice instead of leaving the role without a voice.
   */
  chosen(settings: VoiceSettings, role: VoiceRole): string | undefined {
    const chosen = settings.voices[role].byLanguage[this.languageOf(settings, role)];
    if (!chosen) return undefined;
    if (this.choices && !this.choices.some((v) => v.id === chosen && v.installed)) return undefined;
    return chosen;
  }

  /**
   * The voice of a speaker in the language it speaks: the user's choice, else the coach's default, a crew voice
   * other than the coach's, and a stand-in clearly different from both. The team boss speaks with the stand-in's
   * voice, in the crew's language.
   */
  resolve(settings: VoiceSettings, speaker: Speaker): string {
    if (speaker === 'boss') {
      const language = this.languageOf(settings, 'crew');
      const chosen = settings.voices.standin.byLanguage[language];
      if (chosen && (!this.choices || this.choices.some((v) => v.id === chosen && v.installed))) return chosen;
      return this.choices ? defaultStandInVoiceId(language, this.choices, this.resolve(settings, 'coach'), this.resolve(settings, 'crew')) : '';
    }
    const chosen = this.chosen(settings, speaker);
    if (chosen) return chosen;
    if (!this.choices) return '';
    const language = this.languageOf(settings, speaker);
    if (speaker === 'coach') return defaultVoiceId(language, this.choices);
    if (speaker === 'crew') return defaultCrewVoiceId(language, this.choices, this.resolve(settings, 'coach'));
    return defaultStandInVoiceId(language, this.choices, this.resolve(settings, 'coach'), this.resolve(settings, 'crew'));
  }

  // --- Recorded voice packs ---

  /** The pack a speaker uses for the language it speaks, if it still exists and speaks that language (the boss: the stand-in's in the crew's language). */
  packId(settings: VoiceSettings, speaker: Speaker): string | undefined {
    const language = this.languageOf(settings, speaker === 'boss' ? 'crew' : speaker);
    const id = settings.voices[speaker === 'boss' ? 'standin' : speaker].recordings[language];
    return id && this.packs.get(id)?.language === language ? id : undefined;
  }

  recordings(settings: VoiceSettings, speaker: Speaker): RecordedVoice | undefined {
    const id = this.packId(settings, speaker);
    return id ? this.pack(id, settings) : undefined;
  }

  /** A pack's recordings, without the names it leaves out. */
  pack(id: string, settings = this.settings): RecordedVoice | undefined {
    return this.packs.voice(id, this.skipNames(settings));
  }

  /** Names the recordings leave out where a pack has no recording of them (setting 'leave-out'). */
  skipNames(settings = this.settings): string[] {
    return settings.nameNotRecorded === 'leave-out' && settings.driverName ? [settings.driverName] : [];
  }

  /** The voices using this pack take its new recordings. */
  recordingsChanged(id: string): void {
    this.emit('recordings', id);
  }

  // --- The crew's radio ---

  get radio(): Radio | undefined {
    return this.onAir;
  }

  /** The crew puts a voice on its radio, or none (it stopped, or its voice is being prepared). */
  setRadio(radio: Radio | undefined): void {
    const before = this.onAir;
    this.onAir = radio;
    if (before?.voice !== radio?.voice || before?.phrases !== radio?.phrases) this.emit('radio');
  }

  // --- How it is said ---

  pauses(role: VoiceRole, settings = this.settings): SpeechPauses {
    return { comma: settings.voices[role].commaPause, sentence: settings.voices[role].sentencePause, address: this.addressPauses(settings) };
  }

  /** "<pause> Maldö: <pause pause> …" (docs/dev/voices.md); no name, no address. */
  addressPauses(settings = this.settings): AddressPauses | undefined {
    return settings.driverName ? { name: settings.driverName, before: settings.namePauseBefore, after: settings.namePauseAfter, slower: settings.nameSlower } : undefined;
  }

  /**
   * The driver's name in front of a sentence (as the language pack places it). Timing-critical cues never
   * get it. With addressing 'sometimes' only important sentences always do, others every third time.
   */
  address(text: string, important: boolean, phrases: Phrases): string {
    const name = this.settings.driverName;
    if (!name || !text) return text;
    if (this.settings.addressing === 'sometimes' && !important && this.addressCount++ % 3 !== 0) return text;
    return phrases.address(name, text);
  }

  // --- Opening a voice, and its volume ---

  open(voice: OpenRoleVoice): Promise<ClipVoice> {
    const settings = this.settings;
    const { dirs } = this.options;
    return openVoice({
      id: voice.id,
      locale: voice.locale,
      clips: voice.clips,
      cacheDir: dirs.voiceCache,
      voicesDir: dirs.voices,
      rate: settings.voices[voice.role].rate,
      pitch: settings.voices[voice.role].pitch,
      pauses: this.pauses(voice.role, settings),
      spoken: voice.spoken,
      output: voice.channel === 'silent' ? NO_AUDIO : this.output(voice.channel),
      ...(voice.effect ? { effect: voice.effect } : {}),
      ...(voice.recordings ? { recordings: voice.recordings } : {}),
      ...(voice.onProgress ? { onProgress: voice.onProgress } : {}),
    });
  }

  /** A channel's volume, 0..1: the overall volume times the role's own (the user, 2026-10-25). */
  gain(channel: VoiceChannel): number {
    const s = this.settings;
    return (s.volume / 100) * ((channel === 'crew' ? s.crewVolume : s.coachVolume) / 100);
  }

  /** The volumes changed: the open channels take them at once, nothing is rendered again. */
  applyVolumes(): void {
    for (const channel of ['coach', 'crew'] as const) for (const open of this.channels[channel]) open.setVolume?.(this.gain(channel));
  }

  /** The audio output of a channel: each one opened through it starts at the channel's volume and follows changes. */
  private output(role: VoiceChannel): AudioOutput {
    return {
      openChannel: () => {
        const channel = (this.options.audio ?? SYSTEM_AUDIO).openChannel();
        const channels = this.channels[role];
        const tracked: AudioChannel = {
          load: (name, file) => channel.load(name, file),
          play: (name) => channel.play(name),
          stop: () => channel.stop(),
          close: () => {
            channels.delete(tracked);
            channel.close();
          },
          setVolume: (gain) => channel.setVolume?.(gain),
        };
        channels.add(tracked);
        tracked.setVolume?.(this.gain(role));
        return tracked;
      },
    };
  }
}
