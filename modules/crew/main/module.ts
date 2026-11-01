// The race crew in the main process (docs/dev/modules.md): it runs the crew session with its own settings and the
// app's, on the telemetry, the speech floor and the voices the shell hands it, and reports its part of the status the
// app shows. While it runs, its voice is on the shell's radio: the coach makes its race corner calls on it.

import type { ModuleDefinition } from '@gt-toolz/core';
import type { ActivityBody, CrewStatus, ShellVoices, SpeechFloor, TelemetryFeed, VoiceStatus } from '@gt-toolz/runtime';
import { CREW, type CrewModuleSettings } from '../src/api';
import { defaultSettings, normalizeSettings, withTalk } from '../src/settings';
import { CrewSession, type CrewSessionSettings } from './session';

/** What the shell gives the crew besides its host. */
export interface CrewShell {
  telemetry: TelemetryFeed;
  floor: SpeechFloor;
  voices: ShellVoices;
  /** The timeline (one for every module). */
  activity(body: ActivityBody): void;
  /** The crew's part of the status the app shows; none: the crew is off. */
  status(crew: CrewStatus | undefined, voice: VoiceStatus | undefined): void;
}

/** The app's settings the crew reads: how it sounds, and the personality. */
type AppPart = Omit<CrewSessionSettings, keyof CrewModuleSettings>;

export function crewModule(shell: CrewShell): ModuleDefinition<CrewModuleSettings> {
  return {
    id: CREW,
    enabledByDefault: true,
    settings: { defaults: defaultSettings, normalize: normalizeSettings },

    start(host) {
      const read = (): CrewSessionSettings => ({ ...(host.app() as unknown as AppPart), ...withTalk(host.settings()) });
      let settings = read();
      const session = new CrewSession({
        telemetry: shell.telemetry,
        floor: shell.floor,
        voices: shell.voices,
        settings: () => settings,
        log: host.log,
        activity: shell.activity,
      });
      session.on('changed', () => shell.status(session.status, session.voiceStatus));
      // Its own settings or the app's: the session compares them with the ones before.
      const changed = () => {
        const before = settings;
        settings = read();
        session.settingsChanged(settings, before);
      };
      session.start();
      return {
        settingsChanged: changed,
        appChanged: changed,
        voicesChanged: (phase) => (phase === 'removing' ? session.releaseVoices() : session.voicesChanged()),
        stop() {
          session.stop();
          shell.status(undefined, undefined);
        },
      };
    },
  };
}
