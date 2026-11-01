// The app's own settings file (config.json in the data folder), version 2 (docs/dev/modules.md). Read
// defensively: it may come from an older version or be edited by hand. The modules still inside the runner get their
// settings flat (the split happens here only); the modules that moved keep theirs as stored (modules.ts).

import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_VERSION, isVersion1, parseConfigFile, type ConfigFile, type StoredModule } from '@gt-toolz/core';
import { configFromVersion1, isRunnerModule, joinSettings, MODULE_IDS, splitSettings, upgradeConfig, writeFileAtomic, type RunnerSettings } from '@gt-toolz/runtime';

/** The file before version 2, kept once next to config.json (for going back to 0.0.5-alpha by hand). */
export const VERSION1_BACKUP = 'config.v1.json';

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // First start or unreadable: defaults.
    return undefined;
  }
}

/**
 * As stored, and whether it was a version 1 file. "null" or a list is valid JSON too, but no config (release check
 * 2026-10-28: the app did not start): empty, like anything else unreadable.
 */
function readStored(file: string): { stored: ConfigFile; version1: boolean } {
  const raw = readJson(file);
  const version1 = isVersion1(raw);
  return { stored: version1 ? configFromVersion1(raw) : upgradeConfig(parseConfigFile(raw)), version1 };
}

/** config.json as the main process keeps it. */
export interface StoredConfig {
  /** The app's and the runner's modules' settings, flat. */
  settings: RunnerSettings;
  guideDone: boolean;
  /** The modules that moved into their folders, and those a newer version wrote, as stored. */
  modules: Record<string, StoredModule>;
}

export function loadConfig(file: string): StoredConfig {
  const { stored, version1 } = readStored(file);
  if (version1) moveOver(file, stored);
  const settings = joinSettings(stored);
  const modules = Object.fromEntries(Object.entries(stored.modules).filter(([id]) => !isRunnerModule(id)));
  return { settings, guideDone: stored.guideDone, modules };
}

/** Once: the old file stays as it was, the new one replaces it. A file a virus scanner holds is moved next start. */
function moveOver(file: string, stored: ConfigFile): void {
  const backup = path.join(path.dirname(file), VERSION1_BACKUP);
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
    writeFileAtomic(file, JSON.stringify({ ...stored, modules: ordered(stored.modules) }, null, 2));
  } catch {
    // Read as version 1 again next time.
  }
}

/** Replaced in one step, so a crash never leaves a half-written config. Modules a newer version wrote are kept. */
export function saveConfig(file: string, config: StoredConfig): void {
  const { app, modules } = splitSettings(config.settings);
  const next: ConfigFile = { version: CONFIG_VERSION, app, modules: ordered({ ...config.modules, ...modules }), guideDone: config.guideDone };
  writeFileAtomic(file, JSON.stringify(next, null, 2));
}

/** In the navigation's order, then the ones this version does not know. */
function ordered(modules: Record<string, StoredModule>): Record<string, StoredModule> {
  const known: readonly string[] = MODULE_IDS;
  const ids = [...known.filter((id) => modules[id]), ...Object.keys(modules).filter((id) => !known.includes(id))];
  return Object.fromEntries(ids.map((id) => [id, modules[id]!]));
}
