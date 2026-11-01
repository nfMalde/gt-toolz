// config.json, version 2 (docs/dev/modules.md): the app's settings, and per module whether it is on and its
// settings. Generic here: which setting belongs to whom is the runtime's (settings-split.ts) and, once the modules have
// moved into their folders, each module's own. Read defensively: the file may come from an older version or be edited
// by hand.

export const CONFIG_VERSION = 2;

/** Module ids: lower case letters, the key in config.json and the IPC namespace (gtt:<id>:…). */
export const MODULE_ID = /^[a-z][a-z0-9-]*$/;

export interface StoredModule {
  /** Missing: the module's own default. */
  enabled?: boolean;
  /** As stored; checked by the module (or for now the runtime's normalize). */
  settings?: unknown;
}

export interface ConfigFile {
  version: typeof CONFIG_VERSION;
  /** The shell's settings (language, name, voices, volume …). */
  app: Record<string, unknown>;
  /** By module id. Modules this version does not know are kept as they are (a newer version wrote them). */
  modules: Record<string, StoredModule>;
  /** The setup assistant was finished once. */
  guideDone: boolean;
}

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Version 1 (until 0.0.5-alpha): one flat settings object, no version. */
export function isVersion1(raw: unknown): boolean {
  const value = asObject(raw);
  return value.version === undefined && value.settings !== null && typeof value.settings === 'object' && !Array.isArray(value.settings);
}

/** A version 2 file as it is stored: unknown or invalid module ids ("__proto__") and non-boolean flags dropped. */
export function parseConfigFile(raw: unknown): ConfigFile {
  const value = asObject(raw);
  const modules: Record<string, StoredModule> = {};
  for (const [id, stored] of Object.entries(asObject(value.modules))) {
    if (!MODULE_ID.test(id)) continue;
    const entry = asObject(stored);
    modules[id] = { ...(typeof entry.enabled === 'boolean' ? { enabled: entry.enabled } : {}), settings: entry.settings };
  }
  return { version: CONFIG_VERSION, app: { ...asObject(value.app) }, modules, guideDone: value.guideDone === true };
}
