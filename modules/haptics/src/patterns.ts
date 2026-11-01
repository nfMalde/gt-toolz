// Accessibility: the cues as vibration, for drivers who hear badly or not at all. Coach and crew decide what is felt
// and when (the same moment the cue would be heard, through the shell's haptics sink); this turns a cue into the
// driver's pattern, and the app plays the pulses on the chosen output.

import type { CustomHapticPattern, CustomHapticPulse, HapticCue, HapticDetail, HapticEvent, HapticPattern, HapticPatternRef, HapticPulse, HapticSettings } from './api';

/**
 * The patterns at tempo 1: start and length in milliseconds, strength 0..1. All end within half a second,
 * so a countdown (one cue per second) stays clearly apart even at a slower tempo. A pulse is at least 70 ms:
 * a bass shaker at 40 Hz needs a few cycles to be felt.
 */
const SHAPES: Record<Exclude<HapticPattern, 'off' | 'number'>, HapticPulse[]> = {
  tap: [{ at: 0, duration: 90, strength: 0.85 }],
  double: [
    { at: 0, duration: 80, strength: 0.85 },
    { at: 170, duration: 80, strength: 0.85 },
  ],
  triple: [
    { at: 0, duration: 70, strength: 0.8 },
    { at: 150, duration: 70, strength: 0.8 },
    { at: 300, duration: 70, strength: 0.8 },
  ],
  long: [{ at: 0, duration: 450, strength: 1 }],
  rise: [
    { at: 0, duration: 80, strength: 0.35 },
    { at: 150, duration: 80, strength: 0.65 },
    { at: 300, duration: 110, strength: 1 },
  ],
  fall: [
    { at: 0, duration: 110, strength: 1 },
    { at: 180, duration: 80, strength: 0.65 },
    { at: 330, duration: 80, strength: 0.35 },
  ],
  heartbeat: [
    { at: 0, duration: 100, strength: 1 },
    { at: 200, duration: 70, strength: 0.6 },
  ],
};

/** 'number': short taps this far apart, at most this many (gear 8 takes about a second). */
const NUMBER_TAP_MS = 70;
const NUMBER_SPACING_MS = 140;
const MAX_NUMBER = 8;

/** The pulses of a built-in pattern at tempo 1; 'number' needs the number (a pattern without one is a single tap). */
export function hapticPulses(pattern: HapticPattern, number?: number): HapticPulse[] {
  if (pattern === 'off') return [];
  if (pattern !== 'number') return SHAPES[pattern];
  const taps = Math.max(1, Math.min(MAX_NUMBER, Math.round(number ?? 1)));
  return Array.from({ length: taps }, (_, i) => ({ at: i * NUMBER_SPACING_MS, duration: NUMBER_TAP_MS, strength: 0.85 }));
}

/** A designed pattern's pulses one after another: each starts after the one before and its pause. */
export function customHapticPulses(pulses: readonly CustomHapticPulse[]): HapticPulse[] {
  let at = 0;
  return pulses.map((p) => {
    const pulse = { at, duration: p.duration, strength: p.strength };
    at += p.duration + p.pause;
    return pulse;
  });
}

/** The pulses a pattern reference stands for: built-in ones at the tempo, the driver's own exactly as designed. */
export function patternPulses(ref: HapticPatternRef, tempo: number, custom: readonly CustomHapticPattern[], number?: number): HapticPulse[] {
  if (ref.startsWith('custom:')) {
    const pattern = custom.find((c) => `custom:${c.id}` === ref);
    return pattern ? customHapticPulses(pattern.pulses) : [];
  }
  return hapticPulses(ref as HapticPattern, number).map((p) => ({ ...p, at: Math.round(p.at * tempo), duration: Math.round(p.duration * tempo) }));
}

/**
 * What to feel for a cue, with the user's pattern, tempo, strength and sides; undefined when the cue has no pattern.
 * side: the turn's direction; number: the countdown number or the gear.
 */
export function hapticEvent(settings: HapticSettings, cue: HapticCue, detail: HapticDetail = {}): HapticEvent | undefined {
  const pulses = patternPulses(settings.patterns[cue] ?? 'off', settings.tempo, settings.custom, detail.number);
  if (!pulses.length) return undefined;
  return {
    cue,
    pulses: pulses.map((p) => ({ ...p, strength: Math.round(p.strength * settings.intensity * 100) / 100 })),
    side: settings.directions && detail.side ? detail.side : 'both',
  };
}
