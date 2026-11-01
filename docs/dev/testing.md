# Testing

GT Toolz is tested with Node's own test runner, without extra test packages. Most of the app can be tested without a PS5: the coach, the crew and the telemetry work on frames, and recordings and a fake PS5 stand in for the console.

## Type check

```bash
npm run typecheck
```

`tsc` (TypeScript 7.0.2) with the root `tsconfig.json`: strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, no emit. It covers `packages/*/src`, `modules/*/src`, `modules/*/main`, `modules/*/page`, `tools/*/src`, `apps/desktop/src` and `tests`.

The UI (`apps/ui/src` and `modules/*/ui`) is type-checked by the Angular compiler with strict templates:

```bash
npm run build -w @gt-toolz/ui
```

## Tests

```bash
npm test                                         # node --import tsx --test tests/*.test.ts
node --import tsx --test tests/laps.test.ts      # one file
node --import tsx --test --test-name-pattern="RaceEnd" tests/race-end.test.ts
```

- Every test file is `tests/<topic>.test.ts`, written with `node:test` and `node:assert/strict`. `tsx` runs the TypeScript sources directly.
- Tests import the sources by relative path (`../packages/telemetry/src/laps`, `../modules/haptics/main/module`).
- Time is mocked, not waited for: `mock.timers.enable({ apis: ['setTimeout', 'Date'], now })`, then `mock.timers.tick(ms)` or `mock.timers.setTime(t)`.
- Files go into a folder of the test's own under `os.tmpdir()`, removed in `after()`.
- Nothing opens a window, a network connection to the outside, or plays sound. A test that needs a real engine runs only where it exists (`{ skip: process.platform !== 'win32' }` in `tests/speech.test.ts`).
- The release step runs the same files with `--test-reporter=spec` ([building.md](building.md#release-scripts)).

**Coverage** of one file, measured with its own tests:

```bash
node --import tsx --test --experimental-test-coverage --test-coverage-include=packages/runtime/src/session-log.ts tests/session-log.test.ts
```

Measure per file: across all test files at once, Node's coverage with `tsx` maps the lines of some files wrongly.

### Guard tests

Some tests protect rules rather than features. They fail when a change breaks a rule:

| Test | Rule |
|---|---|
| `tests/network.test.ts` | Shipped code opens connections only in the listed places ([security.md](security.md#network)); PS5 addresses must be on the home network; only whole packets from the home network are taken |
| `tests/texts.test.ts` | German and English UI texts have the same keys and placeholders; a module's keys start with its id; the language packs load without a warning and have the same keys; every license notice has its text |
| `tests/own-texts.test.ts` | Every text has an area, every placeholder an example value |
| `tests/voice-catalogue.test.ts` | Every voice package is complete and pinned, every target stays inside the voices folder |
| `tests/files.test.ts` | Files are replaced in one step; broken references and voice packs are refused; "Reset data" empties only a folder the app created |
| `tests/session-log.test.ts` | Logs are anonymous |
| `tests/config.test.ts` | Every setting has one owner; version 1 files move over once; hand-edited and broken files give valid settings; modules a newer version wrote are kept |

## Test helpers

### `tests/runner.ts`: a runner as the app builds it

`testRunner(options, telemetrySettings?, crewSettings?)` puts together a `CoachRunner` with a `TelemetrySession` and `ShellVoices`, as `apps/desktop/src/main.ts` does. With `crewSettings`, a `CrewSession` runs next to it on the same speech floor. No connection, no session log, the German texts loaded.

It returns `{ runner, telemetry, voices, crew, packetIn, inside, setCrewVoice }`:

- `telemetry.handleFrame(frame)` hands in a frame; `packetIn(packet)` hands in a decrypted packet (the path from the PS5).
- `setCrewVoice(voice)` puts a test voice on the crew's radio (one that only counts what it is asked to play).

```ts
// tests/telemetry.test.ts
const dirs = { references: path.join(dir, 'references'), sessions: path.join(dir, 'sessions'), voiceCache: path.join(dir, 'cache'), voices: path.join(dir, 'voices') };
const { runner, telemetry } = testRunner({ settings: normalizeSettings({ crew: false, practiceTyres: false, slides: false }), dirs }, { autoReference: false });
const drive = (frames: TelemetryFrame[]) => {
  for (const frame of frames) {
    mock.timers.setTime(frame.time);
    telemetry.handleFrame(frame);
  }
};
```

### `tests/oval.ts`: a lap without a recording

`ovalLap(lap, start)` returns the frames of one lap of an oval (two 500 m straights, two half circles of 60 m radius), driven on track at 60 frames a second, braking into each curve. Laps one after another give the telemetry a lap to learn and the coach two braking zones to coach:

```ts
const lap = ovalLap(1, 0);
drive(lap.slice(0, 240));
```

### `tests/packets.ts`: a decrypted packet

`packet(time, id, { x, speed, flags, lapCount, lapsInRace, carsInRace })` builds a type C packet after decryption, with the fields the telemetry reads, for tests that go through the packet path (`packetIn`):

```ts
// tests/learning.test.ts
r.onPacket(packet(t, id++, { x, speed: 60, flags: 0, lapCount: 1, lapsInRace: 0, carsInRace: 1 }));
```

### A module on a host of its own

A module's main part is tested on a `ModuleHost` built in the test: handlers in a `Map`, events in an array, frames handed in by the test. `tests/haptics.test.ts` and the tutorial's test ([modules.md](modules.md#step-14-tests)) show the pattern. The host itself (settings checked, calls and listeners taken back on stop, one module failing to start) is covered by `tests/modules.test.ts` with a fake `Shell`.

## Recordings

A recording is a `.gtcap` file: every decrypted packet with its arrival time ([telemetry.md](telemetry.md#recordings)). Ways to get one:

- In the app: **Settings → Diagnostics → Record telemetry**. The file goes to the sessions folder (in development `captures/`).
- On the console: `npm run capture -- [--ip <PS5>] [--type C] [--out captures]`.

`captures/` and `references/` are ignored by Git: recordings and references are not in the repository.

## Offline simulation

`npm run simulate` runs a recording through `CoachSession` without real time: every frame keeps its recorded timestamp, so the coach behaves as it would live, in seconds instead of minutes. It prints every call with its time and corner, the results per corner, and the calls that would talk over each other (`OVERLAP`, with estimated clip lengths).

```bash
npm run reference -- captures/<replay>.gtcap            # learn a reference from a recording (saved to references/)
npm run simulate -- captures/<drive>.gtcap --reference references/<ref>.json
```

| Option | What |
|---|---|
| `--laps <n>` | repeat the recording n times |
| `--language de\|en` | the language pack |
| `--feedback all\|1\|2\|3\|off` | feedback per lap |
| `--style sentences\|notes` | the corner plan as sentences or pace notes |
| `--countdown <n>`, `--count-pause <s>`, `--count-pause-short <s>` | the countdown |
| `--all-cues` | print every cue, not only the spoken ones |
| `--no-wait` | no silent out lap |
| `--no-chains`, `--no-fast`, `--no-guide` | without corner chains, without corners without braking, without the calls through problem corners |
| `--replay-calls` | calls in replays too |
| `--race all\|mistakes` | play the recording as a race (the crew's corner calls) |
| `--history <ref>.history.json` | what earlier sessions remember |
| `--briefing` | print the briefing after the laps |
| `--start-at <s>`, `--end-at <s>` | a part of the recording |

Other tools for recordings: `npm run signals` (which fields carry usable data), `npm run compare` (two time windows bit by bit). See [code-map.md](code-map.md#toolscapture).

## Without a PS5

The fake PS5 (`tools/capture/src/fake-ps5.ts`) runs on this PC. It answers the discovery search on UDP 9302 at once, takes heartbeats on UDP 33739, and sends encrypted telemetry to whoever sent them, like a PS5.

```bash
npm run fake-ps5 -- --replay captures/<file>.gtcap          # a recording in real time, looping
npm run fake-ps5 -- --replay captures/<file>.gtcap --start-at 60 --end-at 300
npm run fake-ps5                                            # a synthetic 30 s scenario (lights, blinking bits)
```

`--gt7-delay <s>` (default 8) makes "GT7" start some seconds after the console answers, to see the connection stages.

Then point a client at it:

- **The app:** `npm run dev`, then set the PS5 address to `127.0.0.1` (Settings of the telemetry, or the setup assistant's PlayStation step). `127.x` is accepted as a home address for this purpose.
- **The console coach:** `npm run coach -- --ip 127.0.0.1 [--reference references/<ref>.json]`, which speaks through the system's player.
- **The recorder:** `npm run capture -- --ip 127.0.0.1`.

Tips:

- A replay of a fast lap (a ghost) teaches the app a reference; a recording of one's own driving then gives calls and feedback against it.
- `GTT_DATA_DIR=<empty folder> npm run dev` starts the app as on the first day (the welcome, the setup assistant), without touching your development data.
- In WSL2 with the default NAT network, telemetry from a real PS5 does not arrive; the fake PS5 on the same system always works.

### Checking the layout without looking

In development, `GTT_SCREENSHOTS=<folder>/script.json` runs a list of steps against the UI and saves screenshots next to the script; `GTT_SCREENSHOTS_QUIT=1` quits afterwards. Steps: `{"route": "/settings"}`, `{"click": "<css selector>"}`, `{"wait": 1500}`, `{"shot": "<name>"}`, `{"log": "<expression>"}`, `{"drag": {"selector": "<css>", "dx": 200, "dy": -50, "at": "center"}}`. The runner is `runScreenshotScript` in `apps/desktop/src/main.ts`. In such a run the window comes to the front and keeps painting behind other windows (`backgroundThrottling` off), so the screenshots show the current page. To move between pages, click the navigation (`{"click": "[data-tour=\"nav-telemetry-cockpit\"]"}`, `nav-modules`, `nav-overlays-sources`, `nav-settings` …), as a user would.

For the README's screenshots, use a data folder of its own (`GTT_DATA_DIR`) with `mute: true`, the telemetry IP `127.0.0.1` and the fake PS5 replaying a recording (`npm run fake-ps5 -- --replay <file> --start-at <s>`), so nothing reaches a real console and nothing is heard. The images live in `docs/images/`.
