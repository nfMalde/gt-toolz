# GT Toolz developer documentation

GT Toolz is a desktop app for Gran Turismo 7. It reads the UDP telemetry that GT7 sends from a PS5 on the home network. A coach and a race crew speak calls in the driver's ear. OBS overlays and vibration are optional modules.

The app is an Electron main process with an Angular 22 UI (zoneless, signals, NgRx signal stores), written in TypeScript and organised as npm workspaces.

- **Version:** GT Toolz 1.0.0 Beta.
- **Repository:** <https://github.com/nfMalde/gt-toolz>
- **License:** GPL-3.0-only ([LICENSE](../../LICENSE)). Third-party components: [THIRD-PARTY-NOTICES.md](../../THIRD-PARTY-NOTICES.md).
- **Contributions:** pull requests to `main`, under the [contributor license agreement](../../CLA.md) (the CLA bot asks on the first pull request). How to contribute: [CONTRIBUTING.md](../../CONTRIBUTING.md). Security issues: [SECURITY.md](../../SECURITY.md), never in a public issue.
- **Using the app** (not building it): [user guide](../user/README.md).

## Prerequisites

| What | Version | Why |
|---|---|---|
| Node.js | 22.23.2 (the CI uses this version) | `package.json` requires `>=22.22.3`; Angular CLI 22 needs at least 22.22.3 |
| npm | the one that comes with Node | workspaces, `npm ci` |
| Git | any recent | |
| OS | Windows 10/11 x64, Linux x64 (Ubuntu 22.04 or later), macOS 13 or later | Electron 43 |

The repository's `.npmrc` hardens every install:

```ini
ignore-scripts=true
save-exact=true
fund=false
```

- `ignore-scripts=true`: no package runs an install script. One consequence: the Electron binary is not downloaded by `npm ci`. You fetch it once with `node node_modules/electron/install.js` (see below).
- `save-exact=true`: `npm install <pkg>` writes an exact version, never `^` or `~`.

Read [security.md](security.md#dependency-policy) before you add or update any dependency.

## Clone, install, run, test

```bash
git clone https://github.com/nfMalde/gt-toolz.git
cd gt-toolz
npm ci                                  # exactly the lockfile, no install scripts
node node_modules/electron/install.js   # once: the Electron binary, checked against its checksums
npm run dev                             # Angular dev server + main process in watch mode + Electron
```

In a second terminal:

```bash
npm run typecheck   # TypeScript for packages, modules, tools, the main process and the tests
npm test            # node:test via tsx, every tests/*.test.ts
npm run build:app   # the UI (strict templates) and the main process, as the PR build does
```

The UI is type-checked by the Angular build, not by `npm run typecheck`. The PR build runs these three on Windows, Linux and macOS ([building.md](building.md#ci)).

**No PS5?** Replay a recording with the fake PS5 and set the PS5 address to `127.0.0.1` in the app:

```bash
npm run fake-ps5 -- --replay captures/<file>.gtcap
```

Details: [testing.md](testing.md#without-a-ps5).

In development the app keeps its data in the repository (`.cache/`, `references/`, `captures/`, `language-packs/`), all ignored by Git. [architecture.md](architecture.md#data-folders) lists every folder.

## Pages

| Page | What it covers |
|---|---|
| [architecture.md](architecture.md) | The processes, the shell and its modules, the module host, how a UDP packet becomes speech, the bridge (`window.gtt`), config v2 |
| [code-map.md](code-map.md) | Every workspace and important folder and file, with its main APIs |
| [modules.md](modules.md) | How modules work, and a tutorial that builds a complete example module |
| [telemetry.md](telemetry.md) | The GT7 packet, decryption, fields and flags, mode detection, laps, race start and end, track detection, references |
| [coach-and-texts.md](coach-and-texts.md) | The coach engine, language packs, own texts, adding or changing a spoken text, adding a language |
| [voices.md](voices.md) | Speech engines, the voice catalogue, downloads, recorded voice packs, the radio filter, licensing rules |
| [testing.md](testing.md) | Type check, tests and their helpers, offline simulation, testing without a PS5 |
| [building.md](building.md) | Dev mode, production build, the release scripts, installers on Windows, macOS and Linux, CI |
| [security.md](security.md) | The security model, network rules and the dependency policy |

## Ground rules for contributions

- **Docs and code comments in English.** Short sentences, real names.
- **Tests with every change.** `npm run typecheck`, `npm test` and `npm run build:app` pass before a pull request.
- **Changes users notice** get a line under `## [Unreleased]` in [CHANGELOG.md](../../CHANGELOG.md).
- **No new dependency without review** ([security.md](security.md#dependency-policy)).
- **No network access** beyond the places listed in [security.md](security.md#network). `tests/network.test.ts` fails on anything new.
- **Hands off the console and the game:** no access to them, no input to the game, no cheats ([CONTRIBUTING.md](../../CONTRIBUTING.md#hands-off-the-console-and-the-game)).
- **Spoken texts live in language packs**, never in code ([coach-and-texts.md](coach-and-texts.md)).
- **Every setting has a default and a check** in one place ([modules.md](modules.md#settings-defaults-and-normalize)).
- **Only clearly licensed voices** ([voices.md](voices.md#licensing-rules)).
