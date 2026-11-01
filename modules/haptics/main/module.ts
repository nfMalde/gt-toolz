// The vibration in the main process (docs/user/haptics.md, "Fühlen statt hören"): the cues coach and crew make felt reach it through
// the shell's haptics sink while it is on; it turns them into the driver's patterns, one after the other, and sends
// them to the UI, which plays them on the chosen output (window.gtt.haptics). Everything it uses comes from its host
// (packages/core/src/module.ts).

import { HAPTIC_CUES, type HapticCue, type HapticDetail, type ModuleDefinition } from '@gt-toolz/core';
import { HAPTICS, type HapticEvent, type HapticSettings } from '../src/api';
import { hapticEvent } from '../src/patterns';
import { defaultSettings, normalizeSettings } from '../src/settings';

/** Two patterns are felt apart with at least this pause between them. */
const GAP_MS = 80;
/** A pattern that would wait longer than this comes too late to mean anything: it is dropped. */
const MAX_WAIT_MS = 1500;

/**
 * The braking zone the test plays, timed like on track with the default countdown (two numbers, about 1.4 s apart):
 * the attention, the numbers, "jetzt", the gear and the turn-in. Fixed, so it does not depend on the coach.
 */
const ZONE: [seconds: number, cue: HapticCue, detail?: HapticDetail][] = [
  [0, 'attention'],
  [1.2, 'count', { number: 2 }],
  [2.6, 'count', { number: 1 }],
  [4, 'now'],
  [4.7, 'gear', { number: 2 }],
  [5.4, 'turn', { side: 'left' }],
];

export const hapticsModule: ModuleDefinition<HapticSettings> = {
  id: HAPTICS,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },

  start(host) {
    const { handle, send } = host.bridge;
    let freeAt = 0;
    let waiting: NodeJS.Timeout | undefined;
    /** The zone test's steps, and its callers waiting for the end. */
    const timers = new Set<NodeJS.Timeout>();
    const testsDone = new Set<() => void>();

    /**
     * One pattern at a time: "jetzt" goes out at once (it replaces one that waits); the others wait for the one
     * before, but only one waits, and one that would come too late is dropped.
     */
    const queue = (event: HapticEvent) => {
      const now = Date.now();
      const length = Math.max(...event.pulses.map((p) => p.at + p.duration));
      if (event.cue === 'now') {
        clearTimeout(waiting);
        waiting = undefined;
        freeAt = now + length;
        send('haptic', event);
        return;
      }
      const wait = Math.max(0, freeAt + GAP_MS - now);
      if (wait > MAX_WAIT_MS) return;
      freeAt = now + wait + length;
      if (!wait) {
        send('haptic', event);
        return;
      }
      clearTimeout(waiting);
      waiting = setTimeout(() => {
        waiting = undefined;
        send('haptic', event);
      }, wait);
    };
    const feel = (cue: HapticCue, detail?: HapticDetail) => {
      const event = hapticEvent(host.settings(), cue, detail);
      if (event) queue(event);
    };

    // --- Calls from the UI ---
    handle('test', (cue) => {
      if (cue === 'zone') {
        return new Promise<void>((resolve) => {
          testsDone.add(resolve);
          for (const [seconds, zoneCue, detail] of ZONE) {
            const timer = setTimeout(() => {
              timers.delete(timer);
              feel(zoneCue, detail);
              if (timers.size) return;
              for (const done of testsDone) done();
              testsDone.clear();
            }, seconds * 1000);
            timers.add(timer);
          }
        });
      }
      if (!HAPTIC_CUES.includes(cue as HapticCue)) throw new Error('Invalid argument');
      const test = cue as HapticCue;
      feel(test, test === 'turn' ? { side: 'right' } : test === 'count' || test === 'gear' ? { number: 3 } : undefined);
    });

    return {
      feel,
      stop() {
        clearTimeout(waiting);
        for (const timer of timers) clearTimeout(timer);
        timers.clear();
        // Switched off during a test: the page waiting for it is told it ended.
        for (const done of testsDone) done();
        testsDone.clear();
      },
    };
  },
};
