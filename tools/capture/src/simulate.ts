// Runs a recording through the coach without real time: every frame keeps its recorded timestamp,
// so the coach behaves exactly as it would live. Takes seconds instead of minutes.
// Usage: npm run simulate -- <recording.gtcap> --reference references/x.json [--laps 2] [--feedback all|1|2|3|off] [--all-cues] [--no-guide]
//   [--style sentences|notes] [--no-fast] [--countdown 2] [--count-pause 1] [--count-pause-short 0.8] [--replay-calls]
//   [--race all|mistakes] [--history references/x.history.json]

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { readCaptureFile, readFrame, type TelemetryFrame } from '@gt-toolz/telemetry';
import {
  buildBriefing,
  builtInPhrases,
  chainedAfter,
  chainFollowers,
  CoachSession,
  cornerLabel,
  DEFAULT_COACH_SETTINGS,
  describeProblems,
  emptyHistory,
  fastCornerLabel,
  prepareReference,
  rememberResult,
  type CoachHistory,
  type PlanVariant,
  type ReferenceLap,
} from '@gt-toolz/coach';
import { cornerPlanClips, DEFAULT_RUNNER_SETTINGS, fastNoteText } from '@gt-toolz/runtime';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    reference: { type: 'string' },
    language: { type: 'string', default: 'de' },
    laps: { type: 'string', default: '1' },
    feedback: { type: 'string', default: '2' },
    /** No calls through the big problem corners (docs/dev/coach-and-texts.md). */
    'no-guide': { type: 'boolean', default: false },
    'start-at': { type: 'string', default: '0' },
    'no-wait': { type: 'boolean', default: false },
    'end-at': { type: 'string' },
    'all-cues': { type: 'boolean', default: false },
    /** Print the briefing the coach would give after the simulated laps. */
    briefing: { type: 'boolean', default: false },
    /** Corner chains as before 2026-10-28: every zone explains itself (docs/dev/coach-and-texts.md). */
    'no-chains': { type: 'boolean', default: false },
    /** How the corner plan is said: sentences or pace notes (docs/dev/coach-and-texts.md). */
    style: { type: 'string', default: 'sentences' },
    /** No pace notes for the corners without braking. */
    'no-fast': { type: 'boolean', default: false },
    /** The longest countdown number (fewer in corners close together). */
    countdown: { type: 'string', default: String(DEFAULT_COACH_SETTINGS.countdownSeconds) },
    /** Silence after each countdown number, with time to spare and when it is tight (docs/dev/coach-and-texts.md). */
    'count-pause': { type: 'string', default: String(DEFAULT_COACH_SETTINGS.countPause) },
    'count-pause-short': { type: 'string', default: String(DEFAULT_COACH_SETTINGS.countPauseShort) },
    /** Calls in replays too (a recording of a ghost replay; off: the coach is quiet there). */
    'replay-calls': { type: 'boolean', default: false },
    /** Play the recording as a race (lapsInRace set): the crew's corner calls, every corner or the biggest problem corners. */
    race: { type: 'string' },
    /** What earlier sessions remember (<reference>.history.json): the race calls' problem corners before they are driven. */
    history: { type: 'string' },
  },
});

const file = positionals[0];
if (!file || !values.reference) {
  console.error('Usage: simulate <recording.gtcap> --reference <ref.json> [--laps 2] [--feedback all|1|2|3|off]');
  process.exit(1);
}

const reference = JSON.parse(fs.readFileSync(values.reference, 'utf8')) as ReferenceLap;
prepareReference(reference);
const phrases = builtInPhrases(values.language);
const coach = new CoachSession(reference, {
  ...DEFAULT_COACH_SETTINGS,
  feedback: values.feedback !== 'off',
  feedbackPerLap: values.feedback === 'all' || values.feedback === 'off' ? 'all' : Number(values.feedback),
  waitForFirstLap: !values['no-wait'],
  countdownSeconds: Number(values.countdown),
  countPause: Number(values['count-pause']),
  countPauseShort: Number(values['count-pause-short']),
  replayCalls: values['replay-calls'],
  fastCorners: !values['no-fast'],
  chainCalls: !values['no-chains'],
  guideCorners: !values['no-guide'],
  raceCalls: values.race === 'all' || values.race === 'mistakes' ? values.race : 'off',
}, phrases);

// In the real tool the audio side renders the plans and pace notes and reports their lengths; estimate them here.
const spoken = (text: string) => text.length * 0.065;
const planSettings = { ...DEFAULT_RUNNER_SETTINGS, planStyle: values.style === 'notes' ? 'notes' : 'sentences', fastCorners: !values['no-fast'], chainCalls: !values['no-chains'] } as const;
const plans = new Map(reference.corners.map((corner) => [corner.index, cornerPlanClips(corner, phrases, planSettings, chainedAfter(reference, corner), chainFollowers(reference, corner))]));
for (const [index, clips] of plans) {
  coach.setPlanAudio(index, { fullSeconds: spoken(clips.full ?? ''), shortSeconds: spoken(clips.short ?? ''), shapeSeconds: clips.shape !== undefined ? spoken(clips.shape) : undefined });
}
const notes = new Map(
  (reference.fastCorners ?? []).map((corner) => [corner.index, { full: fastNoteText(corner, phrases, planSettings, 'full'), short: fastNoteText(corner, phrases, planSettings, 'short') }]),
);
if (planSettings.fastCorners) for (const [index, text] of notes) coach.setNoteAudio(index, { fullSeconds: spoken(text.full), shortSeconds: spoken(text.short) });

const history = emptyHistory();
if (values.history) {
  const remembered = JSON.parse(fs.readFileSync(values.history, 'utf8')) as CoachHistory;
  coach.setEarlierResults(remembered.corners);
  const zones = Object.entries(remembered.corners).map(([index, memory]) => `${index}: ${memory.timeLossS >= 0 ? '+' : ''}${memory.timeLossS.toFixed(2)} s`);
  console.log(`HISTORY  ${zones.join(' | ')}`);
}
// A race: GT7 reports the race's laps (the crew's corner calls, docs/user/crew.md). A recorded race keeps its own, so its
// chequered flag counts; practice gets more than it drives (the coach stops after the flag, RaceEnd).
const asRace = (frame: TelemetryFrame): TelemetryFrame => (values.race ? { ...frame, lapsInRace: frame.lapsInRace > 0 ? frame.lapsInRace : 99 } : frame);
const all = readCaptureFile(file).map((p) => asRace(readFrame(p.data, p.time)));
const t0 = all[0]!.time;
const end = values['end-at'] ? Number(values['end-at']) * 1000 : Infinity;
const frames = all.filter((f) => f.time - t0 >= Number(values['start-at']) * 1000 && f.time - t0 <= end);

// Two cues talking over each other: with the estimated lengths (the coach's defaults for the cue words).
const s = DEFAULT_COACH_SETTINGS;
const cueSeconds: Record<string, number> = { tone: s.toneSeconds, count: s.countSeconds, now: s.nowSeconds, gear: s.gearSeconds, 'turn-in': s.turnInSeconds, intro: s.introSeconds, assist: 1 };
let speaking = { until: 0, what: '' };
let overlaps = 0;
const speak = (time: number, seconds: number, what: string, t: string) => {
  if (time < speaking.until - 50) {
    overlaps++;
    console.log(`${t} s  OVERLAP  ${what} starts ${((speaking.until - time) / 1000).toFixed(2)} s before ${speaking.what} ends`);
  }
  speaking = { until: Math.max(speaking.until, time + seconds * 1000), what };
};

// Repeat the recording to simulate several laps; shift timestamps so time keeps running forward.
const span = frames.at(-1)!.time - frames[0]!.time + 1000 / 60;
for (let round = 0; round < Number(values.laps); round++) {
  for (const original of frames) {
    const frame: TelemetryFrame = { ...original, time: original.time + round * span };
    const t = ((frame.time - frames[0]!.time) / 1000).toFixed(1).padStart(6);
    for (const event of coach.update(frame)) {
      switch (event.type) {
        case 'cue': {
          const c = event.cue;
          const words =
            c.kind === 'plan'
              ? plans.get(c.corner.index)?.[c.plan as PlanVariant]
              : c.kind === 'feedback'
                ? c.feedback!.texts[c.variant!]
                : c.kind === 'intro' && c.feedback
                  ? c.feedback.texts.intro
                  : undefined;
          speak(frame.time, words !== undefined ? spoken(words) : (cueSeconds[c.kind] ?? 1), `corner ${c.corner.index} ${c.kind}`, t);
          if (!values['all-cues'] && (c.kind === 'count' || c.kind === 'now' || c.kind === 'tone')) break;
          const text =
            c.kind === 'feedback'
              ? c.feedback!.texts[c.variant!]
              : c.kind === 'intro' && c.feedback
                ? c.feedback.texts.intro
                : c.kind === 'assist'
                  ? (c.assist ?? '')
                  : c.kind === 'plan'
                    ? `${c.plan}: ${plans.get(c.corner.index)?.[c.plan as PlanVariant] ?? ''}`
                    : '';
          console.log(`${t} s  CUE      corner ${c.corner.index} ${c.kind}${c.gear ? ` ${c.gear}` : ''}${c.count ? ` ${c.count}` : ''} ${text} (${c.secondsToPoint.toFixed(2)} s)`);
          break;
        }
        case 'corner-result': {
          const r = event.result;
          rememberResult(history, r);
          const h = event.help;
          const help = h ? `  [help ${h.kind} ${h.times}x: ${h.step}${h.improved ? ', better' : ''}]` : '';
          // Trail braking (docs/dev/coach-and-texts.md): brake at the reference's turn-in, and where the brake came off against the reference.
          const trail =
            r.brakeAtTurnIn !== undefined
              ? `  {trail: ${Math.round(r.brakeAtTurnIn * 100)} % at turn-in${r.corner.trailBrake !== undefined ? ` (ref ${Math.round(r.corner.trailBrake * 100)} %)` : ''}${r.brakeEndS !== undefined ? `, off ${r.brakeEndS - r.corner.brakeEndS >= 0 ? '+' : ''}${Math.round(r.brakeEndS - r.corner.brakeEndS)} m` : ''}}`
              : '';
          console.log(`${t} s  CORNER   ${r.corner.index} ${cornerLabel(r.corner, phrases)}: ${r.timeLossS >= 0 ? '+' : ''}${r.timeLossS.toFixed(2)} s  ${describeProblems(r.problems, phrases) || 'ok'}${help}${trail}`);
          break;
        }
        case 'feedback-new':
        case 'feedback-updated':
          console.log(`${t} s  FEEDBACK ${event.feedback.number} ${event.type.slice(9)} → corner ${event.feedback.cornerIndex}: "${event.feedback.texts.short}"`);
          if (event.feedback.texts.after) console.log(`${t} s           right after it: "${event.feedback.texts.after}"`);
          // In the real tool the audio side reports clip lengths; estimate them here.
          coach.setFeedbackAudio(event.feedback.cornerIndex, {
            version: event.feedback.version,
            longSeconds: spoken(event.feedback.texts.long),
            shortSeconds: spoken(event.feedback.texts.short),
            tinySeconds: spoken(event.feedback.texts.tiny),
            introSeconds: spoken(event.feedback.texts.intro),
          });
          break;
        case 'feedback-resolved':
          console.log(`${t} s  FEEDBACK ${event.feedback.number} resolved`);
          break;
        case 'mode':
          console.log(`${t} s  MODE     ${event.mode}`);
          break;
        case 'note':
          speak(frame.time, spoken(notes.get(event.note.index)?.[event.variant] ?? ''), `note ${event.note.index}`, t);
          console.log(`${t} s  NOTE     ${fastCornerLabel(event.note, phrases)} ${event.variant}: ${notes.get(event.note.index)?.[event.variant]} (${event.secondsToPoint.toFixed(2)} s)`);
          break;
        case 'focus-started':
          console.log(`${t} s  FOCUS    corner ${event.cornerIndex} for ${event.laps} laps`);
          break;
        case 'focus-ended':
          console.log(`${t} s  FOCUS    corner ${event.cornerIndex} ${event.done ? 'done' : 'over'}`);
          break;
        default:
          console.log(`${t} s  ${event.type.toUpperCase()}${'lap' in event ? ` ${event.lap}` : ''}`);
      }
    }
  }
}

console.log(`\n${overlaps} overlap(s) of cues (estimated lengths)`);

if (values.briefing) {
  console.log('\n--- Briefing ---');
  for (const sentence of buildBriefing(reference, history, coach.activeFeedback, phrases, 'auto')) console.log(sentence);
}
