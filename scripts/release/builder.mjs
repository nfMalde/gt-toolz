// The electron-builder configuration for all three installers (docs/dev/building.md) and the call that builds one.
// electron-builder 26.17.0, checked by the project's rules (docs/dev/security.md).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { APP_ID, ELECTRON_VERSION, OUT, PRODUCT_NAME, ROOT, STAGE_APP, STAGE_BUILD, STAGE_UI, fail, info, writeChecksums } from './lib.mjs';

const require = createRequire(import.meta.url);

export function builderConfig() {
  return {
    appId: APP_ID,
    productName: PRODUCT_NAME,
    copyright: `Copyright © ${new Date().getFullYear()} Maldö`,
    directories: { app: STAGE_APP, output: OUT, buildResources: STAGE_BUILD },
    electronVersion: ELECTRON_VERSION,
    // Electron's zips are checked against checksums.json from the signed npm package, not against a list
    // downloaded next to them.
    electronDownload: { checksums: JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'checksums.json'), 'utf8')) },
    asar: true,
    extraResources: [{ from: STAGE_UI, to: 'ui' }],
    // No native modules: nothing to rebuild, no node-gyp, no downloads of Node headers.
    npmRebuild: false,
    nodeGypRebuild: false,
    buildDependenciesFromSource: false,
    includePdb: false,
    // docs/dev/security.md: no "Electron as Node", no NODE_OPTIONS or --inspect, only the checked app.asar.
    electronFuses: {
      runAsNode: false,
      enableNodeOptionsEnvironmentVariable: false,
      enableNodeCliInspectArguments: false,
      enableEmbeddedAsarIntegrityValidation: true,
      onlyLoadAppFromAsar: true,
      grantFileProtocolExtraPrivileges: false,
    },
    // The release workflow uploads the installers itself; the app looks for updates on its own (apps/desktop/src/updates.ts),
    // without electron-updater.
    publish: null,

    win: {
      target: [{ target: 'nsis', arch: ['x64'] }],
      // Not signed (a certificate is not free): SmartScreen shows "Unknown publisher" (README, "Installing").
      signAndEditExecutable: true,
    },
    nsis: {
      // Per user, no admin rights: %LOCALAPPDATA%\Programs, Start menu and desktop shortcut.
      oneClick: true,
      perMachine: false,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: PRODUCT_NAME,
      uninstallDisplayName: PRODUCT_NAME,
      // References, recorded voices and settings stay after an uninstall (%APPDATA%\GT Toolz).
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
      artifactName: 'GT-Toolz-Setup-${version}-${arch}.${ext}',
    },

    linux: {
      target: [{ target: 'deb', arch: ['x64'] }],
      executableName: 'gt-toolz',
      category: 'Game',
      synopsis: 'Toolkit for Gran Turismo 7: coach, pit crew, OBS overlays',
      description: 'GT Toolz reads the Gran Turismo 7 telemetry on the home network: a coach and a pit crew call braking points, corners and lap times by voice, and overlays show the driving values in OBS.',
      maintainer: 'Maldö <nfMalde@users.noreply.github.com>',
      vendor: 'Maldö',
      desktop: { entry: { Name: PRODUCT_NAME, Comment: 'Toolkit for Gran Turismo 7: coach, pit crew, OBS overlays', Categories: 'Game;Utility;' } },
    },
    deb: {
      artifactName: 'gt-toolz_${version}_${arch}.${ext}',
      priority: 'optional',
    },

    mac: {
      target: [{ target: 'dmg', arch: ['arm64', 'x64'] }],
      category: 'public.app-category.racing-games',
      // Ad-hoc signature (an Apple developer account is not free): runs on Apple silicon, Gatekeeper asks once.
      identity: '-',
      hardenedRuntime: false,
      gatekeeperAssess: false,
      notarize: false,
      extendInfo: {
        NSMicrophoneUsageDescription: 'GT Toolz records your voice only when you record a take for your own voice pack.',
        NSLocalNetworkUsageDescription: 'GT Toolz finds your PlayStation on the home network and receives its telemetry.',
      },
    },
    dmg: {
      artifactName: 'GT-Toolz-${version}-mac-${arch}.${ext}',
      title: '${productName} ${version}',
    },
  };
}

/** Builds installers for one platform ('windows' | 'linux' | 'mac') into release/<version>. */
export async function buildInstaller(platform) {
  if (!fs.existsSync(path.join(STAGE_APP, 'package.json'))) fail('nothing staged: run step 1 (Build) first');
  const { build, Platform } = require('electron-builder');
  const target = { windows: Platform.WINDOWS, linux: Platform.LINUX, mac: Platform.MAC }[platform];
  const config = builderConfig();
  const artifacts = await build({ targets: target.createTarget(), config, projectDir: ROOT, publish: 'never' });
  const installers = artifacts.filter((f) => /\.(exe|deb|dmg)$/.test(f));
  if (!installers.length) fail(`electron-builder made no installer (${artifacts.join(', ') || 'nothing'})`);
  // Only the installers stay in release/<version>; the unpacked app folders and blockmaps go.
  for (const entry of fs.readdirSync(OUT)) {
    const file = path.join(OUT, entry);
    if (/-unpacked$|^mac(-arm64)?$|\.blockmap$|^builder-(debug|effective-config)\.yml$|^\.icon-/.test(entry)) fs.rmSync(file, { recursive: true, force: true });
  }
  info('Installers:');
  writeChecksums();
  return installers;
}
