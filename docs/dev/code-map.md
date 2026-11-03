# Code map

Every workspace and the folders and files that matter, with their main APIs. For how the parts work together, see [architecture.md](architecture.md).

```
apps/desktop        Electron main process, preloads, audio window, security, IPC, config, module host
apps/ui             Angular UI: shell pages, navigation, stores, texts
packages/core       the module contract, config v2, settings helpers (no Electron)
packages/telemetry  GT7 packets, decryption, UDP client, mode, laps, track and car data
packages/coach      reference analysis, the coach session, briefing, language packs
packages/runtime    CoachRunner, telemetry feed, speech floor, voices, voice packages, references, logs
modules/telemetry   the telemetry module (required)
modules/coach       the coach's UI part (its logic is in packages/coach and packages/runtime)
modules/crew        the race crew module
modules/overlays    the OBS overlays module
modules/haptics     the vibration module
tools/capture       console tools: recording, fake PS5, simulator, console coach
scripts/release     release steps and installers
tests               node:test suites and helpers
```

Workspace names (root `package.json`, `"workspaces": ["packages/*", "modules/*", "tools/*", "apps/*"]`):

| Folder | Package |
|---|---|
| `apps/desktop` | `@gt-toolz/desktop` |
| `apps/ui` | `@gt-toolz/ui` |
| `packages/core` | `@gt-toolz/core` |
| `packages/telemetry` | `@gt-toolz/telemetry` |
| `packages/coach` | `@gt-toolz/coach` |
| `packages/runtime` | `@gt-toolz/runtime` |
| `modules/telemetry` | `@gt-toolz/telemetry-module` |
| `modules/crew` | `@gt-toolz/crew` |
| `modules/overlays` | `@gt-toolz/overlays` |
| `modules/haptics` | `@gt-toolz/haptics` |
| `tools/capture` | `@gt-toolz/capture` |

The packages are TypeScript sources; there is no separate build per package. Their `package.json` `exports` point at `.ts` files (`"." : "./src/index.ts"`). esbuild bundles the main process, the Angular CLI bundles the UI, and `tsx` runs the tools and tests directly.

## Root

| File | What |
|---|---|
| `package.json` | Workspaces and scripts (below), the dev tools (`typescript`, `tsx`, `electron-builder`, `@types/node`) and `overrides` |
| `.npmrc` | `ignore-scripts=true`, `save-exact=true`, `fund=false` |
| `tsconfig.json` | The type check of everything but the UI (`npm run typecheck`): `packages/*/src`, `modules/*/src`, `modules/*/main`, `modules/*/page`, `tools/*/src`, `apps/desktop/src`, `tests` |
| `.vscode/launch.json` | "Attach: main process" (port 9229), "Attach: UI" (port 9222), and both together |
| `.github/workflows/` | CI: `pr.yml`, `build.yml`, `release.yml`, `cla.yml` ([building.md](building.md#ci)); `.github/dependabot.yml`, issue and pull request templates |
| `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | The project's front page, how to contribute, the code of conduct |
| `LICENSE`, `CLA.md` | GPL-3.0; the contributor license agreement |
| `SECURITY.md` | How to report a vulnerability |
| `CHANGELOG.md` | The changes per version ("Unreleased" on top) |
| `THIRD-PARTY-NOTICES.md` | Every shipped component, data set and optional download with its license |
| `docs/user/`, `docs/dev/` | The user guide and this developer documentation |

| Script | What it does |
|---|---|
| `npm run dev` | `apps/desktop/scripts/dev.mjs`: Angular dev server, main process in watch mode, Electron with debuggers ([building.md](building.md#development-mode)) |
| `npm run build:app` | UI production build, then the main process |
| `npm run app` | `build:app`, then starts Electron on the built app |
| `npm run typecheck` | `tsc` with the root `tsconfig.json` |
| `npm test` | `node --import tsx --test tests/*.test.ts` |
| `npm run release` | `scripts/release/release.mjs` |
| `npm run capture`, `fake-ps5`, `compare`, `probe`, `signals`, `reference`, `coach`, `simulate`, `voices` | the console tools in `tools/capture/src` (below) |

## apps/desktop

The Electron main process and its preloads. Built by `apps/desktop/scripts/build.mjs` (esbuild, CommonJS for Node 24 / Electron) into `apps/desktop/dist`: `main.cjs`, `preload.cjs`, `audio-preload.cjs`, the overlay page's script `overlay-client.js`, and `licenses.json` (the license texts of every shipped package, collected from their own files).

| File | What |
|---|---|
| `src/main.ts` | App start: data folder, config, the shared services, the module list, the window, quitting. `APP_NAME` (process name, ASCII only) and the dev-only screenshot script (`GTT_SCREENSHOTS`) |
| `src/modules.ts` | The module host: class `Modules` ([modules.md](modules.md#the-module-host)) |
| `src/bridge.ts` | `handle(channel, handler)`: an IPC handler that only accepts calls from the app's page |
| `src/ipc.ts` | The shell's IPC handlers (`registerIpc`): config, settings, module switches, status, calibration, briefing, sound check, voices, texts, recordings, licenses, links, folders, log export, data reset, updates |
| `src/preload.ts` | `window.gtt`: the shell's calls and one namespace per module |
| `src/audio.ts`, `src/audio-preload.ts` | The hidden audio window (`ElectronAudio` implements `AudioOutput`) and its Web Audio player |
| `src/security.ts` | `app://gtt` scheme, CSP, permission handlers, request filter, navigation guards, host-resolver block, `DEV_URL`, `PORTABLE` ([security.md](security.md)) |
| `src/config.ts` | `loadConfig`, `saveConfig`: `config.json` version 2, the move from version 1 |
| `src/licenses.ts` | The entries of the in-app licenses page (`licenseEntries()`) |
| `src/reset.ts` | "Reset data": a marker file, emptied at the next start (`requestReset`, `applyPendingReset`, `claimDataFolder`) |
| `src/self-test.ts` | `--self-test=<file>`: the installer check's self-test ([building.md](building.md#the-installer-test)) |
| `src/updates.ts` | `AppUpdates`: looks for newer releases on GitHub (official builds only) and hands the installer to the system |
| `scripts/build.mjs` | esbuild bundles and `licenses.json` (`node scripts/build.mjs [--watch]`) |
| `scripts/dev.mjs` | Dev mode (`npm run dev`) |

The module list in `main.ts`:

```ts
const modules = new Modules(
  { dev, app: …, stored: (id) => config.modules[id], save: …, telemetry: …, desktop: …, handle, log: …, send },
  [
    telemetryModule(telemetry, dirs.references),
    crewModule({ telemetry, floor: runner.speechFloor, voices, activity: …, status: … }),
    overlaysModule(path.join(__dirname, 'overlay-client.js')),
    hapticsModule,
  ],
);
```

## apps/ui

The Angular 22 app: zoneless, signals, NgRx signal stores, hash routing (`withHashLocation()`), standalone components. Built with `@angular/build:application` into `apps/ui/dist/ui/browser`. It has its own TypeScript (6.0.3, as Angular 22 requires) and compiles `src/**/*.ts` plus `../../modules/*/ui/**/*.ts` (`tsconfig.app.json`) with strict templates.

Path aliases (`apps/ui/tsconfig.json`):

| Alias | Points to |
|---|---|
| `@gtt/api`, `@gt-toolz/runtime/app-api` | `packages/runtime/src/app-api.ts` |
| `@gt-toolz/core/*` | `packages/core/src/*` |
| `@gt-toolz/<id>/*` (`telemetry-module`, `crew`, `haptics`, `overlays`) | `modules/<id>/src/*` (the module's contract, and code without Node such as the overlay view) |
| `@shell/*` | `apps/ui/src/app/*` (what the modules' UI parts import from the shell) |
| `@modules/*` | `modules/*` |

| Folder or file | What |
|---|---|
| `src/main.ts`, `src/app/app.config.ts` | Bootstrap; router with hash location |
| `src/app/app.ts`, `app.html`, `app.css` | The shell: title bar, navigation, dialogs, services of the modules that are on |
| `src/app/app.routes.ts` | Shell routes and one route per module (`/<id>/…`, guarded by `moduleOn`) |
| `src/app/modules.ts` | `MODULE_UIS`: every module's `ModuleUi`, in navigation order |
| `src/app/core/module-ui.ts` | The UI extension points: `ModuleUi`, `ModulePage`, `ModuleAction`, `ModuleCockpit`, `CockpitCard`, `ModuleGuide`, `GuideStep`, `TourStop` |
| `src/app/core/gtt.ts` | The `GTT` injection token, `GttBridge`, `BRIDGE_AVAILABLE`, the offline bridge |
| `src/app/core/format.ts` | `lapTime`, `deltaSeconds`, `parseLapTime`, `carLabel`, `bytes` |
| `src/app/core/streamer.ts`, `hide-paths.ts`, `ui/secret.ts` | Streamer mode: what is hidden, and the reveal controls |
| `src/app/core/clip-player.ts`, `mic-recorder.ts` | Playing a recorded take in the page; recording a take (audio only) |
| `src/app/core/links.ts`, `markdown.ts` | Links shown in the app; a safe Markdown subset for the news and update windows |
| `src/app/i18n/` | `I18n` service (`t(key, params)`, platform variants `<key>.mac`), the shell's `en.ts` and `de.ts` |
| `src/app/pages/` | Shell pages: `modules`, `voices`, `texts`, `recordings`, `listen` (sound check), `settings`, `about`, `licenses`, `welcome`, `guide` (setup assistant), `tour` |
| `src/app/stores/` | `SettingsStore`, `CoachStore`, `VoicesStore`, `RecordingsStore`, `TextsStore`, `UpdatesStore` |
| `src/app/ui/` | Small components: `gtt-icon` (own icon set), `gtt-toggle`, `gtt-slider`, `gtt-segmented`, `gtt-secret`, the link bar, the news and update dialogs |
| `src/styles.css` | Design tokens and the global classes (`page`, `card`, `setting`, `btn`, `chip`, `gtt-guide` …) |
| `public/` | The mascot icons; `public/news/<version>.<lang>.md` (the news window of each version) |

The UI can run in a plain browser (`npm start -w @gt-toolz/ui`, `ng serve` on port 4200). Without Electron every bridge call fails, which is enough to work on layout.

## packages/core

The shell's contract, without Electron or Node imports (`@gt-toolz/core`, `@gt-toolz/core/api`).

| File | What |
|---|---|
| `src/module.ts` | `ModuleDefinition`, `ModuleSettings`, `ModuleInstance`, `ModuleHost`, `ModuleTelemetry`, `ModuleHaptics`, `ModuleDesktop`, `ModuleBridge`, `LapTime` ([modules.md](modules.md#moduledefinition)) |
| `src/api.ts` | Shared by UI and preload: `BridgeScope`, `ModuleSettingsApi<S>`, `settingsBridge(scope)`, `HapticCue`, `HAPTIC_CUES`, `HapticDetail`, `ModuleState`, `Unsubscribe` |
| `src/config.ts` | `ConfigFile`, `StoredModule`, `CONFIG_VERSION` (2), `MODULE_ID`, `parseConfigFile`, `isVersion1`, `asObject` |
| `src/normalize.ts` | The building blocks of every settings check: `clamp`, `bool`, `oneOf` |
| `src/args.ts` | `asString(value)`: an IPC argument that must be a short string |

```ts
// packages/core/src/normalize.ts
clamp(value, min, max, fallback)   // a number in range, or the fallback
bool(value, fallback)              // a boolean, or the fallback
oneOf(value, options, fallback)    // one of the options, or the fallback
```

## packages/telemetry

GT7's telemetry as a library (`@gt-toolz/telemetry`). Its only runtime dependency is `@noble/ciphers`. Details: [telemetry.md](telemetry.md).

| File | What |
|---|---|
| `src/packet.ts` | Packet types and sizes, field layout (`fieldLayout`, `fieldMap`), `Flags`, `TelemetryFrame`, `readFrame(data, time)` |
| `src/crypto.ts` | `decryptPacket`, `decryptAny`, `encryptPacket` (Salsa20) |
| `src/client.ts` | `TelemetryClient` (heartbeat, receive, sender lock), `isHomeAddress`, `isPrivateIpv4`, `discoveryTargets`, ports `PS5_HEARTBEAT_PORT` (33739) and `LOCAL_TELEMETRY_PORT` (33740) |
| `src/console-discovery.ts` | `ConsoleDiscovery`: finds the PS5 (or PS4) with the Remote Play discovery protocol |
| `src/mode.ts` | `SessionMode`, `detectMode(frame)`, `RaceEnd`, `RaceRunning` |
| `src/laps.ts` | `Lap`, `splitLaps(frames)`, `lapToLearn(laps)`, `OWN_LAPS` (3), `formatLapTime`, `distance` |
| `src/line.ts`, `src/locator.ts` | `ReferencePoint`, `referenceTimeMs`; `TrackLocator` projects a position onto a reference line |
| `src/tracks.ts` | `recognizeTrack(points)`: the track from the driven line |
| `src/cars.ts` | `carName(code)` |
| `src/capture-file.ts` | The `.gtcap` recording format: `readCaptureFile`, `encodeCaptureRecord`, `CAPTURE_HEADER` |
| `data/` | `track-signatures.json`, `own-track-signatures.json`, `cars.json`, their licenses and `SOURCE.md` (source, commit, SHA-256, license of every part) |

Reading a recording (`tools/capture/src/reference.ts`):

```ts
import { readCaptureFile, readFrame, splitLaps } from '@gt-toolz/telemetry';

const frames = readCaptureFile(file).map((p) => readFrame(p.data, p.time));
const laps = splitLaps(frames);
```

## packages/coach

The coaching logic, independent of Electron and audio (`@gt-toolz/coach`). It builds on `packages/telemetry`, never the other way round. Details: [coach-and-texts.md](coach-and-texts.md).

| File | What |
|---|---|
| `src/reference.ts` | `ReferenceLap`, `Corner`, `buildReference(lap, source)`, `prepareReference(reference)`, `cornerGears` |
| `src/coach.ts` | `CoachSession`: cue planning and timing, feedback, help ladder, focus exercise, sectors; `CoachSettings`, `DEFAULT_COACH_SETTINGS`, `CoachEvent`, `Cue` |
| `src/analysis.ts` | `analyzeCorner`, `Problem` (the mistake kinds), `CornerResult` |
| `src/briefing.ts` | `buildBriefing`, `buildDebrief`, the coach's memory (`CoachHistory`, `rememberResult`) |
| `src/fast.ts` | Corners without braking (`findFastCorners`) and corner chains (`chainedAfter`, `isFollower`, `chainFollowers`) |
| `src/shape.ts`, `src/trail.ts`, `src/curbs.ts`, `src/names.ts` | Corner shape, trail braking, curb use, corner names |
| `src/slides.ts` | `SlideWatcher`: slides and spins and what started them |
| `src/i18n/` | Language packs: `TEXT_KEYS`, `validateLanguagePack`, `phrasesFromPack`, `LanguageRegistry`, `builtInPhrases`, own texts (`checkOwnText`, `textGroup`, `textSamples`), the `Phrases` interface |
| `language-packs/de.json`, `en.json` | The built-in spoken texts |
| `data/corner-names.json` | Official corner names (CC0), with `SOURCE.md` |

Coaching a recording without the app (`tools/capture/src/simulate.ts`, shortened):

```ts
const reference = JSON.parse(fs.readFileSync(values.reference, 'utf8')) as ReferenceLap;
prepareReference(reference);
const phrases = builtInPhrases(values.language);
const coach = new CoachSession(reference, { ...DEFAULT_COACH_SETTINGS, feedback: values.feedback !== 'off' }, phrases);
for (const frame of frames) {
  for (const event of coach.update(frame)) {
    // 'cue', 'note', 'new-lap', 'corner-result', 'feedback-new', …
  }
}
```

## packages/runtime

The shell's runtime without Electron (`@gt-toolz/runtime`, `@gt-toolz/runtime/app-api`). The desktop app and the console tools use it.

| File | What |
|---|---|
| `src/app-api.ts` | The IPC contract of the shell: `GttApi`, `RunnerSettings`, `RunnerStatus`, `ModuleId`, `MODULE_IDS`, `RUNNER_MODULE_IDS`, `PRODUCT_NAME`, `PRODUCT_BYLINE`, `isLanAddress`, `UpdateStatus` … (types and a few constants only) |
| `src/runner.ts` | `CoachRunner`: the coach as a service (voice, coaching, memory, briefing, debrief, calibration, sound check, lap times, race calls on the crew's radio); owns the speech floor (`speechFloor`) |
| `src/telemetry-feed.ts` | `TelemetryFeed` (the interface coach and crew read), `TelemetryEvents`, `ReferenceEvent`, `ReferenceChange` |
| `src/speech-floor.ts` | `SpeechFloor`, `Announcement`, `ANNOUNCE_MARGIN_S` |
| `src/shell-voices.ts` | `ShellVoices`: the voice per role and language, language packs (`languages`), recorded packs (`packs`), the name in front of a sentence (`address`), `open(…)`, volumes, the crew's `radio` |
| `src/voice.ts` | `ClipVoice` (render, cache, play, `prepare(name, text)`), Windows voices through PowerShell, `AudioOutput`, `SYSTEM_AUDIO`, `NO_AUDIO`, `radioFilter` |
| `src/voices.ts` | `availableVoices`, `defaultVoiceId`, `openVoice` |
| `src/piper.ts`, `src/sherpa.ts`, `src/mac-speech.ts`, `src/piper-for-sherpa.ts` | The engines' renderers; making a Piper voice ready for sherpa-onnx on the Mac |
| `src/voice-packages.ts`, `voice-packages.json` | The voice catalogue and the download manager ([voices.md](voices.md)) |
| `src/voice-pack.ts` | Recorded voice packs: format, matching by words, storage, export and import |
| `src/clips.ts` | Clip names and texts for cues, plans and pace notes (`clipFor`, `cueText`, `cornerPlanText`, `fastNoteText`, `coachClips`) |
| `src/haptics.ts` | `hapticForClip`: which coach clip is which haptic cue |
| `src/connection.ts` | `Gt7Connection`: find the PS5, then GT7, with fallback packet types and the status the UI shows |
| `src/references.ts` | Reference files: `readReference`, `listReferences`, `referenceFile`, `deleteReference`, `updateReferenceDetails`, `historyFileFor`, `markReferenceUsed` |
| `src/reference-picker.ts`, `src/ghost.ts` | `ReferencePicker` (a saved reference that fits the track), `GhostWatch` (is the car on a reference's line) |
| `src/recorder.ts` | `CaptureRecorder`: writes `.gtcap` |
| `src/session-log.ts` | `openSessionLog`, `anonymize`, `fileStamp` |
| `src/settings.ts` | `DEFAULT_RUNNER_SETTINGS`, `normalizeSettings`, `migrateSettings`, `withTalk`, `coachSettingsFrom`, `ownTexts` |
| `src/settings-split.ts` | `OWNERS` (the owner of every key), `keysOf`, `splitSettings`, `joinSettings`, `configFromVersion1`, `upgradeConfig` |
| `src/app-updates.ts` | Release list, version order, installer name, download checked against `SHA256SUMS.txt` (GitHub only) |
| `src/atomic-file.ts`, `src/wav.ts` | `writeFileAtomic`; WAV helpers (trim, join with pauses, playback rate) |

How `main.ts` puts the runtime together:

```ts
const telemetry = new TelemetrySession({ dirs, settings: () => ({ …telemetrySettings, driverName }), log: (line) => runner.log(line) });
const voices = new ShellVoices({ dirs, audio, settings: () => runner.currentSettings });
const runner = new CoachRunner({ settings: config.settings, dirs, telemetry, echo: dev, audio, voices });
```

## modules/telemetry

The telemetry module (`@gt-toolz/telemetry-module`), required and always on. Every other module reads it.

| File | What |
|---|---|
| `src/api.ts` | `TELEMETRY`, `TelemetryModuleSettings` (`ip`, `autoReference`, `driveMode`, `driveBop`, `record`, `activeReference`), `TelemetryApi` (references: list, activate, update, delete) |
| `src/settings.ts` | Defaults and `normalizeSettings` (a manual PS5 address must be a home-network address) |
| `main/session.ts` | `TelemetrySession` (implements `TelemetryFeed`): connection, frames, mode, driving, car, recording, the reference in use, learning, picking |
| `main/module.ts` | `telemetryModule(session, referencesDir)`: runs the session with the module's settings, remembers the active reference, answers the references calls |
| `main/preload.ts` | `telemetryBridge(scope)` |
| `ui/` | Cockpit page and its cards (session, live, learning, timeline), References page with the learn and mode dialogs, Settings page, the connection pill in the title bar, the PlayStation and reference steps of the setup assistant, `TelemetryStore`, `ReferencesStore` |

## modules/coach

Only the coach's UI part lives here; its logic is in `packages/coach` and `CoachRunner`.

| File | What |
|---|---|
| `ui/module.ts` | `coachUi`: the Settings page, the Calibration action, its Cockpit cards (last call, zones, feedback), chips and banners, the calibration step, tips and warning in the setup assistant, a tour stop |
| `ui/cockpit/` | `CalloutCard`, `ZonesCard`, `FeedbackCard`, `CoachChips`, `CoachBanners` |
| `ui/pages/settings/` | The coach's settings (they are `RunnerSettings` keys, saved through `SettingsStore`) |
| `ui/guide/calibrate-step.ts` | The calibration step |
| `ui/i18n/` | `coach.*` texts |

## modules/crew

The race crew (`@gt-toolz/crew`): in races on its own voice with the radio filter, the tyre calls outside races, the team boss.

| File | What |
|---|---|
| `src/api.ts` | `CREW`, `CrewModuleSettings`, `CrewApi` (only the settings calls) |
| `src/settings.ts` | Defaults, `normalizeSettings`, `withTalk` (the talk level on top of the settings) |
| `src/crew.ts` | `RaceCrew`: positions, sectors against the own best lap, laps to go, fuel and tyre strategy, cheeky remarks |
| `src/tyres.ts` | `TyreWatch`: tyre temperature calls (also outside races) |
| `main/session.ts` | `CrewSession`: listens to the telemetry, opens its voices through `ShellVoices`, speaks through the speech floor, puts its voice on the radio |
| `main/module.ts` | `crewModule(shell: CrewShell)` |
| `main/preload.ts` | `crewBridge(scope)` |
| `ui/` | Race card on the Cockpit (only while a race runs), Settings page, `CrewStore` |

## modules/overlays

The OBS overlays (`@gt-toolz/overlays`): a browser source served on `127.0.0.1`, put together in an editor.

| File | What |
|---|---|
| `src/api.ts` | `OVERLAYS`, `OverlaysSettings`, `OverlaysApi`, `OverlayFrame`, `OverlayLayout`, widget kinds, canvases, looks |
| `src/settings.ts` | Defaults (port 4790) and the layout check |
| `src/frame.ts` | `overlayFrame(…)`: what the overlay shows of a frame; `AfterFlag` (hidden from the chequered flag until the session is left) |
| `src/view.ts` | The overlay's drawing code (plain DOM), shared by the editor in the app and the page in OBS |
| `main/server.ts` | `OverlayServer`: Node `http` on `127.0.0.1`, `/overlay`, `/events` (server-sent events) |
| `main/module.ts` | `overlaysModule(clientFile)` |
| `page/client.ts`, `page/style.ts` | The page OBS shows (bundled to `dist/overlay-client.js`) and its CSS |
| `ui/` | Browser sources page, the editor, `OverlaysStore` |

## modules/haptics

The vibration (`@gt-toolz/haptics`): the cues of coach and crew as patterns on an audio output or a game controller. The smallest module; the tutorial in [modules.md](modules.md) follows its layout.

| File | What |
|---|---|
| `src/api.ts` | `HAPTICS`, `HapticSettings`, `HapticsApi` (`onHaptic`, `test`), `HapticEvent`, patterns |
| `src/settings.ts` | Defaults and `normalizeSettings` |
| `src/patterns.ts` | `hapticEvent(settings, cue, detail)`: a cue as the driver's pattern |
| `main/module.ts` | `hapticsModule`: one pattern at a time, "now" at once, the zone test |
| `main/preload.ts` | `hapticsBridge(scope)` |
| `ui/core/haptic-player.ts`, `ui/core/dualsense.ts` | The player (Web Audio oscillators or gamepad rumble), DualSense vibration over WebHID |
| `ui/` | Vibration page, the device test, own patterns, the setup step, `HapticsStore` |

## tools/capture

Console tools for development (`@gt-toolz/capture`), run with `tsx`. End users never use them.

| Script | File | What |
|---|---|---|
| `npm run capture -- [--ip <PS5>] [--type C] [--out captures]` | `main.ts` | Records telemetry to `.gtcap` and reports every changing bit |
| `npm run fake-ps5 -- [--replay <file.gtcap>] [--start-at <s>] [--end-at <s>] [--gt7-delay 8]` | `fake-ps5.ts` | A fake PS5 on this PC: answers discovery and sends a recording (or a synthetic scenario) |
| `npm run simulate -- <file.gtcap> --reference <ref.json> [options]` | `simulate.ts` | Runs a recording through `CoachSession` without real time and prints every call |
| `npm run coach -- [--reference <ref.json>] [--ip <PS5>] [options]` | `coach.ts` | The console coach: the same `CoachRunner` as the app, with the system's audio player |
| `npm run reference -- <file.gtcap> [--lap <n>] [--out references]` | `reference.ts` | Learns a reference from a recording and lists its corners |
| `npm run signals -- <file.gtcap> … [--reference <ref.json>]` | `signals.ts` | Data probe: which fields carry usable information |
| `npm run compare -- <file.gtcap> --baseline HH:MM:SS-HH:MM:SS --test HH:MM:SS-HH:MM:SS` | `compare.ts` | Bit-by-bit comparison of two time windows |
| `npm run probe -- [--ip <PS5>] [--chars DEFG]` | `probe.ts` | Which packet sizes GT7 answers other heartbeat letters with |
| `npm run voices -- --list \| --install <ids> \| --remove <ids>` | `voices-setup.ts` | The voice manager on the console (the app has the same logic behind its Voices page) |

`analyzer.ts` holds the bit-change analyser used by `capture`. Details: [testing.md](testing.md).

## scripts/release

Plain Node scripts (no packages) that build and test a release the same way locally and in CI. See [building.md](building.md#release-scripts).

| File | Step |
|---|---|
| `release.mjs` | Runs the steps in order (`--steps=`, `--skip=`, `--force`) |
| `plan.mjs` | The release plan: the next version from channel and bump, and with `--apply` the versions, `CHANGELOG.md` and the news for it; writes `release/notes.md` |
| `announce.mjs` | The release's announcement on Discord: the English news, up to three tries; never fails the release |
| `1-build.mjs` | Production build and staging (`release/stage`) |
| `2-test.mjs` | Type check, tests, `npm audit signatures`, `npm audit` |
| `3-installer-windows.mjs`, `4-installer-linux.mjs`, `5-installer-mac.mjs` | The installers (each only on its own system) |
| `6-test-installers.mjs` | Installs, checks and self-tests the installers of this system |
| `7-mac-package.mjs` | The Mac package without an installer |
| `builder.mjs` | The electron-builder configuration (`builderConfig()`, `buildInstaller(platform)`) |
| `lib.mjs` | Paths, version, `run`, `fail`, `SkipStep`, checksums, zip |
| `mac-package/` | The start script and README templates of the Mac package |

## tests

`node:test` suites run with `tsx` (`npm test`). See [testing.md](testing.md).

| File | What it covers |
|---|---|
| `runner.ts` | Helper: `testRunner(…)` builds a runner with its telemetry and voices as `main.ts` does (optionally with the crew) |
| `oval.ts` | Helper: `ovalLap(lap, start)`, a synthetic lap with two braking zones |
| `packets.ts` | Helper: `packet(time, id, values)`, a decrypted type C packet |
| `modules.test.ts`, `config.test.ts`, `settings.test.ts` | Module host, config v2 and its migrations, settings |
| `telemetry.test.ts`, `laps.test.ts`, `learning.test.ts`, `race-start.test.ts`, `race-end.test.ts`, `data.test.ts` | Telemetry, laps, learning, race start and end, bundled data |
| `speech-floor.test.ts`, `speech.test.ts`, `shell-voices.test.ts`, `volume.test.ts`, `talk-and-race.test.ts`, `coach-switch.test.ts` | Speech floor and voices through the runner |
| `chains.test.ts`, `fast-corners.test.ts`, `slides.test.ts`, `tyre-wear.test.ts`, `crew.test.ts` | Coach and crew logic |
| `texts.test.ts`, `own-texts.test.ts` | UI texts, language packs, own texts |
| `voice-catalogue.test.ts`, `piper-for-sherpa.test.ts`, `mac-speech.test.ts` | Voice catalogue and engines |
| `overlays.test.ts`, `overlay-server.test.ts`, `haptics.test.ts` | The modules |
| `network.test.ts`, `files.test.ts`, `session-log.test.ts`, `app-updates.test.ts` | Network rules, file handling, anonymous logs, updates |
