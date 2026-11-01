// Learned reference laps on disk: <dir>/<name>.json, with the coach's memory in <name>.history.json.

import fs from 'node:fs';
import path from 'node:path';
import { prepareReference, type ReferenceLap } from '@gt-toolz/coach';
import { carName, formatLapTime } from '@gt-toolz/telemetry';

import { REFERENCE_MODES, type ReferenceDetails, type ReferenceMode, type ReferenceSummary } from './app-api';
import { writeFileAtomic } from './atomic-file';

export type { ReferenceDetails, ReferenceSummary } from './app-api';

const ID = /^[\w.-]{1,120}$/;

export function historyFileFor(referenceFile: string): string {
  return referenceFile.replace(/\.json$/i, '') + '.history.json';
}

/** A reference file larger than this is no reference (a long lap at 60 Hz is about 10 MB). */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const POINT_FIELDS = ['s', 't', 'x', 'y', 'z', 'speed', 'throttle', 'brake', 'gear', 'steer'] as const;
const TEXT_FIELDS = ['driver', 'carName', 'label', 'carCategory', 'source'] as const;

export function readReference(file: string): ReferenceLap {
  if (fs.statSync(file).size > MAX_FILE_BYTES) throw new Error(`${path.basename(file)} is too large for a reference lap`);
  const ref = JSON.parse(fs.readFileSync(file, 'utf8')) as ReferenceLap;
  // A copied or hand-edited file is checked before the coach works with it (release check 2026-10-28: one file
  // without a date broke the whole list, and with it the automatic choice on every packet).
  if (!isReferenceLap(ref)) throw new Error(`${path.basename(file)} is not a reference lap`);
  for (const field of TEXT_FIELDS) if (ref[field] !== undefined && typeof ref[field] !== 'string') delete ref[field];
  for (const field of ['driver', 'carName', 'label'] as const) if (ref[field] !== undefined) ref[field] = cleanName(ref[field]) || undefined;
  // References saved by older versions lack some corner fields; corners are cheap to recompute.
  prepareReference(ref);
  return ref;
}

function isReferenceLap(ref: ReferenceLap): boolean {
  const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
  return (
    !!ref &&
    typeof ref === 'object' &&
    ref.version === 1 &&
    typeof ref.createdAt === 'string' &&
    finite(ref.lapTimeMs) &&
    finite(ref.lengthMeters) &&
    finite(ref.carCode) &&
    (ref.track === undefined || (typeof ref.track === 'object' && ref.track !== null && typeof ref.track.name === 'string')) &&
    Array.isArray(ref.points) &&
    ref.points.length >= 10 &&
    ref.points.every((point) => !!point && typeof point === 'object' && POINT_FIELDS.every((field) => finite(point[field])))
  );
}

function rememberedZones(file: string): number {
  try {
    return Object.keys((JSON.parse(fs.readFileSync(historyFileFor(file), 'utf8')) as { corners: object }).corners).length;
  } catch {
    return 0;
  }
}

/** The reference's car: from the bundled list, else the name the user gave it. */
export function referenceCarName(ref: ReferenceLap): string | undefined {
  return carName(ref.carCode) ?? ref.carName;
}

export function summarizeReference(ref: ReferenceLap, file: string): ReferenceSummary {
  return {
    id: path.basename(file, '.json'),
    file,
    track: ref.track?.name,
    trackId: ref.track?.id,
    reversed: ref.track?.reversed,
    carCode: ref.carCode,
    carCategory: ref.carCategory,
    carName: referenceCarName(ref),
    carListed: carName(ref.carCode) !== undefined,
    lapTimeMs: ref.lapTimeMs,
    lapTime: formatLapTime(ref.lapTimeMs),
    driver: ref.driver,
    targetTimeMs: ref.targetTimeMs ?? ref.lapTimeMs,
    targetTime: formatLapTime(ref.targetTimeMs ?? ref.lapTimeMs),
    customTarget: ref.targetTimeMs !== undefined && ref.targetTimeMs !== ref.lapTimeMs,
    lengthMeters: ref.lengthMeters,
    zones: ref.corners.length,
    createdAt: ref.createdAt,
    remembered: rememberedZones(file),
    origin: ref.origin,
    mode: ref.mode,
    bop: ref.bop,
    label: ref.label,
    modeConfirmed: ref.modeConfirmed === true,
  };
}

/** Summaries are cached by file and modification time: reference files are large. */
const cache = new Map<string, { mtimeMs: number; summary: ReferenceSummary }>();

/**
 * When each reference was last the active one, by id (the user, 2026-10-25: of the saved references that fit the
 * track and class, the one used last is taken). A small file next to the references.
 */
const USAGE_FILE = 'last-used.json';

export function referenceUsage(dir: string): Record<string, number> {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dir, USAGE_FILE), 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return {};
    return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, number] => ID.test(entry[0]) && typeof entry[1] === 'number'));
  } catch {
    return {};
  }
}

export function markReferenceUsed(dir: string, id: string, at = Date.now()): void {
  if (!ID.test(id)) return;
  try {
    writeFileAtomic(path.join(dir, USAGE_FILE), JSON.stringify({ ...referenceUsage(dir), [id]: at }));
  } catch {
    // Only a preference for the automatic choice: nothing breaks without it.
  }
}

export function listReferences(dir: string): ReferenceSummary[] {
  if (!fs.existsSync(dir)) return [];
  const summaries: ReferenceSummary[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json') || name.endsWith('.history.json') || name === USAGE_FILE) continue;
    const file = path.join(dir, name);
    try {
      const { mtimeMs } = fs.statSync(file);
      let entry = cache.get(file);
      if (!entry || entry.mtimeMs !== mtimeMs) {
        entry = { mtimeMs, summary: summarizeReference(readReference(file), file) };
        cache.set(file, entry);
      } else {
        // The memory changes while driving.
        entry.summary = { ...entry.summary, remembered: rememberedZones(file) };
      }
      summaries.push(entry.summary);
    } catch {
      // Not a reference (or broken): not listed.
    }
  }
  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The file of a reference id inside dir; undefined for anything that is not a plain name there. */
export function referenceFile(dir: string, id: string): string | undefined {
  if (!ID.test(id) || id.includes('..') || `${id}.json` === USAGE_FILE) return undefined;
  const file = path.join(dir, `${id}.json`);
  return fs.existsSync(file) ? file : undefined;
}

export function deleteReference(dir: string, id: string): boolean {
  const file = referenceFile(dir, id);
  if (!file) return false;
  fs.rmSync(file);
  fs.rmSync(historyFileFor(file), { force: true });
  cache.delete(file);
  return true;
}

/** Normalizes user input: trimmed names (max. 60 characters, no control characters), target time between 10 s and 1 h. */
export function cleanDetails(details: ReferenceDetails): ReferenceDetails {
  const clean: ReferenceDetails = {};
  if (typeof details.driver === 'string') clean.driver = cleanName(details.driver);
  if (typeof details.carName === 'string') clean.carName = cleanName(details.carName);
  if (details.targetTimeMs === null) clean.targetTimeMs = null;
  else if (typeof details.targetTimeMs === 'number' && details.targetTimeMs >= 10_000 && details.targetTimeMs <= 3_600_000) clean.targetTimeMs = Math.round(details.targetTimeMs);
  if (REFERENCE_MODES.includes(details.mode as ReferenceMode)) clean.mode = details.mode;
  if (typeof details.bop === 'boolean') clean.bop = details.bop;
  if (typeof details.label === 'string') clean.label = cleanName(details.label);
  if (typeof details.modeConfirmed === 'boolean') clean.modeConfirmed = details.modeConfirmed;
  return clean;
}

/** Spoken by the voices: no control characters, no half of a character pair (Piper stopped at one), 60 at most. */
const cleanName = (value: string): string =>
  [
    ...value
      .replace(/\p{Cc}|\p{Cs}/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ]
    .slice(0, 60)
    .join('')
    .trim();

/** Applies player, car name, target time and what it is (mode, BoP, own name) to a reference lap (in memory). */
export function applyDetails(ref: ReferenceLap, details: ReferenceDetails): void {
  const clean = cleanDetails(details);
  if (clean.driver !== undefined) ref.driver = clean.driver || undefined;
  if (clean.carName !== undefined) ref.carName = clean.carName || undefined;
  if (clean.targetTimeMs === null) delete ref.targetTimeMs;
  else if (clean.targetTimeMs !== undefined) ref.targetTimeMs = clean.targetTimeMs;
  if (clean.mode !== undefined) ref.mode = clean.mode;
  if (clean.bop !== undefined) ref.bop = clean.bop;
  if (clean.label !== undefined) ref.label = clean.label || undefined;
  if (clean.modeConfirmed !== undefined) ref.modeConfirmed = clean.modeConfirmed;
}

/** Saves player, car name, target time and what it is in the reference file. */
export function updateReferenceDetails(dir: string, id: string, details: ReferenceDetails): ReferenceSummary | undefined {
  const file = referenceFile(dir, id);
  if (!file) return undefined;
  const ref = JSON.parse(fs.readFileSync(file, 'utf8')) as ReferenceLap;
  applyDetails(ref, details);
  writeFileAtomic(file, JSON.stringify(ref));
  cache.delete(file);
  return summarizeReference(ref, file);
}

/** Forgets the remembered mistakes of a reference (the briefing starts from scratch). */
export function forgetHistory(dir: string, id: string): boolean {
  const file = referenceFile(dir, id);
  if (!file) return false;
  fs.rmSync(historyFileFor(file), { force: true });
  return true;
}
