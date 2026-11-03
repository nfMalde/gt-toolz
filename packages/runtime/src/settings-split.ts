// Which setting belongs to whom (docs/dev/modules.md), and the way between config.json version 2 and the
// flat RunnerSettings the runner still works with: the modules move into their folders step by step, and until the
// last one has, the runner gets the settings of the modules still inside it as before. The modules that moved keep
// their own (apps/desktop/src/modules.ts).

import { asObject, CONFIG_VERSION, type ConfigFile, type StoredModule } from '@gt-toolz/core';
import { moduleEnabled, RUNNER_MODULE_IDS, type RunnerModuleId, type RunnerSettings } from './app-api';
import { DEFAULT_RUNNER_SETTINGS, migrateSettings, normalizeSettings } from './settings';

type Owner = 'app' | RunnerModuleId;

/** Every key in exactly one place; the type makes sure no new setting is forgotten. The voices are the shell's. */
const OWNERS: { [K in keyof RunnerSettings]-?: Owner } = {
  settingsVersion: 'app',
  language: 'app',
  driverName: 'app',
  addressing: 'app',
  namePauseBefore: 'app',
  namePauseAfter: 'app',
  nameSlower: 'app',
  nameNotRecorded: 'app',
  voices: 'app',
  streamerMode: 'app',
  mute: 'app',
  volume: 'app',
  detailedLog: 'app',
  updateCheck: 'app',
  updateAsked: 'app',
  newsSeen: 'app',
  // What coach and crew say, in the user's words: the language packs are the shell's.
  texts: 'app',
  // The personality: coach and crew are cheeky together.
  style: 'app',
  patience: 'app',
  crewPatience: 'app',
  // How a role sounds is the shell's voices' (the user, 2026-10-29, option A): the language it speaks, its volume, the
  // crew's radio. The coach speaks the race calls with the crew's voice without reading the crew's settings.
  coachLanguage: 'app',
  crewLanguage: 'app',
  coachVolume: 'app',
  crewVolume: 'app',
  radio: 'app',
  coach: 'coach',
  countdownSeconds: 'coach',
  countPause: 'coach',
  countPauseShort: 'coach',
  latencySeconds: 'coach',
  latencyCalibrated: 'coach',
  tone: 'coach',
  intro: 'coach',
  plan: 'coach',
  curbs: 'coach',
  cornerShape: 'coach',
  planStyle: 'coach',
  fastCorners: 'coach',
  chainCalls: 'coach',
  trailCalls: 'coach',
  actionAfterNow: 'coach',
  gearAfterNow: 'coach',
  turnIn: 'coach',
  lineCalls: 'coach',
  feedback: 'coach',
  guideCorners: 'coach',
  immediateFeedback: 'coach',
  waitForFirstLap: 'coach',
  replayCalls: 'coach',
  briefing: 'coach',
  lapDelta: 'coach',
  ghostSectors: 'coach',
  helpFirst: 'coach',
  helpAssists: 'coach',
  focusLaps: 'coach',
  coachQuits: 'coach',
  standInLaps: 'coach',
  debriefZones: 'coach',
  debriefHandbrake: 'coach',
  debriefBonus: 'coach',
  slides: 'coach',
  slidesInRace: 'coach',
  coachTalk: 'coach',
  // The race corner calls are made by the coach (its timing needs the clips), on the crew's radio.
  raceCalls: 'coach',
  raceCallsScope: 'coach',
};

/**
 * The settings of the modules that moved into their folders, as version 1 files keep them (flat, next to all the
 * others): picked out as they are, the module checks them when it starts. The switch becomes the module's "on".
 */
const MOVED_VERSION1: Record<string, (flat: Record<string, unknown>, file: Record<string, unknown>) => StoredModule> = {
  // Always on; the reference in use was kept next to the settings.
  telemetry: (flat, file) => ({
    settings: {
      ...pick(flat, ['ip', 'autoReference', 'driveMode', 'driveBop', 'record']),
      ...(typeof file.activeReference === 'string' ? { activeReference: file.activeReference } : {}),
    },
  }),
  overlays: (flat) => ({
    ...switchOf(flat.overlayEnabled),
    settings: pick(flat, ['overlayPort', 'overlayLayout', 'overlayAutoHide']),
  }),
  // The team boss took the coach's quitting and stand-in laps; now he has his own.
  crew: (flat) => ({
    ...switchOf(flat.crew),
    settings: {
      ...pick(flat, ['crewSectors', 'crewStrategy', 'practiceTyres', 'pitLossSeconds', 'crewTalk']),
      ...renamed(flat, { coachQuits: 'bossTakesOver', standInLaps: 'bossLaps' }),
    },
  }),
  // One object with its switch inside.
  haptics: (flat) => {
    const { enabled, ...settings } = asObject(flat.haptics);
    return { ...switchOf(enabled), settings };
  },
};

/** The keys a version 1 file has, as they are. */
function pick(flat: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in flat).map((key) => [key, flat[key]]));
}

/** The keys a file has, under their new names. */
function renamed(flat: Record<string, unknown>, names: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(names).filter(([from]) => from in flat).map(([from, to]) => [to, flat[from]]));
}

/** A switch from a version 1 file; none: the module's own default. */
function switchOf(value: unknown): Pick<StoredModule, 'enabled'> {
  return typeof value === 'boolean' ? { enabled: value } : {};
}

/** The keys a module owns (for its settings page and, later, its own normalize). */
export function keysOf(owner: Owner): (keyof RunnerSettings)[] {
  return (Object.keys(OWNERS) as (keyof RunnerSettings)[]).filter((key) => OWNERS[key] === owner);
}

/**
 * The flat settings as config.json version 2: the app's and those of the modules still inside the runner. The
 * switches become the modules' "on": `coach`, `crew`.
 */
export function splitSettings(settings: RunnerSettings): Pick<ConfigFile, 'app' | 'modules'> {
  const app: Record<string, unknown> = {};
  const owned: Record<RunnerModuleId, Record<string, unknown>> = { coach: {} };
  for (const key of Object.keys(OWNERS) as (keyof RunnerSettings)[]) {
    const owner = OWNERS[key];
    if (owner === 'app') app[key] = settings[key];
    else owned[owner][key] = settings[key];
  }
  delete owned.coach.coach;
  const modules: Record<RunnerModuleId, StoredModule> = {
    coach: { enabled: moduleEnabled(settings, 'coach'), settings: owned.coach },
  };
  return { app, modules };
}

/** config.json version 2 as the runner's flat settings (normalized). */
export function joinSettings(file: ConfigFile): RunnerSettings {
  const flat: Record<string, unknown> = { ...file.app };
  for (const id of RUNNER_MODULE_IDS) Object.assign(flat, asObject(file.modules[id]?.settings));
  const on = (id: RunnerModuleId, fallback: boolean) => file.modules[id]?.enabled ?? fallback;
  flat.coach = on('coach', DEFAULT_RUNNER_SETTINGS.coach);
  return normalizeSettings(migrateSettings(flat));
}

/**
 * A version 2 file written while the crew was still inside the runner (0.0.6 in development, PR #21): the team boss
 * took the coach's quitting and stand-in laps; now he has his own, taken over once.
 */
export function upgradeConfig(file: ConfigFile): ConfigFile {
  const crew = file.modules.crew;
  if (!crew) return file;
  const settings = asObject(crew.settings);
  const coach = asObject(file.modules.coach?.settings);
  const boss = renamed(coach, { coachQuits: 'bossTakesOver', standInLaps: 'bossLaps' });
  for (const key of Object.keys(boss)) if (key in settings) delete boss[key];
  if (!Object.keys(boss).length) return file;
  return { ...file, modules: { ...file.modules, crew: { ...crew, settings: { ...settings, ...boss } } } };
}

/**
 * A version 1 file (until 0.0.5-alpha: `{ settings, activeReference, guideDone }`) as version 2. Its own migrations
 * (settingsVersion 2 and 3) run first, then the keys are split.
 */
export function configFromVersion1(raw: unknown): ConfigFile {
  const value = asObject(raw);
  const settings = normalizeSettings(migrateSettings(value.settings));
  const { app, modules } = splitSettings(settings);
  const flat = asObject(value.settings);
  const moved = Object.entries(MOVED_VERSION1).map(([id, take]) => [id, take(flat, value)]);
  return { version: CONFIG_VERSION, app, modules: { ...modules, ...Object.fromEntries(moved) }, guideDone: value.guideDone === true };
}
