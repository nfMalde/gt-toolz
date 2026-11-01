// The speech floor (docs/dev/modules.md): coach and crew speak one at a time. What is said occupies the
// floor; a sentence waiting for its moment never talks over it, nor over the coach's next cue ("jetzt" is never
// talked over), waits while something holds the floor (briefing, debrief), and is dropped when it comes too late.
// The shell's service: the coach and the crew announce through it, and the coach tells it how long it stays quiet.

import type { HapticCue } from '@gt-toolz/core/api';

/** A sentence starts only if it ends this long before the next cue (the estimate is never exact). */
export const ANNOUNCE_MARGIN_S = 0.6;
/** After what is said, a moment of silence before the next sentence. */
const AFTER_MS = 300;
/** Its caller is told this long after a sentence ends (the clip's tail). */
const DONE_AFTER_MS = 400;

/** A sentence, rendered, waiting for its moment. */
export interface Announcement {
  text: string;
  /** How long it takes to say. */
  seconds: number;
  /** Dropped after this (ms since 1970). */
  until: number;
  /** Who says it: its sentences go together when it leaves (drop). */
  speaker: unknown;
  /** What the driver feels when it is said. */
  haptic: HapticCue;
  play(): void;
  /** Called once it has been said, or dropped. */
  done?: () => void;
}

export interface SpeechFloorOptions {
  /** Seconds until the coach's next cue; Infinity: no cue coming (no coach, or quiet in a race). */
  quietSeconds(): number;
  /** Something holds the floor (a briefing, a debrief): nothing waiting is said. */
  held(): boolean;
  /** Muted: said without a sound (felt, and the floor counts it as said). */
  muted(): boolean;
  feel(cue: HapticCue): void;
  log(line: string): void;
  /** Only to the log file (a dropped sentence). */
  logToFile(line: string): void;
  /** The floor is busy until then: the coach's pace notes wait for it. */
  busy(until: number): void;
}

export class SpeechFloor {
  private waiting: Announcement[] = [];
  private occupiedUntil = 0;

  constructor(private readonly options: SpeechFloorOptions) {}

  /** Until when something is (probably) still being said (ms since 1970). */
  get busyUntil(): number {
    return this.occupiedUntil;
  }

  /** Something is said from now on for this long. */
  occupy(ms: number): void {
    this.occupiedUntil = Math.max(this.occupiedUntil, Date.now() + ms);
    this.options.busy(this.occupiedUntil);
  }

  /** Waits for a quiet moment that fits it. */
  announce(announcement: Announcement): void {
    this.waiting.push(announcement);
  }

  /** A speaker left (another voice took over, the coach was switched off): its waiting sentences go. finish: their callers are told. */
  drop(speaker: unknown, finish = false): void {
    const dropped = this.waiting.filter((a) => a.speaker === speaker);
    this.waiting = this.waiting.filter((a) => a.speaker !== speaker);
    if (finish) for (const announcement of dropped) announcement.done?.();
  }

  /** Everything waiting goes, without a word (a new reference, a calibration). */
  clear(): void {
    this.waiting = [];
  }

  /** Says the oldest waiting sentence that fits before the next cue; stale ones are dropped. Called with every frame the game is not paused. */
  next(): void {
    if (!this.waiting.length) return;
    const now = Date.now();
    for (const stale of this.waiting.filter((a) => now > a.until)) {
      this.options.logToFile(`ANNOUNCE  dropped, no quiet moment: "${stale.text}"`);
      stale.done?.();
    }
    this.waiting = this.waiting.filter((a) => now <= a.until);
    if (this.options.held() || now < this.occupiedUntil + AFTER_MS) return;
    const quiet = this.options.quietSeconds();
    const next = this.waiting.find((a) => quiet >= a.seconds + ANNOUNCE_MARGIN_S);
    if (!next) return;
    this.waiting = this.waiting.filter((a) => a !== next);
    this.options.log(`CUE       now      "${next.text}"`);
    this.occupy(next.seconds * 1000);
    this.options.feel(next.haptic);
    if (!this.options.muted()) next.play();
    const done = next.done;
    if (done) setTimeout(done, next.seconds * 1000 + DONE_AFTER_MS);
  }
}
