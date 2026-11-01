// Bundles the main process and the preload script (esbuild) and collects the license texts of
// everything that ships with the app into dist/licenses.json.
// Usage: node scripts/build.mjs [--watch]

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { context } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const repoRoot = path.resolve(appDir, '..', '..');
const dist = path.join(appDir, 'dist');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  sourcemap: true,
  // Provided by Electron at runtime.
  external: ['electron'],
  logLevel: 'info',
  absWorkingDir: appDir,
};

const builds = [
  { ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' },
  { ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' },
  { ...common, entryPoints: ['src/audio-preload.ts'], outfile: 'dist/audio-preload.cjs' },
  // The OBS overlay page's script, for the browser (served by modules/overlays/main/server.ts).
  { bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', logLevel: 'info', absWorkingDir: appDir, entryPoints: ['../../modules/overlays/page/client.ts'], outfile: 'dist/overlay-client.js' },
];

collectLicenses();

const contexts = await Promise.all(builds.map((options) => context(options)));
if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}

function collectLicenses() {
  const require = createRequire(path.join(repoRoot, 'apps', 'ui', 'package.json'));
  const packageDir = (name) => {
    // Some packages do not export package.json; walk up from the resolved entry instead.
    let dir = path.dirname(require.resolve(name));
    while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) {
      const parent = path.dirname(dir);
      if (parent === dir) throw new Error(`package.json of ${name} not found`);
      dir = parent;
    }
    return dir;
  };
  const shipped = ['electron', '@angular/core', '@ngrx/signals', 'rxjs', 'tslib', '@noble/ciphers'];
  const texts = {};
  const versions = {};
  for (const name of shipped) {
    const dir = name === 'electron' ? path.join(repoRoot, 'node_modules', 'electron') : name === '@noble/ciphers' ? path.join(repoRoot, 'node_modules', '@noble', 'ciphers') : packageDir(name);
    const file = fs.readdirSync(dir).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
    if (!file) throw new Error(`No license file in ${dir}`);
    texts[name] = fs.readFileSync(path.join(dir, file), 'utf8');
    versions[name] = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version;
  }
  // The plain Apache-2.0 terms (from RxJS's license file, without its own appendix).
  const rx = texts['rxjs'];
  const end = rx.indexOf('END OF TERMS AND CONDITIONS');
  texts['apache-2.0'] = end > 0 ? rx.slice(0, end + 'END OF TERMS AND CONDITIONS'.length) + '\n' : rx;
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'licenses.json'), JSON.stringify({ texts, versions }));
}
