// Files the app keeps (config, references, history, recorded voice packs) are replaced in one step (release check
// 2026-10-28): written to a fresh temporary name next to the file, flushed to disk, then renamed over it. A crash or
// a full disk never leaves a half-written file, and a link planted at a fixed temp name is never followed.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Windows: a virus scanner or the search indexer may hold the file for a moment. */
const RENAME_ATTEMPTS = 5;
const RENAME_WAIT_MS = 50;

export function writeFileAtomic(file: string, data: string | Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  // wx: never an existing file or link; 0600: only this user (where the system has file modes).
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    renameWithRetry(temp, file);
  } catch (err) {
    fs.rmSync(temp, { force: true });
    throw err;
  }
}

function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= RENAME_ATTEMPTS || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_WAIT_MS);
    }
  }
}
