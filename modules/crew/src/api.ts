// The race crew's part of the contract between the UI and the main process (window.gtt.crew): its settings. Types and
// constants only: the UI and the main process import this. How the crew sounds (its language, volume, radio filter and
// voice) is the shell's (docs/dev/modules.md).

import type { ModuleSettingsApi } from '@gt-toolz/core/api';
import type { TalkLevel } from '@gt-toolz/runtime/app-api';

export const CREW = 'crew';

export interface CrewModuleSettings {
  /** Sectors per lap for the crew's splits (1 = only the lap). */
  crewSectors: number;
  /** Fuel and tyre reports with pit advice. */
  crewStrategy: boolean;
  /** Tyre temperatures outside races too (quali, time trial, free run): up to temperature, hot, fast changes (docs/user/crew.md). */
  practiceTyres: boolean;
  /** Seconds a pit stop costs (pit lane and stop), for the tyre advice. */
  pitLossSeconds: number;
  /** How much the race crew says. */
  crewTalk: TalkLevel;
  /**
   * Cheeky style, absolute escalation in races: the race engineer quits and the team boss takes the radio on his own
   * voice (the stand-in's, docs/user/crew.md).
   */
  bossTakesOver: boolean;
  /** Laps the team boss stays on the radio before the race engineer is back. */
  bossLaps: number;
}

export type CrewApi = ModuleSettingsApi<CrewModuleSettings>;
