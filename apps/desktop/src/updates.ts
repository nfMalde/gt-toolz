// Updates from the app's GitHub releases, half automatic: the app looks (at start once the user agreed, or from the
// update button), the user sees what changed and chooses "Update" or "Later". Then the installer for this system is
// downloaded and checked against the signed checksum list (packages/runtime/src/app-updates.ts). Windows: the
// installer runs and the app closes for it.
// macOS and Linux: the disk image or the package opens for the user (installing there needs the user anyway).
// Only official installed builds look: their package.json names the repository (scripts/release/1-build.mjs).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app, shell } from 'electron';
import { downloadUpdate, fetchReleases, newestRelease, releaseNotes, type FoundUpdate, type UpdateStatus } from '@gt-toolz/runtime';

/** Progress goes to the UI at most this often. */
const PROGRESS_INTERVAL_MS = 250;
/** The installer has started before the app closes for it. */
const QUIT_DELAY_MS = 1500;

export interface UpdatesOptions {
  /** owner/name of the repository whose releases count; undefined: this build never looks. */
  repo: string | undefined;
  version: string;
  /** Where the installer is saved. */
  downloads: string;
  send: (status: UpdateStatus) => void;
  log: (line: string) => void;
  quit: () => void;
}

/**
 * The repository an official build looks at: set by the release build in the app's package.json, never in dev or in
 * a build from source.
 */
export function updateRepo(): string | undefined {
  if (!app.isPackaged) return undefined;
  try {
    const repo = (JSON.parse(fs.readFileSync(path.join(app.getAppPath(), 'package.json'), 'utf8')) as { updateRepo?: unknown }).updateRepo;
    return typeof repo === 'string' && repo ? repo : undefined;
  } catch {
    return undefined;
  }
}

export class AppUpdates {
  private state: UpdateStatus;
  private found: FoundUpdate | undefined;
  private busy = false;

  constructor(private readonly options: UpdatesOptions) {
    this.state = { available: !!options.repo, state: 'idle' };
  }

  get status(): UpdateStatus {
    return this.state;
  }

  /** Looks for a newer release (one look at a time); nothing when this build does not look. */
  async check(): Promise<UpdateStatus> {
    const repo = this.options.repo;
    if (!repo || this.busy || this.state.state === 'installing') return this.state;
    this.busy = true;
    this.set({ state: 'checking', error: undefined });
    try {
      const releases = await fetchReleases({ repo, version: this.options.version });
      this.found = newestRelease(releases, this.options.version, process.platform, process.arch);
      const found = this.found;
      this.options.log(found ? `UPDATE    ${found.version} available (${found.asset.name})` : `UPDATE    ${this.options.version} is the newest`);
      this.set({
        state: found ? 'found' : 'none',
        checkedAt: Date.now(),
        release: found && {
          version: found.version,
          name: found.release.name || `GT Toolz ${found.version}`,
          notes: releaseNotes(found.release.body),
          prerelease: found.release.prerelease,
          publishedAt: found.release.published_at ?? undefined,
          file: found.asset.name,
          size: found.asset.size,
        },
      });
    } catch (err) {
      this.options.log(`UPDATE    look failed: ${(err as Error).message}`);
      this.set({ state: 'error', error: (err as Error).message, checkedAt: Date.now() });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  /** The update the user chose: download and check the installer, then hand it to the system. */
  async install(): Promise<UpdateStatus> {
    const repo = this.options.repo;
    const found = this.found;
    if (!repo || !found || this.busy || this.state.state === 'installing') return this.state;
    this.busy = true;
    this.set({ state: 'downloading', progress: 0, error: undefined });
    let sentAt = 0;
    try {
      const file = await downloadUpdate({ repo, version: this.options.version }, found, this.options.downloads, {
        onProgress: (received, total) => {
          const now = Date.now();
          if (now - sentAt < PROGRESS_INTERVAL_MS && received < total) return;
          sentAt = now;
          this.set({ progress: total ? received / total : 0 });
        },
      });
      this.options.log(`UPDATE    ${path.basename(file)} downloaded and checked`);
      await this.hand(file);
    } catch (err) {
      this.options.log(`UPDATE    failed: ${(err as Error).message}`);
      this.set({ state: 'error', error: (err as Error).message });
    } finally {
      this.busy = false;
    }
    return this.state;
  }

  /**
   * Windows: the installer runs on its own and starts the new version; the app closes for it, but only once the
   * installer did start (an antivirus or Smart App Control may block it: then an error, and the app stays). Elsewhere:
   * the file is opened.
   */
  private async hand(file: string): Promise<void> {
    if (process.platform === 'win32') {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(file, [], { detached: true, stdio: 'ignore' });
        child.once('error', reject);
        child.once('spawn', () => {
          child.unref();
          resolve();
        });
      });
      this.set({ state: 'installing', progress: 1 });
      setTimeout(() => this.options.quit(), QUIT_DELAY_MS);
      return;
    }
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
    this.set({ state: 'opened', progress: 1 });
  }

  /** What the window shows of an error: no folders of this PC (streamer mode); the log keeps the whole message. */
  private shown(message: string): string {
    let text = message;
    for (const [folder, as] of [[this.options.downloads, '<download folder>'], [os.homedir(), '<home>']] as const) {
      if (folder) text = text.split(folder).join(as);
    }
    return text.replace(/[A-Za-z]:\\[^\s'"`]+|\/(?:home|Users)\/[^\s'"`]+/g, '<folder>');
  }

  private set(change: Partial<UpdateStatus>): void {
    this.state = { ...this.state, ...change, ...(change.error ? { error: this.shown(change.error) } : {}) };
    this.options.send(this.state);
  }
}
