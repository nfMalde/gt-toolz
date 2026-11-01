// The vibration's settings: their defaults and the check of everything that comes from the UI or config.json.

import { bool, clamp } from '@gt-toolz/core';
import {
  HAPTIC_CUES,
  HAPTIC_PATTERNS,
  MAX_CUSTOM_HAPTIC_PATTERNS,
  MAX_CUSTOM_HAPTIC_PULSES,
  type CustomHapticPattern,
  type HapticCue,
  type HapticPattern,
  type HapticPatternRef,
  type HapticSettings,
} from './api';

/** The patterns are the suggestion until the driver sets them up (Vibration page or setup assistant). */
export function defaultSettings(): HapticSettings {
  return {
    output: 'audio',
    audioDevice: '',
    frequency: 45,
    intensity: 0.8,
    // A bit longer than the patterns are written: a controller's motors run on after a pulse.
    tempo: 1.5,
    // Felt apart on a PS5 controller only from about 400 ms (200 ms still blurred).
    controllerPause: 400,
    // A single bass shaker is often on one channel only: sides only when the driver has two (or a controller).
    directions: false,
    verified: '',
    patterns: { attention: 'triple', count: 'tap', now: 'long', turn: 'double', gear: 'off', assist: 'heartbeat', faster: 'rise', slower: 'fall', message: 'off' },
    custom: [],
  };
}

export function normalizeSettings(value: unknown, base: HapticSettings): HapticSettings {
  if (!value || typeof value !== 'object') return base;
  const v = value as Partial<Record<keyof HapticSettings, unknown>>;
  const custom = normalizeCustomPatterns(v.custom, base.custom);
  // A built-in pattern, or one of the driver's own that still exists.
  const known = (ref: unknown): ref is HapticPatternRef =>
    HAPTIC_PATTERNS.includes(ref as HapticPattern) || (typeof ref === 'string' && ref.startsWith('custom:') && custom.some((c) => `custom:${c.id}` === ref));
  const patternsIn = (v.patterns && typeof v.patterns === 'object' ? v.patterns : {}) as Partial<Record<HapticCue, unknown>>;
  const defaults = defaultSettings().patterns;
  const patterns = Object.fromEntries(
    HAPTIC_CUES.map((cue) => {
      const wanted = patternsIn[cue];
      const fallback = known(base.patterns[cue]) ? base.patterns[cue] : defaults[cue];
      return [cue, known(wanted) ? wanted : fallback];
    }),
  ) as Record<HapticCue, HapticPatternRef>;
  return {
    output: v.output === 'audio' || v.output === 'gamepad' ? v.output : base.output,
    // A device id from the browser: letters, digits and a few marks only.
    audioDevice: typeof v.audioDevice === 'string' && /^[\w.:=+/-]{0,200}$/.test(v.audioDevice) ? v.audioDevice : base.audioDevice,
    frequency: Math.round(clamp(v.frequency, 20, 250, base.frequency)),
    intensity: Math.round(clamp(v.intensity, 0.1, 1, base.intensity) * 100) / 100,
    tempo: Math.round(clamp(v.tempo, 1, 2.5, base.tempo) * 10) / 10,
    controllerPause: Math.round(clamp(v.controllerPause, 100, 800, base.controllerPause) / 10) * 10,
    directions: bool(v.directions, base.directions),
    verified: typeof v.verified === 'string' && /^(gamepad|audio:[\w.:=+/-]{0,200})?$/.test(v.verified) ? v.verified : base.verified,
    patterns,
    custom,
  };
}

/** The driver's own patterns: at most 12 of at most 8 pulses each, within sane lengths; broken ones are dropped. */
function normalizeCustomPatterns(value: unknown, base: CustomHapticPattern[]): CustomHapticPattern[] {
  if (!Array.isArray(value)) return base;
  const patterns: CustomHapticPattern[] = [];
  for (const item of value.slice(0, MAX_CUSTOM_HAPTIC_PATTERNS)) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<Record<keyof CustomHapticPattern, unknown>>;
    if (typeof p.id !== 'string' || !/^[a-z0-9]{1,24}$/.test(p.id) || patterns.some((x) => x.id === p.id)) continue;
    const name = typeof p.name === 'string' ? p.name.replace(/[^\p{L}\p{N}\p{M} '+-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
    const pulses = (Array.isArray(p.pulses) ? p.pulses : [])
      .slice(0, MAX_CUSTOM_HAPTIC_PULSES)
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        duration: Math.round(clamp(x.duration, 30, 1000, 100)),
        strength: Math.round(clamp(x.strength, 0.1, 1, 0.8) * 20) / 20,
        pause: Math.round(clamp(x.pause, 0, 1000, 100)),
      }));
    if (name && pulses.length) patterns.push({ id: p.id, name, pulses });
  }
  return patterns;
}
