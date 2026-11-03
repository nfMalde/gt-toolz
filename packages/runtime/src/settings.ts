// What the user can set, shared by the app (settings file) and the CLI (arguments).

import { checkOwnText, DEFAULT_COACH_SETTINGS, FALLBACK_PACK, type CoachSettings } from '@gt-toolz/coach';
import {
  VOICE_ROLES,
  type Addressing,
  REFERENCE_MODES,
  isLanAddress,
  type OwnText,
  type NameNotRecorded, type BriefingSetting, type CoachStyle, type Patience, type PlanStyle, type RaceCallsScope, type ReferenceMode, type RoleVoice, type RunnerSettings, type TalkLevel, type VoiceRole } from './app-api';
import { MAX_COUNTDOWN } from './clips';

export type { BriefingSetting, CoachStyle, FeedbackSetting, Patience, RoleVoice, RunnerSettings, VoiceRole } from './app-api';

// Pauses as in normal speech: about half a second after a comma, a bit more after a sentence.
const DEFAULT_ROLE_VOICE: RoleVoice = { byLanguage: {}, recordings: {}, rate: 0, pitch: 10, commaPause: 0.5, sentencePause: 0.7 };

/** The language a role speaks: its own setting, else the app language. The stand-in speaks like the coach. */
export function speechLanguage(settings: Pick<RunnerSettings, 'language' | 'coachLanguage' | 'crewLanguage'>, role: VoiceRole): string {
  return (role === 'crew' ? settings.crewLanguage : settings.coachLanguage) || settings.language;
}

/**
 * Raised when a changed default should reach settings saved before it (migrateSettings):
 * 2 (stream feedback, 2026-10-23): feedback for the 2 worst corners instead of every one; the crew calls the
 * biggest problem corners in races.
 */
export const SETTINGS_VERSION = 3;

/**
 * Settings from the file, brought up to SETTINGS_VERSION: a changed default replaces the old default once (a
 * value the user picked away from the old default stays). Only for the file; normalizeSettings does the rest.
 */
export function migrateSettings(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const v = { ...(value as Record<string, unknown>) };
  const version = typeof v.settingsVersion === 'number' ? v.settingsVersion : 1;
  if (version < 2) {
    if (v.feedback === 'all') v.feedback = 2;
    if (v.raceCalls === false) v.raceCalls = true;
  }
  // Stream feedback 2026-10-25: a countdown from three was too long (corners close together got mixed up).
  if (version < 3 && v.countdownSeconds === 3) v.countdownSeconds = 2;
  v.settingsVersion = SETTINGS_VERSION;
  return v;
}

export const DEFAULT_RUNNER_SETTINGS: RunnerSettings = {
  settingsVersion: SETTINGS_VERSION,
  language: 'de',
  coachLanguage: '',
  crewLanguage: '',
  driverName: '',
  addressing: 'always',
  // "<pause> <name> <pause pause>" (the user, 2026-10-21): a pause, the name, twice the pause, the sentence.
  namePauseBefore: 0.5,
  namePauseAfter: 1,
  // Piper says a name alone in about 0.2 s; the user chose 3 times slower by ear (2026-10-22).
  nameSlower: 3,
  // The user's own recordings stay in the pack's voice; the name is left out rather than spoken by another voice.
  nameNotRecorded: 'leave-out',
  voices: { coach: DEFAULT_ROLE_VOICE, crew: { ...DEFAULT_ROLE_VOICE, rate: 2, pitch: -6 }, standin: { ...DEFAULT_ROLE_VOICE, rate: 0, pitch: 0 } },
  countdownSeconds: DEFAULT_COACH_SETTINGS.countdownSeconds,
  countPause: DEFAULT_COACH_SETTINGS.countPause,
  countPauseShort: DEFAULT_COACH_SETTINGS.countPauseShort,
  latencySeconds: DEFAULT_COACH_SETTINGS.outputLatencySeconds,
  latencyCalibrated: false,
  tone: true,
  intro: true,
  // The coach is quiet in races; the crew calls the corners there (the user, 2026-10-20), by default only the
  // biggest problem corners (the user, 2026-10-24).
  raceCalls: true,
  raceCallsScope: 'mistakes',
  plan: true,
  curbs: true,
  cornerShape: true,
  // Pace notes are the user's idea (2026-10-20); sentences stay the default, they explain themselves.
  planStyle: 'sentences',
  fastCorners: DEFAULT_COACH_SETTINGS.fastCorners,
  // The user, 2026-10-28 (SUGO): chained corners named together, no explanations in between.
  chainCalls: DEFAULT_COACH_SETTINGS.chainCalls,
  // The user, 2026-10-22: trail braking in the corner plan too.
  trailCalls: true,
  // The user, 2026-11-03: the countdown runs to the first action and names it.
  actionAfterNow: true,
  gearAfterNow: false,
  turnIn: true,
  // The two worst corners (stream feedback, 2026-10-23: seven feedbacks on seven braking zones were too many).
  feedback: 2,
  guideCorners: DEFAULT_COACH_SETTINGS.guideCorners,
  immediateFeedback: true,
  waitForFirstLap: true,
  replayCalls: DEFAULT_COACH_SETTINGS.replayCalls,
  streamerMode: false,
  briefing: 'auto',
  lapDelta: true,
  // The user, 2026-10-20: the ghost comparison in time trials too.
  ghostSectors: 3,
  helpFirst: DEFAULT_COACH_SETTINGS.helpFirst,
  helpAssists: DEFAULT_COACH_SETTINGS.helpAssists,
  focusLaps: DEFAULT_COACH_SETTINGS.focusLaps,
  // On by default; the user can switch it off (settings, start guide).
  style: 'cheeky',
  patience: 'normal',
  crewPatience: 'normal',
  coachQuits: true,
  standInLaps: 2,
  // The modules on at the first start (the user, 2026-10-29): coach and crew (modules/crew); the overlays and the
  // vibration (their own modules, modules/<id>) not.
  coach: true,
  radio: true,
  debriefZones: 4,
  debriefHandbrake: false,
  debriefBonus: true,
  slides: true,
  slidesInRace: true,
  mute: false,
  coachTalk: 'normal',
  volume: 100,
  coachVolume: 100,
  crewVolume: 100,
  // The standard log is enough for most issues; the detailed one on request (the user, 2026-10-24).
  detailedLog: false,
  // Ticked when the news window asks; nothing is looked up before the user answered.
  updateCheck: true,
  updateAsked: false,
  newsSeen: '',
  texts: {},
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/**
 * A voice id from config.json: never quotes, dollar signs or control characters (release check 2026-10-28: a Windows
 * voice's name went into a PowerShell script; it is passed differently now, this keeps hand-edited ids harmless too).
 */
const VOICE_ID = /^[^\p{Cc}'"`$‘-‛]+$/u;

function normalizeRoleVoice(value: unknown, base: RoleVoice): RoleVoice {
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<Record<keyof RoleVoice, unknown>>;
  const perLanguage = (input: unknown, fallback: Record<string, string>) => {
    if (!input || typeof input !== 'object') return fallback;
    const out: Record<string, string> = {};
    for (const [lang, id] of Object.entries(input as Record<string, unknown>)) {
      if (LANGUAGE.test(lang) && typeof id === 'string' && id.length < 200 && VOICE_ID.test(id)) out[lang] = id;
    }
    return out;
  };
  return {
    byLanguage: perLanguage(v.byLanguage, base.byLanguage),
    recordings: perLanguage(v.recordings, base.recordings ?? {}),
    rate: Math.round(clamp(v.rate, -10, 10, base.rate)),
    pitch: Math.round(clamp(v.pitch, -30, 50, base.pitch)),
    commaPause: Math.round(clamp(v.commaPause, 0, 1.5, base.commaPause) * 100) / 100,
    sentencePause: Math.round(clamp(v.sentencePause, 0, 2, base.sentencePause) * 100) / 100,
  };
}

/**
 * Takes settings from an untrusted source (file, UI, older versions) and returns complete, valid settings.
 * Missing or invalid values keep the value from base.
 */
export function normalizeSettings(value: unknown, base: RunnerSettings = DEFAULT_RUNNER_SETTINGS): RunnerSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof RunnerSettings, unknown>>;
  const d = base;
  const voicesIn = (v.voices && typeof v.voices === 'object' ? v.voices : {}) as Partial<Record<VoiceRole, unknown>>;
  const voices = Object.fromEntries(VOICE_ROLES.map((role) => [role, normalizeRoleVoice(voicesIn[role], d.voices[role])])) as Record<VoiceRole, RoleVoice>;
  const feedback =
    v.feedback === 'all' || v.feedback === 'off' ? v.feedback : typeof v.feedback === 'number' ? Math.round(clamp(v.feedback, 1, 30, 1)) : d.feedback;
  const briefing = ['auto', 'all', 'problems', 'off'].includes(v.briefing as string) ? (v.briefing as BriefingSetting) : d.briefing;
  return {
    settingsVersion: SETTINGS_VERSION,
    language: typeof v.language === 'string' && LANGUAGE.test(v.language) ? v.language : d.language,
    coachLanguage: typeof v.coachLanguage === 'string' && (v.coachLanguage === '' || LANGUAGE.test(v.coachLanguage)) ? v.coachLanguage : d.coachLanguage,
    crewLanguage: typeof v.crewLanguage === 'string' && (v.crewLanguage === '' || LANGUAGE.test(v.crewLanguage)) ? v.crewLanguage : d.crewLanguage,
    driverName: typeof v.driverName === 'string' ? cleanName(v.driverName) : d.driverName,
    addressing: v.addressing === 'always' || v.addressing === 'sometimes' ? (v.addressing as Addressing) : d.addressing,
    namePauseBefore: Math.round(clamp(v.namePauseBefore, 0, 2, d.namePauseBefore) * 100) / 100,
    namePauseAfter: Math.round(clamp(v.namePauseAfter, 0, 2, d.namePauseAfter) * 100) / 100,
    nameSlower: Math.round(clamp(v.nameSlower, 1, 4, d.nameSlower) * 10) / 10,
    nameNotRecorded: v.nameNotRecorded === 'leave-out' || v.nameNotRecorded === 'voice' ? (v.nameNotRecorded as NameNotRecorded) : d.nameNotRecorded,
    voices,
    countdownSeconds: Math.round(clamp(v.countdownSeconds, 0, MAX_COUNTDOWN, d.countdownSeconds)),
    countPause: Math.round(clamp(v.countPause, 0.2, 2, d.countPause) * 100) / 100,
    countPauseShort: Math.round(clamp(v.countPauseShort, 0.2, 2, d.countPauseShort) * 100) / 100,
    latencySeconds: Math.round(clamp(v.latencySeconds, 0, 1, d.latencySeconds) * 100) / 100,
    latencyCalibrated: bool(v.latencyCalibrated, d.latencyCalibrated),
    tone: bool(v.tone, d.tone),
    intro: bool(v.intro, d.intro),
    // Earlier versions kept a list here ('mistakes', …): the new default (off) applies to them.
    raceCalls: bool(v.raceCalls, d.raceCalls),
    raceCallsScope: v.raceCallsScope === 'all' || v.raceCallsScope === 'mistakes' ? (v.raceCallsScope as RaceCallsScope) : d.raceCallsScope,
    plan: bool(v.plan, d.plan),
    curbs: bool(v.curbs, d.curbs),
    cornerShape: bool(v.cornerShape, d.cornerShape),
    planStyle: v.planStyle === 'sentences' || v.planStyle === 'notes' ? (v.planStyle as PlanStyle) : d.planStyle,
    fastCorners: bool(v.fastCorners, d.fastCorners),
    chainCalls: bool(v.chainCalls, d.chainCalls),
    trailCalls: bool(v.trailCalls, d.trailCalls),
    actionAfterNow: bool(v.actionAfterNow, d.actionAfterNow),
    gearAfterNow: bool(v.gearAfterNow, d.gearAfterNow),
    turnIn: bool(v.turnIn, d.turnIn),
    feedback,
    guideCorners: bool(v.guideCorners, d.guideCorners),
    immediateFeedback: bool(v.immediateFeedback, d.immediateFeedback),
    waitForFirstLap: bool(v.waitForFirstLap, d.waitForFirstLap),
    replayCalls: bool(v.replayCalls, d.replayCalls),
    streamerMode: bool(v.streamerMode, d.streamerMode),
    briefing,
    lapDelta: bool(v.lapDelta, d.lapDelta),
    ghostSectors: Math.round(clamp(v.ghostSectors, 0, 6, d.ghostSectors)),
    helpFirst: bool(v.helpFirst, d.helpFirst),
    helpAssists: bool(v.helpAssists, d.helpAssists),
    focusLaps: Math.round(clamp(v.focusLaps, 0, 5, d.focusLaps)),
    style: v.style === 'neutral' || v.style === 'cheeky' ? (v.style as CoachStyle) : d.style,
    patience: patienceOf(v.patience, d.patience),
    // The user, 2026-11-03: coach and crew each have their own. Until then the crew went by the one setting.
    crewPatience: patienceOf(v.crewPatience, patienceOf(v.patience, d.crewPatience)),
    coachQuits: bool(v.coachQuits, d.coachQuits),
    standInLaps: Math.round(clamp(v.standInLaps, 1, 5, d.standInLaps)),
    coach: bool(v.coach, d.coach),
    radio: bool(v.radio, d.radio),
    debriefZones: Math.round(clamp(v.debriefZones, 0, 10, d.debriefZones)),
    debriefHandbrake: bool(v.debriefHandbrake, d.debriefHandbrake),
    debriefBonus: bool(v.debriefBonus, d.debriefBonus),
    slides: bool(v.slides, d.slides),
    slidesInRace: bool(v.slidesInRace, d.slidesInRace),
    mute: bool(v.mute, d.mute),
    coachTalk: talkLevel(v.coachTalk, d.coachTalk),
    volume: Math.round(clamp(v.volume, 0, 100, d.volume)),
    coachVolume: Math.round(clamp(v.coachVolume, 0, 100, d.coachVolume)),
    crewVolume: Math.round(clamp(v.crewVolume, 0, 100, d.crewVolume)),
    detailedLog: bool(v.detailedLog, d.detailedLog),
    updateCheck: bool(v.updateCheck, d.updateCheck),
    updateAsked: bool(v.updateAsked, d.updateAsked),
    newsSeen: typeof v.newsSeen === 'string' && v.newsSeen.length <= 64 ? v.newsSeen : d.newsSeen,
    texts: normalizeTexts(v.texts, d.texts),
  };
}

/** The pack's text an own text replaced: kept only for the comparison, as long as the packs allow. */
const isTextValue = (value: unknown): value is string | string[] =>
  (typeof value === 'string' && value.length <= 400) || (Array.isArray(value) && value.length <= 50 && value.every((item) => typeof item === 'string' && item.length <= 400));

/** Own texts from the file or the UI, checked as the app checks them: one that cannot be used is dropped, never spoken. */
function normalizeTexts(value: unknown, fallback: RunnerSettings['texts']): RunnerSettings['texts'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const out: RunnerSettings['texts'] = {};
  for (const [language, texts] of Object.entries(value as Record<string, unknown>)) {
    if (!LANGUAGE.test(language) || !texts || typeof texts !== 'object' || Array.isArray(texts)) continue;
    const own: Record<string, OwnText> = {};
    for (const [key, entry] of Object.entries(texts as Record<string, unknown>)) {
      const { text, base } = (entry && typeof entry === 'object' ? entry : {}) as Partial<Record<keyof OwnText, unknown>>;
      // The word lists count as many in every pack (the countdown five): English tells how many.
      const { value: checked } = checkOwnText(key, text, FALLBACK_PACK.texts[key]);
      if (checked !== undefined) own[key] = { text: checked, base: isTextValue(base) ? base : checked };
    }
    if (Object.keys(own).length) out[language] = own;
  }
  return out;
}

/** A language's own texts as the language packs take them: key → text. */
export function ownTexts(settings: Pick<RunnerSettings, 'texts'>, language: string): Record<string, string | string[]> {
  return Object.fromEntries(Object.entries(settings.texts[language] ?? {}).map(([key, own]) => [key, own.text]));
}

/** A language's own texts differ (the voices speaking it put their clips together anew). */
export function textsChanged(a: Pick<RunnerSettings, 'texts'>, b: Pick<RunnerSettings, 'texts'>, language: string): boolean {
  return JSON.stringify(a.texts[language] ?? {}) !== JSON.stringify(b.texts[language] ?? {});
}

/**
 * A name as it is spoken: letters (any alphabet), spaces, hyphens and apostrophes, at most 30 characters.
 * Punctuation would change how the sentence is read (a period ends it), so it is left out.
 */
export function cleanName(value: string): string {
  // Cut by characters, not code units: half of a pair (𠮷) made Piper stop (release check 2026-10-28).
  return [
    ...value
      .replace(/[^\p{L}\p{M}\s'-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, 30)
    .join('')
    .trim();
}

/** Spoken lengths of the prepared clips, which the cue timing needs. */
export interface ClipDurations {
  tone: number;
  intro: number;
  now: number;
  brake: number;
  gear: number;
  turnIn: number;
  /** The longest countdown number. */
  count: number;
}

function patienceOf(value: unknown, fallback: Patience): Patience {
  return value === 'high' || value === 'normal' || value === 'low' ? value : fallback;
}

function talkLevel(value: unknown, fallback: TalkLevel): TalkLevel {
  return value === 'much' || value === 'normal' || value === 'little' ? value : fallback;
}

/**
 * The settings as the coach and the crew work with them: the talk levels switch calls off on top of the single
 * settings ("Ansagen begrenzen", the user, 2026-10-25), and the user's own settings stay as they are.
 * Coach 'normal': no sector calls against the ghost, no tip right after the corner (the feedback comes on the next
 * approach anyway). Coach 'little': the braking calls and one feedback corner; no corner plan, no notes for corners
 * without braking, no calls through problem corners, no lap difference, no cheeky remarks.
 * Crew 'normal': the lap time and position at the line, no sector times. Crew 'little': position, laps to go near the
 * end, fuel and tyres; no lap times, no remarks, no corner calls.
 */
export function withTalk(settings: RunnerSettings): RunnerSettings {
  const s = { ...settings };
  if (s.coachTalk !== 'much') {
    s.ghostSectors = 0;
    s.immediateFeedback = false;
  }
  if (s.coachTalk === 'little') {
    s.plan = false;
    s.cornerShape = false;
    s.fastCorners = false;
    s.guideCorners = false;
    s.lapDelta = false;
    s.style = 'neutral';
    if (s.feedback !== 'off') s.feedback = 1;
  }
  return s;
}

export function coachSettingsFrom(settings: RunnerSettings, durations: ClipDurations): CoachSettings {
  return {
    ...DEFAULT_COACH_SETTINGS,
    countdownSeconds: settings.countdownSeconds,
    countPause: settings.countPause,
    countPauseShort: settings.countPauseShort,
    countSeconds: durations.count,
    announceTone: settings.tone,
    toneSeconds: durations.tone,
    announceIntro: settings.intro,
    introSeconds: durations.intro,
    nowSeconds: durations.now,
    brakeSeconds: durations.brake,
    gearSeconds: durations.gear,
    turnInSeconds: durations.turnIn,
    // The plan cue carries the shape, the gears, or both.
    announcePlan: settings.plan || settings.cornerShape,
    raceCalls: settings.raceCalls ? settings.raceCallsScope : 'off',
    announceAction: settings.actionAfterNow,
    announceGear: settings.gearAfterNow,
    // The corner plan's gears, and where the reference shifts in the corner.
    announceShifts: settings.plan,
    announceTurnIn: settings.turnIn,
    feedback: settings.feedback !== 'off',
    feedbackPerLap: typeof settings.feedback === 'number' ? Math.max(1, settings.feedback) : 'all',
    guideCorners: settings.guideCorners,
    outputLatencySeconds: settings.latencySeconds,
    waitForFirstLap: settings.waitForFirstLap,
    replayCalls: settings.replayCalls,
    helpFirst: settings.helpFirst,
    helpAssists: settings.helpAssists,
    focusLaps: settings.focusLaps,
    fastCorners: settings.fastCorners,
    chainCalls: settings.chainCalls,
  };
}
