// "Daten zurücksetzen" (the user, 2026-10-24): deletes everything the app keeps (settings, references, session logs
// and recordings, the user's voice packs, downloaded voices unless kept, the browser cache) and starts again as on
// the first day. The request is a marker file in the data folder; the deletion happens at the next start, before
// anything opens a file there (on Windows, open files cannot be deleted).

import fs from 'node:fs';
import path from 'node:path';
import type { DataSummary, RunnerDirs } from '@gt-toolz/runtime';

const MARKER = 'reset-pending.json';
/**
 * In a folder given with GTT_DATA_DIR: GT Toolz created it, so a reset may empty it (release check 2026-10-28: a
 * folder like "D:\Games" given by mistake would have been emptied completely).
 */
const OWNER = 'gt-toolz-data.txt';

/** A folder given with GTT_DATA_DIR that is new or empty becomes the app's own (only those can be reset). */
export function claimDataFolder(dir: string): void {
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, OWNER), 'Created by GT Toolz for its data. "Reset data" in the app empties this folder.\n');
}

export function ownsDataFolder(dir: string): boolean {
  return fs.existsSync(path.join(dir, OWNER));
}

/** What a reset would delete, for the confirmation: counts and sizes, no paths. */
export function dataSummary(dataDir: string, dirs: RunnerDirs, available: boolean): DataSummary {
  const count = (dir: string, match: (name: string) => boolean) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(match).length : 0);
  return {
    available,
    references: count(dirs.references, (f) => f.endsWith('.json') && !f.endsWith('.history.json')),
    sessions: count(dirs.sessions, (f) => f.endsWith('.log') || f.endsWith('.gtcap')),
    recordedPacks: dirs.voicePacks && fs.existsSync(dirs.voicePacks) ? fs.readdirSync(dirs.voicePacks, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0,
    voicesBytes: folderSize(dirs.voices),
    totalBytes: folderSize(dataDir),
  };
}

/** Asks for a reset at the next start (the caller then restarts the app). */
export function requestReset(dataDir: string, keepVoices: boolean): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, MARKER), JSON.stringify({ keepVoices, requested: new Date().toISOString() }));
}

/**
 * At start, before anything else uses the data folder: if a reset was asked for, empties the folder (the voices
 * folder stays if the user kept the downloaded voices). Retries a moment while the previous instance lets go.
 */
export function applyPendingReset(dataDir: string, voicesDir: string): void {
  const marker = path.join(dataDir, MARKER);
  if (!fs.existsSync(marker)) return;
  let keepVoices = false;
  try {
    keepVoices = (JSON.parse(fs.readFileSync(marker, 'utf8')) as { keepVoices?: unknown }).keepVoices === true;
  } catch {
    // An unreadable marker still means "reset": everything goes.
  }
  const keep = keepVoices ? path.resolve(voicesDir) : undefined;
  for (const entry of fs.readdirSync(dataDir)) {
    const full = path.resolve(dataDir, entry);
    if (entry === MARKER || entry === OWNER || full === keep) continue;
    try {
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
    } catch (err) {
      console.error(`[reset] could not delete ${entry}: ${(err as Error).message}`);
    }
  }
  fs.rmSync(marker, { force: true });
}

function folderSize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    try {
      total += entry.isDirectory() ? folderSize(full) : fs.statSync(full).size;
    } catch {
      // A file that went away meanwhile.
    }
  }
  return total;
}
