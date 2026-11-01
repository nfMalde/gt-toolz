import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { SettingsStore } from '../stores/settings.store';
import { hidePaths } from './hide-paths';

/** How long a hidden value stays visible after the warning. */
export const REVEAL_SECONDS = 10;

/**
 * Streamer mode (docs/dev/architecture.md; a streamer friend's wish, 2026-10-22): IP addresses and the PlayStation's name, file
 * paths, other players' names and device names are hidden in the app. A click shows one after a warning, for
 * REVEAL_SECONDS. The setting lives with the others, so it survives a restart.
 */
@Injectable({ providedIn: 'root' })
export class StreamerMode {
  private readonly settings = inject(SettingsStore);
  readonly enabled = computed(() => this.settings.settings()?.streamerMode ?? false);
  /** The warning that is open: answering it resolves confirm(). */
  readonly asking = signal<((show: boolean) => void) | undefined>(undefined);

  toggle(): void {
    void this.settings.update({ streamerMode: !this.enabled() });
  }

  /** Asks before a hidden value is shown, since the stream would show it too. */
  confirm(): Promise<boolean> {
    this.asking()?.(false);
    return new Promise((resolve) =>
      this.asking.set((show) => {
        this.asking.set(undefined);
        resolve(show);
      }),
    );
  }

  /** A text (an error message) with its absolute paths cut down to the file name while streaming. */
  paths(text: string): string {
    return this.enabled() ? hidePaths(text) : text;
  }
}

/**
 * One hidden value (or a group, like the device list): shown after the warning, hidden again after
 * REVEAL_SECONDS or on request. Create it in a component's field initializer (it cleans up its timer).
 */
export class Reveal {
  private readonly streamer = inject(StreamerMode);
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly revealed = signal(false);
  /** True while streamer mode is on and the value is not shown. */
  readonly hidden = computed(() => this.streamer.enabled() && !this.revealed());

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  async show(): Promise<void> {
    if (!(await this.streamer.confirm())) return;
    this.revealed.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.revealed.set(false), REVEAL_SECONDS * 1000);
  }

  hide(): void {
    clearTimeout(this.timer);
    this.revealed.set(false);
  }

  toggle(): void {
    if (this.revealed()) this.hide();
    else void this.show();
  }
}
