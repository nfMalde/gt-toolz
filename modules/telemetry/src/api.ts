// The telemetry's part of the contract between the UI and the main process (window.gtt.telemetry): its settings and
// the references (laps to coach with). Types and constants only: the UI and the main process import this.

import type { ModuleSettingsApi } from '@gt-toolz/core/api';
import type { ReferenceDetails, ReferenceMode, ReferenceSummary } from '@gt-toolz/runtime/app-api';

export const TELEMETRY = 'telemetry';

export interface TelemetryModuleSettings {
  /** PS5 address; empty = search the local network. */
  ip: string;
  /**
   * Picks the reference for the track being driven (docs/dev/telemetry.md): the fastest saved one of the car's class that
   * fits, else the driver's own lap is learned (the fastest of three).
   */
  autoReference: boolean;
  /**
   * What the driver drives right now (the switch in the Cockpit, docs/dev/telemetry.md): the automatic choice only takes
   * references of this mode and BoP. Own laps are learned as this.
   */
  driveMode: ReferenceMode;
  driveBop: boolean;
  /** Also write the telemetry to a .gtcap file (for bug reports). */
  record: boolean;
  /** The reference in use (its id), taken up again at the next start. */
  activeReference?: string;
}

export interface TelemetryApi extends ModuleSettingsApi<TelemetryModuleSettings> {
  listReferences(): Promise<ReferenceSummary[]>;
  /** null: learn a new reference from the next clean lap (learn: details for it, e.g. the player). */
  activateReference(id: string | null, learn?: ReferenceDetails): Promise<void>;
  /** Player and target time of a reference (targetTimeMs null: back to the lap's own time); the one in use takes them over at once. */
  updateReference(id: string, details: ReferenceDetails): Promise<ReferenceSummary>;
  deleteReference(id: string): Promise<void>;
}
