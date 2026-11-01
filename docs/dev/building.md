# Building and releasing

This page covers development mode, the production build, the release scripts that build and test the installers, how to build installers on Windows, macOS and Linux, and the CI workflows.

## Once after cloning

```bash
npm ci                                  # exactly the lockfile; .npmrc keeps install scripts off
node node_modules/electron/install.js   # the Electron binary
```

`ignore-scripts=true` keeps Electron's npm package from fetching its binary. `install.js` downloads it from Electron's GitHub releases and checks the zip against `checksums.json` from the signed npm package. Run it again after every Electron update. `npm run dev` stops with a hint if the binary is missing.

## Development mode

```bash
npm run dev               # with the Node debugger on port 9229
npm run dev -- --no-inspect
```

`apps/desktop/scripts/dev.mjs`:

1. Runs `apps/desktop/scripts/build.mjs` once (all bundles and `licenses.json`).
2. Starts the Angular dev server (`ng serve` on `http://localhost:4200`) with live reload.
3. Watches the main process and the preload with esbuild; after a rebuild it restarts Electron.
4. Starts Electron with `--inspect=9229` and `--remote-debugging-port=9222`, and `GTT_DEV_URL=http://localhost:4200`, so the window loads the dev server instead of `app://gtt`.

It removes `ELECTRON_RUN_AS_NODE` from the environment (VS Code sets it for its extension processes; with it Electron would start as plain Node). Changes to `audio-preload.ts` and the overlay page's `client.ts` are not watched: restart `npm run dev` for them.

**Debugging:**

| What | How |
|---|---|
| UI | F12 or Ctrl+Shift+I opens DevTools (development builds only; `GTT_DEVTOOLS=1` allows it in a built app). Ctrl+R reloads. UI warnings and errors also appear in the terminal as `[ui:warning]` and `[ui:error]`. |
| Main process | VS Code: "Attach: main process" (port 9229) in `.vscode/launch.json`, with source maps |
| Both | "Attach: main + UI" |
| UI alone | `npm start -w @gt-toolz/ui` in a plain browser; every bridge call fails ([architecture.md](architecture.md#the-bridge-windowgtt)) |

**Environment variables:**

| Variable | Effect |
|---|---|
| `GTT_DEV_URL` | The dev server's URL; only in an unpacked build (an installed or portable app ignores it). Set by `dev.mjs`. |
| `GTT_DEVTOOLS=1` | DevTools for the app's page in a built app |
| `GTT_DATA_DIR=<folder>` | Another data folder (a clean first start); "Reset data" empties it only if GT Toolz created it |
| `GTT_SCREENSHOTS=<script.json>`, `GTT_SCREENSHOTS_QUIT=1` | The dev screenshot script ([testing.md](testing.md#checking-the-layout-without-looking)) |
| `GTT_UPDATE_REPO=<owner/name>` | At build time (release step 1): the repository an official build looks at for updates |

## Production build

```bash
npm run build:app   # UI production build, then the main process
npm run app         # build:app, then start Electron on the result
```

| Output | What |
|---|---|
| `apps/ui/dist/ui/browser` | The Angular production build (hashed file names, no source maps) |
| `apps/desktop/dist` | `main.cjs`, `preload.cjs`, `audio-preload.cjs`, `overlay-client.js`, `licenses.json` (with source maps for development) |

`npm run app` serves the built UI from `app://gtt` (no dev server), but it is still a development build: the repository's data folders, DevTools allowed.

## Release scripts

`scripts/release/` holds one plain Node script per step. They run the same on a developer machine and in GitHub Actions. `release.mjs` runs them in order; each also runs alone (`node scripts/release/1-build.mjs`). A step for another system is skipped with a note, so one command works everywhere.

```bash
npm run release                                         # every step that can run here
node scripts/release/release.mjs --steps=build,test     # only these
node scripts/release/release.mjs --skip=verify          # all but these
node scripts/release/release.mjs --force                # the installer test may replace an existing installation
```

Steps: `build`, `test`, `windows`, `linux`, `mac`, `verify`, `mac-package`.

| Step | File | Runs on | What it does |
|---|---|---|---|
| `build` | `1-build.mjs` | any | Checks that every workspace has the root's version, that the news exist (`apps/ui/public/news/<version>.en.md` and `.de.md`), and `GTT_UPDATE_REPO` if set. Builds the UI and the main process, then stages exactly what ships: `release/stage/app` (`package.json` and the five files of `dist`, no source maps, no `node_modules`), `release/stage/ui` and the icon. The staged `package.json` carries `updateRepo` only when `GTT_UPDATE_REPO` was set. |
| `test` | `2-test.mjs` | any | `tsc --noEmit -p .`, every `tests/*.test.ts`, `npm audit signatures` (must verify) and `npm audit` (listed; a critical finding stops the release) |
| `windows` | `3-installer-windows.mjs` | Windows | `GT-Toolz-Setup-<version>-x64.exe` (NSIS, per user) |
| `linux` | `4-installer-linux.mjs` | Linux | `gt-toolz_<version>_amd64.deb` |
| `mac` | `5-installer-mac.mjs` | macOS | `GT-Toolz-<version>-mac-arm64.dmg` and `GT-Toolz-<version>-mac-x64.dmg` |
| `verify` | `6-test-installers.mjs` | the installers' system | Installs each installer as a user would, checks it, reads the Electron fuses from the binary, runs the self-test, uninstalls |
| `mac-package` | `7-mac-package.mjs` | any | `GT-Toolz-<version>-mac.zip`: the built app without an installer, for a Mac without the dmg |

`plan.mjs` is not one of these steps: it prepares a version before the build ([below](#versions-changelog-and-news)).

**Output:** `release/<version>/` holds the installers and `SHA256SUMS.txt` (sha256sum format); `release/test/` the self-test results. `release/` is ignored by Git. The exit code is 1 if a step failed.

**Pitfall:** a package electron-builder uses ends the process with `process.exit(0)` after its work, which would hide a failed build. `markFailed()` in `lib.mjs` sets the exit code back.

### The installers

electron-builder 26.17.0, configured in `scripts/release/builder.mjs` (`builderConfig()`):

- **App id** `com.maldoe.gttoolz`, product name "GT Toolz".
- **Contents:** the app as `app.asar`, the UI as `resources/ui`. There are no native modules: nothing is rebuilt, no node-gyp runs.
- **Electron fuses** (read back by the installer test): `runAsNode` off, `enableNodeOptionsEnvironmentVariable` off, `enableNodeCliInspectArguments` off, `enableEmbeddedAsarIntegrityValidation` on, `onlyLoadAppFromAsar` on, `grantFileProtocolExtraPrivileges` off.
- **Electron's zips** are checked against `checksums.json` from the signed npm package (`electronDownload.checksums`).
- **Build tools** (NSIS, 7-Zip, fpm …) are downloaded by electron-builder on the build machine and checked against checksums built into it.
- **`publish: null`:** electron-builder publishes nothing. The app's own update check is described in [security.md](security.md#update-check).

| | Windows | Linux | macOS |
|---|---|---|---|
| File | `GT-Toolz-Setup-<v>-x64.exe` | `gt-toolz_<v>_amd64.deb` | `GT-Toolz-<v>-mac-arm64.dmg`, `…-mac-x64.dmg` |
| Installs to | `%LOCALAPPDATA%\Programs\gt-toolz`, no admin rights, Start menu and desktop shortcut | `/opt/GT Toolz`, the `gt-toolz` command, a menu entry | `/Applications` (drag from the disk image) |
| Data | `%APPDATA%\GT Toolz` (kept on uninstall) | `~/.config/GT Toolz` | `~/Library/Application Support/GT Toolz` |
| Signed | no (SmartScreen shows "Unknown publisher") | no | ad-hoc, not notarized; hardened runtime off |
| Systems | Windows 10 and 11, x64 | Ubuntu 22.04+, Debian 12+, x64 | macOS 13+, Apple silicon or Intel |

Linux: the package sets up Chromium's sandbox (`chrome-sandbox` setuid only where user namespaces do not work) and, on Ubuntu 24.04 and later, an AppArmor profile. macOS: `Info.plist` carries the usage texts for the microphone (own voice packs) and the local network (finding the PS5).

### The installer test

`6-test-installers.mjs`, for every installer of the running system:

- **Windows:** silent install (`/S`) for this user, check the program and the Start menu shortcut, the fuses, the self-test, silent uninstall. It stops if GT Toolz is already installed for this user, unless `--force` is given (it would replace and then remove that installation).
- **Linux:** check the package's fields and contents. With password-free `sudo` (GitHub Actions): `apt-get install`, the self-test with the sandbox, `apt-get remove`. Otherwise: unpack with `dpkg-deb -x` and run the self-test with `--no-sandbox`. Without a display it uses `xvfb-run`.
- **macOS:** attach the disk image, copy the app, `codesign --verify --deep --strict`, the bundle id and the usage texts, the fuses, the self-test.

**The self-test** (`apps/desktop/src/self-test.ts`): `--self-test=<file>` starts the installed app on an empty temporary data folder (with its own single-instance lock and the PS5 set to `127.0.0.1`, so no broadcast), the window hidden. It checks that the app is packaged in `app.asar`, the bundled files, that the UI started, the bridge, the coach with a session log, and the voice list; writes the result as JSON and quits with 0 or 1. The test starts the app with `ELECTRON_RUN_AS_NODE` and `NODE_OPTIONS` set: with the fuses right, both are ignored.

### The Mac package without an installer

A dmg can only be built on a Mac. `7-mac-package.mjs` packs the built app on any system: `app/dist`, `app/ui`, `app/package.json`, a start script `Start GT Toolz.command` and the instructions (`scripts/release/mac-package/README.md`, `README.de.md`). On its first start the script downloads Electron for the Mac's processor from Electron's GitHub release, checks it against the SHA-256 written into the script (from `checksums.json` in the npm package), unpacks it and starts the app. With the UI next to `dist`, the app runs as an installed one (`PORTABLE` in `apps/desktop/src/security.ts`): no dev server, no DevTools, the user's data folder.

## Building installers locally

**Every system:** Node 22.23.2, `npm ci`, `node node_modules/electron/install.js`, then `npm run release`. An installer can only be built on its own system.

| System | Notes |
|---|---|
| **Windows** | Builds the `.exe`, tests it and the Mac package. If GT Toolz is installed for your user, the installer test would replace and remove it: uninstall first, run with `--force`, or leave it out with `--skip=verify`. |
| **Linux** | Ubuntu 22.04 or later, or WSL2. `dpkg-deb` comes with Ubuntu; without a display the installer test needs `xvfb`. Without password-free `sudo` the test runs the unpacked package without the sandbox. |
| **macOS** | `hdiutil`, `codesign`, `ditto` and `plutil` come with macOS. Both disk images are built on one Mac; the Intel one is tested only where Rosetta 2 is installed, with five times the waits of the self-test (`GTT_SELF_TEST_SLOW`: its first start under Rosetta takes about two minutes on a CI Mac). |

A local build is a build from source: without `GTT_UPDATE_REPO` it never looks for updates. Only the release workflow sets it.

## Versions, changelog and news

- **The version** is set in the root `package.json` (now `1.0.0-beta`). Every workspace's `package.json` carries the same version; step 1 refuses a mismatch (its list of workspaces is in `1-build.mjs`). The app shows `app.getVersion()`, from the staged `package.json`.
- Versions follow semver; a pre-release has a suffix (`1.0.0-beta`, `1.0.0-beta.2`). The update check offers pre-releases only to users who run one.
- **Changelog:** changes users notice go under `## [Unreleased]` in `CHANGELOG.md`.
- **News:** every version ships `apps/ui/public/news/<version>.en.md` and `<version>.de.md`, shown once after an update. Step 1 refuses a version without them. News for the coming version are written as `apps/ui/public/news/next.en.md` and `next.de.md`.
- **The release plan** (`scripts/release/plan.mjs`) works out the next version and, with `--apply`, prepares the tree for it: the version in every `package.json` and the lockfile, `CHANGELOG.md`'s "Unreleased" section as the version's (with the date), `news/next.<lang>.md` renamed to `news/<version>.<lang>.md`. It writes the version's changelog section to `release/notes.md`.

  ```bash
  node scripts/release/plan.mjs --channel=beta --bump=pre          # 1.0.0-beta → 1.0.0-beta.2 (only shows the plan)
  node scripts/release/plan.mjs --channel=full                     # 1.0.0-beta → 1.0.0
  node scripts/release/plan.mjs --channel=beta --version=1.1.0-beta --apply
  ```

  Channels: `alpha` and `beta` (pre-releases, `<version>-alpha[.n]`, `<version>-beta[.n]`) and `full`. Bumps: `none`, `pre`, `patch`, `minor`, `major`; an explicit `--version` wins.

## CI

GitHub Actions workflows in `.github/workflows`. All of them use Node 22.23.2 and `npm ci`, and run with read-only permissions unless a job needs more.

| Workflow | When | What |
|---|---|---|
| `pr.yml` | every pull request to `main` | On Windows, Linux and macOS: `npm ci`, `npm audit signatures`, `npm run typecheck`, `npm test`, `npm run build:app`. Must be green before a merge. |
| `build.yml` | every push to `main` (and by hand) | The same checks as the PR build on all three systems. No installers and no uploads: installers are made only by the release, after the approval. |
| `release.yml` | by hand only (Actions → Release → Run workflow) | A release, below |
| `cla.yml` | pull requests and their comments | The CLA bot: every contributor signs `CLA.md` once with a comment on their pull request; signatures are kept on the branch `cla-signatures`. It runs on `pull_request_target` without checking out the pull request's code. |

**`release.yml`**, with the inputs `channel` (`beta`, `alpha`, `full`), `bump` (`none`, `pre`, `patch`, `minor`, `major`) and `version` (an exact version instead of the bump):

Two approvals: before the first nothing is built or uploaded (only the plan, the checks and a preview); before the second nothing is published.

1. **plan** (only on `main`): stops unless both environments, `approval` and `release`, have required reviewers. Then `plan.mjs --apply` with the inputs; the tag `v<version>` must be new; `npm audit signatures`, the type check and the tests. When the plan changed files, a release commit goes to the branch `release/v<version>`. A preview (version, commit, notes, the news in both languages) goes into the run's summary.
2. **approve:** the first approval (environment `approval`). Read the preview, then approve or reject.
3. **build:** the installers on Windows, Linux and macOS from exactly the planned commit, each tested as a user gets it, with `GTT_UPDATE_REPO` set to the repository (the official builds that look for updates). They go to the next jobs as artifacts kept for one day.
4. **attest:** build provenance for every installer (`actions/attest-build-provenance`; check with `gh attestation verify`), in a job of its own that runs no npm code.
5. **publish:** the second approval (environment `release`, which holds the signing key): when the builds are green, approve to publish, or reject and nothing becomes public. Then it takes each installer from the build of its own system (exactly one each), checks it against that build's checksums and its provenance, makes one `SHA256SUMS.txt`, signs it with the project's Ed25519 key (`scripts/release/sign.mjs`, the secret `RELEASE_SIGNING_KEY` of the environment `release`) and publishes the release with its tag, all files at once. When the plan made a release commit, `main` gets it by a pull request from `release/v<version>` (the ruleset lets nothing else change `main`); merge it with a merge commit so the tag stays in `main`'s history. The run's summary shows the `gh pr create` line.

The app takes an update only when `SHA256SUMS.txt` carries a valid signature of the key in `RELEASE_PUBLIC_KEY` (`packages/runtime/src/app-updates.ts`), so a release changed by anyone without the approval cannot reach an installed app. `sign.mjs` refuses a key that does not belong to that public key.

**Repository settings the release relies on** (set them once in the public repository):

- **Environment `approval`** (Settings → Environments): required reviewers (the maintainers), deployment branches limited to `main`. Only the approve job uses it.
- **Environment `release`:** required reviewers too, deployment branches limited to `main`, and the secret `RELEASE_SIGNING_KEY` (the private key, PEM). Only the publish job uses it; so the key is never used without an approval right before it.
- **Immutable releases** (Settings → General → Releases): a published release's files and tag cannot change.
- **Rulesets:** `main` only by pull request (with the PR build green), tags `v*` created only by the release.
- **The branch `cla-signatures`** for the CLA bot, and **private vulnerability reporting** (Settings → Security) for [SECURITY.md](../../SECURITY.md).
- **Actions** (Settings → Actions → General): only actions by GitHub and `contributor-assistant/github-action@*` are allowed; workflow runs of pull requests from all outside contributors need a maintainer's approval.
- **Code security** (Settings → Code security): secret scanning with push protection, and CodeQL's default setup (JavaScript/TypeScript and Actions, extended queries) for `main` and every pull request.

**The signing key:** keep the private key in a password manager as well as in the secret. A lost key means installed apps take no more automatic updates; a new key has to come with a release signed with the old one. To make a pair: `node -e "const {privateKey,publicKey}=require('crypto').generateKeyPairSync('ed25519');console.log(privateKey.export({type:'pkcs8',format:'pem'})+publicKey.export({type:'spki',format:'pem'}))"`.

Actions are pinned to exact version tags (for example `actions/checkout@v7.0.1`), each at least 14 days old when pinned. Dependabot (`.github/dependabot.yml`) proposes newer action versions monthly, with a 14-day cooldown. npm packages are updated by hand ([security.md](security.md#dependency-policy)).

## Before a release

For the exact commit that becomes the release:

1. **Packages:** `npm audit` and `npm audit signatures`. Every changed version is at least 14 days old ([security.md](security.md#dependency-policy)).
2. **Secrets:** none in tracked or untracked files; profile files (`config.json`, logs, recordings) stay outside the repository or in ignored folders.
3. **Review** the areas that matter for security: the Electron shell (`security.ts`, the preloads, `ipc.ts`), the overlay server, speech engines and downloads, network and file handling.
4. **Changelog and news:** the changes under "Unreleased" in `CHANGELOG.md`, the news in `apps/ui/public/news/next.en.md` and `next.de.md` (the release plan turns both into the version's).
5. **Clean build:** `build.yml` on `main` is green (or locally: a fresh checkout of the candidate, `npm ci`, `npm run release`). Nothing the build needs may be ignored by Git or missing from the commit.
6. **Licenses:** every shipped package, data set, engine and voice is on the licenses page (`apps/desktop/src/licenses.ts`, texts in `dist/licenses.json`) and in `THIRD-PARTY-NOTICES.md`.
