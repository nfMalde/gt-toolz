// The vibration's part of the contract between the UI and the main process (window.gtt.haptics): "Fühlen statt hören"
// for drivers who hear badly or not at all (docs/user/haptics.md). Its settings, the patterns and what is due to be felt. Types and
// constants only: the UI and the main process import this.

import type { HapticCue, ModuleSettingsApi, Unsubscribe } from '@gt-toolz/core/api';

export { HAPTIC_CUES, type HapticCue, type HapticDetail } from '@gt-toolz/core/api';

export const HAPTICS = 'haptics';

export interface HapticsApi extends ModuleSettingsApi<HapticSettings> {
  /** A pattern is due now: the UI plays it on the chosen output. */
  onHaptic(listener: (event: HapticEvent) => void): Unsubscribe;
  /** Plays a cue's pattern, or a whole braking zone timed like on track ('zone'): the driver feels them before choosing. */
  test(cue: HapticCue | 'zone'): Promise<void>;
}

/** Vibration patterns. 'number': as many taps as the number (countdown "drei" or gear 3: three taps). */
export type HapticPattern = 'off' | 'tap' | 'double' | 'triple' | 'long' | 'rise' | 'fall' | 'heartbeat' | 'number';
export const HAPTIC_PATTERNS: readonly HapticPattern[] = ['off', 'tap', 'double', 'triple', 'long', 'rise', 'fall', 'heartbeat', 'number'];

/** One pulse of a pattern the driver designed: its length, its strength and the pause after it. */
export interface CustomHapticPulse {
  /** Milliseconds, 30 .. 1000. */
  duration: number;
  /** 0.1 .. 1 (the overall strength still applies). */
  strength: number;
  /** Milliseconds after the pulse, 0 .. 1000. */
  pause: number;
}

/** A pattern the driver designed (accessibility page); used like the built-in ones, exactly as designed. */
export interface CustomHapticPattern {
  /** Short random id (letters and digits). */
  id: string;
  name: string;
  pulses: CustomHapticPulse[];
}

export const MAX_CUSTOM_HAPTIC_PATTERNS = 12;
export const MAX_CUSTOM_HAPTIC_PULSES = 8;

/** A built-in pattern, or "custom:<id>" for one of the driver's own. */
export type HapticPatternRef = HapticPattern | `custom:${string}`;

/**
 * Where the vibration goes. audio: low-frequency pulses on an audio output, felt through anything that turns
 * sound into vibration (bass shakers, haptic vests and mats, headsets with haptics). gamepad: the rumble of a
 * game controller connected to the computer.
 */
export type HapticOutput = 'audio' | 'gamepad';

/** On and off is the module's switch (Modules page, setup assistant). */
export interface HapticSettings {
  output: HapticOutput;
  /** Audio output for the pulses ('' = the system's default output). */
  audioDevice: string;
  /** Frequency of the audio pulses in Hz (bass shakers like it low, small haptic motors higher). */
  frequency: number;
  /** Overall strength, 0.1 .. 1. */
  intensity: number;
  /**
   * Length of the built-in patterns' pulses and pauses, as a factor (1 .. 2.5). Controllers need longer pauses
   * than bass shakers to feel the pulses apart. The driver's own patterns play exactly as designed.
   */
  tempo: number;
  /**
   * Controllers: the shortest pause between two pulses in milliseconds (100 .. 800). Their motors run on after a
   * pulse; shorter pauses blur the pulses into one.
   */
  controllerPause: number;
  /** Turn-in on the side of the turn: the left or right channel, or the controller's left or right motor. */
  directions: boolean;
  /**
   * The output the driver felt in the device test ("audio:<device>" or "gamepad"; '' = not tested). Another
   * output or device needs a new test; until then the patterns are not offered.
   */
  verified: string;
  /** The pattern of each cue ('off': not felt). */
  patterns: Record<HapticCue, HapticPatternRef>;
  /** The driver's own patterns. */
  custom: CustomHapticPattern[];
}

/** One pulse: start and length in milliseconds, strength 0..1 (the intensity is already applied). */
export interface HapticPulse {
  at: number;
  duration: number;
  strength: number;
}

/** A pattern that is due now; the app plays it at once on the chosen output. */
export interface HapticEvent {
  cue: HapticCue;
  pulses: HapticPulse[];
  side: 'both' | 'left' | 'right';
}
