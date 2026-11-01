// The user's own texts (docs/dev/coach-and-texts.md "Own texts"): any text of a language pack in the user's words, set
// in the app (the user, 2026-10-31: "Lift" or "Gas weg", "wie man das nennen soll, kann dann der Nutzer entscheiden").
// Checked like a pack's texts; the pack keeps the standard, the own text goes over it.

import { ABBREVIATION, fill, LIST_KEYS, MAX_TEXT_LENGTH, TEXT_KEYS, TEXT_LIST_KEYS } from './pack';
import type { LanguagePack } from './types';

export type TextValue = string | string[];
/** A text, a list of texts (one is picked when spoken), or a fixed number of words (countdown, number words). */
export type TextKind = 'text' | 'list' | 'words';

/** Areas of the texts, in the order the app shows them. */
export const TEXT_GROUPS = ['basics', 'notes', 'plan', 'feedback', 'help', 'slides', 'briefing', 'lap', 'cheeky', 'crew', 'session', 'calibration', 'recordings'] as const;
export type TextGroup = (typeof TEXT_GROUPS)[number];

/**
 * The short calls, shown first: the words of the braking calls and pace notes, the ones a driver most likely wants
 * in their own words ("liften" or "Gas weg").
 */
export const QUICK_TEXTS: readonly string[] = [
  'count',
  'now',
  'gear',
  'brakeIntro.full',
  'brakeIntro.percent',
  'direction.left',
  'direction.right',
  'note.flat',
  'note.lift',
  'note.then',
  'note.trail',
  'note.gears',
  'note.gearsMid',
  'note.curbIn',
  'note.curbIn.touch',
  'note.curbIn.half',
  'note.curbIn.full',
  'note.curbOut',
  'note.curbOut.touch',
  'note.curbOut.half',
  'note.curbOut.full',
  'shape.hairpin.left',
  'shape.hairpin.right',
  'shape.tight.left',
  'shape.tight.right',
  'shape.medium.left',
  'shape.medium.right',
  'shape.fast.left',
  'shape.fast.right',
  'shape.chicane.left',
  'shape.chicane.right',
  'assist.wait',
  'assist.throttle',
  'assist.target',
  'assist.trail',
  'assist.release',
];

/** The crew's lines of the cheeky style (the rest of `cheeky.*` is the coach's). */
const CREW_CHEEKY = /^cheeky\.(offtrack\.|crewQuit$|boss|crewComeback)/;

export function textGroup(key: string): TextGroup {
  if (key.startsWith('spell.')) return 'recordings';
  if (/^(note|shape|curb)\./.test(key)) return 'notes';
  if (/^(plan|label)\./.test(key)) return 'plan';
  if (/^(problem|tiny|feedback|after)\./.test(key)) return 'feedback';
  if (/^(tip|tipTiny|help|assist)\./.test(key)) return 'help';
  if (key.startsWith('slide.')) return 'slides';
  if (key.startsWith('briefing.')) return 'briefing';
  if (/^(lap|debrief|time|ghost|sector)\./.test(key)) return 'lap';
  if (key.startsWith('crew.') || CREW_CHEEKY.test(key)) return 'crew';
  if (key.startsWith('cheeky.')) return 'cheeky';
  if (/^(session|car)\./.test(key)) return 'session';
  if (key.startsWith('calibration.')) return 'calibration';
  return 'basics';
}

export function textKind(key: string): TextKind {
  return TEXT_LIST_KEYS.has(key) ? 'list' : LIST_KEYS.has(key) ? 'words' : 'text';
}

/** The gears in these are said as ordinal words ("im dritten Gang"), elsewhere as numbers ("Gang drei"). */
export function usesOrdinals(key: string): boolean {
  return /^(plan|briefing)\./.test(key) || key.startsWith('tip.wrong-gear');
}

export type TextProblem =
  | { kind: 'unknown-key' }
  | { kind: 'empty' }
  | { kind: 'too-long'; max: number }
  /** A list longer than any pack has. */
  | { kind: 'too-many'; max: number }
  /** Placeholders this text cannot have. */
  | { kind: 'placeholder'; names: string[] }
  /** Words: exactly as many as the standard has (the countdown counts five). */
  | { kind: 'count'; count: number }
  /** Only a hint: spelled out letter by letter. */
  | { kind: 'abbreviation'; word: string }
  /** Only a hint: the standard says these, the own text does not. */
  | { kind: 'dropped'; names: string[] };

/** A hint does not keep a text from being used. */
export function isHint(problem: TextProblem): boolean {
  return problem.kind === 'abbreviation' || problem.kind === 'dropped';
}

export interface TextCheck {
  /** The text as it is used; undefined: it cannot be. */
  value?: TextValue;
  problems: TextProblem[];
}

const placeholdersIn = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))];
/** Entries of a list at most (the packs have up to 21: the number words for recordings). */
const MAX_LIST_ITEMS = 50;

/** Checks an own text for a key against what the key allows; standard: the pack's text, for the hints and the word count. */
export function checkOwnText(key: string, value: unknown, standard?: TextValue): TextCheck {
  const allowed = Object.hasOwn(TEXT_KEYS, key) ? TEXT_KEYS[key]! : undefined;
  if (!allowed) return { problems: [{ kind: 'unknown-key' }] };
  const kind = textKind(key);
  const problems: TextProblem[] = [];
  const items = kind === 'text' ? (typeof value === 'string' ? [value] : []) : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  if (!items.length || items.some((item) => !item.trim())) problems.push({ kind: 'empty' });
  if (items.some((item) => item.length > MAX_TEXT_LENGTH)) problems.push({ kind: 'too-long', max: MAX_TEXT_LENGTH });
  if (items.length > MAX_LIST_ITEMS) problems.push({ kind: 'too-many', max: MAX_LIST_ITEMS });
  const unknown = [...new Set(items.flatMap(placeholdersIn))].filter((name) => kind === 'words' || !allowed.includes(name));
  if (unknown.length) problems.push({ kind: 'placeholder', names: unknown });
  if (kind === 'words' && Array.isArray(standard) && items.length !== standard.length) problems.push({ kind: 'count', count: standard.length });
  const abbreviation = items.map((item) => item.match(ABBREVIATION)?.[0]).find(Boolean);
  if (abbreviation) problems.push({ kind: 'abbreviation', word: abbreviation });
  if (kind === 'text' && typeof standard === 'string' && items.length) {
    const dropped = placeholdersIn(standard).filter((name) => !items[0]!.includes(`{${name}}`));
    if (dropped.length) problems.push({ kind: 'dropped', names: dropped });
  }
  if (problems.some((p) => !isHint(p))) return { problems };
  return { value: kind === 'text' ? items[0]! : items, problems };
}

export interface TextSamples {
  /** A value for every placeholder, in the pack's language ("170", "rechts"). */
  values: Record<string, string>;
  /** The gear words for the keys that say them as ordinals ("dritten" instead of "drei"). */
  ordinals: Record<string, string>;
}

/** Example values for the placeholders, to show and hear an own text as it would be said. */
export function textSamples(pack: LanguagePack, fallback: LanguagePack): TextSamples {
  const template = (key: string): string => {
    const own = pack.texts[key];
    const other = fallback.texts[key];
    return typeof own === 'string' ? own : typeof other === 'string' ? other : '';
  };
  const words = (key: string): string[] => {
    const own = pack.texts[key];
    return Array.isArray(own) ? own : Array.isArray(fallback.texts[key]) ? (fallback.texts[key] as string[]) : [];
  };
  const t = (key: string, values: Record<string, string | number> = {}) => fill(template(key), values);
  const n = (k: number) => words('numbers')[k - 1] ?? String(k);
  const o = (k: number) => words('ordinals')[k - 1] ?? String(k);
  const seconds = (value: number) => value.toLocaleString(pack.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const zone = t('label.turn', { turn: 4 });
  const car = 'Porsche 911 RSR';
  const time = t('time.seconds', { seconds: seconds(0.4) });
  return {
    values: {
      direction: t('direction.right'),
      strength: t('strength.medium'),
      gear: '3',
      gearWord: n(3),
      refGear: '2',
      refGearWord: n(2),
      entry: '3',
      entryWord: n(3),
      mid: '2',
      midWord: n(2),
      exit: '4',
      exitWord: n(4),
      kmh: '170',
      refKmh: '125',
      speed: '170',
      percent: '70',
      refPercent: '90',
      meters: '15',
      number: '2',
      what: t('problem.brake-early', { meters: 15 }),
      tip: t('tip.brake-early'),
      zone,
      label: zone,
      name: t('briefing.zoneName', { index: 2, label: zone }),
      turn: '4',
      index: '2',
      track: 'Willow Springs',
      zones: '8',
      problemZones: '2',
      brake: t('briefing.brake.full', { speed: 170 }),
      gears: t('briefing.gears', { entry: 3, exit: 4, entryWord: o(3), exitWord: o(4) }),
      curb: t('curb.in.half'),
      note: t('note.flat', { direction: t('direction.left') }),
      corner: t('after.corner.left'),
      surface: t('slide.surface.grass'),
      seconds: seconds(1.4),
      minutes: '2',
      time,
      ghost: t('ghost.ahead', { time }),
      text: t('crew.newBest'),
      count: '3',
      countWord: n(3),
      times: '3',
      laps: '3',
      lapsWord: n(3),
      lap: '5',
      sectorWord: n(2),
      position: '4',
      cars: '16',
      places: '2',
      liters: '12',
      wheel: t('crew.wheel.fl'),
      degrees: '95',
      car,
      driver: 'Alex',
      about: t('session.about.car', { car }),
      group: '3',
      left: '3',
      leftWord: n(3),
    },
    ordinals: { gearWord: o(3), refGearWord: o(2), entryWord: o(3), midWord: o(2), exitWord: o(4) },
  };
}
