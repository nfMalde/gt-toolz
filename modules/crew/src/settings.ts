// The race crew's settings: their defaults, the check of everything that comes from the UI or config.json, and the
// talk level on top of them.

import { bool, clamp, oneOf } from '@gt-toolz/core';
import type { TalkLevel } from '@gt-toolz/runtime/app-api';
import type { CrewModuleSettings } from './api';

const TALK_LEVELS: readonly TalkLevel[] = ['much', 'normal', 'little'];

export function defaultSettings(): CrewModuleSettings {
  return {
    crewSectors: 3,
    crewStrategy: true,
    practiceTyres: true,
    pitLossSeconds: 25,
    crewTalk: 'normal',
    bossTakesOver: true,
    bossLaps: 2,
  };
}

export function normalizeSettings(value: unknown, base: CrewModuleSettings): CrewModuleSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof CrewModuleSettings, unknown>>;
  return {
    crewSectors: Math.round(clamp(v.crewSectors, 1, 6, base.crewSectors)),
    crewStrategy: bool(v.crewStrategy, base.crewStrategy),
    practiceTyres: bool(v.practiceTyres, base.practiceTyres),
    pitLossSeconds: Math.round(clamp(v.pitLossSeconds, 5, 120, base.pitLossSeconds)),
    crewTalk: oneOf(v.crewTalk, TALK_LEVELS, base.crewTalk),
    bossTakesOver: bool(v.bossTakesOver, base.bossTakesOver),
    bossLaps: Math.round(clamp(v.bossLaps, 1, 5, base.bossLaps)),
  };
}

/**
 * The settings as the crew works with them (the user's own stay as they are): 'normal' gives the lap time and position
 * at the line, no sector times; 'little' also no lap times, no remarks and no corner calls on its radio.
 */
export function withTalk(settings: CrewModuleSettings): CrewModuleSettings {
  return settings.crewTalk === 'much' ? settings : { ...settings, crewSectors: 1 };
}
