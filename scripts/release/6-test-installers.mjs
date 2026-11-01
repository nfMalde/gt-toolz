// Step 6: tests the installers of this platform the way a tester gets them. Installs (or unpacks) each one, checks
// what is inside, reads the Electron fuses from the binary and starts the installed app with --self-test: an empty
// temporary data folder, window, bridge, coach, bundled files and voices (apps/desktop/src/self-test.ts). The app
// is started with ELECTRON_RUN_AS_NODE and NODE_OPTIONS set: with the fuses right, both are ignored.
// Windows: silent install for this user, check, uninstall. Linux: apt install and remove where sudo needs no
// password (GitHub Actions), else unpacked with dpkg-deb. macOS: attach the dmg, copy the app, check the signature.
// Usage: node scripts/release/6-test-installers.mjs [--force]   (--force: replace an existing installation)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { APP_ID, HOST, PRODUCT_NAME, TEST_OUT, VERSION, fail, hasProgram, heading, info, installers, run, runIfMain, SkipStep } from './lib.mjs';

export default async function testInstallers(args = {}) {
  heading(`Test installers (${HOST})`);
  const found = installers(HOST);
  if (!found.length) {
    if (!['windows', 'linux', 'mac'].includes(HOST)) throw new SkipStep(`no installers for ${HOST}`);
    fail(`no ${HOST} installer in release/${VERSION}: run its installer step first`);
  }
  fs.mkdirSync(TEST_OUT, { recursive: true });
  for (const installer of found) {
    info(`· ${path.basename(installer)}`);
    if (HOST === 'windows') await testWindows(installer, args);
    if (HOST === 'linux') await testLinux(installer, args);
    if (HOST === 'mac') await testMac(installer);
  }
}

// --- Windows ---

async function testWindows(installer, args) {
  const dir = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'gt-toolz');
  const exe = path.join(dir, `${PRODUCT_NAME}.exe`);
  const uninstaller = path.join(dir, `Uninstall ${PRODUCT_NAME}.exe`);
  if (fs.existsSync(dir) && !args.force) fail(`GT Toolz is installed for this user (${dir}). The check would replace and then remove it: uninstall it first, or run with --force.`);

  await run(installer, ['/S'], { timeout: 300_000 });
  try {
    if (!fs.existsSync(exe)) fail(`not installed: ${exe}`);
    const startMenu = path.join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${PRODUCT_NAME}.lnk`);
    if (!fs.existsSync(startMenu)) fail(`no Start menu shortcut: ${startMenu}`);
    info('installed for this user, Start menu shortcut present');
    checkFuses(exe);
    await selfTest('windows-x64', [exe]);
  } finally {
    if (fs.existsSync(uninstaller)) {
      await run(uninstaller, ['/S'], { timeout: 120_000 });
      // The uninstaller copies itself to a temp folder and returns at once; wait until the app folder is gone.
      for (let i = 0; i < 60 && fs.existsSync(exe); i++) await sleep(500);
      if (fs.existsSync(exe)) fail(`uninstall left ${exe}`);
      info('uninstalled');
    }
  }
}

// --- Linux ---

async function testLinux(deb, args) {
  for (const program of ['dpkg-deb']) if (!(await hasProgram(program))) fail(`${program} is missing`);
  const { stdout: fields } = await run('dpkg-deb', ['--field', deb, 'Package', 'Version', 'Architecture', 'Depends'], { capture: true });
  info(fields.trim().split('\n').join(' · '));
  const { stdout: contents } = await run('dpkg-deb', ['--contents', deb], { capture: true, quiet: true });
  for (const needed of [`/opt/${PRODUCT_NAME}/gt-toolz`, `/opt/${PRODUCT_NAME}/resources/app.asar`, `/opt/${PRODUCT_NAME}/resources/ui/index.html`, `/opt/${PRODUCT_NAME}/chrome-sandbox`, '/usr/share/applications/gt-toolz.desktop']) {
    if (!contents.includes(`.${needed}`)) fail(`not in the package: ${needed}`);
  }
  info('package contents complete (app, UI, sandbox helper, menu entry)');

  const sudo = (await run('sudo', ['-n', 'true'], { capture: true, quiet: true, allowFail: true }).catch(() => ({ code: 1 }))).code === 0;
  if (sudo) {
    const installed = (await run('dpkg', ['-s', 'gt-toolz'], { capture: true, quiet: true, allowFail: true })).code === 0;
    if (installed && !args.force) fail('gt-toolz is installed on this system. The check would replace and then remove it: remove it first, or run with --force.');
    await run('sudo', ['-n', 'apt-get', 'install', '-y', '--no-install-recommends', path.resolve(deb)], { timeout: 600_000 });
    try {
      const exe = `/opt/${PRODUCT_NAME}/gt-toolz`;
      checkFuses(exe);
      await selfTest('linux-x64', [exe]);
    } finally {
      await run('sudo', ['-n', 'apt-get', 'remove', '-y', 'gt-toolz'], { timeout: 300_000 });
      if (fs.existsSync(`/opt/${PRODUCT_NAME}/gt-toolz`)) fail('apt-get remove left /opt/GT Toolz/gt-toolz');
      info('removed');
    }
  } else {
    // Without root the sandbox helper cannot be setuid: the unpacked app runs without Chromium's sandbox.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-toolz-deb-'));
    try {
      await run('dpkg-deb', ['-x', deb, dir]);
      const exe = path.join(dir, 'opt', PRODUCT_NAME, 'gt-toolz');
      checkFuses(exe);
      info('no password-free sudo: testing the unpacked package (without the Chromium sandbox)');
      await selfTest('linux-x64', [exe, '--no-sandbox']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

// --- macOS ---

async function testMac(dmg) {
  const arch = /-arm64\.dmg$/.test(dmg) ? 'arm64' : 'x64';
  const prefix = [];
  if (arch !== process.arch) {
    if (arch === 'arm64') return info('skipped: an Apple silicon build does not run on an Intel Mac');
    const rosetta = (await run('arch', ['-x86_64', '/usr/bin/true'], { capture: true, quiet: true, allowFail: true })).code === 0;
    if (!rosetta) return info('skipped: the Intel build needs Rosetta 2 on this Mac (softwareupdate --install-rosetta)');
    prefix.push('arch', '-x86_64');
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-toolz-dmg-'));
  const mount = path.join(work, 'mnt');
  fs.mkdirSync(mount);
  try {
    await run('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg], { capture: true });
    try {
      const mounted = path.join(mount, `${PRODUCT_NAME}.app`);
      if (!fs.existsSync(mounted)) fail(`no ${PRODUCT_NAME}.app in the disk image`);
      if (!fs.existsSync(path.join(mount, 'Applications'))) fail('no Applications link in the disk image');
      await run('ditto', [mounted, path.join(work, `${PRODUCT_NAME}.app`)]);
    } finally {
      await run('hdiutil', ['detach', mount, '-quiet'], { allowFail: true });
    }
    const app = path.join(work, `${PRODUCT_NAME}.app`);
    await run('codesign', ['--verify', '--deep', '--strict', app]);
    const { stderr: signature } = await run('codesign', ['-dv', app], { capture: true, quiet: true });
    if (!/Signature=adhoc/.test(signature)) fail(`expected an ad-hoc signature:\n${signature}`);
    const plist = path.join(app, 'Contents', 'Info.plist');
    const { stdout: id } = await run('plutil', ['-extract', 'CFBundleIdentifier', 'raw', plist], { capture: true, quiet: true });
    if (id.trim() !== APP_ID) fail(`CFBundleIdentifier is ${id.trim()}, expected ${APP_ID}`);
    for (const key of ['NSMicrophoneUsageDescription', 'NSLocalNetworkUsageDescription']) {
      await run('plutil', ['-extract', key, 'raw', plist], { capture: true, quiet: true });
    }
    info(`signature ad-hoc, ${APP_ID}, usage texts for microphone and local network present`);
    checkFuses(path.join(app, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework'));
    // Under Rosetta 2 the first start translates the whole app first (two minutes on a CI Mac): the self-test waits longer.
    await selfTest(`mac-${arch}`, [...prefix, path.join(app, 'Contents', 'MacOS', PRODUCT_NAME)], { slow: prefix.length > 0 });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// --- Shared ---

/** The fuse wire in the Electron binary (format of @electron/fuses): the sentinel, a version byte, a length, then
 * one byte per fuse, "0" off and "1" on. Order: RunAsNode, EnableCookieEncryption, EnableNodeOptionsEnvironmentVariable,
 * EnableNodeCliInspectArguments, EnableEmbeddedAsarIntegrityValidation, OnlyLoadAppFromAsar,
 * LoadBrowserProcessSpecificV8Snapshot, GrantFileProtocolExtraPrivileges. */
const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
const EXPECTED_FUSES = { 0: ['RunAsNode', '0'], 2: ['NodeOptions', '0'], 3: ['NodeCliInspect', '0'], 4: ['AsarIntegrity', '1'], 5: ['OnlyLoadAppFromAsar', '1'], 7: ['FileProtocolPrivileges', '0'] };

function checkFuses(binary) {
  const data = fs.readFileSync(binary);
  const at = data.indexOf(FUSE_SENTINEL);
  if (at < 0) fail(`no fuse wire in ${binary}`);
  const length = data[at + FUSE_SENTINEL.length + 1];
  const wire = data.subarray(at + FUSE_SENTINEL.length + 2, at + FUSE_SENTINEL.length + 2 + length).toString('latin1');
  const wrong = Object.entries(EXPECTED_FUSES).filter(([i, [, want]]) => wire[Number(i)] !== want);
  if (wrong.length) fail(`fuses not as required: ${wrong.map(([i, [name, want]]) => `${name}=${wire[Number(i)]} (want ${want})`).join(', ')}`);
  info(`fuses: ${Object.values(EXPECTED_FUSES).map(([name, want]) => `${name} ${want === '1' ? 'on' : 'off'}`).join(', ')}`);
}

/**
 * Starts the installed app with --self-test and prints its checks. fuseProbe: set ELECTRON_RUN_AS_NODE and
 * NODE_OPTIONS, which an installed app must ignore; off for Electron from npm, whose fuses are not set. slow: every
 * wait five times as long (GTT_SELF_TEST_SLOW, apps/desktop/src/self-test.ts), for the Intel build under Rosetta 2.
 */
export async function selfTest(label, command, { fuseProbe = true, slow = false } = {}) {
  fs.mkdirSync(TEST_OUT, { recursive: true });
  const resultFile = path.join(TEST_OUT, `${label}.json`);
  fs.rmSync(resultFile, { force: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  if (fuseProbe) {
    // With the fuses off, the app ignores both; with them on, it would run as Node or fail to start.
    env.ELECTRON_RUN_AS_NODE = '1';
    env.NODE_OPTIONS = '--require=/gt-toolz-fuse-probe-must-not-load';
  }
  if (slow) env.GTT_SELF_TEST_SLOW = '1';
  const display = process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY;
  const [program, ...rest] = display ? ['xvfb-run', '-a', ...command] : command;
  if (display && !(await hasProgram('xvfb-run'))) fail('no display and no xvfb-run (sudo apt-get install xvfb)');
  const { code } = await run(program, [...rest, `--self-test=${resultFile}`], { env, timeout: slow ? 600_000 : 180_000, allowFail: true });
  if (!fs.existsSync(resultFile)) fail(`the app wrote no self-test result (exit code ${code})`);
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  for (const c of result.checks) info(`${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`);
  if (result.dataDir?.includes('gt-toolz-self-test-')) fs.rmSync(result.dataDir, { recursive: true, force: true });
  if (!result.ok || code !== 0) fail(`self-test failed on ${label} (exit code ${code})`);
  if (result.version !== VERSION) fail(`the installed app reports ${result.version}, expected ${VERSION}`);
  info(`self-test passed: ${PRODUCT_NAME} ${result.version}, ${result.platform}-${result.arch}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await runIfMain(import.meta.url, testInstallers);
