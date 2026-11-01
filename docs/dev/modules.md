# Modules

GT Toolz is a shell with modules. A module brings one feature (the telemetry, the race crew, the OBS overlays, the vibration), can be switched on and off on the Modules page, and keeps its own settings. This page explains how a module is built, then walks through a complete example module.

For where modules sit in the app, see [architecture.md](architecture.md#the-shell-and-its-modules).

## The parts of a module

A module lives in `modules/<id>/` and is its own npm workspace (`@gt-toolz/<id>`):

| Folder | What | May import |
|---|---|---|
| `src/` | The module's contract (`api.ts`: settings type, API type, the id constant), its settings check (`settings.ts`) and logic that needs no Node or Electron | `@gt-toolz/core`, other libraries without Node |
| `main/` | `module.ts` (its `ModuleDefinition`, run by the host in the main process) and `preload.ts` (its part of `window.gtt`) | Node, the runtime; never Electron (`preload.ts`: nothing but `@gt-toolz/core/api` and its own `src`) |
| `ui/` | `module.ts` (its `ModuleUi`), pages, stores, Cockpit cards, setup steps, texts (`i18n/en.ts`, `i18n/de.ts`) | Angular, `@shell/*`, `@gt-toolz/<id>/*` (its `src`) |

Two rules hold for every module:

- **A module never imports Electron and never reaches into another module.** Everything it uses comes from its host or from the factory the shell calls.
- **Everything from the UI or from `config.json` is untrusted.** Settings go through `normalize`, call arguments are checked in the handler.

## ModuleDefinition

The contract between the shell and a module's main part is in `packages/core/src/module.ts`:

```ts
export interface ModuleDefinition<S extends object = object> {
  /** Lower case letters: the key in config.json, the IPC namespace (gtt:<id>:…) and window.gtt.<id>. */
  readonly id: string;
  /** Switched on in a new install. */
  readonly enabledByDefault: boolean;
  /** Cannot be switched off (the telemetry: every other module reads it). */
  readonly required?: boolean;
  readonly settings: ModuleSettings<S>;
  /** Called when the module is switched on (at start, or later by the user). */
  start(host: ModuleHost<S>): ModuleInstance<S>;
}

export interface ModuleSettings<S> {
  /** Every setting with its default. */
  defaults(): S;
  /** Turns untrusted input into complete, valid settings: what is missing or invalid keeps its value from base. */
  normalize(value: unknown, base: S): S;
}

/** A running module. The shell calls these; all but stop() are optional. */
export interface ModuleInstance<S> {
  settingsChanged?(next: S, before: S): void;
  appChanged?(): void;
  feel?(cue: HapticCue, detail?: HapticDetail): void;
  voicesChanged?(phase: 'removing' | 'changed'): void;
  stop(): void | Promise<void>;
}

export interface ModuleHost<S> {
  readonly id: string;
  readonly dev: boolean;
  /** One line in the session log (anonymised when written). */
  log(line: string): void;
  settings(): S;
  /** Validates, saves and announces a change the module makes itself. */
  updateSettings(change: Partial<S>): Promise<S>;
  /** The shell's settings, read only. */
  app(): Readonly<Record<string, unknown>>;
  readonly telemetry: ModuleTelemetry;
  readonly haptics: ModuleHaptics;
  readonly desktop: ModuleDesktop;
  readonly bridge: ModuleBridge;
}
```

The services on the host:

| Member | What |
|---|---|
| `telemetry.onFrame(listener)` | Every `TelemetryFrame` (about 60 a second). Returns a function that stops listening; stopping the module does that too. |
| `telemetry.mode()` | The session's mode: `'race' \| 'practice' \| 'replay' \| 'menu'` (a frozen picture counts as a menu). |
| `telemetry.lastLap()` | The last lap against the target time (`{ lap, timeMs, deltaMs }`), or `undefined`. The coach times the laps, so this needs the coach on and a reference. |
| `haptics.feel(cue, detail?)` | Makes a cue felt through the vibration module (nothing while that is off). |
| `desktop.copyText(text)` | Writes the clipboard from the main process (the UI has no clipboard permission). |
| `desktop.openLocalPage(url)` | Opens `http://127.0.0.1:<port>/…` or `http://localhost:<port>/…` in the browser; anything else is refused. |
| `bridge.handle(name, handler)` | Registers the IPC call `gtt:<id>:<name>`. Arguments come from the UI: check every one. |
| `bridge.send(event, value)` | Sends the event `gtt:<id>:<event>` to the UI. |
| `log(line)` | A line in the session log. Use a 10-character tag like the other lines (`'OVERLAYS  on …'`). |
| `settings()`, `updateSettings(change)` | The module's settings, checked; a change the module makes itself is checked, saved and sent to the UI. |
| `app()` | The shell's settings (language, name …), read only. |

The instance hooks:

| Hook | When |
|---|---|
| `settingsChanged(next, before)` | The module's settings changed (from the UI, or by `updateSettings`). The host has saved them and told the UI. |
| `appChanged()` | An app setting changed (for example the language). |
| `feel(cue, detail)` | The haptics sink: coach or crew made a cue felt. Only a module that feels implements it (the vibration). |
| `voicesChanged(phase)` | `'removing'`: voice packages are about to be removed; close every engine now (Windows locks open files). `'changed'`: packages were installed or removed. |
| `stop()` | Switched off, or the app quits: stop speaking, close servers and engines. The host removes the handlers and frame listeners itself. |

## The module host

`apps/desktop/src/modules.ts` (class `Modules`) runs the definitions passed in `apps/desktop/src/main.ts`.

1. **At start** it reads each module's stored entry (`config.json`, `modules.<id>`) and checks the settings: `normalize(stored.settings, defaults())`. Whether the module is on comes from the file, else `enabledByDefault`; a `required` module is always on.
2. It registers `gtt:<id>:settings` and `gtt:<id>:setSettings` for every module. **These two answer also while the module is off**, so a settings page works before the module runs.
3. `startEnabled()` calls `start(host)` for every module that is on. If `start` throws, the module stays off, the error goes to the log, and everything it registered is taken back.
4. `setEnabled(id, on)` (the Modules page) saves the switch and starts or stops the module. Switches run one after the other.
5. On a settings change it runs `normalize({ ...before, ...change }, before)`, saves, calls `settingsChanged(next, before)` and sends `gtt:<id>:settings` to the UI.
6. On stop it calls `stop()`, then removes every handler and frame listener the module registered through its host.

**Services that are not on the host.** The speech floor and the shell's voices are not part of `ModuleHost`. A module that speaks gets them from the shell in a factory, as the race crew does:

```ts
// apps/desktop/src/main.ts
crewModule({
  telemetry,
  floor: runner.speechFloor,
  voices,
  activity: (body) => runner.activity(body),
  status: (crew, voice) => runner.crewStatus(crew, voice),
}),
```

The tutorial below ends with a sketch of this ([Going further](#going-further-let-the-pit-board-speak)).

## Settings, defaults and normalize

Every setting has its default and its check in one place: `modules/<id>/src/settings.ts`. The host stores them as `modules.<id>.settings` in `config.json`. The on and off switch is **not** a setting; the host keeps it as `modules.<id>.enabled`.

`normalize(value, base)` must:

- accept anything (`undefined`, a string, a hand-edited object) and never throw;
- return a **complete** settings object;
- keep the value from `base` for anything missing or invalid;
- clamp numbers, check strings against a pattern or a list, and drop unknown keys.

The building blocks are in `packages/core/src/normalize.ts`: `clamp(value, min, max, fallback)`, `bool(value, fallback)`, `oneOf(value, options, fallback)`. The crew's check is a good model:

```ts
// modules/crew/src/settings.ts
export function normalizeSettings(value: unknown, base: CrewModuleSettings): CrewModuleSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof CrewModuleSettings, unknown>>;
  return {
    crewSectors: Math.round(clamp(v.crewSectors, 1, 6, base.crewSectors)),
    crewStrategy: bool(v.crewStrategy, base.crewStrategy),
    practiceTyres: bool(v.practiceTyres, base.practiceTyres),
    pitLossSeconds: Math.round(clamp(v.pitLossSeconds, 5, 120, base.pitLossSeconds)),
    crewTalk: oneOf(v.crewTalk, TALK_LEVELS, base.crewTalk),
    bossTakesOver: bool(v.bossTakesOver, base.bossTakesOver),
    bossLaps: Math.round(clamp(v.bossLaps, 1, 5, base.bossLaps)),
  };
}
```

## The bridge: handlers and events

A module's part of `window.gtt` has three pieces:

1. **The contract** in `src/api.ts`: the id constant, the settings type and an API type that extends `ModuleSettingsApi<S>` (`settings()`, `setSettings(change)`, `onSettings(listener)`). Types and constants only; the UI and the main process both import it.
2. **The main part** registers its calls with `host.bridge.handle(name, handler)` and sends events with `host.bridge.send(event, value)`.
3. **The preload part** in `main/preload.ts` builds the API from a `BridgeScope`. `settingsBridge(scope)` provides the three settings calls:

```ts
// modules/haptics/main/preload.ts
export function hapticsBridge(scope: BridgeScope): HapticsApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<HapticSettings>(scope),
    onHaptic: subscribe('haptic'),
    test: (cue) => invoke('test', cue),
  };
}
```

`apps/desktop/src/preload.ts` gives every module its scope (`gtt:<id>:…`) and exposes the result as `window.gtt.<id>`. The preload is bundled into the sandboxed preload script: `main/preload.ts` must not import Node or Electron.

A handler that takes arguments checks them, as the vibration's `test` call does:

```ts
// modules/haptics/main/module.ts
if (!HAPTIC_CUES.includes(cue as HapticCue)) throw new Error('Invalid argument');
```

`asString(value)` and `asObject(value)` from `@gt-toolz/core` cover the common cases.

## The UI part

`modules/<id>/ui/module.ts` exports a `ModuleUi` (`apps/ui/src/app/core/module-ui.ts`). `id`, `name`, `description`, `icon`, `pages` and `routes` are required; the rest is optional:

| Member | What |
|---|---|
| `id` | The module id (a `ModuleId` from `MODULE_IDS`). Its routes are `/<id>/…`, its text keys start with `<id>.` |
| `name`, `description`, `icon` | For the navigation and the Modules page (`icon`: an `IconName` from `apps/ui/src/app/ui/icon.ts`) |
| `required` | Shown as "required" on the Modules page, no switch |
| `pages` | Its pages in the navigation, in order: `{ path, label, icon, badge? }`. The first opens when the module is chosen |
| `routes` | Angular routes below `/<id>/`, usually `loadComponent` (lazy) |
| `actions` | Buttons below its pages (the coach: Calibration); called in an injection context |
| `services` | Classes started with the app while the module is on (the vibration's player) |
| `dialogs` | Components shown over every page while the module is on (the telemetry's "What is this reference?") |
| `titleBar` | A component in the title bar (the telemetry's connection) |
| `cockpit` | Its part of the Cockpit: `cards`, `chips` (in the header), `banners` (above the cards) |
| `guide` | Its part of the setup assistant: `steps`, `checks`, `tips`, `warning` |
| `tour` | Its stops in the tour |

### Routes and pages

`apps/ui/src/app/app.routes.ts` builds one route per module from `MODULE_UIS` and guards it with `moduleOn(id)`: a page of a module that is off leads to the start page. The navigation shows a module's pages only while it is on. A page gets a `data-tour="nav-<id>-<path>"` attribute, which tour stops can point at.

### Stores

A module's UI state lives in an NgRx signal store in `modules/<id>/ui/stores`, `providedIn: 'root'`. The pattern used by every module:

- `withState` with `settings: S | null` and an `error`;
- `load()` reads the settings (and whatever else the module offers);
- `update(change)` is **optimistic**: it shows the change at once, then replaces it with the checked settings `setSettings` returns, or rolls back on an error;
- `withHooks.onInit` loads (only if `BRIDGE_AVAILABLE`) and subscribes to `onSettings` and the module's events.

**Never name a method like a state key.** In a signal store, a method with the same name replaces the state signal (a `board()` method would replace the `board` state).

The Cockpit asks every module for its part, also modules that are off, so a store injected by `cockpit()` loads even while its module is off. Its settings call works then; its own calls do not (their handlers exist only while the module runs). Catch them.

### Texts (i18n)

- `modules/<id>/ui/i18n/en.ts` exports `en` (`as const`) and the key type; every key starts with `<id>.`.
- `modules/<id>/ui/i18n/de.ts` exports `de: Record<KeyType, string>`: the compiler refuses a missing German text.
- `apps/ui/src/app/i18n/i18n.ts` merges them into `TextKey` and `TEXTS`.
- `tests/texts.test.ts` checks that both languages have the same keys and placeholders, and that a module's keys start with its id.
- `{computer}` ("PC" or "Mac") and `{os}` work in every text. A key with a platform suffix (`<key>.mac`, `<key>.linux`) wins over the plain key on that platform.
- Spoken texts never go here: they belong in the language packs ([coach-and-texts.md](coach-and-texts.md)).

### Cockpit cards

```ts
export interface CockpitCard {
  id: string;
  area: CockpitArea;            // 'top' | 'wide' | 'main' | 'side'
  order: number;                // left to right (top to bottom in 'side'), over all modules
  weight?: number;              // its share of the row's width ('top', 'main')
  component: Type<unknown>;
  shown?: Signal<boolean>;      // shown only while true
}
```

"top" is the row with the connection, "wide" the full width below it, "main" and "side" the row below that (side: one column on the right). A module that is off takes its cards with it; the cards of a row share its width, so no gap stays. Current orders: top `session` 10, `live` 20, `callout` 30; wide `race` 10, `learning` 20; main `zones` 10; side `feedback` 10, `timeline` 20.

### Setup assistant and tour

- **Steps** have an `order` among all steps. The shell's: basics 10, voices 40, name 50; telemetry: PlayStation 30, reference 60; coach: calibration 70; vibration 20. "Ready" is always last. `missing` holds the first setup until the step is done; `done` turns "Later" into "Next"; `offer: true` shows the step also while the module is off (the step's own switch turns the module on).
- **Checks, tips and a warning** go on the last step.
- **Tour stops** point at a `data-tour` target. The shell's stops have the orders 60 (Modules) to 120; telemetry 10 to 50, coach 40, overlays 100.

The basics step lists every module that is not `required` with its switch, so a new module appears there by itself.

## The Modules page

`apps/ui/src/app/pages/modules/modules.ts` lists `MODULE_UIS` with a switch each. A switch calls `SettingsStore.setModuleEnabled(id, on)` (optimistic), which calls `gtt.setModuleEnabled(id, on)`. The main process (`ipc.ts`) checks the id against `MODULE_IDS`, switches the module on the host (or, for the coach, the setting `coach`) and sends `gtt:modules` with every module's state. The navigation, the routes, the Cockpit and the setup assistant follow that state.

---

# Tutorial: a pit board module

This tutorial builds a complete module, **Pit board** (`pitboard`): it keeps the last laps the coach timed, shows them on a page and on the Cockpit, and has three settings. It uses every part a module has: a workspace, the contract, settings with defaults and a check, logic, the main part on the host, the preload part, the UI with a page, a store, a Cockpit card and texts in two languages, the registration in the shell, and a test.

The example is not part of the repository. Every snippet below was compiled and tested against the code as it is.

What it does:

- On every frame it reads `host.telemetry.lastLap()`. A lap it has not seen goes on top of the board; the board keeps the newest `laps` laps and the best one since it was cleared.
- The UI reads the board with `gtt.pitboard.board()`, gets new boards from `onBoard`, and can clear it.
- Settings: `laps` (1 to 10, default 5), `showDelta` (each lap against the target time), `cockpitCard` (the card on the Cockpit).

Files:

```
modules/pitboard/
  package.json
  src/api.ts                 the contract (window.gtt.pitboard)
  src/settings.ts            defaults and normalize
  src/board.ts               the board logic (no Node)
  main/module.ts             the ModuleDefinition
  main/preload.ts            its part of window.gtt
  ui/module.ts               its ModuleUi
  ui/stores/pitboard.store.ts
  ui/pages/board/board.ts
  ui/cockpit/board-card.ts
  ui/i18n/en.ts
  ui/i18n/de.ts
tests/pitboard.test.ts
```

Files of the shell that change: `packages/runtime/src/app-api.ts`, `apps/desktop/package.json`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `apps/ui/tsconfig.json`, `apps/ui/src/app/core/gtt.ts`, `apps/ui/src/app/modules.ts`, `apps/ui/src/app/i18n/i18n.ts`, `tests/texts.test.ts`, `scripts/release/1-build.mjs`.

## Step 1: the workspace

`modules/pitboard/package.json`. Take `version` and `license` from the root `package.json` (the release build refuses a version that differs):

```json
{
  "name": "@gt-toolz/pitboard",
  "version": "1.0.0-beta",
  "license": "GPL-3.0-only",
  "private": true,
  "type": "module",
  "description": "The pit board, a GT Toolz module: the last laps the coach timed, on a page and on the Cockpit. src: no Node or Electron (the UI uses its contract); main: the module in the main process, through its host",
  "exports": {
    "./api": "./src/api.ts",
    "./settings": "./src/settings.ts",
    "./main": "./main/module.ts",
    "./preload": "./main/preload.ts"
  },
  "dependencies": {
    "@gt-toolz/core": "*",
    "@gt-toolz/telemetry": "*"
  }
}
```

The root `package.json` already includes `modules/*` as workspaces. Link the new one:

```bash
npm install
```

This creates `node_modules/@gt-toolz/pitboard` and adds the workspace to `package-lock.json`. It downloads nothing (`.npmrc` keeps install scripts off). Commit the lockfile change with the module.

## Step 2: the contract

`modules/pitboard/src/api.ts`. Types and constants only:

```ts
// The pit board's part of the contract between the UI and the main process (window.gtt.pitboard): its settings and
// the board. Types and constants only: the UI and the main process import this.

import type { ModuleSettingsApi, Unsubscribe } from '@gt-toolz/core/api';

export const PITBOARD = 'pitboard';

export interface PitboardSettings {
  /** How many laps the board shows, newest first (1 .. 10). */
  laps: number;
  /** Each lap against the reference's target time. */
  showDelta: boolean;
  /** The board's card on the Cockpit. */
  cockpitCard: boolean;
}

/** One lap on the board. */
export interface PitboardLap {
  lap: number;
  timeMs: number;
  /** Against the target time; positive: slower. */
  deltaMs: number;
}

export interface PitBoard {
  /** Newest first. */
  laps: PitboardLap[];
  /** The fastest lap since the board was cleared. */
  bestMs?: number;
}

export interface PitboardApi extends ModuleSettingsApi<PitboardSettings> {
  board(): Promise<PitBoard>;
  /** A lap came in, or the board was cleared. */
  onBoard(listener: (board: PitBoard) => void): Unsubscribe;
  clear(): Promise<void>;
}
```

## Step 3: settings

`modules/pitboard/src/settings.ts`:

```ts
// The pit board's settings: their defaults and the check of everything that comes from the UI or config.json.

import { bool, clamp } from '@gt-toolz/core';
import type { PitboardSettings } from './api';

export function defaultSettings(): PitboardSettings {
  return { laps: 5, showDelta: true, cockpitCard: true };
}

export function normalizeSettings(value: unknown, base: PitboardSettings): PitboardSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof PitboardSettings, unknown>>;
  return {
    laps: Math.round(clamp(v.laps, 1, 10, base.laps)),
    showDelta: bool(v.showDelta, base.showDelta),
    cockpitCard: bool(v.cockpitCard, base.cockpitCard),
  };
}
```

## Step 4: the board logic

`modules/pitboard/src/board.ts`. Pure logic without Node, so a test can use it directly:

```ts
// The board itself: the laps the coach timed, newest first. No Node or Electron here (the tests use it directly).

import type { LapTime } from '@gt-toolz/core';
import type { PitBoard } from './api';

/** The board with a new lap on top, at most `keep` laps, and the best lap since it was cleared. */
export function withLap(board: PitBoard, lap: LapTime, keep: number): PitBoard {
  return {
    laps: [{ lap: lap.lap, timeMs: lap.timeMs, deltaMs: lap.deltaMs }, ...board.laps].slice(0, keep),
    bestMs: board.bestMs === undefined ? lap.timeMs : Math.min(board.bestMs, lap.timeMs),
  };
}
```

## Step 5: the main part

`modules/pitboard/main/module.ts`. Off by default. It listens to frames, answers two calls and sends one event:

```ts
// The pit board in the main process: every lap the coach times goes on the board, which the UI shows
// (window.gtt.pitboard). Everything it uses comes from its host (packages/core/src/module.ts); the shell takes its
// calls and its frame listener back when it stops.

import type { ModuleDefinition } from '@gt-toolz/core';
import { formatLapTime } from '@gt-toolz/telemetry';
import { PITBOARD, type PitBoard, type PitboardSettings } from '../src/api';
import { withLap } from '../src/board';
import { defaultSettings, normalizeSettings } from '../src/settings';

export const pitboardModule: ModuleDefinition<PitboardSettings> = {
  id: PITBOARD,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },

  start(host) {
    const { handle, send } = host.bridge;
    let board: PitBoard = { laps: [] };
    /** The last lap put on the board ("lap:time"), so a lap goes on it once. */
    let seen: string | undefined;

    const show = (next: PitBoard) => {
      board = next;
      send('board', board);
    };

    // The coach times the laps; a new one shows up in lastLap(). Reading it on every frame is cheap.
    host.telemetry.onFrame(() => {
      const lap = host.telemetry.lastLap();
      if (!lap) return;
      const key = `${lap.lap}:${lap.timeMs}`;
      if (key === seen) return;
      seen = key;
      host.log(`PITBOARD  lap ${lap.lap}: ${formatLapTime(lap.timeMs)}`);
      show(withLap(board, lap, host.settings().laps));
    });

    // --- Calls from the UI ---
    handle('board', () => board);
    handle('clear', () => show({ laps: [] }));

    return {
      settingsChanged(next) {
        if (board.laps.length > next.laps) show({ ...board, laps: board.laps.slice(0, next.laps) });
      },
      // Nothing of its own to close: the host removes the frame listener and the calls.
      stop() {},
    };
  },
};
```

Neither call takes arguments, so there is nothing to check. A call that does take arguments must check each one (`asString`, a list of known values, a clamp).

## Step 6: the preload part

`modules/pitboard/main/preload.ts`. No Node or Electron imports: it is bundled into the sandboxed preload.

```ts
// The pit board's part of the preload (window.gtt.pitboard): a fixed set of calls within its own namespace. Bundled
// into the sandboxed preload (apps/desktop/src/preload.ts): no Node or Electron imports here.

import { settingsBridge, type BridgeScope } from '@gt-toolz/core/api';
import type { PitboardApi, PitboardSettings } from '../src/api';

export function pitboardBridge(scope: BridgeScope): PitboardApi {
  const { invoke, subscribe } = scope;
  return {
    ...settingsBridge<PitboardSettings>(scope),
    board: () => invoke('board'),
    onBoard: subscribe('board'),
    clear: () => invoke('clear'),
  };
}
```

## Step 7: register it in the main process

**`packages/runtime/src/app-api.ts`**: add the id to `MODULE_IDS` (the order is the navigation's):

```ts
export const MODULE_IDS = ['telemetry', 'coach', 'crew', 'overlays', 'haptics', 'pitboard'] as const;
```

`ModuleId`, `AppConfig.modules`, the `setModuleEnabled` check in `ipc.ts` and the order in `config.json` all follow from this list.

**`apps/desktop/package.json`**: add the dependency next to the other modules:

```json
"@gt-toolz/pitboard": "*",
```

**`apps/desktop/src/main.ts`**: import the definition and add it to the module list:

```ts
import { pitboardModule } from '@gt-toolz/pitboard/main';
```

```ts
    [
      telemetryModule(telemetry, dirs.references),
      crewModule({ … }),
      overlaysModule(path.join(__dirname, 'overlay-client.js')),
      hapticsModule,
      pitboardModule,
    ],
```

**`apps/desktop/src/preload.ts`**: import the contract and the bridge, add both to `api`:

```ts
import { PITBOARD, type PitboardApi } from '@gt-toolz/pitboard/api';
import { pitboardBridge } from '@gt-toolz/pitboard/preload';
```

```ts
const api: GttApi & { [TELEMETRY]: TelemetryApi; [CREW]: CrewApi; [OVERLAYS]: OverlaysApi; [HAPTICS]: HapticsApi; [PITBOARD]: PitboardApi } = {
  // …
  [HAPTICS]: hapticsBridge(scope(HAPTICS)),
  [PITBOARD]: pitboardBridge(scope(PITBOARD)),
};
```

**`scripts/release/1-build.mjs`**: add `'modules/pitboard'` to the list of workspaces whose version must match the root's.

## Step 8: texts

`modules/pitboard/ui/i18n/en.ts`:

```ts
// English texts of the pit board module. Its keys start with the module's id; German (de.ts) must have the same keys.

export const en = {
  'pitboard.module.name': 'Pit board',
  'pitboard.module.description': 'The last laps the coach timed, against the target time: on a page of its own and on the Cockpit.',
  'pitboard.nav.board': 'Pit board',
  'pitboard.title': 'Pit board',
  'pitboard.empty': 'No lap yet. The coach times your laps while it coaches with a reference.',
  'pitboard.lap': 'Lap {lap}',
  'pitboard.clear': 'Clear the board',
  'pitboard.settings': 'Settings',
  'pitboard.laps': 'Laps on the board',
  'pitboard.lapsHint': 'The newest first.',
  'pitboard.showDelta': 'Against the target time',
  'pitboard.showDeltaHint': 'Each lap with its difference to the reference’s target time.',
  'pitboard.cockpitCard': 'On the Cockpit',
  'pitboard.cockpitCardHint': 'A small board below the timeline.',
  'pitboard.tour.board': 'Pit board',
  'pitboard.tour.boardText': 'Your last laps and the best one, against the target time.',
} as const;

export type PitboardTextKey = keyof typeof en;
```

`modules/pitboard/ui/i18n/de.ts`:

```ts
// Deutsche Texte des Boxentafel-Moduls. Gleiche Schlüssel wie en.ts (der Typ prüft es).

import type { PitboardTextKey } from './en';

export const de: Record<PitboardTextKey, string> = {
  'pitboard.module.name': 'Boxentafel',
  'pitboard.module.description': 'Die letzten Runden, die der Coach gestoppt hat, gegen die Zielzeit: auf einer eigenen Seite und im Cockpit.',
  'pitboard.nav.board': 'Boxentafel',
  'pitboard.title': 'Boxentafel',
  'pitboard.empty': 'Noch keine Runde. Der Coach stoppt deine Runden, während er mit einer Referenz coacht.',
  'pitboard.lap': 'Runde {lap}',
  'pitboard.clear': 'Tafel leeren',
  'pitboard.settings': 'Einstellungen',
  'pitboard.laps': 'Runden auf der Tafel',
  'pitboard.lapsHint': 'Die neueste zuerst.',
  'pitboard.showDelta': 'Gegen die Zielzeit',
  'pitboard.showDeltaHint': 'Jede Runde mit ihrem Abstand zur Zielzeit der Referenz.',
  'pitboard.cockpitCard': 'Im Cockpit',
  'pitboard.cockpitCardHint': 'Eine kleine Tafel unter der Zeitleiste.',
  'pitboard.tour.board': 'Boxentafel',
  'pitboard.tour.boardText': 'Deine letzten Runden und die beste, gegen die Zielzeit.',
};
```

## Step 9: the store

`modules/pitboard/ui/stores/pitboard.store.ts`:

```ts
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withState } from '@ngrx/signals';
import type { PitBoard, PitboardSettings } from '@gt-toolz/pitboard/api';
import { BRIDGE_AVAILABLE, GTT } from '@shell/core/gtt';

interface PitboardState {
  settings: PitboardSettings | null;
  board: PitBoard;
  error: string | null;
}

/** The pit board (window.gtt.pitboard): its settings and the laps on it. */
export const PitboardStore = signalStore(
  { providedIn: 'root' },
  withState<PitboardState>({ settings: null, board: { laps: [] }, error: null }),
  withComputed(({ settings }) => ({
    /** The Cockpit shows the card while this is true. */
    cockpitCard: computed(() => settings()?.cockpitCard ?? false),
  })),
  withMethods((store, gtt = inject(GTT)) => ({
    async load(): Promise<void> {
      // The settings calls are answered also while the module is off ...
      patchState(store, { settings: await gtt.pitboard.settings() });
      // ... its own calls only while it runs (the Cockpit asks every module for its cards, also those that are off).
      const board = await gtt.pitboard.board().catch(() => undefined);
      if (board) patchState(store, { board });
    },

    /** Optimistic: the page shows the change at once, the main process returns the checked settings. */
    async update(change: Partial<PitboardSettings>): Promise<void> {
      const settings = store.settings();
      if (!settings) return;
      patchState(store, { settings: { ...settings, ...change }, error: null });
      try {
        patchState(store, { settings: await gtt.pitboard.setSettings(change) });
      } catch (err) {
        patchState(store, { settings, error: (err as Error).message });
      }
    },

    /** Not named "board": a method must never have a state key's name. */
    clearBoard(): Promise<void> {
      return gtt.pitboard.clear();
    },
  })),
  withHooks({
    onInit(store, gtt = inject(GTT)) {
      if (!BRIDGE_AVAILABLE) return;
      void store.load();
      gtt.pitboard.onSettings((settings) => patchState(store, { settings }));
      gtt.pitboard.onBoard((board) => patchState(store, { board }));
    },
  }),
);
```

## Step 10: the page

`modules/pitboard/ui/pages/board/board.ts`. It uses the shell's global classes (`page`, `card`, `setting` …, in `apps/ui/src/styles.css`) and its controls (`gtt-icon`, `gtt-slider`, `gtt-toggle`):

```ts
import { Component, inject } from '@angular/core';
import { deltaSeconds, lapTime } from '@shell/core/format';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { PitboardStore } from '../../stores/pitboard.store';

/** The pit board: the last laps against the target time, and the module's settings. */
@Component({
  selector: 'gtt-pitboard',
  imports: [Icon, Slider, Toggle],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('pitboard.module.name') }}</div>
          <h1>{{ t('pitboard.title') }}</h1>
        </div>
        <div class="actions row wrap">
          <button type="button" class="btn sm" (click)="store.clearBoard()"><gtt-icon name="trash" [size]="14" />{{ t('pitboard.clear') }}</button>
        </div>
      </div>

      @let board = store.board();
      @let s = store.settings();
      <div class="stack">
        <section class="card">
          @for (lap of board.laps; track $index) {
            <div class="lap-row">
              <span class="muted">{{ t('pitboard.lap', { lap: lap.lap }) }}</span>
              <span class="num time" [class.best]="lap.timeMs === board.bestMs">{{ lapTime(lap.timeMs) }}</span>
              @if (s?.showDelta) {
                <span class="num delta" [class.bad]="lap.deltaMs > 50" [class.good]="lap.deltaMs < -50">{{ delta(lap.deltaMs) }}</span>
              }
            </div>
          } @empty {
            <p class="muted">{{ t('pitboard.empty') }}</p>
          }
        </section>

        @if (s) {
          <section class="card">
            <div class="card-header">
              <div class="card-icon"><gtt-icon name="sliders" /></div>
              <h2>{{ t('pitboard.settings') }}</h2>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('pitboard.laps') }}</div>
                <div class="hint">{{ t('pitboard.lapsHint') }}</div>
              </div>
              <div class="control wide">
                <gtt-slider [value]="s.laps" [min]="1" [max]="10" [label]="t('pitboard.laps')" (changed)="store.update({ laps: $event })" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('pitboard.showDelta') }}</div>
                <div class="hint">{{ t('pitboard.showDeltaHint') }}</div>
              </div>
              <div class="control">
                <gtt-toggle [checked]="s.showDelta" [label]="t('pitboard.showDelta')" (checkedChange)="store.update({ showDelta: $event })" />
              </div>
            </div>
            <div class="setting">
              <div class="text">
                <div class="title">{{ t('pitboard.cockpitCard') }}</div>
                <div class="hint">{{ t('pitboard.cockpitCardHint') }}</div>
              </div>
              <div class="control">
                <gtt-toggle [checked]="s.cockpitCard" [label]="t('pitboard.cockpitCard')" (checkedChange)="store.update({ cockpitCard: $event })" />
              </div>
            </div>
          </section>
        }
      </div>
    </div>
  `,
  styles: `
    .lap-row { display: grid; grid-template-columns: 1fr auto 90px; gap: 12px; align-items: baseline; padding: 6px 0; }
    .time { font-family: var(--font-display); font-size: 22px; font-weight: 650; }
    .time.best { color: var(--ok); }
    .delta { text-align: right; color: var(--text-2); }
    .delta.bad { color: #ff8aa0; }
    .delta.good { color: var(--ok); }
  `,
})
export class Board {
  protected readonly store = inject(PitboardStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly lapTime = lapTime;

  protected delta(ms: number): string {
    return deltaSeconds(ms, this.i18n.locale());
  }
}
```

## Step 11: the Cockpit card

`modules/pitboard/ui/cockpit/board-card.ts`:

```ts
import { Component, inject } from '@angular/core';
import { lapTime } from '@shell/core/format';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { PitboardStore } from '../stores/pitboard.store';

/** The newest three laps on the Cockpit, below the timeline. */
@Component({
  selector: 'gtt-pitboard-card',
  imports: [Icon],
  template: `
    <section class="card">
      <div class="card-header">
        <div class="card-icon"><gtt-icon name="timer" /></div>
        <h2>{{ t('pitboard.title') }}</h2>
      </div>
      @let board = store.board();
      @for (lap of board.laps.slice(0, 3); track $index) {
        <div class="lap-row">
          <span class="muted">{{ t('pitboard.lap', { lap: lap.lap }) }}</span>
          <span class="num" [class.best]="lap.timeMs === board.bestMs">{{ lapTime(lap.timeMs) }}</span>
        </div>
      } @empty {
        <p class="faint small">{{ t('pitboard.empty') }}</p>
      }
    </section>
  `,
  styles: `
    .lap-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .best { color: var(--ok); }
  `,
})
export class BoardCard {
  protected readonly store = inject(PitboardStore);
  protected readonly t = inject(I18n).t;
  protected readonly lapTime = lapTime;
}
```

## Step 12: the module's UI definition

`modules/pitboard/ui/module.ts`:

```ts
// The pit board in the UI: its page, its card on the Cockpit and its stop in the tour (the shell's extension points
// are in apps/ui/src/app/core/module-ui.ts).

import { inject } from '@angular/core';
import type { ModuleCockpit, ModuleUi } from '@shell/core/module-ui';
import { BoardCard } from './cockpit/board-card';
import { PitboardStore } from './stores/pitboard.store';

function cockpit(): ModuleCockpit {
  const store = inject(PitboardStore);
  return {
    // In the right column, below the coach's feedback (10) and the telemetry's timeline (20).
    cards: [{ id: 'pitboard', area: 'side', order: 30, component: BoardCard, shown: store.cockpitCard }],
  };
}

export const pitboardUi: ModuleUi = {
  id: 'pitboard',
  name: 'pitboard.module.name',
  description: 'pitboard.module.description',
  icon: 'timer',
  pages: [{ path: 'board', label: 'pitboard.nav.board', icon: 'timer' }],
  routes: [{ path: 'board', loadComponent: () => import('./pages/board/board').then((m) => m.Board) }],
  cockpit,
  tour: [{ target: 'nav-pitboard-board', order: 105, title: 'pitboard.tour.board', text: 'pitboard.tour.boardText' }],
};
```

`cockpit()` runs in the Cockpit's injection context, so it may `inject` the store. The tour target `nav-pitboard-board` is the navigation entry of the page `board`.

## Step 13: register it in the UI

**`apps/ui/tsconfig.json`**: the alias for the module's contract, next to the others:

```json
"@gt-toolz/pitboard/*": ["../../modules/pitboard/src/*"],
```

**`apps/ui/src/app/core/gtt.ts`**: the module's namespace on the bridge type:

```ts
import type { PitboardApi } from '@gt-toolz/pitboard/api';

export type GttBridge = GttApi & { telemetry: TelemetryApi; crew: CrewApi; overlays: OverlaysApi; haptics: HapticsApi; pitboard: PitboardApi };
```

**`apps/ui/src/app/modules.ts`**: the module's UI, in the same order as `MODULE_IDS`:

```ts
import { pitboardUi } from '@modules/pitboard/ui/module';

export const MODULE_UIS: readonly ModuleUi[] = [telemetryUi, coachUi, crewUi, overlaysUi, hapticsUi, pitboardUi];
```

**`apps/ui/src/app/i18n/i18n.ts`**: the texts:

```ts
import { de as pitboardDe } from '@modules/pitboard/ui/i18n/de';
import { en as pitboardEn, type PitboardTextKey } from '@modules/pitboard/ui/i18n/en';

export type TextKey = ShellTextKey | TelemetryTextKey | CoachTextKey | CrewTextKey | OverlaysTextKey | HapticsTextKey | PitboardTextKey;

const TEXTS: Record<UiLanguage, Record<TextKey, string>> = {
  de: { ...de, ...telemetryDe, ...coachDe, ...crewDe, ...overlaysDe, ...hapticsDe, ...pitboardDe },
  en: { ...en, ...telemetryEn, ...coachEn, ...crewEn, ...overlaysEn, ...hapticsEn, ...pitboardEn },
};
```

The Modules page, the navigation, the routes, the Cockpit, the setup assistant's basics and the tour pick the module up from `MODULE_UIS`.

## Step 14: tests

`tests/pitboard.test.ts`. The module runs on a host of its own, like `tests/haptics.test.ts` does it:

```ts
// The pit board (modules/pitboard): its settings, and the module on a host of its own: a lap goes on the board once,
// newest first, the board keeps as many laps as set, and "clear" empties it.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LapTime, ModuleHost } from '../packages/core/src/index';
import type { TelemetryFrame } from '../packages/telemetry/src/packet';
import { pitboardModule } from '../modules/pitboard/main/module';
import type { PitBoard, PitboardSettings } from '../modules/pitboard/src/api';
import { defaultSettings, normalizeSettings } from '../modules/pitboard/src/settings';

test('settings: defaults, and anything broken keeps the value before', () => {
  const base = defaultSettings();
  assert.deepEqual(normalizeSettings(undefined, base), base);
  assert.deepEqual(normalizeSettings({ laps: 99, showDelta: 'yes', cockpitCard: false }, base), { laps: 10, showDelta: true, cockpitCard: false });
});

/** The module on a host of its own: frames come from the test, and what it sends is kept. */
function start(settings: PitboardSettings = defaultSettings()) {
  let lastLap: LapTime | undefined;
  const frameListeners = new Set<(frame: TelemetryFrame) => void>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const boards: PitBoard[] = [];
  const host: ModuleHost<PitboardSettings> = {
    id: 'pitboard',
    dev: false,
    log: () => undefined,
    settings: () => settings,
    updateSettings: async () => settings,
    app: () => ({}),
    telemetry: {
      onFrame: (listener) => {
        frameListeners.add(listener);
        return () => frameListeners.delete(listener);
      },
      mode: () => 'practice',
      lastLap: () => lastLap,
    },
    haptics: { feel: () => undefined },
    desktop: { copyText: () => undefined, openLocalPage: async () => undefined },
    bridge: {
      handle: (name, handler) => void handlers.set(name, handler),
      send: (event, value) => {
        if (event === 'board') boards.push(value as PitBoard);
      },
    },
  };
  const instance = pitboardModule.start(host);
  /** The coach timed a lap, then a frame arrives. */
  const lap = (value: LapTime) => {
    lastLap = value;
    for (const listener of frameListeners) listener({} as TelemetryFrame);
  };
  return { instance, handlers, boards, lap };
}

test('a lap goes on the board once, newest first, with the best lap', () => {
  const { instance, boards, lap } = start({ ...defaultSettings(), laps: 2 });
  lap({ lap: 1, timeMs: 92_500, deltaMs: 1500 });
  lap({ lap: 1, timeMs: 92_500, deltaMs: 1500 });
  assert.equal(boards.length, 1, 'the same lap twice is one');
  lap({ lap: 2, timeMs: 90_800, deltaMs: -200 });
  lap({ lap: 3, timeMs: 91_100, deltaMs: 100 });
  assert.deepEqual(
    boards.at(-1)!.laps.map((l) => l.lap),
    [3, 2],
    'at most two laps',
  );
  assert.equal(boards.at(-1)!.bestMs, 90_800);
  void instance.stop();
});

test('the UI reads the board and clears it', async () => {
  const { instance, handlers, lap } = start();
  lap({ lap: 4, timeMs: 95_000, deltaMs: 0 });
  assert.equal(((await handlers.get('board')!()) as PitBoard).laps.length, 1);
  await handlers.get('clear')!();
  assert.deepEqual(await handlers.get('board')!(), { laps: [] });
  void instance.stop();
});
```

**`tests/texts.test.ts`**: add the module's texts, so the language check and the key prefix check cover them:

```ts
import { de as pitboardDe } from '../modules/pitboard/ui/i18n/de';
import { en as pitboardEn } from '../modules/pitboard/ui/i18n/en';

const de: Record<string, string> = { ...shellDe, ...telemetryDe, ...coachDe, ...crewDe, ...overlaysDe, ...hapticsDe, ...pitboardDe };
const en: Record<string, string> = { ...shellEn, ...telemetryEn, ...coachEn, ...crewEn, ...overlaysEn, ...hapticsEn, ...pitboardEn };
```

and in the test "a module's texts start with its id":

```ts
    ['pitboard', pitboardEn],
```

The host itself is covered by `tests/modules.test.ts` (settings checked, calls and listeners taken back on stop); a module does not need to test that again.

## Step 15: check it

```bash
npm run typecheck                 # the module's src and main, the registration, the test
npm test                          # tests/pitboard.test.ts, tests/texts.test.ts and the rest
npm run build -w @gt-toolz/ui     # the UI part (strict templates)
npm run dev
```

In the app: open **Modules**, switch on **Pit board**. Its page appears in the navigation and, with "On the Cockpit" on, its card on the Cockpit. To see laps without a PS5, replay a recording with the fake PS5 and coach it with a reference that fits the recording ([testing.md](testing.md#without-a-ps5)).

## Checklist for a new module

- [ ] `modules/<id>/package.json` with `exports` for `./api`, `./settings`, `./main`, `./preload`; `npm install` run; lockfile committed
- [ ] `src/api.ts` (id constant, settings type, API extending `ModuleSettingsApi`), types and constants only
- [ ] `src/settings.ts` with `defaults()` and a `normalize` that never throws and returns complete settings
- [ ] `main/module.ts`: a `ModuleDefinition`; every argument from the UI checked; `stop()` closes what the module opened
- [ ] `main/preload.ts` without Node or Electron imports
- [ ] the id in `MODULE_IDS` (`packages/runtime/src/app-api.ts`)
- [ ] `apps/desktop/package.json`, `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`
- [ ] `scripts/release/1-build.mjs` version list
- [ ] `ui/module.ts`, pages, store, texts in `en.ts` and `de.ts` with keys starting with the id
- [ ] `apps/ui/tsconfig.json`, `apps/ui/src/app/core/gtt.ts`, `apps/ui/src/app/modules.ts`, `apps/ui/src/app/i18n/i18n.ts`
- [ ] a test in `tests/`, and the texts in `tests/texts.test.ts`
- [ ] no network access; if the module needs one, it needs a reason in `tests/network.test.ts` and a review ([security.md](security.md#network))
- [ ] a new runtime dependency only after review, and then on the licenses page and in `THIRD-PARTY-NOTICES.md` ([security.md](security.md#dependency-policy))
- [ ] user documentation in `docs/user/`, and a line under `## [Unreleased]` in `CHANGELOG.md`

## Going further: let the pit board speak

The host has no voice. A module that speaks gets the speech floor and the shell's voices from the shell, the way `crewModule(shell)` does. A sketch, type-checked against the runtime, that says each lap with the crew's voice and text ("Lap 3: one minute 33.8. New best lap!"):

```ts
import type { ModuleDefinition } from '@gt-toolz/core';
import type { ClipVoice, ShellVoices, SpeechFloor, VoiceSettings } from '@gt-toolz/runtime';
import { PITBOARD, type PitBoard, type PitboardSettings } from '../src/api';
import { withLap } from '../src/board';
import { defaultSettings, normalizeSettings } from '../src/settings';

/** What the shell gives the pit board besides its host, as crewModule gets it. */
export interface PitboardShell {
  floor: SpeechFloor;
  voices: ShellVoices;
}

export function pitboardModule(shell: PitboardShell): ModuleDefinition<PitboardSettings> {
  return {
    id: PITBOARD,
    enabledByDefault: false,
    settings: { defaults: defaultSettings, normalize: normalizeSettings },

    start(host) {
      const { floor, voices } = shell;
      // The voices read the app's settings (language, voice per role, volume …).
      const app = () => host.app() as unknown as VoiceSettings;
      const phrases = voices.phrases(voices.languageOf(app(), 'crew'));
      let voice: ClipVoice | undefined;
      const openVoice = async () => {
        try {
          // Which voices are installed decides which one speaks.
          await voices.ensureListed();
          voice = await voices.open({ id: voices.resolve(app(), 'crew'), role: 'crew', locale: phrases.locale, spoken: (text) => phrases.spoken(text), clips: {}, channel: 'crew' });
        } catch (err) {
          host.log(`ERROR     pit board voice: ${(err as Error).message}`);
        }
      };
      void openVoice();

      let board: PitBoard = { laps: [] };
      let seen: string | undefined;
      let clips = 0;
      host.telemetry.onFrame(() => {
        const lap = host.telemetry.lastLap();
        if (!lap) return;
        const key = `${lap.lap}:${lap.timeMs}`;
        if (key === seen) return;
        seen = key;
        const best = board.bestMs;
        board = withLap(board, lap, host.settings().laps);
        host.bridge.send('board', board);
        const speaker = voice;
        if (!speaker) return;
        // "Lap 3: one minute 33.8. New best lap!" (the crew's text, in the crew's language).
        const text = phrases.crewLap(lap.lap, lap.timeMs, best === undefined ? undefined : lap.timeMs < best ? 'new' : lap.timeMs - best);
        const clip = `pitboard-${clips++ % 4}`;
        void speaker
          .prepare(clip, text)
          .then((seconds) => floor.announce({ text, seconds, until: Date.now() + 20_000, speaker, haptic: 'message', play: () => speaker.play(clip) }))
          .catch((err: Error) => host.log(`ERROR     pit board: ${err.message}`));
      });

      const close = () => {
        if (voice) floor.drop(voice);
        voice?.close();
        voice = undefined;
      };
      return {
        // 'removing': no engine may run while packages are removed. 'changed': another voice may fit now.
        voicesChanged(phase) {
          close();
          if (phase === 'changed') void openVoice();
        },
        stop: close,
      };
    },
  };
}
```

and in `apps/desktop/src/main.ts`:

```ts
pitboardModule({ floor: runner.speechFloor, voices }),
```

What a real speaking module adds on top (see `modules/crew/main/session.ts`): reacting to `appChanged()` (another language, another voice), recorded voice packs (`voices.recordings(settings, role)` and the `recordings` event), the radio effect (`effect: 'radio'`), and the decision whether it should speak at all while the crew already announces the lap. Anything spoken must be a language pack text ([coach-and-texts.md](coach-and-texts.md)).
