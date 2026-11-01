// Step 4: the Linux package (Debian/Ubuntu, x64): gt-toolz_<version>_amd64.deb, installs to /opt/GT Toolz with a
// menu entry; on Ubuntu 24.04 and later with an AppArmor profile for Chromium's sandbox.
// Runs on Linux (Ubuntu, also WSL2; ubuntu-latest in GitHub Actions).
// Usage: node scripts/release/4-installer-linux.mjs

import { buildInstaller } from './builder.mjs';
import { heading, requireHost, runIfMain } from './lib.mjs';

export default async function installerLinux() {
  heading('Create installer: Linux (deb)');
  requireHost('linux', 'the deb package is built on Linux (Ubuntu or WSL2)');
  await buildInstaller('linux');
}

await runIfMain(import.meta.url, installerLinux);
