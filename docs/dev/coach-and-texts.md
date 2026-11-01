# Coach and texts

The coach turns the reference lap and the live telemetry into calls with exact timing. Everything it and the crew say comes from language packs, and the user can replace any text with their own words. This page explains the coach engine at a high level and how texts work, and gives the steps to change a text or add a language.

For what the coach does from the driver's side, see the [user guide](../user/coach.md).

## The coach engine

Two layers:

| Layer | Code | What |
|---|---|---|
| **`CoachSession`** | `packages/coach/src/coach.ts` | Pure logic, one instance per reference. Gets every frame (`update(frame)`), returns `CoachEvent`s. No audio, no files. |
| **`CoachRunner`** | `packages/runtime/src/runner.ts` | The coach as a service: creates a session for each new reference, renders and plays the clips, times the laps, runs briefing, debrief, calibration and the sound check, keeps the coach's memory, the mood and the stand-in, and owns the speech floor. |

`CoachSession` does not know about voices. The runner tells it how long each clip takes (`setPlanAudio`, `setFeedbackAudio`, `setNoteAudio`, and the clip lengths in `CoachSettings`), so its timing fits the voice in use.

### The reference's analysis

When a reference is loaded or learned, `prepareReference` (`packages/coach/src/reference.ts`) computes:

| What | Code |
|---|---|
| Braking zones (`Corner`): braking point, peak brake, turn-in, apex, exit, the gears (`entryGear`, `midGear`, `exitGear`) | `findCorners` in `reference.ts` |
| Curb use inside and outside, and how much of the car (touch, half, full) | `curbs.ts` |
| Corner shape: hairpin, tight, medium, fast, chicane | `shape.ts` |
| Trail braking: the brake at turn-in where the reference brakes into the corner | `trail.ts` |
| Official corner names (within 40 m), else "Turn 6" or "Braking zone 3" | `names.ts`, `data/corner-names.json` |
| Corners without braking (flat, lift, feather) and corner chains | `fast.ts` |

### Calls per braking zone

For each braking zone, the session fixes a cue plan about 30 s ahead (`PLAN_HORIZON_SECONDS`), backwards from the braking point:

1. attention tone;
2. feedback for a problem corner (long, short or tiny, the longest that fits);
3. announcement ("Full braking ahead", "40 percent ahead");
4. corner plan: full (shape, trail braking, gears, curbs), short (shape and gears) or shape only, as sentences or pace notes;
5. countdown: up to `countdownSeconds` numbers, each followed by `countPause` (or `countPauseShort` when time is tight);
6. "now" at the braking point;
7. after "now": the entry gear (optional), gears in the corner, helping cues, the calls through a big problem corner, turn-in.

Rules the timing follows:

- Every cue comes earlier by the calibrated output latency (`latencySeconds`, the coach's `outputLatencySeconds`).
- The time to a point is the shorter of the current speed's estimate and the reference's own time over the distance, so sentences out of a slow corner are not promised too much time.
- A cue that would come too late is dropped, never played late (0.25 s for timed cues, 0.6 s for announcements).
- After "now" the cues are checked against each other; of two that would overlap, the more important one stays. "Now" is never talked over.
- A braking zone that follows the previous one within 6 s is part of a chain: the first zone's plan names it, and it gets no announcement, plan or feedback of its own (`chainCalls`).
- Corners without braking get a pace note ("Flat right", "Then lift to 140, right") when there is room (`fastCorners`).

### After each corner

`analyzeCorner` (`analysis.ts`) compares the run with the reference and returns `Problem`s: `no-brake`, `brake-early`, `brake-late`, `wrong-gear`, `slow-apex`, `fast-apex`, `late-throttle`, `brake-weak`, `brake-hard`, `no-trail`, `trail-long`. From those the session:

- numbers the corners that cost the most as feedback ("Feedback 1"), at most `feedback` per lap;
- climbs the help ladder per corner: feedback, then a tip, then a helping cue in the corner ("wait", "Throttle!", the target speed), then a focus exercise (`helpFirst`, `helpAssists`, `focusLaps`);
- reports progress and resolved feedback.

The runner adds the rest: the cheeky style with its mood levels and the stand-in, slides and spins with their cause (`SlideWatcher`, `slides.ts`), sectors against the ghost, the lap time against the target, and the memory per braking zone in `<reference>.history.json` for the briefing, the debrief and the race calls.

### When the coach is quiet

- On the out lap until the first line crossing (`waitForFirstLap`).
- In replays (unless `replayCalls`), menus and while paused.
- Off the reference line (more than 30 m), or with a reference that does not fit the track or class.
- In races: no briefing, debrief, remarks or help. The braking calls in races come only on request (`raceCalls`), spoken by the crew on its radio while the crew is on.
- From the chequered flag on (`RaceEnd`).
- With the coach module off (the setting `coach`).

### Settings and talk levels

The coach's settings are `RunnerSettings` keys (`packages/runtime/src/app-api.ts`), owned by `coach` in `OWNERS` (`settings-split.ts`) and stored as `modules.coach.settings`. Their defaults and checks are in `packages/runtime/src/settings.ts`. `coachSettingsFrom(settings, durations)` turns them into the session's `CoachSettings`.

The talk level (`coachTalk`: `much`, `normal`, `little`) switches calls off on top of the single settings (`withTalk` in `settings.ts`); the crew has its own (`crewTalk`, `withTalk` in `modules/crew/src/settings.ts`). The user's own settings stay as they set them; coach and crew work with the result. Braking calls (tone, announcement, countdown, "now") always stay.

## Language packs

Every spoken text lives in a language pack: a JSON file with texts and `{placeholders}`. Packs are data only and can execute nothing.

| Where | What |
|---|---|
| `packages/coach/language-packs/de.json`, `en.json` | Built in. `en.json` is complete by definition and the fallback for every other pack. |
| `language-packs/*.json` (dev: in the repository; installed: in the data folder) | Extra packs, loaded at start (`loadLanguagePacks` in `runner.ts`). A pack with the same `id` replaces a built-in one. |

```json
{
  "format": "gt-toolz-language-pack",
  "version": 1,
  "textsVersion": 12,
  "id": "de",
  "name": "Deutsch",
  "locale": "de-DE",
  "pronounce": { "Curb": "Körb", "Feedback": "Fietbäck" },
  "texts": {
    "count": ["eins", "zwei", "drei", "vier", "fünf"],
    "now": "jetzt",
    "gear": "Gang {gearWord}",
    "help.focusDone": "{zone} sitzt. Übung geschafft, gut gemacht."
  }
}
```

| Field | What |
|---|---|
| `format`, `version` | Always `"gt-toolz-language-pack"` and `1` (the file format) |
| `textsVersion` | The version of the texts, a whole number from 1. **Raise it whenever texts are added or changed.** Recorded voice packs note the version they were recorded against, so the app can tell the user about new texts to record. |
| `id` | Language code: `de`, `en`, `pt-BR` |
| `name` | The language's name in itself |
| `locale` | BCP 47 tag; picks matching voices |
| `pronounce` | Word → spelling the speech engine reads right. Whole words only, only when speaking; the app shows the original. |
| `texts` | Every key of `TEXT_KEYS` |

### Keys

`TEXT_KEYS` (`packages/coach/src/i18n/pack.ts`) lists every key with the placeholders it may use:

```ts
export const TEXT_KEYS: Record<string, readonly string[]> = {
  count: [],
  now: [],
  gear: ['gear', 'gearWord'],
  'problem.brake-early': ['meters'],
  // …
  'help.focusDone': ['zone'],
  'crew.lapsLeft': ['laps', 'lapsWord'],
  // …
};
```

Three kinds of value (`textKind`):

| Kind | Keys | Value |
|---|---|---|
| `text` | most | one string |
| `words` | `count` (countdown 1 to 5), `numbers` (1 to 9), `ordinals` (1 to 9, the form before "gear": "ersten"), `spell.numbers` (0 to 20, only for recorded voices) | a list of words, as many as the standard |
| `list` | every `cheeky.*` key | a list of texts; one is picked at random, none again before the list is through |

The key's prefix decides its area on the Texts page (`textGroup` in `own-texts.ts`):

| Area | Prefixes |
|---|---|
| basics | everything not below (`count`, `now`, `gear`, `brakeIntro.*`, `direction.*`, `turn` …) |
| notes | `note.`, `shape.`, `curb.` |
| plan | `plan.`, `label.` |
| feedback | `problem.`, `tiny.`, `feedback.`, `after.` |
| help | `tip.`, `tipTiny.`, `help.`, `assist.` |
| slides | `slide.` |
| briefing | `briefing.` |
| lap | `lap.`, `debrief.`, `time.`, `ghost.`, `sector.` |
| cheeky | `cheeky.` (the crew's lines go to crew) |
| crew | `crew.`, the crew's `cheeky.*` lines |
| session | `session.`, `car.` |
| calibration | `calibration.` |
| recordings | `spell.` |

### Loading rules

`validateLanguagePack(value)` never throws. It returns the usable pack and warnings:

- A wrong `format` or `version`, or an invalid `id`, rejects the file.
- Unknown keys, unknown placeholders and wrong types are reported; that text is ignored.
- A text longer than 400 characters is ignored.
- An abbreviation with a slash ("km/h") is reported: engines spell it letter by letter.
- Missing texts come from English; reported as one line.
- Warnings go to the session log at start as `WARNING   language pack <file>: …`.

`tests/texts.test.ts` requires both built-in packs to load without a warning and to have the same keys.

### From pack to sentence

`phrasesFromPack(pack, fallback)` builds a `Phrases` object (`packages/coach/src/i18n/types.ts`): one member per call, which fills the template.

```ts
// packages/coach/src/i18n/pack.ts
focusDone: (zone) => text('help.focusDone', { zone }),
crewLapsLeft: (laps) => text('crew.lapsLeft', { laps, lapsWord: word('numbers', laps) }),
```

`LanguageRegistry` holds the built-in and extra packs; `phrases(id, own)` gives the phrases of a language with the user's own texts over the pack's. `builtInPhrases('de')` is the shortcut the tools and tests use. In the app, `ShellVoices.phrases(language)` is the way in.

The timing-critical words are clips rendered once per voice (`coachClips` in `packages/runtime/src/clips.ts`): `now`, `count-1` … `count-5`, `gear-1` … `gear-8`, `intro-full`, `intro-10` … `intro-90`, `turn-<direction>-<strength>`, the helping cues. Corner plans, pace notes and feedback are clips per reference; everything else is rendered as a sentence when it is said.

### Writing for speech

All texts are spoken; the engines read what is written.

- **Write everything out.** "Kilometer pro Stunde", never "km/h".
- **No number right before a period.** "Start in 1. Gang" is read as "Start in eins." plus a new sentence. Use the word placeholders (`{gearWord}`, `{entryWord}`).
- **Punctuation is audible.** The app speaks each part up to a comma or a sentence end on its own and joins the parts with fixed pauses (by default 0.5 s after a comma, 0.7 s after a sentence end; adjustable per role). Place commas only where you would pause. A text without a final mark gets a period.
- **Short cue words.** The countdown, "now" and the gears are timed to a tenth of a second; long words shift the calls earlier.
- **English words in German** need a `pronounce` entry ("Curb" → "Körb").
- **Never insulting.** The cheeky lines tease the driving, never the person.

## Own texts

The user can say any text in their own words, per language, on the **Texts** page. The pack keeps its text (the standard); the own one goes over it.

- **Stored** in the app setting `texts`: language → key → `{ text, base }`. `base` is the pack's text at the time; when an update changes the standard, the page shows both.
- **Checked like a pack's text** by `checkOwnText(key, value, standard)` (`packages/coach/src/i18n/own-texts.ts`), while typing and again when the settings are loaded. A text that cannot be used is dropped, never spoken.
  - Not usable: empty; longer than 400 characters; a list of more than 50 entries; a placeholder the key does not have; a word list with another number of words than the standard.
  - Hints only: an abbreviation; a placeholder of the standard left out.
- **Example values** (`textSamples`): every placeholder has one in the pack's language, so the page shows and plays a text as it would be said.
- **Said at once:** coach and crew build their sentences anew, as for a new language.
- **The bridge:** `gtt.texts(language)` (the `TextCatalog`: areas, the short calls `QUICK_TEXTS` first, samples, entries), `gtt.checkText(key, value, language)`, `gtt.previewText(text, language, speaker)`. Saving goes through `gtt.setSettings({ texts })`.

## Add or change a spoken text

**Change a text:** edit it in `en.json` and `de.json`, raise `textsVersion` in both, run `npm test`.

**Add a text:**

1. **The key.** Add it to `TEXT_KEYS` in `packages/coach/src/i18n/pack.ts` with its placeholders. Pick a prefix that puts it in the right area (table above), for example `crew.` for the crew.
2. **The texts.** Add it to `packages/coach/language-packs/en.json` and `de.json`, following [Writing for speech](#writing-for-speech). Raise `textsVersion` in both.
3. **The phrase.** Add a member to `Phrases` (`packages/coach/src/i18n/types.ts`) and build it in `phrasesFromPack`. For a new crew line `crew.pitOpen` (an example, not in the packs):

   ```ts
   // types.ts
   /** …what it says and when. */
   crewPitOpen(lap: number): string;

   // pack.ts, in phrasesFromPack
   crewPitOpen: (lap) => text('crew.pitOpen', { lap }),
   ```

4. **Say it.** Call the phrase where it is said: through the speech floor for a sentence (`announce` in the runner, the crew's `announce`), or as a clip in `coachClips` for a timing-critical word.
5. **A new placeholder** needs an example value in `textSamples` (`own-texts.ts`); `tests/own-texts.test.ts` checks that every placeholder has one.
6. **The sound check:** if the driver should be able to hear it there, add a sample in the runner's sound check.
7. Run `npm run typecheck` and `npm test` (`tests/texts.test.ts`, `tests/own-texts.test.ts`).

The Texts page, own texts and recorded voice packs pick up the new key by themselves: the Recordings page lists it as a text to record.

## Add a language

**Spoken language (coach and crew):**

1. Copy `packages/coach/language-packs/en.json` to `<id>.json`.
2. Set `id`, `name` and `locale`; translate every text. Do not translate placeholders. Keep the cue words short.
3. Add `pronounce` entries for words the engines read wrong.
4. For a try-out, put the file into the `language-packs/` folder (in development: the repository's `language-packs/`; installed: the data folder) and pick the language in the app. The warnings in the session log show what is missing.
5. To ship it, put it next to `de.json` and `en.json` and add it to `BUILT_IN_PACKS` in `packages/coach/src/i18n/index.ts`; extend `tests/texts.test.ts` so it must load without a warning.
6. The language needs at least one allowed voice for its locale ([voices.md](voices.md#the-voice-catalogue)); without one, the system voice (Windows, macOS) is used.

**UI language:** the UI has German and English (`UiLanguage` in `apps/ui/src/app/i18n/i18n.ts`); a spoken language without UI texts shows the UI in English. A new UI language needs a text file next to every `en.ts` (the shell's and each module's), the type `UiLanguage` and `TEXTS` extended, and the tests in `tests/texts.test.ts`.
