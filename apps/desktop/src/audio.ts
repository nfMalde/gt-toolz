// Plays the voices' clips in a hidden window with Web Audio: the same on Windows, macOS and Linux, and every
// clip is decoded in advance, so it starts right away. The window shows nothing and its page may load
// nothing (strict CSP); the player lives in its preload script (audio-preload.ts).

import fs from 'node:fs';
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron';
import type { AudioChannel, AudioOutput } from '@gt-toolz/runtime';

const EMPTY_PAGE = "<!doctype html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'\">";
/** More crashes than this within CRASH_WINDOW_MS: the player is started again only after SLOW_RESTART_MS. */
const MAX_QUICK_RESTARTS = 3;
const CRASH_WINDOW_MS = 60_000;
const SLOW_RESTART_MS = 10_000;

export class ElectronAudio implements AudioOutput {
  private window: BrowserWindow | undefined;
  private ready = false;
  /** Messages sent before the player listens. */
  private pending: [channel: string, ...args: unknown[]][] = [];
  private nextChannel = 1;
  /** What each channel has loaded: loaded again into a new window after a crash. */
  private readonly loaded = new Map<number, Map<string, string>>();
  /** Each channel's volume (0..1), for a new window after a crash too. */
  private readonly volumes = new Map<number, number>();
  /** When the player crashed lately. */
  private crashes: number[] = [];

  constructor(
    private readonly preload: string,
    private readonly dev: boolean,
  ) {
    ipcMain.on('audio:ready', (event: IpcMainEvent) => {
      if (!this.window || event.sender !== this.window.webContents) return;
      this.ready = true;
      if (this.dev) console.log(`[audio] player ready, ${this.pending.length} message(s) waiting`);
      for (const [channel, ...args] of this.pending.splice(0)) this.window.webContents.send(channel, ...args);
    });
  }

  start(): void {
    const window = new BrowserWindow({
      show: false,
      width: 100,
      height: 100,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: this.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        spellcheck: false,
        // Clips play the moment they are due, also while the window is hidden, without a click first.
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    this.window = window;
    this.ready = false;
    window.webContents.on('render-process-gone', (_event, details) => {
      if (this.window !== window) return;
      if (!window.isDestroyed()) window.destroy();
      // One that keeps crashing is started again more slowly, not in a loop (release check 2026-10-28).
      const now = Date.now();
      this.crashes = [...this.crashes.filter((at) => now - at < CRASH_WINDOW_MS), now];
      const delay = this.crashes.length > MAX_QUICK_RESTARTS ? SLOW_RESTART_MS : 0;
      console.error(`[audio] player stopped (${details.reason}), starting it again${delay ? ` in ${delay / 1000} s` : ''}`);
      setTimeout(() => {
        if (this.window !== window) return;
        this.start();
        for (const [channel, clips] of this.loaded) {
          for (const [name, file] of clips) this.sendLoad(channel, name, file);
        }
        for (const [channel, gain] of this.volumes) this.send('audio:volume', channel, gain);
      }, delay);
    });
    if (this.dev) {
      window.webContents.on('console-message', (event) => {
        if (event.level === 'warning' || event.level === 'error') console.log(`[audio:${event.level}] ${event.message}`);
      });
    }
    // An empty page that may load nothing at all; the player is the preload script.
    void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(EMPTY_PAGE)}`);
  }

  stop(): void {
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = undefined;
  }

  openChannel(): AudioChannel {
    const channel = this.nextChannel++;
    const clips = new Map<string, string>();
    this.loaded.set(channel, clips);
    return {
      load: async (name, file) => {
        clips.set(name, file);
        this.sendLoad(channel, name, file);
      },
      play: (name) => this.send('audio:play', channel, name),
      stop: () => this.send('audio:stop', channel),
      close: () => {
        this.loaded.delete(channel);
        this.volumes.delete(channel);
        this.send('audio:close', channel);
      },
      setVolume: (gain) => {
        this.volumes.set(channel, gain);
        this.send('audio:volume', channel, gain);
      },
    };
  }

  private sendLoad(channel: number, name: string, file: string): void {
    let data: Buffer;
    try {
      data = fs.readFileSync(file);
    } catch (err) {
      console.error(`[audio] ${file}: ${(err as Error).message}`);
      return;
    }
    this.send('audio:load', channel, name, data);
  }

  private send(channel: string, ...args: unknown[]): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    if (this.ready) window.webContents.send(channel, ...args);
    else this.pending.push([channel, ...args]);
  }
}
