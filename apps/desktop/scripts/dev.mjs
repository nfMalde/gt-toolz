// Dev mode: Angular dev server (live reload) + esbuild watch for the main process + Electron.
// The main process restarts when its code changes; the UI reloads by itself.
// Debugging: main process on port 9229 (VS Code "Attach to main"), UI with F12 (DevTools).
// Usage: npm run dev   [-- --no-inspect]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const uiDir = path.join(repoRoot, 'apps', 'ui');
const DEV_URL = 'http://localhost:4200';
const inspect = !process.argv.includes('--no-inspect');

const electronExe = path.join(repoRoot, 'node_modules', 'electron', 'dist', process.platform === 'win32' ? 'electron.exe' : 'electron');
if (!fs.existsSync(electronExe)) {
  console.error('Electron binary missing. Run once: node node_modules/electron/install.js (see docs/dev/building.md)');
  process.exit(1);
}

const env = { ...process.env, NG_CLI_ANALYTICS: 'false', GTT_DEV_URL: DEV_URL };
// Set by VS Code for its extension processes; with it, Electron would start as plain Node.
delete env.ELECTRON_RUN_AS_NODE;

// --- Angular dev server ---
const ng = spawn(process.execPath, [path.join(repoRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js'), 'serve', '--port', '4200'], {
  cwd: uiDir,
  env,
  stdio: 'inherit',
});
ng.on('exit', (code) => {
  console.log(`[dev] Angular dev server ended (${code})`);
  shutdown();
});

// --- Main process: build, watch, (re)start Electron ---
let electron;
let restarting = false;

function startElectron() {
  const args = [...(inspect ? ['--inspect=9229'] : []), '--remote-debugging-port=9222', appDir];
  electron = spawn(electronExe, args, { env, stdio: 'inherit' });
  electron.on('exit', () => {
    if (restarting) return;
    console.log('[dev] Electron closed, stopping');
    shutdown();
  });
}

function restartElectron() {
  if (!electron) return startElectron();
  restarting = true;
  electron.once('exit', () => {
    restarting = false;
    startElectron();
  });
  electron.kill();
}

const restartPlugin = {
  name: 'restart-electron',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length) return;
      if (serverReady) restartElectron();
    });
  },
};

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
  absWorkingDir: appDir,
};

let serverReady = false;
let main;
let preload;
// Licenses and a first full build come from the normal build script.
await new Promise((resolve, reject) => {
  const build = spawn(process.execPath, [path.join(here, 'build.mjs')], { stdio: 'inherit' });
  build.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('build failed'))));
});
main = await context({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs', plugins: [restartPlugin] });
preload = await context({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs', plugins: [restartPlugin] });
await main.watch();
await preload.watch();

await waitForServer(DEV_URL);
serverReady = true;
startElectron();

async function waitForServer(url) {
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  restarting = false;
  electron?.kill();
  ng.kill();
  void main?.dispose();
  void preload?.dispose();
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
