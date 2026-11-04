// Step 1: production build. Builds the UI (Angular, production) and the main process (esbuild), then stages exactly
// what goes into the installers: release/stage/app (package.json + the bundled main process, no source maps) and
// release/stage/ui. The installer steps package only these folders.
// Usage: node scripts/release/1-build.mjs

import fs from 'node:fs';
import path from 'node:path';
import { APP_ID, ELECTRON_VERSION, PRODUCT_NAME, ROOT, STAGE, STAGE_APP, STAGE_BUILD, STAGE_UI, VERSION, fail, heading, info, readJson, run, runIfMain } from './lib.mjs';

const DESKTOP_DIST = path.join(ROOT, 'apps', 'desktop', 'dist');
const UI_DIST = path.join(ROOT, 'apps', 'ui', 'dist', 'ui', 'browser');
/** The main process loads these from its own folder (apps/desktop/src: main.ts, licenses.ts; the overlays module: overlay-client.js). */
const APP_FILES = ['main.cjs', 'preload.cjs', 'audio-preload.cjs', 'overlay-client.js', 'licenses.json'];

export default async function build() {
  heading(`Build (Prod) · GT Toolz ${VERSION} · Electron ${ELECTRON_VERSION}`);
  // Every workspace carries the same version; a mismatch means a forgotten bump.
  for (const dir of ['apps/desktop', 'apps/ui', 'packages/core', 'packages/runtime', 'packages/coach', 'packages/telemetry', 'modules/telemetry', 'modules/crew', 'modules/overlays', 'modules/haptics', 'tools/capture']) {
    const version = readJson(path.join(ROOT, dir, 'package.json')).version;
    if (version !== VERSION) fail(`${dir}/package.json has version ${version}, the root ${VERSION}`);
  }
  // Every version ships its news, shown once after the update (apps/ui/src/app/ui/news-dialog.ts).
  for (const language of ['en', 'de']) {
    const news = path.join(ROOT, 'apps', 'ui', 'public', 'news', `${VERSION}.${language}.md`);
    if (!fs.existsSync(news)) fail(`no news for ${VERSION}: apps/ui/public/news/${VERSION}.${language}.md`);
  }
  // Official builds (the release workflow) name the repository whose releases the app looks at for updates; a build
  // from source has none and never looks (apps/desktop/src/updates.ts).
  const updateRepo = process.env.GTT_UPDATE_REPO ?? '';
  if (updateRepo && !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(updateRepo)) fail(`GTT_UPDATE_REPO is not owner/name: ${updateRepo}`);
  info(updateRepo ? `updates from github.com/${updateRepo}` : 'no updates (GTT_UPDATE_REPO not set: a build from source)');

  for (const dir of [DESKTOP_DIST, path.join(ROOT, 'apps', 'ui', 'dist')]) fs.rmSync(dir, { recursive: true, force: true });
  await run('npm', ['run', 'build', '-w', '@gt-toolz/ui']);
  await run('npm', ['run', 'build', '-w', '@gt-toolz/desktop']);

  heading('Stage what the installers contain');
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(path.join(STAGE_APP, 'dist'), { recursive: true });
  for (const file of APP_FILES) {
    const source = path.join(DESKTOP_DIST, file);
    if (!fs.existsSync(source)) fail(`missing build output: apps/desktop/dist/${file}`);
    fs.copyFileSync(source, path.join(STAGE_APP, 'dist', file));
  }
  // Everything the main process needs is bundled into main.cjs; the app has no node_modules.
  const desktop = readJson(path.join(ROOT, 'apps', 'desktop', 'package.json'));
  fs.writeFileSync(
    path.join(STAGE_APP, 'package.json'),
    `${JSON.stringify(
      {
        name: 'gt-toolz',
        productName: PRODUCT_NAME,
        version: VERSION,
        description: 'GT Toolz: toolkit for Gran Turismo 7 (coach and pit crew in your ear, OBS overlays), based on the telemetry GT7 sends on your home network',
        author: { name: 'Maldö', email: 'nfMalde@users.noreply.github.com' },
        homepage: 'https://github.com/nfMalde/gt-toolz',
        license: desktop.license,
        private: true,
        main: 'dist/main.cjs',
        ...(updateRepo ? { updateRepo } : {}),
      },
      null,
      2,
    )}\n`,
  );

  if (!fs.existsSync(path.join(UI_DIST, 'index.html'))) fail('missing UI build: apps/ui/dist/ui/browser/index.html');
  fs.cpSync(UI_DIST, STAGE_UI, { recursive: true });

  // The app icon (the mascot); electron-builder makes .ico (Windows), .icns (macOS) and the Linux sizes from it.
  fs.mkdirSync(STAGE_BUILD, { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'apps', 'ui', 'public', 'maldoe-512.png'), path.join(STAGE_BUILD, 'icon.png'));

  const maps = listFiles(STAGE).filter((f) => f.endsWith('.map'));
  if (maps.length) fail(`source maps in the stage: ${maps.join(', ')}`);
  const files = listFiles(STAGE);
  const bytes = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
  info(`${APP_ID} ${VERSION}: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in release/stage`);
}

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

await runIfMain(import.meta.url, build);
