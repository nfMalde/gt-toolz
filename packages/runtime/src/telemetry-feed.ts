// The telemetry as coach and crew read it (docs/dev/modules.md, "telemetry feed"): the PS5's frames, the
// session's mode and whether the driver is driving, worked out once, the car and the reference in use, with events
// when they change. The telemetry module provides it (modules/telemetry); the runner only reads it, and suspends it
// while it calibrates.

import type { EventEmitter } from 'node:events';
import type { ReferenceLap } from '@gt-toolz/coach';
import type { SessionMode, TelemetryFrame } from '@gt-toolz/telemetry';
import type { LiveSample, ReferenceMode, RunnerStatus } from './app-api';

/**
 * Why the reference changed. start: the one the last session ended with, or none; chosen: in the app; learned: a
 * ghost replay's lap or the driver's own; picked: a saved one fits the track being driven; learn: the driver asked
 * to learn a new one; none-fits: no saved one fits, the driver's own lap is learned.
 */
export type ReferenceChange = 'start' | 'chosen' | 'learned' | 'picked' | 'learn' | 'none-fits';

export interface ReferenceEvent {
  /** None: learning. */
  reference?: ReferenceLap;
  file?: string;
  why: ReferenceChange;
}

/** The telemetry's part of the status the app shows. */
export type TelemetryStatus = Pick<RunnerStatus, 'connection' | 'mode' | 'coach' | 'reference' | 'learning' | 'car' | 'otherCar' | 'recording'>;

/** What the telemetry reads of the settings: its own (modules/telemetry/src/api.ts) and the driver's name (own laps are theirs). */
export interface TelemetrySettings {
  ip: string;
  autoReference: boolean;
  driveMode: ReferenceMode;
  driveBop: boolean;
  record: boolean;
  driverName: string;
}

export interface TelemetryEvents {
  /** Every frame (about 60 a second), after its mode and car were worked out. */
  frame: [TelemetryFrame];
  /** For the app, about 10 times a second. */
  live: [LiveSample];
  /** Something in the status changed. */
  status: [];
  /** GT7 sends (again). */
  connected: [];
  /** The session's mode changed (it held for a moment). */
  mode: [SessionMode];
  driving: [boolean];
  reference: [ReferenceEvent];
  /** None of the saved references fits: the driver's own laps are learned (said once per learning). */
  'learn-own': [];
}

export interface TelemetryFeed extends EventEmitter<TelemetryEvents> {
  readonly status: TelemetryStatus;
  readonly mode: SessionMode | undefined;
  /** The game repeats the last packet (a results screen). */
  readonly frozen: boolean;
  /** On track, moving, not paused. */
  readonly driving: boolean;
  /** GT7 sends. */
  readonly live: boolean;
  readonly reference: ReferenceLap | undefined;
  readonly referenceFile: string | undefined;
  /** The reference in use does not fit the track or class being driven: the coach stays quiet meanwhile. */
  readonly referenceLost: boolean;
  /** The PlayStation's name (hidden in the log). */
  readonly consoleName: string | undefined;
  /** The calibration has it: coach and crew say nothing of their own meanwhile. */
  readonly suspended: boolean;
  /** Only frames and the car while suspended (the calibration): no mode, no driving, no learning or picking. The returned function ends it. */
  suspend(owner: string): () => void;
}
