// Step 7: the Mac test package without an installer (the user, 2026-10-24: the testers run the built app with
// Electron, without the repository; a dmg can only be built on a Mac). GT-Toolz-<version>-mac.zip holds the built
// app (app/dist, app/ui), the start script and the instructions. Electron for the Mac comes to the tester's Mac on
// the first start, straight from its GitHub release, checked against the SHA-256 that this step writes into the
// start script from checksums.json in Electron's signed npm package; the tester installs nothing (2026-10-28: no
// Node.js). Built on any system: the app is the same JavaScript everywhere. Where this machine has Electron's
// binary, the package gets a self-test.
// Usage: node scripts/release/7-mac-package.mjs

import fs from 'node:fs';
import path from 'node:path';
import { selfTest } from './6-test-installers.mjs';
import { HOST, OUT, RELEASE, ROOT, STAGE_APP, STAGE_UI, VERSION, fail, heading, info, readJson, runIfMain, writeChecksums, writeZip } from './lib.mjs';

const TEMPLATE = path.join(ROOT, 'scripts', 'release', 'mac-package');
/** File names in the package are English (the user, 2026-10-28); the German instructions are README.de.md. */
const START_SCRIPT = 'Start GT Toolz.command';

export default async function macPackage() {
  heading('Mac test package (no installer)');
  if (!fs.existsSync(path.join(STAGE_APP, 'package.json'))) fail('nothing staged: run step 1 (Build) first');

  const name = `GT-Toolz-${VERSION}-mac`;
  const dir = path.join(RELEASE, 'mac-package', name);
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
  const app = path.join(dir, 'app');
  fs.mkdirSync(app, { recursive: true });
  fs.cpSync(path.join(STAGE_APP, 'dist'), path.join(app, 'dist'), { recursive: true });
  // The UI next to dist: the app sees it and runs as an installed one (PORTABLE in apps/desktop/src/security.ts).
  fs.cpSync(STAGE_UI, path.join(app, 'ui'), { recursive: true });

  // The staged app's package.json: version, product name and main, nothing to install.
  fs.copyFileSync(path.join(STAGE_APP, 'package.json'), path.join(app, 'package.json'));

  // The start script with the project's Electron: its version and the SHA-256 of both Mac builds.
  const electronDir = path.join(ROOT, 'node_modules', 'electron');
  const electron = readJson(path.join(electronDir, 'package.json')).version;
  const checksums = readJson(path.join(electronDir, 'checksums.json'));
  const sha = (arch) => {
    const value = checksums[`electron-v${electron}-darwin-${arch}.zip`];
    if (!/^[0-9a-f]{64}$/.test(value ?? '')) fail(`no SHA-256 for electron-v${electron}-darwin-${arch}.zip in Electron's checksums.json`);
    return value;
  };
  const values = { ELECTRON_VERSION: electron, SHA256_ARM64: sha('arm64'), SHA256_X64: sha('x64') };
  const script = fs.readFileSync(path.join(TEMPLATE, 'start.command'), 'utf8').replace(/@([A-Z0-9_]+)@/g, (all, key) => values[key] ?? fail(`unknown placeholder ${all} in start.command`));
  fs.writeFileSync(path.join(dir, START_SCRIPT), script);
  info(`start script: Electron ${electron}, arm64 ${values.SHA256_ARM64.slice(0, 12)}…, x64 ${values.SHA256_X64.slice(0, 12)}…`);
  fs.copyFileSync(path.join(TEMPLATE, 'README.md'), path.join(dir, 'README.md'));
  fs.copyFileSync(path.join(TEMPLATE, 'README.de.md'), path.join(dir, 'README.de.md'));

  // The same app on this machine's Electron: the package starts and behaves as an installed app.
  const binary = {
    windows: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    linux: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'),
    mac: path.join(ROOT, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron'),
  }[HOST];
  if (binary && fs.existsSync(binary)) {
    await selfTest(`mac-package-on-${HOST}`, [binary, app, ...(HOST === 'linux' ? ['--no-sandbox'] : [])], { fuseProbe: false });
  } else {
    info('no Electron binary in node_modules here: package not started (node node_modules/electron/install.js)');
  }

  fs.mkdirSync(OUT, { recursive: true });
  const zip = path.join(OUT, `${name}.zip`);
  const files = writeZip(zip, dir, { root: name, executable: [START_SCRIPT] });
  info(`${path.basename(zip)}: ${files} files`);
  writeChecksums();
}

await runIfMain(import.meta.url, macPackage);
