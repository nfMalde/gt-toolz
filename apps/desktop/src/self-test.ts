// Installer check (scripts/release/6-test-installers.mjs): `--self-test=<file>` starts the installed app on an empty
// temporary data folder, checks that its parts work, writes the result to <file> as JSON and quits with 0 (passed)
// or 1. It reads no user data, sends nothing into the network and needs no PS5.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, type BrowserWindow } from 'electron';
import type { CoachRunner } from '@gt-toolz/runtime';
import { chromiumLicensesFile } from './licenses';
import { PORTABLE } from './security';

const FLAG = '--self-test=';

/** The result file, if the app was started for the installer check. */
export const SELF_TEST_FILE = process.argv.find((arg) => arg.startsWith(FLAG))?.slice(FLAG.length) || undefined;

/** An empty data folder of its own, so the check never touches the user's settings, references or logs. */
export function selfTestDataDir(): string {
  // The folders of earlier checks (in use until their app had quit, so they go now).
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (entry.startsWith('gt-toolz-self-test-')) fs.rmSync(path.join(os.tmpdir(), entry), { recursive: true, force: true, maxRetries: 2 });
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-toolz-self-test-'));
  // The PS5 "on this PC": no discovery broadcast into the network during the check.
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ settings: { ip: '127.0.0.1' }, guideDone: true }));
  return dir;
}

export interface SelfTestResult {
  ok: boolean;
  version: string;
  platform: string;
  arch: string;
  packaged: boolean;
  dataDir: string;
  checks: { name: string; ok: boolean; detail: string }[];
}

interface SelfTestOptions {
  file: string;
  window: BrowserWindow;
  runner: CoachRunner;
  uiDir: string;
  dataDir: string;
  sessionsDir: string;
}

/** Runs the checks once the window has loaded, writes the result and quits. Gives up after 90 s. */
export async function runSelfTest(options: SelfTestOptions): Promise<void> {
  const checks: SelfTestResult['checks'] = [];
  const check = async (name: string, test: () => Promise<string> | string) => {
    try {
      checks.push({ name, ok: true, detail: await withTimeout(Promise.resolve().then(test), 30_000) });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const page = (script: string) => options.window.webContents.executeJavaScript(script) as Promise<unknown>;
  const giveUp = setTimeout(() => void finish(options, checks, 'timed out after 90 s'), 90_000);

  await check('packaged', () => {
    if (PORTABLE) return 'portable app folder';
    if (!app.isPackaged) throw new Error('not a packaged app');
    return __dirname.includes('app.asar') ? 'app.asar' : 'unpacked app folder';
  });
  await check('bundled files', () => {
    const files = [
      ...['main.cjs', 'preload.cjs', 'audio-preload.cjs', 'overlay-client.js', 'licenses.json'].map((f) => path.join(__dirname, f)),
      path.join(options.uiDir, 'index.html'),
      path.join(options.uiDir, 'maldoe-256.png'),
      chromiumLicensesFile(),
    ];
    const missing = files.filter((f) => !fs.existsSync(f));
    if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    return `${files.length} files`;
  });
  await check('window', async () => {
    if (options.window.webContents.isLoading()) await new Promise<void>((resolve) => options.window.webContents.once('did-finish-load', () => resolve()));
    // Angular renders into <gtt-root> once it has started.
    for (let i = 0; i < 60; i++) {
      if (Number(await page(`document.querySelector('gtt-root')?.childElementCount ?? 0`)) > 0) return options.window.webContents.getURL();
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('the UI did not start');
  });
  await check('bridge', async () => {
    const version = await page(`window.gtt.info().then((info) => info.version)`);
    if (version !== app.getVersion()) throw new Error(`info() returned ${String(version)}`);
    return `info() ${String(version)}`;
  });
  await check('coach', () => {
    const status = options.runner.currentStatus;
    if (!status.running) throw new Error('the coach is not running');
    const logs = fs.existsSync(options.sessionsDir) ? fs.readdirSync(options.sessionsDir).filter((f) => f.endsWith('.log')) : [];
    if (!logs.length) throw new Error('no session log');
    return `running, ${logs.length} session log`;
  });
  await check('voices', async () => {
    // System voices (Windows, macOS) and installed packages; none is fine on a fresh Linux.
    const count = await page(`window.gtt.listVoices().then((voices) => voices.length)`);
    return `${String(count)} voices`;
  });

  clearTimeout(giveUp);
  await finish(options, checks);
}

let finished = false;

async function finish(options: SelfTestOptions, checks: SelfTestResult['checks'], error?: string): Promise<void> {
  if (finished) return;
  finished = true;
  if (error) checks.push({ name: 'self-test', ok: false, detail: error });
  const result: SelfTestResult = {
    ok: checks.length > 0 && checks.every((c) => c.ok),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    packaged: app.isPackaged,
    dataDir: options.dataDir,
    checks,
  };
  fs.mkdirSync(path.dirname(path.resolve(options.file)), { recursive: true });
  fs.writeFileSync(options.file, JSON.stringify(result, null, 2));
  await withTimeout(options.runner.stop(), 10_000).catch(() => undefined);
  app.exit(result.ok ? 0 : 1);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer within ${ms / 1000} s`)), ms);
    promise.then(
      (value) => (clearTimeout(timer), resolve(value)),
      (error: unknown) => (clearTimeout(timer), reject(error instanceof Error ? error : new Error(String(error)))),
    );
  });
}
