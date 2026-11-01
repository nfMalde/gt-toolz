// Step 5: the macOS disk images, one per processor: GT-Toolz-<version>-mac-arm64.dmg (Apple silicon) and
// GT-Toolz-<version>-mac-x64.dmg (Intel). macOS 13 Ventura or later (Electron 43). Ad-hoc signed, not notarized.
// Runs on macOS (the test Mac or macos-latest in GitHub Actions).
// Usage: node scripts/release/5-installer-mac.mjs

import { buildInstaller } from './builder.mjs';
import { heading, requireHost, runIfMain } from './lib.mjs';

export default async function installerMac() {
  heading('Create installer: macOS (dmg)');
  requireHost('mac', 'the disk images are built on a Mac');
  await buildInstaller('mac');
}

await runIfMain(import.meta.url, installerMac);
