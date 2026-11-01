// The telemetry's settings: their defaults and the check of everything that comes from the UI or config.json.

import { bool } from '@gt-toolz/core';
import { isLanAddress, REFERENCE_MODES, type ReferenceMode } from '@gt-toolz/runtime/app-api';
import type { TelemetryModuleSettings } from './api';

export function defaultSettings(): TelemetryModuleSettings {
  return {
    ip: '',
    // The user, 2026-10-21: the reference by track and class, else the fastest of three own laps.
    autoReference: true,
    // The Cockpit's "Ich fahre" (the user, 2026-10-21): the Daily Race is what most drivers practise.
    driveMode: 'daily',
    driveBop: true,
    record: false,
  };
}

export function normalizeSettings(value: unknown, base: TelemetryModuleSettings): TelemetryModuleSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof TelemetryModuleSettings, unknown>>;
  // A reference's id is its file name without ".json" (date, time and lap: "2026-10-23-22-22-49_lap1").
  const active = 'activeReference' in v ? v.activeReference : base.activeReference;
  return {
    // Only the home network: the app never sends heartbeats to the internet (security audit 2026-10-24).
    ip: typeof v.ip === 'string' && (v.ip.trim() === '' || isLanAddress(v.ip.trim())) ? v.ip.trim() : base.ip,
    autoReference: bool(v.autoReference, base.autoReference),
    driveMode: REFERENCE_MODES.includes(v.driveMode as ReferenceMode) ? (v.driveMode as ReferenceMode) : base.driveMode,
    driveBop: bool(v.driveBop, base.driveBop),
    record: bool(v.record, base.record),
    ...(typeof active === 'string' && /^[\w.-]{1,120}$/.test(active) ? { activeReference: active } : {}),
  };
}
