// A runner with its telemetry and the shell's voices, put together as apps/desktop/src/main.ts does (with the race crew
// on them when a test wants it), for the tests that drive it frame by frame.

import { CrewSession } from '../modules/crew/main/session';
import type { CrewModuleSettings } from '../modules/crew/src/api';
import { defaultSettings as crewDefaults, normalizeSettings as normalizeCrew, withTalk as crewWithTalk } from '../modules/crew/src/settings';
import { TelemetrySession } from '../modules/telemetry/main/session';
import { defaultSettings } from '../modules/telemetry/src/settings';
import { builtInPhrases } from '../packages/coach/src/i18n';
import type { TelemetryPacket } from '../packages/telemetry/src/client';
import { CoachRunner, type RunnerOptions } from '../packages/runtime/src/runner';
import { ShellVoices } from '../packages/runtime/src/shell-voices';
import type { TelemetrySettings } from '../packages/runtime/src/telemetry-feed';

/**
 * telemetry: the telemetry's own settings, over its defaults (the driver's name comes from the runner's). crew: the
 * crew module on, with these of its settings over its defaults; none: the crew is off.
 */
export function testRunner(options: Omit<RunnerOptions, 'telemetry' | 'voices'>, telemetrySettings: Partial<TelemetrySettings> = {}, crewSettings?: Partial<CrewModuleSettings>) {
  let runner: CoachRunner | undefined;
  const settings = () => ({ ...defaultSettings(), driverName: runner!.currentSettings.driverName, ...telemetrySettings });
  const telemetry = new TelemetrySession({ dirs: options.dirs, settings, log: (line) => runner?.log(line) });
  const voices = new ShellVoices({ dirs: options.dirs, audio: options.audio, settings: () => runner!.currentSettings });
  runner = new CoachRunner({ ...options, telemetry, voices });
  // What start() loads: the texts (German, built in), without a session log or a connection.
  const phrases = builtInPhrases('de');
  (runner as unknown as { phrases: unknown }).phrases = phrases;
  let crew: CrewSession | undefined;
  if (crewSettings) {
    const own = normalizeCrew(crewSettings, crewDefaults());
    const session = (crew = new CrewSession({
      telemetry,
      floor: runner.speechFloor,
      voices,
      settings: () => ({ ...runner!.currentSettings, ...crewWithTalk(own) }),
      log: (line) => runner!.log(line),
      activity: (body) => runner!.activity(body),
    }));
    session.on('changed', () => runner!.crewStatus(session.status, session.voiceStatus));
    // Its voice comes from the test (setCrewVoice), none is opened.
    session.prepareVoice = async () => undefined;
    session.start();
  }
  // As after a start without a reference: learning (tests that want one set it themselves).
  telemetry.choose(undefined);
  /** One packet from the PS5. */
  const packetIn = (p: TelemetryPacket) => (telemetry as unknown as { onPacket(p: TelemetryPacket): void }).onPacket(p);
  /** The crew's voice on the radio (a test hands in one that only counts); without the crew, on the radio alone. */
  const setCrewVoice = (voice: unknown) => {
    if (!crew) return voices.setRadio({ voice: voice as never, phrases, takesCalls: true });
    const inside = crew as unknown as { crewVoice: unknown; onAir(): void };
    inside.crewVoice = voice;
    inside.onAir();
  };
  return { runner, telemetry, voices, crew, packetIn, inside: telemetry as unknown as { ref: unknown; lost: boolean }, setCrewVoice };
}
