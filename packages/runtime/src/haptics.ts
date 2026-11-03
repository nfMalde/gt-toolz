// What the coach makes felt (docs/user/haptics.md): its clips stand for cues of the shell's haptics sink. The vibration module
// turns a cue into the driver's pattern (modules/haptics).

import type { HapticCue, HapticDetail } from '@gt-toolz/core/api';

/** The cue a coach clip stands for (by its name: "count-3", "turn-left-sharp" ...); undefined: none. */
export function hapticForClip(clip: string, toneOn: boolean): (HapticDetail & { cue: HapticCue }) | undefined {
  if (clip === 'tone') return { cue: 'attention' };
  // Without the tone, the announcement is the first thing of a braking zone.
  if (clip.startsWith('intro-')) return toneOn ? undefined : { cue: 'attention' };
  // "bremsen" right after "jetzt" is felt once, with the "jetzt"; alone at the braking point it is the moment to brake.
  if (clip === 'now' || clip === 'brake-point') return { cue: 'now' };
  const count = /^count-(\d)$/.exec(clip);
  if (count) return { cue: 'count', number: Number(count[1]) };
  const gear = /^gear-(\d)$/.exec(clip);
  if (gear) return { cue: 'gear', number: Number(gear[1]) };
  const turn = /^turn-(left|right)-/.exec(clip);
  if (turn) return { cue: 'turn', side: turn[1] as 'left' | 'right' };
  if (clip.startsWith('assist-')) return { cue: 'assist' };
  if (clip.startsWith('fb-')) return { cue: 'message' };
  return undefined;
}
