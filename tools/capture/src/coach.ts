// Brake-point coach (MVP, console). Developer tool: the app runs the same CoachRunner.
// Learn mode (default): play a ghost's replay in GT7; after one complete lap the reference is learned and saved.
// Coach mode, per corner: tone – "Gleich voll bremsen" – "drei" – "zwei" – "eins" – "jetzt" – "Gang 2".
// Corners where the driver loses time get a name ("Feedback 1") and are explained on the next approach.
// Briefing (all braking zones, with the last mistakes, also remembered across sessions in <reference>.history.json):
// the app starts it with the Cockpit's button; here --briefing only sets what it covers.
//
// Usage: npm run coach -- [--reference references/x.json] [--ip <PS5-IP>] [--countdown 3] [--latency 0.2]
//                         [--no-tone] [--no-intro] [--no-plan] [--no-curbs] [--gear-after] [--no-turn-in] [--feedback all|1|2|3|off] [--no-immediate]
//                         [--language de|en] [--language-packs language-packs]
//                         [--style neutral|cheeky] [--patience high|normal|low]
//                         [--no-wait] [--briefing auto|all|problems|off] [--mute] [--rate 0] [--pitch 10] [--voice "Microsoft Katja"] [--list-voices]

import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  availableVoices,
  checkVoice,
  CoachRunner,
  DEFAULT_RUNNER_SETTINGS,
  DEFAULT_VOICES_DIR,
  normalizeSettings,
  ShellVoices,
  type RunnerSettings,
} from '@gt-toolz/runtime';
import { CrewSession } from '@gt-toolz/crew/session';
import { defaultSettings as defaultCrewSettings, withTalk as crewWithTalk } from '@gt-toolz/crew/settings';
import { TelemetrySession } from '@gt-toolz/telemetry-module/session';
import { defaultSettings as defaultTelemetrySettings } from '@gt-toolz/telemetry-module/settings';

const { values } = parseArgs({
  options: {
    reference: { type: 'string' },
    /** Language pack id, e.g. de or en. */
    language: { type: 'string', default: 'de' },
    /** Folder with additional language packs (*.json). */
    'language-packs': { type: 'string', default: 'language-packs' },
    ip: { type: 'string' },
    countdown: { type: 'string', default: String(DEFAULT_RUNNER_SETTINGS.countdownSeconds) },
    latency: { type: 'string', default: String(DEFAULT_RUNNER_SETTINGS.latencySeconds) },
    'no-tone': { type: 'boolean', default: false },
    'no-intro': { type: 'boolean', default: false },
    /** No corner plan after the announcement ("Rein im ersten Gang ..."). */
    'no-plan': { type: 'boolean', default: false },
    'no-curbs': { type: 'boolean', default: false },
    /** Say the gear once more right after "jetzt". */
    'gear-after': { type: 'boolean', default: false },
    'no-turn-in': { type: 'boolean', default: false },
    /** Calls while a replay plays (testing with a ghost replay). */
    'replay-calls': { type: 'boolean', default: false },
    /** Live feedback per lap: all (every problem corner), 1, 2, 3 ... or off. */
    feedback: { type: 'string', default: String(DEFAULT_RUNNER_SETTINGS.feedback) },
    mute: { type: 'boolean', default: false },
    rate: { type: 'string', default: '0' },
    /** Windows voice, e.g. "Microsoft Katja" (see --list-voices), or an optional voice ("piper:…", "vits:…"). */
    voice: { type: 'string' },
    'list-voices': { type: 'boolean', default: false },
    /** Optional voice packages (see npm run voices). */
    'voices-dir': { type: 'string', default: DEFAULT_VOICES_DIR },
    /** Also say the feedback right after the corner where the mistake happened. */
    'no-immediate': { type: 'boolean', default: false },
    /** Voice pitch in percent above normal (also makes it that much faster). */
    pitch: { type: 'string', default: '10' },
    /** Start coaching right away instead of after the first start/finish crossing. */
    'no-wait': { type: 'boolean', default: false },
    /** The driver's name: coach and crew address them by it. */
    name: { type: 'string', default: '' },
    /** Coach style: neutral or cheeky (remarks on repeated mistakes), and its patience: high, normal, low. */
    style: { type: 'string', default: 'cheeky' },
    patience: { type: 'string', default: 'normal' },
    /** Briefing scope: auto (all zones at first, then only problems), all, problems, or off. */
    briefing: { type: 'string', default: 'auto' },
    out: { type: 'string', default: 'captures' },
    references: { type: 'string', default: 'references' },
  },
});

const voicesDir = values['voices-dir'];

if (values['list-voices']) {
  for (const v of await availableVoices(voicesDir)) {
    const hint = v.installed ? '' : `  (not installed: npm run voices -- --install ${v.packageId})`;
    console.log(`${v.engine.padEnd(8)} ${v.language.padEnd(6)} ${v.id}${hint}`);
  }
  process.exit(0);
}

if (values.voice) {
  const problem = checkVoice(values.voice, voicesDir);
  if (problem?.problem === 'not-allowed') {
    console.error(`Voice "${values.voice}" is not allowed (license). See --list-voices.`);
    process.exit(1);
  }
  if (problem?.problem === 'not-installed') {
    console.error(`Voice "${values.voice}" is not installed. Run: npm run voices -- --install ${problem.packageId}`);
    process.exit(1);
  }
}

const settings: RunnerSettings = normalizeSettings({
  ...DEFAULT_RUNNER_SETTINGS,
  language: values.language,
  voices: {
    ...DEFAULT_RUNNER_SETTINGS.voices,
    // Without --voice: an installed optional voice for the language, else a Windows voice.
    coach: { byLanguage: values.voice ? { [values.language]: values.voice } : {}, rate: values.rate, pitch: values.pitch },
  },
  countdownSeconds: values.countdown,
  latencySeconds: values.latency,
  tone: !values['no-tone'],
  intro: !values['no-intro'],
  plan: !values['no-plan'],
  curbs: !values['no-curbs'],
  gearAfterNow: values['gear-after'],
  turnIn: !values['no-turn-in'],
  replayCalls: values['replay-calls'],
  feedback: values.feedback === 'all' || values.feedback === 'off' ? values.feedback : Number(values.feedback) || 1,
  immediateFeedback: !values['no-immediate'],
  waitForFirstLap: !values['no-wait'],
  briefing: values.briefing,
  driverName: values.name,
  style: values.style,
  patience: values.patience,
  mute: values.mute,
});

const dirs = {
  references: values.references,
  sessions: values.out,
  voiceCache: path.join('.cache', 'voice'),
  voices: voicesDir,
  languagePacks: values['language-packs'],
};
// The telemetry as in the app: the PS5, frames, mode, the car and the reference (modules/telemetry); recorded always.
const telemetrySettings = { ...defaultTelemetrySettings(), ip: values.ip ?? '', record: true, driverName: settings.driverName };
const telemetry = new TelemetrySession({ dirs, settings: () => telemetrySettings, log: (line) => runner.log(line) });
const voices = new ShellVoices({ dirs, settings: () => settings });
const runner = new CoachRunner({ settings, telemetry, echo: true, dirs, voices });
// The race crew as in the app (modules/crew), with its own defaults, on the coach's floor and the same voices.
const crew = new CrewSession({
  telemetry,
  floor: runner.speechFloor,
  voices,
  settings: () => ({ ...settings, ...crewWithTalk(defaultCrewSettings()) }),
  log: (line) => runner.log(line),
  activity: (body) => runner.activity(body),
});
crew.on('changed', () => runner.crewStatus(crew.status, crew.voiceStatus));

runner.on('status', (status) => {
  if (status.connection.stage === 'error') void shutdown(1);
});

async function shutdown(code = 0): Promise<void> {
  crew.stop();
  await runner.stop();
  await telemetry.stop();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await runner.start();
crew.start();
await telemetry.start(values.reference);
