// IPC between the UI (window.gtt, see preload.ts) and the main process: the shell's calls and those of the modules
// still inside the runner (the modules that moved register their own, modules.ts). Every call is checked: it must
// come from the app's own page, and its arguments are validated here, not trusted.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import {
  fileStamp,
  forgetHistory,
  installPackages,
  isInstalled,
  isRunnerModule,
  keysOf,
  moduleEnabled,
  MODULE_IDS,
  moduleSwitch,
  normalizeSettings,
  RUNNER_MODULE_IDS,
  packageSize,
  preselectedPackages,
  MAX_PACK_FILE_BYTES,
  MAX_RECORDING_SECONDS,
  PRODUCT_NAME,
  RECORDING_SECTIONS,
  readVoicePackages,
  removePackages,
  VOICE_PACK_EXTENSION,
  type AppConfig,
  type AppInfo,
  type ModuleId,
  type ModuleState,
  type RunnerSettings,
  type CoachRunner,
  type FolderId,
  type InstallState,
  type LinkId,
  type RecordingSection,
  type RunnerDirs,
  type TextCatalog,
  type VoicePackageInfo,
} from '@gt-toolz/runtime';
import { handle as handleChannel } from './bridge';
import type { StoredConfig } from './config';
import { chromiumLicensesFile, licenseEntries } from './licenses';
import type { Modules } from './modules';
import { dataSummary, requestReset } from './reset';
import { fromApp } from './security';
import type { AppUpdates } from './updates';

export interface IpcContext {
  runner: CoachRunner;
  /** The modules that moved into their folders (the overlays). */
  modules: Modules;
  updates: AppUpdates;
  dirs: RunnerDirs;
  dataDir: string;
  dev: boolean;
  getConfig: () => StoredConfig;
  updateConfig: (change: Partial<StoredConfig>) => void;
  send: (channel: string, value: unknown) => void;
  /** "Reset data" is offered: not in development with the repository's folders (the developer's data). */
  resettable: boolean;
}

/** The public repository: source code, issues and releases. */
const REPOSITORY = 'https://github.com/nfMalde/gt-toolz';

/**
 * Web pages the app may open in the browser, and only on the user's click (nothing is loaded from them). GT Toolz
 * runs under Maldö (the user, 2026-10-22): the donation and Maldö's channels, and the project on GitHub.
 */
const LINKS: Partial<Record<LinkId, string>> = {
  source: REPOSITORY,
  issues: `${REPOSITORY}/issues/new/choose`,
  releases: `${REPOSITORY}/releases`,
  paypal: 'https://www.paypal.com/donate/?hosted_button_id=SVZHLRTQ6H4VL',
  twitch: 'https://www.twitch.tv/maldoe',
  youtube: 'https://www.youtube.com/@dermaldoe',
  facebook: 'https://www.facebook.com/RealMaldoe',
  x: 'https://x.com/DerMaldoe',
  instagram: 'https://www.instagram.com/maldoe_gaming/',
};

const PROGRESS_INTERVAL_MS = 100;
/** One take from the UI: 16-bit WAV, up to the longest recording at 48 kHz stereo. */
const MAX_TAKE_BYTES = (MAX_RECORDING_SECONDS + 1) * 48_000 * 4 + 1024;

export function registerIpc(ctx: IpcContext): void {
  const { runner, dirs } = ctx;

  const handle = (name: string, handler: (...args: unknown[]) => unknown) => void handleChannel(`gtt:${name}`, handler);
  /** Calls that open a dialog on the calling window. */
  const handleWindow = (name: string, handler: (window: BrowserWindow | undefined, ...args: unknown[]) => unknown) => {
    ipcMain.handle(`gtt:${name}`, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!fromApp(event)) throw new Error('Not allowed');
      return handler(BrowserWindow.fromWebContents(event.sender) ?? undefined, ...args);
    });
  };

  // --- Events to the UI ---
  runner.on('status', (status) => ctx.send('gtt:status', status));
  runner.on('activity', (activity) => ctx.send('gtt:activity', activity));
  runner.on('cue', (cue) => ctx.send('gtt:cue', cue));
  runner.on('live', (sample) => ctx.send('gtt:live', sample));

  // --- App ---
  handle(
    'info',
    (): AppInfo => ({
      name: PRODUCT_NAME,
      version: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      dev: ctx.dev,
      // Other Unix systems (FreeBSD …) get the Linux texts.
      platform: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux',
    }),
  );
  // Every module on or off: those inside the runner by their settings, the others by their hosts.
  const moduleStates = (): Record<ModuleId, ModuleState> => {
    const hosted = ctx.modules.states;
    const settings = runner.currentSettings;
    return Object.fromEntries(
      MODULE_IDS.map((id) => [id, isRunnerModule(id) ? { enabled: moduleEnabled(settings, id) } : (hosted[id] ?? { enabled: false })]),
    ) as Record<ModuleId, ModuleState>;
  };
  const appKeys = keysOf('app');
  const applySettings = async (change: Partial<RunnerSettings>): Promise<RunnerSettings> => {
    const current = runner.currentSettings;
    const next = normalizeSettings({ ...current, ...change }, current);
    await runner.updateSettings(next);
    ctx.updateConfig({ settings: next });
    // Another language: the modules' texts (the overlay's labels) follow.
    if (appKeys.some((key) => JSON.stringify(next[key]) !== JSON.stringify(current[key]))) ctx.modules.appChanged();
    if (RUNNER_MODULE_IDS.some((id) => moduleEnabled(next, id) !== moduleEnabled(current, id))) ctx.send('gtt:modules', moduleStates());
    return next;
  };

  handle('getConfig', (): AppConfig => {
    return { settings: runner.currentSettings, guideDone: ctx.getConfig().guideDone, modules: moduleStates() };
  });
  handle('setSettings', (change) => applySettings(asObject(change)));
  handle('setModuleEnabled', async (id, enabled) => {
    const key = asString(id);
    if (!(MODULE_IDS as readonly string[]).includes(key) || typeof enabled !== 'boolean') throw new Error('Invalid argument');
    if (isRunnerModule(key)) await applySettings(moduleSwitch(key, enabled));
    else {
      await ctx.modules.setEnabled(key, enabled);
      ctx.send('gtt:modules', moduleStates());
    }
    return moduleStates();
  });
  handle('setGuideDone', (done) => ctx.updateConfig({ guideDone: done === true }));
  handle('languages', () => runner.languageList());

  // --- Coach ---
  handle('getStatus', () => runner.currentStatus);
  handle('testAudio', () => runner.testAudio());
  handle('startCalibration', () => runner.startCalibration());
  handle('stopCalibration', () => runner.stopCalibration());
  handle('samples', () => runner.samples());
  handle('startBriefing', () => runner.startBriefing());
  handle('stopBriefing', () => runner.stopBriefing());
  handle('startDebrief', () => runner.startDebrief());
  handle('stopDebrief', () => runner.stopDebrief());
  handle('playSample', (id) => runner.playSample(asString(id)));
  handle('stopSample', () => runner.stopSample());

  // --- The coach's memory of a reference (the references themselves are the telemetry's, window.gtt.telemetry) ---
  handle('forgetHistory', (id) => {
    const name = asString(id);
    if (runner.activeReferenceId === name) runner.forgetHistory();
    if (!forgetHistory(dirs.references, name)) throw new Error('Unknown reference');
  });

  // --- Voices ---
  handle('listVoices', () => runner.listVoices());
  handle('previewVoice', (id, role) => runner.previewVoice(asString(id), role === 'crew' || role === 'standin' ? role : 'coach'));

  // --- Own texts (saved through the settings) ---
  handle('texts', (language): TextCatalog => runner.textCatalog(asString(language)));
  // The value is checked there: a text, or a list of them.
  handle('checkText', (key, value, language) => runner.checkText(asString(key), value, asString(language)));
  handle('previewText', (text, language, speaker) => runner.previewText(asText(text), asString(language), speaker === 'crew' ? 'crew' : 'coach'));
  handle('voicePackages', (): VoicePackageInfo[] => {
    const preselected = new Set(preselectedPackages(runner.currentSettings.language).map((p) => p.id));
    return readVoicePackages().packages.map((pkg) => ({
      id: pkg.id,
      kind: pkg.kind,
      engine: pkg.engine,
      name: pkg.name,
      license: pkg.license,
      source: pkg.source,
      language: pkg.language,
      gender: pkg.gender,
      dataset: pkg.dataset,
      requires: pkg.requires,
      voices: pkg.kind === 'voice' ? [pkg.id] : (pkg.voices ?? []).map((v) => v.id),
      languages: [...new Set(pkg.kind === 'voice' ? [pkg.language ?? ''] : (pkg.voices ?? []).map((v) => v.language))].filter(Boolean),
      sizeBytes: packageSize(pkg),
      installed: isInstalled(dirs.voices, pkg),
      preselected: preselected.has(pkg.id),
    }));
  });

  let install: AbortController | undefined;
  let lastProgressAt = 0;
  const sendInstall = (state: InstallState) => ctx.send('gtt:voice-install', state);

  handle('installVoicePackages', async (ids) => {
    if (install) throw new Error('An installation is already running');
    const selection = packageIds(ids);
    if (!selection.length) return;
    const controller = new AbortController();
    install = controller;
    sendInstall({ state: 'installing', ids: selection });
    try {
      await installPackages(selection, dirs.voices, {
        signal: controller.signal,
        log: (line) => runner.log(`VOICES    ${line}`),
        onProgress: (progress) => {
          const now = Date.now();
          if (progress.phase === 'download' && now - lastProgressAt < PROGRESS_INTERVAL_MS) return;
          lastProgressAt = now;
          sendInstall({ state: 'installing', ids: selection, progress });
        },
      });
      sendInstall({ state: 'done', ids: selection });
      await runner.voicesChanged();
      ctx.modules.voicesChanged('changed');
    } catch (err) {
      if (controller.signal.aborted) sendInstall({ state: 'cancelled' });
      else sendInstall({ state: 'error', message: (err as Error).message });
    } finally {
      install = undefined;
    }
  });
  handle('cancelVoiceInstall', () => install?.abort());
  handle('removeVoicePackages', async (ids) => {
    const selection = packageIds(ids);
    // The modules' voices (the crew's) close first, and open again after.
    ctx.modules.voicesChanged('removing');
    try {
      await runner.withVoiceReleased(() => removePackages(selection, dirs.voices, (line) => runner.log(`VOICES    ${line}`)));
    } finally {
      ctx.modules.voicesChanged('changed');
    }
  });

  // --- Recorded voices: the user's own recordings. Shared only as files the user saves and passes on ---
  const packs = runner.voicePacks;
  const languageIds = () => runner.languageList().map((l) => l.id);
  handle('recordingPacks', () => packs.list());
  handle('createRecordingPack', (details) => {
    const d = asObject(details);
    const language = asString(d.language);
    if (!languageIds().includes(language)) throw new Error('pack-language-unknown');
    return packs.create({ name: asString(d.name), language, speaker: typeof d.speaker === 'string' ? d.speaker : '' });
  });
  handle('updateRecordingPack', (id, details) => {
    const d = asObject(details);
    return packs.update(asString(id), { name: optionalString(d.name), speaker: optionalString(d.speaker) });
  });
  handle('deleteRecordingPack', (id) => {
    packs.remove(asString(id));
    runner.recordingsChanged(asString(id));
  });
  handle('recordingCatalog', (id) => runner.recordingCatalog(asString(id)));
  handle('saveRecording', (id, text, section, wav) => {
    if (!(wav instanceof Uint8Array) || wav.byteLength > MAX_TAKE_BYTES) throw new Error('recording-invalid');
    if (!RECORDING_SECTIONS.includes(section as RecordingSection)) throw new Error('text-invalid');
    const entry = packs.saveRecording(asString(id), asText(text), section as RecordingSection, Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength));
    runner.recordingsChanged(asString(id));
    return entry;
  });
  handle('deleteRecording', (id, key) => {
    packs.removeRecording(asString(id), asText(key));
    runner.recordingsChanged(asString(id));
  });
  handle('recordingAudio', (id, key) => new Uint8Array(packs.recordingWav(asString(id), asText(key))));
  handle('previewRecordingPack', (id) => runner.previewRecordingPack(asString(id)));
  handleWindow('exportRecordingPack', async (window, id, consent) => {
    // The UI only calls this once the user confirmed the consent statement; without it nothing is written.
    if (consent !== true) throw new Error('Consent required');
    const { fileName, data } = packs.exportPack(asString(id));
    const options = { defaultPath: path.join(app.getPath('documents'), fileName), filters: [{ name: 'GT Toolz voice pack', extensions: [VOICE_PACK_EXTENSION] }] };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await fs.promises.writeFile(result.filePath, data);
    runner.log(`RECORDING exported pack ${asString(id)} (${path.basename(result.filePath)}, ${Math.round(data.length / 1024)} KB)`);
    return true;
  });
  // The log for a GitHub issue: anonymous (runner.anonymousLog), a header with what helps to reproduce, nothing personal.
  // "Reset data" (Settings → Diagnostics): the deletion runs at the next start (reset.ts), then the app is new.
  handle('dataSummary', () => dataSummary(ctx.dataDir, dirs, ctx.resettable));
  handle('resetData', (keepVoices) => {
    if (!ctx.resettable) throw new Error('Not available with the repository folders (development)');
    requestReset(ctx.dataDir, keepVoices === true);
    app.relaunch();
    app.quit();
  });
  handleWindow('exportLog', async (window) => {
    const log = runner.anonymousLog();
    if (!log?.trim()) return { empty: true };
    const settings = runner.currentSettings;
    const header = [
      `GT Toolz ${app.getVersion()} · ${process.platform} ${os.release()} ${process.arch} · Electron ${process.versions.electron}`,
      `Log: ${settings.detailedLog ? 'detailed' : 'standard'} · anonymous (names, IP addresses and folders replaced) · app language ${settings.language} · exported ${fileStamp().slice(0, 10)}`,
      '---',
    ].join('\n');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const options = { defaultPath: path.join(app.getPath('downloads'), `gt-toolz-log-${stamp}.txt`), filters: [{ name: 'Text', extensions: ['txt', 'log'] }] };
    const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return {};
    await fs.promises.writeFile(result.filePath, `${header}\n${log}`);
    shell.showItemInFolder(result.filePath);
    return { file: path.basename(result.filePath) };
  });
  handleWindow('importRecordingPack', async (window, confirmed) => {
    if (confirmed !== true) throw new Error('Confirmation required');
    const options = { properties: ['openFile' as const], filters: [{ name: 'GT Toolz voice pack', extensions: [VOICE_PACK_EXTENSION] }] };
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;
    if ((await fs.promises.stat(file)).size > MAX_PACK_FILE_BYTES) throw new Error('pack-file-too-large');
    const info = packs.importPack(await fs.promises.readFile(file), languageIds());
    runner.log(`RECORDING imported pack ${info.id} (${info.language}, ${info.recordings} recordings)`);
    return info;
  });

  // --- Licenses, links, folders ---
  handle('licenses', () => licenseEntries());
  handle('openChromiumLicenses', async () => {
    await shell.openPath(chromiumLicensesFile());
  });
  handle('links', () => LINKS);
  // Updates: only the looking and the update the user chose; which release and file is decided in the main process.
  handle('updateStatus', () => ctx.updates.status);
  handle('checkForUpdate', () => ctx.updates.check());
  handle('installUpdate', () => ctx.updates.install());
  handle('openLink', async (id) => {
    // Own keys only: "constructor" is no link (release check 2026-10-28).
    const key = asString(id);
    const url = Object.hasOwn(LINKS, key) ? LINKS[key as LinkId] : undefined;
    if (typeof url === 'string' && url.startsWith('https://')) await shell.openExternal(url);
  });
  handle('openFolder', async (kind) => {
    const folders: Record<FolderId, string> = { references: dirs.references, logs: dirs.sessions, voices: dirs.voices, recordings: runner.voicePacks.root };
    const key = asString(kind);
    const folder = Object.hasOwn(folders, key) ? folders[key as FolderId] : undefined;
    if (!folder) return;
    await fs.promises.mkdir(folder, { recursive: true });
    await shell.openPath(folder);
  });
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid argument');
  return value;
}

/** A text to record (longer than an id). */
function asText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1000) throw new Error('Invalid argument');
  return value;
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : asString(value);
}

/** Only ids from the voice package manifest. */
function packageIds(value: unknown): string[] {
  const known = new Set(readVoicePackages().packages.map((p) => p.id));
  if (!Array.isArray(value)) throw new Error('Invalid argument');
  return value.filter((id): id is string => typeof id === 'string' && known.has(id));
}
