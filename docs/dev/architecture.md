# Architecture

This page explains how GT Toolz is put together: its processes, the shell and its modules, the path of a telemetry packet to a spoken call, the bridge between UI and main process, and the settings file. File-by-file details are in [code-map.md](code-map.md).

## Overview

```
PS5 / GT7 ──UDP──▶ Electron main process (Node) ─────────────────────────────────────────────┐
 (home network)    │                                                                          │
                   │  TelemetrySession (modules/telemetry)                                    │
                   │    connection, decryption, frames, mode, car, recording, references     │
                   │        │ frame                                                           │
                   │        ├──▶ CoachRunner (packages/runtime): the coach ── cues ──┐        │
                   │        ├──▶ crew module: CrewSession ── sentences ──────────────┤        │
                   │        └──▶ overlays, haptics, … (module host)                  ▼        │
                   │                                         speech floor ─▶ voices (clips)   │
                   │                                                                 │        │
                   │  IPC (window.gtt) ◀──────────────▶ UI window (Angular)          │        │
                   │                                                                 ▼        │
                   │                                   hidden audio window (Web Audio) ─▶ earbud
                   └──────────────────────────────────────────────────────────────────────────┘
```

## Processes

| Process | Code | What it does |
|---|---|---|
| **Electron main process** | `apps/desktop/src/main.ts` | Owns everything that is not drawing: the PS5 connection, the coach, the modules, the voices, the settings file, the IPC handlers, the window security. Bundled with esbuild to `apps/desktop/dist/main.cjs`. |
| **UI window** | `apps/ui` (Angular), preload `apps/desktop/src/preload.ts` | The app's only visible window. Loads `app://gtt/` (in dev the Angular dev server). Sandboxed, context isolation, no Node. Talks to the main process only through `window.gtt`. |
| **Hidden audio window** | `apps/desktop/src/audio.ts`, preload `apps/desktop/src/audio-preload.ts` | An invisible window with an empty page (CSP `default-src 'none'`). Its preload is the player: Web Audio, one channel per voice, clips decoded when loaded. Restarted (and its clips reloaded) if it crashes. |
| **Speech engines** | `packages/runtime/src/voice.ts`, `piper.ts`, `sherpa.ts`, `mac-speech.ts` | Separate programs, started by the main process: Windows PowerShell for Windows voices, `/usr/bin/say` on macOS, Piper and sherpa-onnx for the downloaded voices. They write WAV files; they never play audio themselves. See [voices.md](voices.md). |

The **console tools** in `tools/capture` (for example `npm run coach`) run the same `CoachRunner` and `TelemetrySession` in plain Node, without Electron. They play clips with the system's player instead of the audio window.

Closing the main window quits the app. Quitting stops the coach and every module, waits at most 3 s (`QUIT_TIMEOUT_MS`), then closes the audio window. A second start of the app only brings the running window to the front (`app.requestSingleInstanceLock()`): two instances would fight over the telemetry port.

### Start order

`start()` in `apps/desktop/src/main.ts`:

1. Harden the session, serve the UI from `app://gtt` (`security.ts`).
2. Load `config.json` (`config.ts`), prune old session logs and recordings.
3. Start the audio window (`ElectronAudio`).
4. Create the shared services: `TelemetrySession` (the telemetry), `ShellVoices` (the voices), `CoachRunner` (the coach, with its speech floor).
5. Create the module host (`Modules`) with the module definitions, and wire the haptics sink: `runner.on('feel', …)` → `modules.feel(…)`.
6. Create the update service (`AppUpdates`, `updates.ts`) and register the IPC handlers (`registerIpc`, `ipc.ts`).
7. `await runner.start()`, then `modules.startEnabled()`: the coach is ready before the telemetry's first reference event.
8. Create the window.

## The shell and its modules

GT Toolz is a **shell** with **modules**. A module can be switched on and off on the Modules page (and in the setup assistant). A module that is off does nothing, takes its pages out of the navigation and its cards off the Cockpit.

| Module | Id | Default | Where it runs | Pages |
|---|---|---|---|---|
| Telemetry | `telemetry` | always on (`required`) | `modules/telemetry` on the module host | Cockpit, References, Settings |
| Coach | `coach` | on | inside `CoachRunner` (`packages/runtime/src/runner.ts`); its UI part in `modules/coach/ui` | Settings, the Calibration button |
| Race crew | `crew` | on | `modules/crew` on the module host | Settings |
| OBS overlays | `overlays` | off | `modules/overlays` on the module host | Browser sources |
| Vibration | `haptics` | off | `modules/haptics` on the module host | Vibration |

The **coach is the one module still inside the runner.** Its switch is the setting `coach` (`RUNNER_MODULE_IDS` in `packages/runtime/src/app-api.ts`). Every other module has a `ModuleDefinition` and runs on the module host.

The **shell** (not a module) owns:

- the voices: voice packages, recorded voice packs, the voice per role, languages per role, volumes, the radio filter;
- the app settings: language, name and address, personality (style, patience), mute, streamer mode, diagnostics, updates;
- the shared services: telemetry feed, speech floor, voices, haptics sink;
- the shell pages: Modules, Voices, Texts, Recordings, Sound check (`listen`), Settings, About, Licenses, the welcome, the setup assistant and the tour.

## The module host

`apps/desktop/src/modules.ts` (class `Modules`) runs every module that has a `ModuleDefinition` (`packages/core/src/module.ts`). In short:

- **Settings:** for every module, the host reads its stored settings from `config.json` and passes them through the module's `normalize` (over its `defaults()`). It answers `gtt:<id>:settings` and `gtt:<id>:setSettings` for every module, **also while the module is off**.
- **Starting:** `startEnabled()` starts the modules that are on. `setEnabled(id, on)` saves the switch and starts or stops the module. Switches run one after the other (`queue`), so a module switched off and on again finds its port free. A `required` module cannot be switched off.
- **What a module gets:** a `ModuleHost` with its settings, the app settings (read only), the log, the telemetry (`onFrame`, `mode`, `lastLap`), the haptics sink, desktop helpers (`copyText`, `openLocalPage`) and its own IPC namespace (`bridge.handle`, `bridge.send`).
- **Stopping:** `stop()` on the instance, then the host removes every IPC handler and frame listener the module registered.
- **Failure isolation:** a module whose `start()` throws stays off until the next start; the app keeps running.
- **Fan-out:** `feel(cue, detail)` (the haptics sink), `appChanged()` (an app setting changed, for example the language) and `voicesChanged(phase)` (voice packages are about to be removed, or were installed or removed) go to every running module.

A module that needs more than the host offers gets it from the shell in its factory. The crew module is the example: `crewModule({ telemetry, floor, voices, activity, status })` in `main.ts`. See [modules.md](modules.md).

## From a UDP packet to speech

One frame, about 60 times a second:

1. **Connection** (`packages/runtime/src/connection.ts`, `Gt7Connection`). It finds the PS5 with the Remote Play discovery protocol (`ConsoleDiscovery`, UDP 9302 for a PS5, 987 for a PS4) or uses the address from the settings. `TelemetryClient` (`packages/telemetry/src/client.ts`) sends a one-byte heartbeat (the packet type letter, `C` by default) to UDP 33739 every 1.5 s and listens on UDP 33740. If GT7 does not answer type C, it falls back to `B`, then `A`.
2. **Receive and decrypt.** `TelemetryClient` drops datagrams that are not one of the four packet sizes, that do not come from a home-network address, or that do not come from the PS5 once it is known. `decryptAny` (`packages/telemetry/src/crypto.ts`) decrypts with Salsa20 and checks the magic. Details: [telemetry.md](telemetry.md#the-packet).
3. **Frame** (`modules/telemetry/main/session.ts`, `TelemetrySession.onPacket`). The packet goes to the recorder when "Record telemetry" is on (`CaptureRecorder`, a `.gtcap` file), then `readFrame()` turns it into a `TelemetryFrame`.
4. **Telemetry work** (`handleFrame`), in this order:
   1. `live` event for the UI, at most 10 times a second;
   2. the session's mode (`watchMode`, stable after 3 s, a frozen picture counts as a menu) and whether the driver is driving (`watchDriving`);
   3. the car (`checkCar`);
   4. **the `frame` event**: coach, crew and every module listening through `host.telemetry.onFrame` get the frame now;
   5. picking a saved reference that fits (`autoReference`) and learning a new one (`learn`).

   While the calibration runs, the session is suspended: only frames and the car, no mode, driving, learning or picking.
5. **Coach** (`CoachRunner.onFrame`, `packages/runtime/src/runner.ts`). It watches races and slides, then calls `CoachSession.update(frame)` (`packages/coach/src/coach.ts`). That returns `CoachEvent`s: `cue` (tone, intro, plan, countdown, "now", gear, turn-in, helping cues), `note` (a corner without braking), `new-lap`, `corner-result`, feedback events and more.
6. **Cue to clip.** For a `cue` the runner picks the clip (`clipFor(cue)`, `packages/runtime/src/clips.ts`) and plays it at once (`play`): it makes the cue felt (`hapticForClip` → `feel` → `modules.feel`), tells the speech floor how long it speaks (`floor.occupy`) and plays the clip unless muted. In races with corner calls, the crew's radio voice plays the coach's cues.
7. **Speech floor.** At the end of every frame that is not paused, `floor.next()` gives the oldest waiting sentence its turn if it fits before the coach's next cue. See below.
8. **Playback.** `ClipVoice.play(clip)` sends `audio:play` to the hidden audio window, which starts the decoded buffer on the voice's channel. A new clip cuts off only the clip on the same channel, so coach and crew can overlap.

Sentences that are not timed to a braking point (lap times, crew reports, remarks, feedback after a corner) go another way: the speaker renders the sentence to a clip (`voice.prepare(clip, text)` returns its length), then puts it on the speech floor with `floor.announce({ … })`.

## The speech floor

`packages/runtime/src/speech-floor.ts` (class `SpeechFloor`) makes coach and crew speak one at a time. The runner owns the instance (`runner.speechFloor`) and hands it to the crew.

| Rule | Code |
|---|---|
| What is said occupies the floor; a sentence waits for it, plus 300 ms | `occupy(ms)`, `AFTER_MS` |
| A sentence starts only if it ends 0.6 s before the coach's next cue: "now" is never talked over | `quietSeconds()`, `ANNOUNCE_MARGIN_S` |
| The oldest sentence that fits goes first | `next()` |
| Too late: dropped, and its caller is told | `until`, `done()` |
| Nothing while a briefing or a debrief holds the floor | `held()` |
| Muted: felt and counted as said, not heard | `muted()`, `feel()` |
| A speaker that leaves takes its waiting sentences with it | `drop(speaker)` |
| A new reference or a calibration clears the floor | `clear()` |

```ts
// packages/runtime/src/speech-floor.ts
export interface Announcement {
  text: string;
  /** How long it takes to say. */
  seconds: number;
  /** Dropped after this (ms since 1970). */
  until: number;
  /** Who says it: its sentences go together when it leaves (drop). */
  speaker: unknown;
  /** What the driver feels when it is said. */
  haptic: HapticCue;
  play(): void;
  /** Called once it has been said, or dropped. */
  done?: () => void;
}
```

## The bridge: `window.gtt`

The UI and the main process share TypeScript types and talk over Electron IPC. There is exactly one bridge.

**Preload** (`apps/desktop/src/preload.ts`). It runs sandboxed with context isolation and exposes one object, `window.gtt`, through `contextBridge.exposeInMainWorld('gtt', api)`. The UI never sees `ipcRenderer`.

- **Shell calls** are `gtt:<name>` (for example `gtt:getConfig`, `gtt:setSettings`, `gtt:setModuleEnabled`), declared in `GttApi` (`packages/runtime/src/app-api.ts`).
- **Shell events** are `gtt:<event>`: `gtt:status`, `gtt:activity`, `gtt:cue`, `gtt:live`, `gtt:modules`, `gtt:voice-install`, `gtt:update`.
- **A module's calls and events** live in its own namespace: `gtt:<id>:<name>`, exposed as `window.gtt.<id>`. The preload builds them with a `BridgeScope`:

```ts
// apps/desktop/src/preload.ts
const scope = (id: string): BridgeScope => ({
  invoke: <T>(name: string, ...args: unknown[]) => invoke<T>(`${id}:${name}`, ...args),
  subscribe: <T>(event: string) => subscribe<T>(`${id}:${event}`),
});
// …
  [HAPTICS]: hapticsBridge(scope(HAPTICS)),
```

**Main process.** Every handler goes through `handle()` in `apps/desktop/src/bridge.ts`, which refuses calls that do not come from the app's own page:

```ts
// apps/desktop/src/bridge.ts
export function handle(channel: string, handler: (...args: unknown[]) => unknown): () => void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return handler(...args);
  });
  return () => ipcMain.removeHandler(channel);
}
```

`fromApp` (`apps/desktop/src/security.ts`) accepts only a sender frame on `app://gtt` (in dev, the dev server's URL). The shell's handlers are in `apps/desktop/src/ipc.ts`; each module registers its own through `host.bridge.handle` (the host prefixes `gtt:<id>:`). **Arguments from the UI are never trusted:** every handler checks them (`asString` in `packages/core/src/args.ts`, the modules' `normalize`, ids checked against known lists).

**Contract files** (types and a few constants only, no Node or Electron):

| File | Imported in the UI as | Content |
|---|---|---|
| `packages/core/src/api.ts` | `@gt-toolz/core/api` | What every module shares: `BridgeScope`, `ModuleSettingsApi`, `settingsBridge`, `HapticCue`, `ModuleState` |
| `packages/runtime/src/app-api.ts` | `@gtt/api` | The shell's part: `GttApi`, `RunnerSettings`, `RunnerStatus`, `MODULE_IDS`, `PRODUCT_NAME`, … |
| `modules/<id>/src/api.ts` | `@gt-toolz/<id>/api` | A module's part: its settings type and its API (`window.gtt.<id>`) |

The UI reads the bridge through the `GTT` injection token (`apps/ui/src/app/core/gtt.ts`). Outside Electron (the UI in a plain browser with `ng serve`), `GTT` is an offline bridge: every call rejects and no event arrives. `BRIDGE_AVAILABLE` tells the stores whether to load.

## Config v2

The app keeps its settings in one file, `config.json` in the data folder (dev: `.cache/app-data/config.json`). It is written atomically (`writeFileAtomic`): a crash never leaves a half-written file.

```json
{
  "version": 2,
  "app": { "language": "de", "driverName": "", "volume": 100, "voices": { "…": "…" }, "texts": {} },
  "modules": {
    "telemetry": { "enabled": true, "settings": { "ip": "", "autoReference": true, "driveMode": "daily", "driveBop": true, "record": false } },
    "coach": { "enabled": true, "settings": { "countdownSeconds": 2, "…": "…" } },
    "crew": { "enabled": true, "settings": { "crewSectors": 3, "…": "…" } },
    "overlays": { "enabled": false, "settings": { "overlayPort": 4790, "…": "…" } },
    "haptics": { "enabled": false, "settings": { "output": "audio", "…": "…" } }
  },
  "guideDone": true
}
```

| Part | Who owns it | Where the defaults and checks are |
|---|---|---|
| `app` | the shell | `DEFAULT_RUNNER_SETTINGS`, `normalizeSettings` in `packages/runtime/src/settings.ts`; the owner of every key in `OWNERS` (`packages/runtime/src/settings-split.ts`) |
| `modules.coach` | the coach (still in the runner) | the same files; `splitSettings` and `joinSettings` move its keys between the file and the runner's flat `RunnerSettings` |
| `modules.<id>` for every other module | the module | its `settings.defaults()` and `settings.normalize()` (`modules/<id>/src/settings.ts`) |
| `guideDone` | the shell | the first setup was finished once |

- **Reading** (`apps/desktop/src/config.ts`, `loadConfig`): defensive. A missing or broken file gives the defaults. `parseConfigFile` (`packages/core/src/config.ts`) drops invalid module ids and non-boolean switches.
- **Modules this version does not know** are kept in the file as they are (a newer version wrote them).
- **Version 1** (one flat `settings` object, no `version`) is moved over once at start (`configFromVersion1`); the old file stays next to it as `config.v1.json`.
- **App settings changed:** `ipc.ts` normalizes the change, applies it to the runner, saves the file and calls `modules.appChanged()` when an app key changed.

## Data folders

| | Development (`npm run dev`) | Installed app |
|---|---|---|
| Data folder | the repository | Windows `%APPDATA%\GT Toolz`, macOS `~/Library/Application Support/GT Toolz`, Linux `~/.config/GT Toolz` |
| Settings | `.cache/app-data/config.json` | `config.json` |
| References and the coach's memory | `references/` | `references/` |
| Session logs, telemetry recordings | `captures/` | `sessions/` (the newest 30 logs and 5 recordings are kept) |
| Voice packages | `.cache/tts/` | `voices/` |
| Clip cache | `.cache/voice/` | `cache/voice/` |
| Recorded voice packs | `.cache/voice-packs/` | `voice-packs/` |
| Extra language packs | `language-packs/` | `language-packs/` |

`GTT_DATA_DIR=<folder>` makes the app use another data folder with the installed layout, also in development (useful to test a first start). "Reset data" empties such a folder only if GT Toolz created it (it holds `gt-toolz-data.txt`); see `apps/desktop/src/reset.ts`.

## The UI shell

- `apps/ui/src/app/app.ts` and `app.html`: the title bar, the navigation (Modules, one group per module that is on, the shell's pages) and the mute and volume controls at the bottom.
- `apps/ui/src/app/app.routes.ts`: one route per shell page and one per module (`/<id>/<page>`), guarded by `moduleOn(id)`. A page of a module that is off leads to the start page. The start page is the first page of the first module that is on (the telemetry's Cockpit).
- `apps/ui/src/app/modules.ts` (`MODULE_UIS`) lists every module's `ModuleUi` (`modules/<id>/ui/module.ts`). The Cockpit, the setup assistant and the tour put together what the modules that are on contribute. See [modules.md](modules.md#the-ui-part).
- State lives in NgRx signal stores: `SettingsStore`, `CoachStore`, `VoicesStore`, `RecordingsStore`, `TextsStore`, `UpdatesStore` in `apps/ui/src/app/stores`, and one store per module in `modules/<id>/ui/stores`. Settings are saved optimistically: the store shows the change at once and replaces it with the checked settings the main process returns.
- Texts: `apps/ui/src/app/i18n/{en,de}.ts` for the shell, `modules/<id>/ui/i18n/{en,de}.ts` per module (keys start with the module id). German must have every English key (the type checks it).
