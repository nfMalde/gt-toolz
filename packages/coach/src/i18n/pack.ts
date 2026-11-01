// Language packs: JSON files with texts and {placeholders}. Data only, no code, so packs from
// other people cannot execute anything.

import type { Problem } from '../analysis';
import type { CornerGears, CurbCall, LanguagePack, Phrases } from './types';

/** Every text key a pack must have, with the placeholders it may use. */
export const TEXT_KEYS: Record<string, readonly string[]> = {
  count: [],
  /** Number words 1..9; read more fluently than digits by some voices (Piper). */
  numbers: [],
  /**
   * Ordinal words 1..9 in the form used before "gear" ("ersten" in "im ersten Gang").
   * Never "1.": speech engines read a number before a period as the end of a sentence.
   */
  ordinals: [],
  /**
   * Number words 0..20 for recorded voices: a number in a text ("1,7") is matched against the recordings
   * as these words ("eins Komma sieben"). The speech engines never read them.
   */
  'spell.numbers': [],
  /** The word for the decimal mark ("Komma", "point"), for recorded voices. */
  'spell.decimal': [],
  now: [],
  gear: ['gear', 'gearWord'],
  'brakeIntro.full': [],
  'brakeIntro.percent': ['percent'],
  'direction.left': [],
  'direction.right': [],
  'strength.slight': [],
  'strength.medium': [],
  'strength.sharp': [],
  turn: ['direction', 'strength'],

  'problem.no-brake': [],
  'problem.brake-early': ['meters'],
  'problem.brake-late': ['meters'],
  'problem.wrong-gear': ['gear', 'refGear', 'gearWord', 'refGearWord'],
  'problem.slow-apex': ['kmh'],
  'problem.fast-apex': ['kmh'],
  'problem.late-throttle': ['meters'],
  'problem.brake-weak': ['percent', 'refPercent'],
  'problem.brake-weak-barely': [],
  'problem.brake-hard': ['percent', 'refPercent'],
  'problem.no-trail': ['percent', 'refPercent'],
  'problem.trail-long': ['meters'],
  'tiny.no-brake': [],
  'tiny.brake-early': [],
  'tiny.brake-late': [],
  'tiny.wrong-gear': ['refGear', 'refGearWord'],
  'tiny.slow-apex': [],
  'tiny.fast-apex': [],
  'tiny.late-throttle': [],
  'tiny.brake-weak': [],
  'tiny.brake-hard': [],
  'tiny.no-trail': [],
  'tiny.trail-long': [],
  and: [],

  'feedback.long': ['number', 'what'],
  'feedback.short': ['number', 'what'],
  'feedback.tiny': ['number', 'what'],
  'feedback.intro': ['number'],
  'feedback.resolved': ['number'],
  'feedback.guide': [],

  // Help before cheekiness: how to fix a mistake that keeps coming (tip), short (tipTiny).
  'tip.no-brake': [],
  'tip.brake-early': [],
  'tip.brake-late': [],
  // The lowest gear in the corner (ordinal words): shifted further down than the reference, or not far enough.
  'tip.wrong-gear-lower': ['gear', 'refGear', 'gearWord', 'refGearWord'],
  'tip.wrong-gear-higher': ['gear', 'refGear', 'gearWord', 'refGearWord'],
  'tip.slow-apex': ['refKmh'],
  'tip.fast-apex': ['refKmh'],
  'tip.late-throttle': [],
  'tip.brake-weak': ['refPercent'],
  'tip.brake-hard': ['refPercent'],
  'tip.no-trail': ['refPercent'],
  'tip.trail-long': [],
  'tipTiny.no-brake': [],
  'tipTiny.brake-early': [],
  'tipTiny.brake-late': [],
  'tipTiny.wrong-gear': ['refGear', 'refGearWord'],
  'tipTiny.slow-apex': [],
  'tipTiny.fast-apex': [],
  'tipTiny.late-throttle': [],
  'tipTiny.brake-weak': [],
  'tipTiny.brake-hard': [],
  'tipTiny.no-trail': [],
  'tipTiny.trail-long': [],
  'help.long': ['number', 'what', 'tip'],
  'help.short': ['number', 'tip'],
  'help.better': ['what'],
  'help.focusStart': ['zone', 'laps', 'lapsWord'],
  'help.focusStartOne': ['zone'],
  'help.focusEnd': [],
  'help.focusDone': ['zone'],
  // What the helping cue does, said with the tip; and the cues themselves.
  'help.assist.wait': [],
  'help.assist.early-now': [],
  'help.assist.force': [],
  'help.assist.gear': [],
  'help.assist.target': [],
  'help.assist.throttle': [],
  'help.assist.trail': [],
  'help.assist.release': [],
  'assist.wait': [],
  'assist.throttle': [],
  'assist.target': ['kmh'],
  'assist.trail': [],
  'assist.release': [],

  'label.turn': ['turn'],
  'label.brakingZone': ['index'],
  'label.fast': ['index'],

  'briefing.intro': ['track', 'zones'],
  'briefing.introProblems': ['track', 'problemZones', 'zones'],
  'briefing.noProblems': ['track'],
  'briefing.zoneName': ['index', 'label'],
  'briefing.direction.left': [],
  'briefing.direction.right': [],
  'briefing.brake.full': ['speed'],
  'briefing.brake.percent': ['percent', 'speed'],
  'briefing.gears': ['entry', 'exit', 'entryWord', 'exitWord'],
  'briefing.gearsMid': ['entry', 'mid', 'exit', 'entryWord', 'midWord', 'exitWord'],
  'briefing.zone': ['name', 'direction', 'brake', 'gears'],
  'briefing.feedbackName': ['number'],
  'briefing.lastTime': ['what'],
  'briefing.cleanLastTime': [],
  'briefing.trailIntro': [],
  'briefing.trail': ['percent'],
  'briefing.end': [],

  'plan.entry': ['gear', 'gearWord'],
  'plan.entryCurb': ['gear', 'gearWord', 'curb'],
  'plan.exit': ['gear', 'gearWord'],
  'plan.exitCurb': ['gear', 'gearWord', 'curb'],
  'plan.same': ['gear', 'gearWord'],
  'plan.short': ['entry', 'exit', 'entryWord', 'exitWord'],
  // A downshift after the apex, still in the corner (a chicane's second part).
  'plan.mid': ['gear', 'gearWord'],
  'plan.shortMid': ['entry', 'mid', 'exit', 'entryWord', 'midWord', 'exitWord'],
  'plan.trail': [],
  // A curb with how much of the car goes on it (docs/dev/coach-and-texts.md): one wheel, half the car (one side), the whole car;
  // without a level when the reference knows only the side.
  'curb.in': [],
  'curb.in.touch': [],
  'curb.in.half': [],
  'curb.in.full': [],
  'curb.out': [],
  'curb.out.touch': [],
  'curb.out.half': [],
  'curb.out.full': [],
  // Pace notes (docs/dev/coach-and-texts.md): the plan in short words, and the corners without braking.
  'note.gears': ['entry', 'exit', 'entryWord', 'exitWord'],
  'note.gearsMid': ['entry', 'mid', 'exit', 'entryWord', 'midWord', 'exitWord'],
  'note.trail': [],
  'note.curbIn': [],
  'note.curbIn.touch': [],
  'note.curbIn.half': [],
  'note.curbIn.full': [],
  'note.curbOut': [],
  'note.curbOut.touch': [],
  'note.curbOut.half': [],
  'note.curbOut.full': [],
  'note.flat': ['direction'],
  'note.lift': ['kmh', 'direction'],
  'note.then': ['note'],
  // Right after a corner: how much slower out of it, and what to try (docs/dev/coach-and-texts.md).
  'after.slower': ['kmh', 'corner', 'tip'],
  'after.corner.left': [],
  'after.corner.right': [],
  'after.corner.chicane': [],
  // The corner's shape, said with the plan and in the briefing (docs/dev/coach-and-texts.md).
  'shape.hairpin.left': [],
  'shape.hairpin.right': [],
  'shape.tight.left': [],
  'shape.tight.right': [],
  'shape.medium.left': [],
  'shape.medium.right': [],
  'shape.fast.left': [],
  'shape.fast.right': [],
  'shape.chicane.left': [],
  'shape.chicane.right': [],

  'lap.slower': ['seconds'],
  'lap.faster': ['seconds'],
  'lap.onTarget': [],

  'debrief.intro': ['count', 'countWord'],
  'debrief.introOne': [],
  'debrief.zone': ['name', 'what', 'seconds'],
  'debrief.none': [],
  'debrief.end': [],
  'debrief.hint': ['count', 'countWord'],

  // Slides and spins (docs/dev/coach-and-texts.md): what happened, what started it, how to avoid it. {surface}: in the grass or gravel.
  'slide.spin': [],
  'slide.slide': [],
  'slide.surface.grass': [],
  'slide.surface.gravel': [],
  'slide.cause.grass-throttle': ['surface'],
  'slide.cause.grass-brake': ['surface'],
  'slide.cause.grass': ['surface'],
  'slide.cause.curb-throttle': [],
  'slide.cause.throttle': [],
  'slide.cause.brake': [],
  'slide.cause.brake-straight': [],
  'slide.cause.lift': [],
  'slide.cause.contact': [],
  'slide.cause.unknown': [],
  'slide.pendulum': [],
  'slide.tip.grass-throttle': [],
  'slide.tip.grass-brake': [],
  'slide.tip.grass': [],
  'slide.tip.curb-throttle': [],
  'slide.tip.throttle': [],
  'slide.tip.brake': [],
  'slide.tip.brake-straight': [],
  'slide.tip.lift': [],
  'slide.tip.unknown': [],
  'slide.tip.pendulum': [],

  // Cheeky coach style. Lists: one entry is picked at random, never the same twice in a row.
  'cheeky.no-brake': ['zone', 'times'],
  'cheeky.brake-early': ['zone', 'times'],
  'cheeky.brake-late': ['zone', 'times'],
  'cheeky.wrong-gear': ['zone', 'times'],
  'cheeky.slow-apex': ['zone', 'times'],
  'cheeky.fast-apex': ['zone', 'times'],
  'cheeky.late-throttle': ['zone', 'times'],
  'cheeky.brake-weak': ['zone', 'times'],
  'cheeky.brake-hard': ['zone', 'times'],
  'cheeky.no-trail': ['zone', 'times'],
  'cheeky.trail-long': ['zone', 'times'],
  'cheeky.level1': ['zone', 'times'],
  'cheeky.level2': ['zone', 'times'],
  'cheeky.level3': ['zone', 'times'],
  'cheeky.relief': ['zone'],
  'cheeky.quit': [],
  'cheeky.standIn': [],
  'cheeky.standInQuit': [],
  'cheeky.comeback': [],
  'cheeky.comebackEarly': [],
  /** A cheeky extra mistake after the debrief's list ("Fehler Nummer fünf: GT7 installiert."); {number} as a word. */
  'cheeky.debriefBonus': ['number'],

  /** Where the driver's name goes; {text} is the sentence. */
  address: ['name', 'text'],

  // Race crew
  'crew.raceStart': [],
  // Times as they are said: "36,1 Sekunden", "eine Minute 36,1".
  'time.seconds': ['seconds'],
  'time.minute': ['seconds'],
  'time.minutes': ['minutes', 'seconds'],
  // Against the own best lap (the crew does not use the reference: races are no solo laps).
  'crew.sectorFaster': ['sectorWord', 'time'],
  'crew.sectorSlower': ['sectorWord', 'time'],
  'crew.sectorEven': ['sectorWord'],
  'crew.lapTime': ['lap', 'time'],
  'crew.lapSlower': ['time'],
  'crew.lapEven': [],
  'crew.newBest': [],
  // Against the ghost (the reference lap): in time trials (the coach) and, when it fits the track, in races.
  'ghost.ahead': ['time'],
  'ghost.behind': ['time'],
  'ghost.even': [],
  'sector.ghost': ['sectorWord', 'ghost'],
  'crew.position': ['position', 'cars'],
  'crew.placeGained': [],
  'crew.placesGained': ['places'],
  'crew.placeLost': [],
  'crew.placesLost': ['places'],
  'crew.fuelLaps': ['laps', 'liters'],
  'crew.fuelFinish': [],
  'crew.fuelPit': ['lap'],
  'crew.fuelPitNow': [],
  'crew.tyresWear': ['seconds'],
  'crew.tyresPit': [],
  'crew.tyresWithFuel': [],
  'crew.tyreHot': ['wheel', 'degrees'],
  'crew.tyresCold': [],
  'crew.tyresWarm': [],
  'crew.tyresHotAll': [],
  'crew.tyresRising': ['degrees'],
  'crew.tyresFalling': ['degrees'],
  'crew.wheel.fl': [],
  'crew.wheel.fr': [],
  'crew.wheel.rl': [],
  'crew.wheel.rr': [],
  'crew.lapsLeft': ['laps', 'lapsWord'],
  'crew.lastLap': [],
  'crew.finish': [],
  'cheeky.offtrack.level1': ['times'],
  'cheeky.offtrack.level2': ['times'],
  'cheeky.offtrack.level3': ['times'],
  // Level 4 in races: the race engineer quits, the team boss takes the radio for some laps, then the engineer is back
  // (early: the boss had enough too).
  'cheeky.crewQuit': [],
  'cheeky.bossIntro': [],
  'cheeky.bossQuit': [],
  'cheeky.crewComeback': [],
  'cheeky.crewComebackEarly': [],

  'session.unknownTrack': [],
  'session.referenceLoaded': ['track'],
  'session.referenceLearned': ['track'],
  'session.playReplay': [],
  'session.otherCar': [],
  // The reference's car and player, said when it is loaded or learned; the car of a different car warning.
  'session.referenceLoadedAbout': ['track', 'about'],
  'session.referenceLearnedAbout': ['track', 'about'],
  // The reference picked for the track being driven, or the driver's own laps learned (docs/dev/telemetry.md).
  'session.referenceSwitched': ['track'],
  'session.referenceSwitchedAbout': ['track', 'about'],
  'session.learnOwn': ['laps', 'lapsWord'],
  'session.about.carDriver': ['car', 'driver'],
  'session.about.car': ['car'],
  'session.about.driver': ['driver'],
  'session.otherCarNamed': ['car'],
  // "Gr.3" in car names, spoken.
  'car.group': ['group'],

  'calibration.start': [],
  'calibration.try': ['left', 'leftWord'],
  'calibration.early': [],
  'calibration.late': [],
  'calibration.done': ['seconds'],
};

/** Keys whose value is a list of words (no placeholders). */
export const LIST_KEYS = new Set(['count', 'numbers', 'ordinals', 'spell.numbers']);
/** Keys whose value is a list of texts with placeholders; one of them is picked when spoken. */
export const TEXT_LIST_KEYS = new Set(Object.keys(TEXT_KEYS).filter((key) => key.startsWith('cheeky.')));
/** Abbreviations like "km/h": speech engines spell them out letter by letter (with a rising, question-like tone). */
export const ABBREVIATION = /\b[A-Za-z]+\/[A-Za-z]+\b/;
export const MAX_TEXT_LENGTH = 400;

export interface PackValidation {
  /** Usable pack, or undefined if the file is not a language pack at all. */
  pack?: LanguagePack;
  /** Problems found; missing texts fall back to the fallback pack. */
  warnings: string[];
}

/** Checks a parsed JSON value. Never throws; returns what is usable and what is wrong. */
/** Closer than this (ms) counts as level with the best lap. */
const EVEN_MS = 50;

export function validateLanguagePack(value: unknown): PackValidation {
  const warnings: string[] = [];
  if (!value || typeof value !== 'object') return { warnings: ['not a JSON object'] };
  const raw = value as Partial<LanguagePack>;
  if (raw.format !== 'gt-toolz-language-pack') return { warnings: ['"format" must be "gt-toolz-language-pack"'] };
  if (raw.version !== 1) return { warnings: [`unsupported version ${String(raw.version)}`] };
  if (typeof raw.id !== 'string' || !/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(raw.id)) return { warnings: ['"id" must be a language code like "de" or "pt-BR"'] };
  if (typeof raw.name !== 'string' || !raw.name.trim()) warnings.push('"name" is missing');
  if (typeof raw.locale !== 'string') warnings.push('"locale" is missing');
  const textsVersion = typeof raw.textsVersion === 'number' && Number.isInteger(raw.textsVersion) && raw.textsVersion >= 1 ? raw.textsVersion : 1;
  if (raw.textsVersion !== undefined && textsVersion !== raw.textsVersion) warnings.push('"textsVersion" must be a whole number from 1');
  const texts = raw.texts && typeof raw.texts === 'object' ? raw.texts : {};

  const clean: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(texts)) {
    const allowed = Object.hasOwn(TEXT_KEYS, key) ? TEXT_KEYS[key] : undefined;
    if (!allowed) {
      warnings.push(`unknown text "${key}"`);
      continue;
    }
    if (TEXT_LIST_KEYS.has(key)) {
      const items = Array.isArray(value) ? value : [];
      const usable = items.filter((item): item is string => {
        if (typeof item !== 'string' || !item.trim() || item.length > MAX_TEXT_LENGTH) return false;
        const unknown = [...item.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((name) => !allowed.includes(name));
        if (unknown.length) warnings.push(`"${key}": "${item.slice(0, 40)}…" uses unknown placeholder(s) ${unknown.map((u) => `{${u}}`).join(', ')}`);
        if (ABBREVIATION.test(item)) warnings.push(`"${key}": "${item.slice(0, 40)}…" contains an abbreviation; write it out, it is spoken`);
        return unknown.length === 0;
      });
      if (usable.length) clean[key] = usable;
      else warnings.push(`"${key}" must be a list of texts`);
      continue;
    }
    if (LIST_KEYS.has(key)) {
      if (Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length <= MAX_TEXT_LENGTH)) clean[key] = value;
      else warnings.push(`"${key}" must be a list of texts`);
      continue;
    }
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
      warnings.push(`"${key}" must be a text (max. ${MAX_TEXT_LENGTH} characters)`);
      continue;
    }
    const unknown = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((name) => !allowed.includes(name));
    if (unknown.length) {
      warnings.push(`"${key}" uses unknown placeholder(s) ${unknown.map((u) => `{${u}}`).join(', ')}`);
      continue;
    }
    if (ABBREVIATION.test(value)) warnings.push(`"${key}" contains an abbreviation (${value.match(ABBREVIATION)![0]}); write it out, it is spoken`);
    clean[key] = value;
  }
  // Words the engine reads wrongly, with a spelling that sounds right.
  const pronounce: Record<string, string> = {};
  if (raw.pronounce !== undefined) {
    if (raw.pronounce && typeof raw.pronounce === 'object' && !Array.isArray(raw.pronounce)) {
      for (const [word, spoken] of Object.entries(raw.pronounce as Record<string, unknown>)) {
        if (/^[\p{L}'-]{1,40}$/u.test(word) && typeof spoken === 'string' && spoken.trim() && spoken.length <= 60) pronounce[word] = spoken.trim();
        else warnings.push(`"pronounce": "${word.slice(0, 40)}" must be one word with a spoken spelling`);
      }
    } else warnings.push('"pronounce" must be an object: word → spoken spelling');
  }

  const missing = Object.keys(TEXT_KEYS).filter((key) => !(key in clean));
  if (missing.length) {
    const shown = missing.slice(0, 5).map((k) => `"${k}"`).join(', ');
    warnings.push(`${missing.length} text(s) missing, English is used for them: ${shown}${missing.length > 5 ? ', ...' : ''}`);
  }

  return {
    pack: { format: 'gt-toolz-language-pack', version: 1, textsVersion, id: raw.id, name: raw.name?.trim() || raw.id, locale: raw.locale ?? raw.id, texts: clean, pronounce },
    warnings,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ''));
}

/** Builds the phrases of a pack; texts the pack lacks come from the fallback pack. */
export function phrasesFromPack(pack: LanguagePack, fallback: LanguagePack): Phrases {
  const text = (key: string, values: Record<string, string | number> = {}): string => {
    const own = pack.texts[key];
    const template = typeof own === 'string' ? own : fallback.texts[key];
    return fill(typeof template === 'string' ? template : key, values);
  };
  const list = (key: string): string[] => {
    const own = pack.texts[key];
    const fromFallback = fallback.texts[key];
    return Array.isArray(own) ? own : Array.isArray(fromFallback) ? fromFallback : [];
  };
  /** Seconds with one decimal in the pack's language ("1,7" / "1.7"). */
  const seconds = (value: number): string =>
    Math.abs(value).toLocaleString(pack.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  /**
   * The entries of each text list said so far: none comes again before the list is through (the user, 2026-10-21:
   * the crew said the same four lines over and over), and then not the one just said.
   */
  const said = new Map<string, string[]>();
  const pick = (key: string, values: Record<string, string | number>): string | undefined => {
    const own = pack.texts[key];
    const fromFallback = fallback.texts[key];
    const items = Array.isArray(own) ? own : Array.isArray(fromFallback) ? fromFallback : [];
    if (!items.length) return undefined;
    let used = said.get(key) ?? [];
    let fresh = items.filter((item) => !used.includes(item));
    if (!fresh.length) {
      // Through the list: start over, except with the last one.
      used = used.slice(0, 1);
      fresh = items.filter((item) => !used.includes(item));
      if (!fresh.length) fresh = items;
    }
    const choice = fresh[Math.floor(Math.random() * fresh.length)]!;
    said.set(key, [choice, ...used]);
    return fill(choice, values);
  };
  // Pronunciations: whole words only, longest first ("Curbs" before "Curb"). Words are letters, ' and - only.
  const pronounced = Object.keys(pack.pronounce ?? {}).sort((a, b) => b.length - a.length);
  const pronunciation = pronounced.length ? new RegExp(`(?<!\\p{L})(${pronounced.join('|')})(?!\\p{L})`, 'gu') : undefined;

  /** A time as it is said, rounded to tenths: "0,4 Sekunden", "eine Minute 36,1", "2 Minuten 5,0". */
  const spokenTime = (ms: number): string => {
    const total = Math.round(Math.abs(ms) / 100) / 10;
    if (total < 60) return text('time.seconds', { seconds: seconds(total) });
    const minutes = Math.floor(total / 60);
    const rest = seconds(total - minutes * 60);
    return minutes === 1 ? text('time.minute', { seconds: rest }) : text('time.minutes', { minutes, seconds: rest });
  };

  /** The gap to the ghost (positive: the ghost is ahead): "Ghost 1,2 Sekunden vorn". */
  const ghostGap = (gapMs: number): string =>
    Math.abs(gapMs) < EVEN_MS ? text('ghost.even') : text(gapMs > 0 ? 'ghost.ahead' : 'ghost.behind', { time: spokenTime(gapMs) });

  /** The word for n from a list (1-based); the number itself if the list has none. */
  const word = (key: string, n: number): string => list(key)[n - 1] ?? String(n);
  /** A corner's gears as placeholders: entry, mid, exit and their words. */
  const gearValues = ({ entry, mid, exit }: CornerGears, words: 'ordinals' | 'numbers'): Record<string, string | number> => ({
    entry,
    exit,
    entryWord: word(words, entry),
    exitWord: word(words, exit),
    ...(mid ? { mid, midWord: word(words, mid) } : {}),
  });

  /** A curb with its level ("Curb innen halb"); without one, only that it is used ("Curb innen mitnehmen"). */
  const curbText = (prefix: 'curb.in' | 'curb.out' | 'note.curbIn' | 'note.curbOut', call: CurbCall): string =>
    text(call === 'used' ? prefix : `${prefix}.${call}`);

  const problem = (p: Problem): string => {
    switch (p.kind) {
      case 'brake-early':
      case 'brake-late':
      case 'late-throttle':
        return text(`problem.${p.kind}`, { meters: p.meters });
      case 'wrong-gear':
        return text('problem.wrong-gear', { gear: p.gear, refGear: p.refGear, gearWord: word('numbers', p.gear), refGearWord: word('numbers', p.refGear) });
      case 'slow-apex':
      case 'fast-apex':
        return text(`problem.${p.kind}`, { kmh: p.kmh });
      case 'brake-weak':
        return p.percent < 10 ? text('problem.brake-weak-barely') : text('problem.brake-weak', { percent: p.percent, refPercent: p.refPercent });
      case 'brake-hard':
        return text('problem.brake-hard', { percent: p.percent, refPercent: p.refPercent });
      case 'no-trail':
        return text('problem.no-trail', { percent: p.percent, refPercent: p.refPercent });
      case 'trail-long':
        return text('problem.trail-long', { meters: p.meters });
      case 'no-brake':
        return text('problem.no-brake');
    }
  };
  const problemTiny = (p: Problem): string =>
    p.kind === 'wrong-gear' ? text('tiny.wrong-gear', { refGear: p.refGear, refGearWord: word('numbers', p.refGear) }) : text(`tiny.${p.kind}`);

  /** A car name as it is spoken: without the model year ("'17"), "Gr.3" as "Gruppe 3", "VGT" as "Vision GT". */
  const carSpoken = (name: string): string =>
    name
      .replace(/\s*'\d{2}\b/g, '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\bGr\.\s*(\w+)/g, (_, group: string) => text('car.group', { group }))
      .replace(/\bVGT\b/g, 'Vision GT')
      .replace(/\s+/g, ' ')
      .trim();
  /** The reference's car and player in one sentence, as far as they are known ('' = neither). */
  const aboutReference = (reference?: { car?: string; driver?: string }): string => {
    const car = reference?.car ? carSpoken(reference.car) : '';
    // Player names are often gamertags: underscores read as pauses.
    const driver = reference?.driver?.replace(/_+/g, ' ').trim() ?? '';
    if (car && driver) return text('session.about.carDriver', { car, driver });
    if (car) return text('session.about.car', { car });
    return driver ? text('session.about.driver', { driver }) : '';
  };

  return {
    id: pack.id,
    name: pack.name,
    locale: pack.locale,

    count: (n) => list('count')[n - 1] ?? String(n),
    numberWords: list('spell.numbers'),
    decimalWord: text('spell.decimal'),
    now: text('now'),
    gear: (gear) => text('gear', { gear, gearWord: word('numbers', gear) }),
    brakeIntro: (force) => (force === 'full' ? text('brakeIntro.full') : text('brakeIntro.percent', { percent: force })),
    turn: (direction, strength) => text('turn', { direction: text(`direction.${direction}`), strength: text(`strength.${strength}`) }),

    problem,
    problemTiny,
    and: text('and'),

    feedbackLong: (number, what) => text('feedback.long', { number, what }),
    feedbackShort: (number, what) => text('feedback.short', { number, what }),
    feedbackTiny: (number, what) => text('feedback.tiny', { number, what }),
    feedbackIntro: (number) => text('feedback.intro', { number }),
    feedbackResolved: (number) => text('feedback.resolved', { number }),

    tip: (p, refApexKmh) => {
      const refKmh = Math.round(refApexKmh / 5) * 5;
      switch (p.kind) {
        case 'wrong-gear':
          return text(p.gear < p.refGear ? 'tip.wrong-gear-lower' : 'tip.wrong-gear-higher', {
            gear: p.gear,
            refGear: p.refGear,
            gearWord: word('ordinals', p.gear),
            refGearWord: word('ordinals', p.refGear),
          });
        case 'slow-apex':
        case 'fast-apex':
          return text(`tip.${p.kind}`, { refKmh });
        case 'brake-weak':
        case 'brake-hard':
        case 'no-trail':
          return text(`tip.${p.kind}`, { refPercent: p.refPercent });
        default:
          return text(`tip.${p.kind}`);
      }
    },
    tipTiny: (p) =>
      p.kind === 'wrong-gear' ? text('tipTiny.wrong-gear', { refGear: p.refGear, refGearWord: word('numbers', p.refGear) }) : text(`tipTiny.${p.kind}`),
    helpLong: (number, what, tip) => text('help.long', { number, what, tip }),
    helpShort: (number, tip) => text('help.short', { number, tip }),
    helpAssistNote: (assist) => text(`help.assist.${assist}`),
    feedbackGuide: text('feedback.guide'),
    helpBetter: (what) => text('help.better', { what }),
    focusStart: (zone, laps) => (laps === 1 ? text('help.focusStartOne', { zone }) : text('help.focusStart', { zone, laps, lapsWord: word('numbers', laps) })),
    focusEnd: text('help.focusEnd'),
    focusDone: (zone) => text('help.focusDone', { zone }),
    assistWait: text('assist.wait'),
    assistThrottle: text('assist.throttle'),
    assistTarget: (kmh) => text('assist.target', { kmh: Math.round(kmh / 5) * 5 }),
    assistTrail: text('assist.trail'),
    assistRelease: text('assist.release'),
    planTrail: text('plan.trail'),
    noteTrail: text('note.trail'),

    turnLabel: (turn) => text('label.turn', { turn }),
    brakingZoneLabel: (index) => text('label.brakingZone', { index }),
    fastCornerLabel: (index) => text('label.fast', { index }),

    briefingIntro: (track, zones) => text('briefing.intro', { track, zones }),
    briefingIntroProblems: (track, problemZones, zones) => text('briefing.introProblems', { track, problemZones, zones }),
    briefingNoProblems: (track) => text('briefing.noProblems', { track }),
    briefingZoneName: (index, label) => text('briefing.zoneName', { index, label }),
    briefingZone: ({ name, direction, shape, force, speed, gears }) =>
      text('briefing.zone', {
        name,
        direction: shape ? capitalize(text(`shape.${shape}.${direction}`)) : text(`briefing.direction.${direction}`),
        brake: force === 'full' ? text('briefing.brake.full', { speed }) : text('briefing.brake.percent', { percent: force, speed }),
        gears: text(gears.mid ? 'briefing.gearsMid' : 'briefing.gears', gearValues(gears, 'ordinals')),
      }),
    briefingFeedbackName: (number) => text('briefing.feedbackName', { number }),
    briefingLastTime: (what) => text('briefing.lastTime', { what }),
    briefingCleanLastTime: text('briefing.cleanLastTime'),
    briefingTrailIntro: text('briefing.trailIntro'),
    briefingTrail: (percent) => text('briefing.trail', { percent: Math.round(percent / 10) * 10 }),
    briefingEnd: text('briefing.end'),

    cornerShape: (shape, direction) => `${capitalize(text(`shape.${shape}.${direction}`))}.`,
    thenShape: (shape, direction) => `${capitalize(text('note.then', { note: text(shape ? `shape.${shape}.${direction}` : `direction.${direction}`) }))}.`,

    cornerPlan: (gears, curbIn, curbOut, variant) => {
      const { entry, mid, exit } = gears;
      const gear = (key: string, n: number, curb = '') => capitalize(text(key, { gear: n, gearWord: word('ordinals', n), curb }));
      if (entry === exit && !mid && (variant === 'short' || (!curbIn && !curbOut))) return `${gear('plan.same', entry)}.`;
      if (variant === 'short') return `${capitalize(text(mid ? 'plan.shortMid' : 'plan.short', gearValues(gears, 'ordinals')))}.`;
      const entryPart = curbIn ? gear('plan.entryCurb', entry, curbText('curb.in', curbIn)) : gear('plan.entry', entry);
      const midPart = mid ? ` ${gear('plan.mid', mid)}.` : '';
      const exitPart = curbOut ? gear('plan.exitCurb', exit, curbText('curb.out', curbOut)) : gear('plan.exit', exit);
      return `${entryPart}.${midPart} ${exitPart}.`;
    },
    cornerNotes: ({ shape, direction, gears, curbIn, curbOut }) => {
      const parts = [shape ? text(`shape.${shape}.${direction}`) : text(`direction.${direction}`)];
      if (gears) {
        const { entry, mid, exit } = gears;
        parts.push(
          entry === exit && !mid
            ? text('gear', { gear: entry, gearWord: word('numbers', entry) })
            : text(mid ? 'note.gearsMid' : 'note.gears', gearValues(gears, 'numbers')),
        );
      }
      if (curbIn) parts.push(curbText('note.curbIn', curbIn));
      if (curbOut) parts.push(curbText('note.curbOut', curbOut));
      return `${capitalize(parts.join(', '))}.`;
    },
    fastNote: ({ kind, direction, kmh, curbIn, curbOut, chained }) => {
      const way = text(`direction.${direction}`);
      // Feathering sounds like a lift (the user, 2026-10-31: "Lift" is what drivers say); only the detection differs.
      const parts = [kind === 'flat' ? text('note.flat', { direction: way }) : text('note.lift', { direction: way, kmh: Math.round(kmh / 5) * 5 })];
      if (curbIn) parts.push(curbText('note.curbIn', curbIn));
      if (curbOut) parts.push(curbText('note.curbOut', curbOut));
      const note = parts.join(', ');
      return `${capitalize(chained ? text('note.then', { note }) : note)}.`;
    },
    afterCorner: (kmh, corner, tip) => text('after.slower', { kmh, corner: text(`after.corner.${corner}`), tip }),

    remark: (level, problem, zone, times) => {
      const values = { zone, times: word('numbers', times) };
      const specific = () => pick(`cheeky.${problem}`, values);
      const general = () => pick(`cheeky.level${level}`, values);
      // Mildly cheeky: about the mistake. Annoyed: either. Lost it: anything goes.
      if (level === 1) return specific() ?? general();
      if (level === 2) return (Math.random() < 0.5 ? specific() : general()) ?? general() ?? specific();
      return general() ?? specific();
    },
    relief: (zone) => pick('cheeky.relief', { zone }),
    coachQuit: () => pick('cheeky.quit', {}),
    standInIntro: () => pick('cheeky.standIn', {}),
    standInQuit: () => pick('cheeky.standInQuit', {}),
    coachComeback: (early) => pick(early ? 'cheeky.comebackEarly' : 'cheeky.comeback', {}),

    spoken: (sentence) => (pronunciation ? sentence.replace(pronunciation, (w) => pack.pronounce?.[w] ?? w) : sentence),
    address: (name, sentence) => text('address', { name, text: sentence }),
    crewRaceStart: text('crew.raceStart'),
    crewSector: (sector, deltaMs, ghostMs) => {
      const sectorWord = word('numbers', sector);
      const ghost = ghostMs === undefined ? '' : ghostGap(ghostMs);
      if (deltaMs === undefined) return ghost ? capitalize(text('sector.ghost', { sectorWord, ghost })) : '';
      const own =
        Math.abs(deltaMs) < EVEN_MS
          ? text('crew.sectorEven', { sectorWord })
          : text(deltaMs < 0 ? 'crew.sectorFaster' : 'crew.sectorSlower', { sectorWord, time: spokenTime(deltaMs) });
      return ghost ? `${own} ${capitalize(ghost)}.` : own;
    },
    crewLap: (lap, timeMs, best, ghostMs) => {
      const head = text('crew.lapTime', { lap, time: spokenTime(timeMs) });
      const own =
        best === 'new'
          ? text('crew.newBest')
          : best === undefined
            ? ''
            : Math.abs(best) < EVEN_MS
              ? text('crew.lapEven')
              : capitalize(text('crew.lapSlower', { time: spokenTime(best) }));
      const ghost = ghostMs === undefined ? '' : `${capitalize(ghostGap(ghostMs))}.`;
      return [head, own, ghost].filter(Boolean).join(' ');
    },
    sectorGhost: (sector, gapMs) => capitalize(text('sector.ghost', { sectorWord: word('numbers', sector), ghost: ghostGap(gapMs) })),
    crewPosition: (position, cars, change) => {
      const where = text('crew.position', { position, cars });
      if (!change) return `${where}.`;
      const n = Math.abs(change);
      const moved = change > 0 ? (n === 1 ? text('crew.placeGained') : text('crew.placesGained', { places: n })) : n === 1 ? text('crew.placeLost') : text('crew.placesLost', { places: n });
      return `${where}, ${moved}.`;
    },
    crewFuel: ({ lapsLeft, perLap, toFinish, pitLap }) => {
      const laps = text('crew.fuelLaps', { laps: Math.floor(lapsLeft), liters: seconds(perLap) });
      if (toFinish) return `${laps} ${text('crew.fuelFinish')}`;
      if (pitLap === 'now') return `${laps} ${text('crew.fuelPitNow')}`;
      return pitLap === undefined ? laps : `${laps} ${text('crew.fuelPit', { lap: pitLap })}`;
    },
    crewTyres: ({ lossS, pitNow, withFuel }) => {
      const wear = text('crew.tyresWear', { seconds: seconds(lossS) });
      return withFuel ? `${wear} ${text('crew.tyresWithFuel')}` : pitNow ? `${wear} ${text('crew.tyresPit')}` : wear;
    },
    crewTyreState: (state) => text(state === 'cold' ? 'crew.tyresCold' : state === 'warm' ? 'crew.tyresWarm' : 'crew.tyresHotAll'),
    crewTyreTrend: (direction, degrees) => text(direction === 'rising' ? 'crew.tyresRising' : 'crew.tyresFalling', { degrees }),
    crewTyreHot: (wheel, degrees) => text('crew.tyreHot', { wheel: text(`crew.wheel.${['fl', 'fr', 'rl', 'rr'][wheel]}`), degrees }),
    crewLapsLeft: (laps) => text('crew.lapsLeft', { laps, lapsWord: word('numbers', laps) }),
    crewLastLap: text('crew.lastLap'),
    crewFinish: text('crew.finish'),
    crewOffTrack: (level, times) => pick(`cheeky.offtrack.level${level}`, { times: word('numbers', times) }),
    crewQuit: () => pick('cheeky.crewQuit', {}),
    bossIntro: () => pick('cheeky.bossIntro', {}),
    bossQuit: () => pick('cheeky.bossQuit', {}),
    crewComeback: (early) => pick(early ? 'cheeky.crewComebackEarly' : 'cheeky.crewComeback', {}),

    calibrationStart: text('calibration.start'),
    calibrationTry: (left) => text('calibration.try', { left, leftWord: word('numbers', left) }),
    calibrationEarly: text('calibration.early'),
    calibrationLate: text('calibration.late'),
    calibrationDone: (value) => text('calibration.done', { seconds: seconds(value) }),

    lapDelta: (deltaMs) => {
      // Rounded to tenths, so "0,0 Sekunden" is never said.
      if (Math.abs(deltaMs) < 50) return text('lap.onTarget');
      return text(deltaMs > 0 ? 'lap.slower' : 'lap.faster', { seconds: seconds(deltaMs / 1000) });
    },

    debriefIntro: (count) => (count === 1 ? text('debrief.introOne') : text('debrief.intro', { count, countWord: word('numbers', count) })),
    debriefZone: (name, what, lossS) => text('debrief.zone', { name, what, seconds: seconds(lossS) }),
    debriefNone: text('debrief.none'),
    debriefEnd: text('debrief.end'),
    debriefBonus: (number) => pick('cheeky.debriefBonus', { number: word('numbers', number) }),
    debriefHint: (count) => text('debrief.hint', { count, countWord: word('numbers', count) }),

    slide: (slide) => {
      const surface = text(slide.offSurface === 'S' ? 'slide.surface.gravel' : 'slide.surface.grass');
      const parts = [text(`slide.${slide.kind}`), text(`slide.cause.${slide.cause}`, { surface })];
      if (slide.pendulum) parts.push(text('slide.pendulum'));
      return parts.join(' ');
    },
    // A contact needs no tip; its swing afterwards does.
    slideTip: (slide) => (slide.pendulum ? text('slide.tip.pendulum') : slide.cause === 'contact' ? undefined : text(`slide.tip.${slide.cause}`)),

    unknownTrack: text('session.unknownTrack'),
    referenceLoaded: (track, reference) => {
      const about = aboutReference(reference);
      return about ? text('session.referenceLoadedAbout', { track, about }) : text('session.referenceLoaded', { track });
    },
    referenceLearned: (track, reference) => {
      const about = aboutReference(reference);
      return about ? text('session.referenceLearnedAbout', { track, about }) : text('session.referenceLearned', { track });
    },
    referenceSwitched: (track, reference) => {
      const about = aboutReference(reference);
      return about ? text('session.referenceSwitchedAbout', { track, about }) : text('session.referenceSwitched', { track });
    },
    learnOwn: (laps) => text('session.learnOwn', { laps, lapsWord: word('numbers', laps) }),
    playReplay: text('session.playReplay'),
    otherCar: text('session.otherCar'),
    otherCarNamed: (car) => text('session.otherCarNamed', { car: carSpoken(car) }),
    carSpoken,
  };
}
