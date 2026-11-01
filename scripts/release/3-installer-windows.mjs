// Step 3: the Windows installer (Windows 10 and 11, x64): GT-Toolz-Setup-<version>-x64.exe, per user, no admin.
// Runs on Windows (locally or windows-latest in GitHub Actions).
// Usage: node scripts/release/3-installer-windows.mjs

import { buildInstaller } from './builder.mjs';
import { heading, requireHost, runIfMain } from './lib.mjs';

export default async function installerWindows() {
  heading('Create installer: Windows');
  requireHost('windows', 'the Windows installer is built on Windows');
  await buildInstaller('windows');
}

await runIfMain(import.meta.url, installerWindows);
