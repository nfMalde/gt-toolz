// Electron main process: one window with the Angular UI, the coach runs here (CoachRunner), and the modules that moved
// into their folders run next to it on their hosts (modules.ts), on the telemetry, the speech floor and the voices the
// shell shares.

import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, clipboard, Menu, nativeTheme, shell } from 'electron';
import { crewModule } from '@gt-toolz/crew/main';
import { hapticsModule } from '@gt-toolz/haptics/main';
import { overlaysModule } from '@gt-toolz/overlays/main';
import { TELEMETRY, type TelemetryModuleSettings } from '@gt-toolz/telemetry-module/api';
import { telemetryModule } from '@gt-toolz/telemetry-module/main';
import { TelemetrySession } from '@gt-toolz/telemetry-module/session';
import { CoachRunner, keysOf, PRODUCT_BYLINE, PRODUCT_NAME, ShellVoices, type RunnerDirs } from '@gt-toolz/runtime';
import { ElectronAudio } from './audio';
import { handle } from './bridge';
import { loadConfig, saveConfig, type StoredConfig } from './config';
import { registerIpc } from './ipc';
import { Modules } from './modules';
import { DEV_URL, APP_ORIGIN, PORTABLE, blockHostLookups, guardWebContents, hardenSession, registerAppScheme, serveUi } from './security';
import { applyPendingReset, claimDataFolder, ownsDataFolder } from './reset';
import { SELF_TEST_FILE, runSelfTest, selfTestDataDir } from './self-test';
import { AppUpdates, updateRepo } from './updates';

// Node reads this on every TLS connection: set somewhere on the PC, it would let voice downloads and the update check
// accept any certificate. The app's downloads always check them.
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

const dev = !app.isPackaged && !PORTABLE;
/** Repository root in dev (apps/desktop/dist/main.cjs). */
const repoRoot = path.resolve(__dirname, '..', '..', '..');

// ASCII only: the app name ends up in the user agent, and HTTP headers carry nothing but ASCII.
// The UI and the window title show PRODUCT_NAME.
const APP_NAME = 'GT Toolz';
/** Earlier names of the app after a rename: their data folder moves to the current one (once). */
const FORMER_APP_NAMES: string[] = [];
app.setName(APP_NAME);
// The installer check runs on an empty folder of its own, and GTT_DATA_DIR (tests) on the given one: each with its
// own browser profile and single-instance lock, so they run next to an installed GT Toolz.
const selfTestDir = SELF_TEST_FILE ? selfTestDataDir() : undefined;
const ownDataDir = selfTestDir ?? (process.env.GTT_DATA_DIR ? path.resolve(process.env.GTT_DATA_DIR) : undefined);
if (ownDataDir && !selfTestDir) claimDataFolder(ownDataDir);
app.setPath('userData', ownDataDir ?? adoptDataFolder(app.getPath('appData'), APP_NAME, FORMER_APP_NAMES));
const dataDir = app.getPath('userData');
const repoFolders = dev && !process.env.GTT_DATA_DIR && !selfTestDir;

/**
 * Dev uses the repository's folders, the same as the console tools (references, captures, voice packages).
 * The installed app keeps everything in its data folder (%APPDATA%\GT Toolz).
 */
const dirs: RunnerDirs =
  repoFolders
    ? {
        references: path.join(repoRoot, 'references'),
        sessions: path.join(repoRoot, 'captures'),
        voiceCache: path.join(repoRoot, '.cache', 'voice'),
        voices: path.join(repoRoot, '.cache', 'tts'),
        languagePacks: path.join(repoRoot, 'language-packs'),
        voicePacks: path.join(repoRoot, '.cache', 'voice-packs'),
      }
    : {
        references: path.join(dataDir, 'references'),
        sessions: path.join(dataDir, 'sessions'),
        voiceCache: path.join(dataDir, 'cache', 'voice'),
        voices: path.join(dataDir, 'voices'),
        languagePacks: path.join(dataDir, 'language-packs'),
        voicePacks: path.join(dataDir, 'voice-packs'),
      };
const configFile = repoFolders ? path.join(repoRoot, '.cache', 'app-data', 'config.json') : path.join(dataDir, 'config.json');

// "Reset data": the app's own folder, or one it created for GTT_DATA_DIR (never a folder that held other things).
const resettable = !repoFolders && (!process.env.GTT_DATA_DIR || ownsDataFolder(dataDir));
// Asked for before the restart: the folder is emptied before anything opens a file in it.
if (resettable) applyPendingReset(dataDir, dirs.voices);

/** Built UI: in the app's resources when installed, next to the app folder when portable, the Angular build output in dev. */
const uiDir = app.isPackaged
  ? path.join(process.resourcesPath, 'ui')
  : PORTABLE
    ? path.join(__dirname, '..', 'ui')
    : path.join(repoRoot, 'apps', 'ui', 'dist', 'ui', 'browser');

/** Session logs and telemetry recordings to keep; older ones are deleted at start (recordings are large). */
const KEEP_LOGS = 30;
const KEEP_RECORDINGS = 5;
/** Quitting waits at most this long for the coach and the modules (the overlay server) to stop. */
const QUIT_TIMEOUT_MS = 3000;

registerAppScheme();
blockHostLookups();

// One instance only: two would fight over the telemetry port.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void start();
}

let window: BrowserWindow | undefined;

async function start(): Promise<void> {
  guardWebContents();
  await app.whenReady();
  nativeTheme.themeSource = 'dark';
  // No menus; on macOS a minimal one, without which Cmd+Q and copy and paste in text fields do not work.
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  // Electron from npm (portable, dev) shows its own icon in the Dock; the installed app has the mascot already.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(path.join(uiDir, 'maldoe-512.png'));
  hardenSession();
  if (!DEV_URL) serveUi(uiDir);

  let config: StoredConfig = loadConfig(configFile);
  const updateConfig = (change: Partial<StoredConfig>) => {
    config = { ...config, ...change };
    saveConfig(configFile, config);
  };
  pruneSessions(dirs.sessions);

  // The voices play in the app itself (hidden audio window), the same on every platform.
  const audio = new ElectronAudio(path.join(__dirname, 'audio-preload.cjs'), dev);
  audio.start();
  // The telemetry: the PS5, frames, mode, the car and the reference (module "telemetry", docs/dev/modules.md). The
  // module runs it with its settings; coach and crew (the runner) read it as their feed.
  const telemetry = new TelemetrySession({
    dirs,
    settings: () => ({ ...(modules.settingsOf(TELEMETRY) as TelemetryModuleSettings), driverName: runner.currentSettings.driverName }),
    log: (line) => runner.log(line),
  });
  // The voices of every role, the language packs and the crew's radio: coach and crew open theirs here.
  const voices = new ShellVoices({ dirs, audio, settings: () => runner.currentSettings });
  const runner = new CoachRunner({ settings: config.settings, dirs, telemetry, echo: dev, audio, voices });
  const send = (channel: string, value: unknown) => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, value);
  };
  const appKeys = keysOf('app');
  const modules = new Modules(
    {
      dev,
      app: () => Object.fromEntries(appKeys.map((key) => [key, runner.currentSettings[key]])),
      stored: (id) => config.modules[id],
      save: (id, module) => updateConfig({ modules: { ...config.modules, [id]: module } }),
      // The lap against the target is still the coach's (the runner's) until it moves to the telemetry.
      telemetry: {
        onFrame: (listener) => {
          telemetry.on('frame', listener);
          return () => telemetry.off('frame', listener);
        },
        mode: () => telemetry.mode ?? 'menu',
        lastLap: () => runner.currentStatus.lastLap,
      },
      desktop: {
        // The page does not copy itself: Electron grants writing the clipboard only together with reading it.
        copyText: (text) => clipboard.writeText(text),
        openLocalPage: async (url) => {
          // Only this PC's own address: a module opens nothing on the internet.
          if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\//.test(url)) throw new Error('Not allowed');
          await shell.openExternal(url);
        },
      },
      handle,
      log: (line) => runner.log(line),
      send,
    },
    // The race crew on the coach's speech floor (one speaks at a time). OBS overlays (docs/dev/architecture.md): this PC only, and only
    // while switched on. The vibration (docs/user/haptics.md).
    [
      telemetryModule(telemetry, dirs.references),
      crewModule({
        telemetry,
        floor: runner.speechFloor,
        voices,
        activity: (body) => runner.activity(body),
        status: (crew, voice) => runner.crewStatus(crew, voice),
      }),
      overlaysModule(path.join(__dirname, 'overlay-client.js')),
      hapticsModule,
    ],
  );
  // What coach and crew make felt goes to the vibration, while it is on.
  runner.on('feel', (cue, detail) => modules.feel(cue, detail));

  // Updates from GitHub (official installed builds; the installer check never looks). Windows runs the installer
  // from the app's own data folder (not a shared temporary one another user could prepare); macOS and Linux open the
  // file for the user, so it goes where they find it again.
  const updates = new AppUpdates({
    repo: SELF_TEST_FILE ? undefined : updateRepo(),
    version: app.getVersion(),
    downloads: process.platform === 'win32' ? path.join(dataDir, 'updates') : app.getPath('downloads'),
    send: (status) => send('gtt:update', status),
    log: (line) => runner.log(line),
    quit: () => app.quit(),
  });

  registerIpc({
    runner,
    modules,
    updates,
    dirs,
    dataDir,
    dev,
    getConfig: () => config,
    updateConfig,
    resettable,
    send,
  });
  // The coach first: the telemetry's first reference finds it ready.
  await runner.start();
  modules.startEnabled();

  createWindow();
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });

  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    // Never kept open by something that does not finish (the app would stay in the background without a window).
    const stopped = Promise.allSettled([runner.stop(), modules.stopAll()]);
    void Promise.race([stopped, new Promise((resolve) => setTimeout(resolve, QUIT_TIMEOUT_MS))]).finally(() => {
      audio.stop();
      app.exit(0);
    });
  });
  app.on('window-all-closed', () => app.quit());

  if (SELF_TEST_FILE && window) {
    void runSelfTest({ file: SELF_TEST_FILE, window, runner, uiDir, dataDir, sessionsDir: dirs.sessions });
  }
}

function createWindow(): void {
  window = new BrowserWindow({
    title: `${PRODUCT_NAME} ${PRODUCT_BYLINE}`,
    width: 1320,
    height: 860,
    minWidth: 1000,
    minHeight: 660,
    show: false,
    // Maldö: the espresso black of the app and the mascot as the window and taskbar icon.
    backgroundColor: '#0d0a07',
    icon: path.join(uiDir, 'maldoe-256.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0d0a07', symbolColor: '#d6cbc0', height: 40 },
    // macOS: the window buttons on the left, centred in the 40 px bar.
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      devTools: dev || process.env.GTT_DEVTOOLS === '1',
      // Vibration patterns (accessibility) play here the moment a cue is due, without a click first.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  // The installer check runs without showing the window.
  window.once('ready-to-show', () => {
    if (!SELF_TEST_FILE) window?.show();
  });
  // The hidden audio window would keep the app running: closing the main window ends it.
  window.on('closed', () => {
    window = undefined;
    app.quit();
  });
  // Dev: the UI's console output (errors, CSP violations) also goes to the terminal.
  if (dev) {
    window.webContents.on('console-message', (event) => {
      if (event.level === 'warning' || event.level === 'error') console.log(`[ui:${event.level}] ${event.message} (${event.sourceId}:${event.lineNumber})`);
    });
  }
  window.webContents.on('before-input-event', (event, input) => {
    // F12 / Ctrl+Shift+I: DevTools (dev builds only, see devTools above). Ctrl+R: reload.
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      window?.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (dev && input.control && input.key.toLowerCase() === 'r') {
      window?.webContents.reload();
      event.preventDefault();
    }
  });
  void window.loadURL(DEV_URL ?? `${APP_ORIGIN}/`);
  if (dev && process.env.GTT_SCREENSHOTS) runScreenshotScript(window, process.env.GTT_SCREENSHOTS);
}

type ScreenshotStep =
  | { route: string }
  | { click: string }
  | { wait: number }
  | { shot: string }
  | { log: string }
  | { drag: { selector: string; dx: number; dy: number; at?: 'center' | 'bottom-right' } };

/**
 * Dev helper to check the layout without looking: runs a JSON script of steps against the UI and saves
 * screenshots next to it. Steps: {"route": "/settings"}, {"click": "css selector"}, {"wait": 1500}, {"shot": "name"},
 * {"log": "expression"} (prints what the expression in the page resolves to), {"drag": {"selector": "css", "dx": 200,
 * "dy": -50, "at": "center" | "bottom-right"}} (real mouse events: press on the element, move by dx/dy, release).
 */
function runScreenshotScript(win: BrowserWindow, scriptFile: string): void {
  const steps = JSON.parse(fs.readFileSync(scriptFile, 'utf8')) as ScreenshotStep[];
  const dir = path.dirname(path.resolve(scriptFile));
  win.webContents.once('did-finish-load', async () => {
    for (const step of steps) {
      if ('route' in step) await win.webContents.executeJavaScript(`location.hash = ${JSON.stringify('#' + step.route)}; void 0`);
      if ('click' in step) await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(step.click)})?.click(); void 0`);
      if ('wait' in step) await new Promise((resolve) => setTimeout(resolve, step.wait));
      if ('log' in step) console.log(`[dev] ${step.log} =>`, await win.webContents.executeJavaScript(step.log));
      if ('shot' in step) fs.writeFileSync(path.join(dir, `${step.shot}.png`), (await win.webContents.capturePage()).toPNG());
      if ('drag' in step) await dragWithMouse(win, step.drag);
    }
    console.log(`[dev] screenshots saved to ${dir}`);
    if (process.env.GTT_SCREENSHOTS_QUIT === '1') app.quit();
  });
}

/** A real mouse drag (pointer events with capture, as a person's): press on the element, move in steps, release. */
async function dragWithMouse(win: BrowserWindow, drag: { selector: string; dx: number; dy: number; at?: 'center' | 'bottom-right' }): Promise<void> {
  const corner = drag.at === 'bottom-right';
  const point = (await win.webContents.executeJavaScript(
    `(() => { const r = document.querySelector(${JSON.stringify(drag.selector)})?.getBoundingClientRect(); return r ? [${corner ? 'r.right - 2, r.bottom - 2' : 'r.x + r.width / 2, r.y + r.height / 2'}] : null; })()`,
  )) as [number, number] | null;
  if (!point) return console.log(`[dev] drag: ${drag.selector} not found`);
  const [x, y] = point.map(Math.round) as [number, number];
  const send = (type: 'mouseDown' | 'mouseMove' | 'mouseUp', px: number, py: number) =>
    win.webContents.sendInputEvent({ type, x: px, y: py, button: 'left', clickCount: 1, ...(type === 'mouseMove' ? { modifiers: ['leftbuttondown' as const] } : {}) });
  send('mouseMove', x, y);
  send('mouseDown', x, y);
  for (let i = 1; i <= 10; i++) {
    send('mouseMove', Math.round(x + (drag.dx * i) / 10), Math.round(y + (drag.dy * i) / 10));
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  send('mouseUp', x + drag.dx, y + drag.dy);
}

/**
 * The data folder for the app's name. After a rename the folder of an earlier name moves over once, so the
 * settings, references, voice packages and recordings stay. If it cannot be moved (in use, another drive),
 * the old folder stays as it is and the app starts with a new one; nothing is deleted.
 */
function adoptDataFolder(appData: string, name: string, formerNames: string[]): string {
  const folder = path.join(appData, name);
  if (fs.existsSync(folder)) return folder;
  const former = formerNames.find((n) => fs.existsSync(path.join(appData, n)));
  if (!former) return folder;
  try {
    fs.renameSync(path.join(appData, former), folder);
    console.log(`[app] data folder moved from "${former}" to "${name}"`);
  } catch (err) {
    console.error(`[app] data folder "${former}" could not be moved, starting with a new one: ${(err as Error).message}`);
  }
  return folder;
}

/** Keeps the newest session logs and recordings (file names start with the date, so they sort by age). */
function pruneSessions(dir: string): void {
  if (dev) return;
  try {
    const files = fs.readdirSync(dir).sort().reverse();
    const old = [...files.filter((f) => f.endsWith('.log')).slice(KEEP_LOGS), ...files.filter((f) => f.endsWith('.gtcap')).slice(KEEP_RECORDINGS)];
    for (const file of old) fs.rmSync(path.join(dir, file), { force: true });
  } catch {
    // No sessions yet.
  }
}
