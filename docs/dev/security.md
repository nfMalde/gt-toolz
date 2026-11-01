# Security

GT Toolz runs on the driver's PC next to a game and a stream. It must not spy, must not be a way into the PC, and must not ship code the project has not checked. This page describes the security model, the network rules and the dependency policy. Every rule here is enforced in code or by a test; the files are named.

For what users are told, see the [user guide](../user/privacy.md). To report a vulnerability, follow [SECURITY.md](../../SECURITY.md) (privately, never in a public issue).

## Principles

- **No spying.** No analytics, no crash upload, no advertising, no account. The app talks to the PlayStation on the home network and, only when the user asks for it, to the sources of voice downloads and to GitHub for updates.
- **Local data.** Settings, references, recordings and voice packs stay in the data folder on the PC. "Reset data" deletes all of it.
- **Anonymous logs.** A session log never contains names, IP addresses or folder paths, so it can be attached to an issue as it is.
- **Own content only.** The window shows the app's own UI and nothing else.
- **Untrusted input.** Everything from the UI, from the network and from files (settings, references, language packs, voice packs) is checked before it is used.

## The Electron shell

Code: `apps/desktop/src/security.ts`, `main.ts`, `bridge.ts`, `audio.ts`.

### Windows

The UI window (`createWindow` in `main.ts`):

| Setting | Value |
|---|---|
| `contextIsolation`, `sandbox`, `webSecurity` | `true` |
| `nodeIntegration` | `false` |
| `spellcheck` | `false` (Chromium would download dictionaries) |
| `navigateOnDragDrop` | `false` |
| `devTools` | only in development, or with `GTT_DEVTOOLS=1` |
| `autoplayPolicy` | `no-user-gesture-required` (vibration patterns must play the moment a cue is due) |

No application menu (on macOS a minimal one for Cmd+Q and editing). The hidden audio window is sandboxed with context isolation too; its page is empty with CSP `default-src 'none'`, and its player in the preload exposes nothing. The main process accepts its "ready" message only from exactly that window.

### Only the app's own content

- **`app://gtt`.** The UI is served from the app folder through a privileged custom scheme (`registerAppScheme`, `serveUi`). Paths that leave the UI folder get 403; only plain files are served (a device name like `COM1` would block); unknown paths get `index.html` for the router.
- **CSP** on every response (`CONTENT_SECURITY_POLICY`):

  ```
  default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'
  ```

  `'unsafe-inline'` is for styles only (Angular sets component styles at runtime), never for scripts. Critical CSS inlining is off in `angular.json`, because it would add an inline handler. Every response also carries `X-Content-Type-Options: nosniff`.
- **Request filter.** `session.webRequest.onBeforeRequest` cancels every request that is not `app://gtt`, `devtools://`, `data:` or `blob:` (in development also the dev server), and logs it.
- **No new windows, no navigation away.** `setWindowOpenHandler` denies every window; `will-navigate` and `will-redirect` to anything but the app are prevented; `<webview>` is never attached (`guardWebContents`).
- **No name lookups in Chromium.** `host-resolver-rules` is `MAP * ~NOTFOUND, EXCLUDE localhost`, set before the app is ready (`blockHostLookups`). Even a request that slipped past the filter could not reach a server by name. Downloads run in the main process (Node), which does not use Chromium's resolver.
- **Dev server only in development.** `GTT_DEV_URL` works only in an unpacked build; an installed or portable app ignores it (it would load that address with the whole bridge).

### Permissions

All permissions are denied (`hardenSession`), except, and only for the app's own page:

| Permission | Why |
|---|---|
| `media` with **audio only** | recording a take for an own voice pack, when the user starts it; never the camera or the screen; never for the audio window |
| `speaker-selection` | the vibration on another audio output than the voices |
| `hid`, for a **Sony DualSense** (`054c:0ce6`) or **DualSense Edge** (`054c:0df2`) only | its vibration over WebHID; the device chooser (`select-hid-device`) picks nothing else |

Clipboard: the page has no clipboard permission. A module copies through the main process (`desktop.copyText`).

### IPC

- **One bridge** (`window.gtt`, `apps/desktop/src/preload.ts`), a fixed set of calls. The UI never sees `ipcRenderer`.
- **Only from the app's page.** `handle()` in `bridge.ts` refuses every call whose sender frame is not `app://gtt` (`fromApp`).
- **Arguments are validated in the main process:** settings through `normalize`, reference ids only as a file name inside the references folder, voice package ids only from the catalogue, voice pack ids only as UUIDs of existing packs, links only from a fixed list (`LINKS` in `ipc.ts`, `https:` only, opened in the browser on a click), a module's page only at `http://127.0.0.1:<port>` or `http://localhost:<port>` (`openLocalPage` in `main.ts`).

### The installed app

- **Electron fuses** (set in `scripts/release/builder.mjs`, read back by the installer test): no `ELECTRON_RUN_AS_NODE`, no `NODE_OPTIONS`, no `--inspect`; ASAR integrity check on; the app only from `app.asar`; no extra privileges for `file://`.
- **Single instance** (`app.requestSingleInstanceLock()`): two instances would fight over the telemetry port.
- **External programs with full paths** on Windows: PowerShell (`%SystemRoot%\System32\WindowsPowerShell\v1.0`) and `tar` (`%SystemRoot%\System32\tar.exe`), never through `PATH`. A voice name goes into PowerShell through an environment variable, never into the script.
- **The process name is ASCII** (`APP_NAME` in `main.ts`): it ends up in the user agent.
- The installers are not code-signed (Windows shows "Unknown publisher"; macOS is signed ad-hoc).

## Network

Everything that can leave the PC:

| What | Protocol, port | Where to | When |
|---|---|---|---|
| Telemetry | UDP 33739 out (heartbeat), 33740 in | the PS5, home network only | while the app runs |
| Console discovery | UDP 9302 (PS5), 987 (PS4) | broadcast and the local /24, private interfaces only | until the PS5 is found |
| OBS overlay server | TCP, port 4790 by default | listens on `127.0.0.1` only | only while the overlays module is on |
| Voice downloads | HTTPS | GitHub, Hugging Face | only after the user picked packages and clicked "Install selected" |
| Update check | HTTPS | GitHub's API and releases of the project | only in official builds, after the user agreed |
| Links | the system browser | a fixed list (project, donation, channels) | only on a click; the app loads nothing from them |

`tests/network.test.ts` lists every place in shipped code that may open a connection, with a reason. Any new `fetch`, socket, HTTP server, `EventSource` or `openExternal` outside that list fails the test.

### Telemetry

(`packages/telemetry/src/client.ts`, `console-discovery.ts`)

- **Private networks only:** discovery goes out only on interfaces with a private IPv4 address and a hardware address, never on VPN or tunnel adapters.
- **Home-network senders only:** telemetry and discovery answers are taken only from private, link-local or local addresses.
- **Sender lock:** once the PS5 is known, telemetry from any other address is dropped and logged once. If the PS5 stops answering, the app searches again (unless the user entered an address).
- **Whole packets only:** a datagram must have one of the four packet sizes; the magic must match after decryption; NaN and infinite floats become 0. An exception while handling one packet costs only that packet.
- **A manual address** must be a home-network address (`isLanAddress`): private ranges, `127.x` (the fake PS5), `169.254.x`; no leading zeros (Node would take "192.168.1.08" for a host name).
- **Discovery answers** are cleaned of control characters and cut to 64 characters.

The PS5's name and IP are shown in the app; streamer mode hides them on screen.

### The overlay server

(`modules/overlays/main/server.ts`)

- **Off by default.** It runs only while the overlays module is on, and stops when it is switched off or the app quits.
- **This PC only:** it listens on `127.0.0.1`, never on `0.0.0.0` or the LAN address.
- **Own host name only:** the `Host` header must be `127.0.0.1:<port>` or `localhost:<port>`, else 403 (no DNS rebinding).
- **Own pages only:** an `Origin` other than the server's own, or a `Sec-Fetch-Site` other than `none` (OBS opening the address) or `same-origin`, gets 403.
- **Read only:** `GET` only (405 otherwise), fixed paths (`/`, `/overlay`, `/overlay.css`, `/overlay.js`, `/events`), 404 for the rest. Nothing is read from the request but the path and the host. The layout is changed only in the app.
- **Headers:** CSP `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`, plus `nosniff`, `no-referrer`, `no-store`. No inline script or style; the script is the app's own bundle.
- **What it sends:** driving values and the layout, drawn as text, never as HTML. No IP, no names, no paths.
- **Limits:** at most 16 open streams (more get 503); a stream that reads nothing for 10 s is dropped; a client with more than 2 KB still unsent skips frames until it has caught up. A malformed request gets 400; a server error is logged, never thrown.

### Voice downloads

(`packages/runtime/src/voice-packages.ts`, [voices.md](voices.md#downloads))

- Nothing is downloaded until the user picks packages and confirms.
- Every file is pinned in `voice-packages.json` with URL, size and SHA-256.
- Only `https:` on `github.com`, `*.githubusercontent.com`, `huggingface.co`, `*.huggingface.co`, `*.hf.co`; redirects are followed by hand and checked against the same list.
- Size and SHA-256 must match, else the file is deleted. Archives are unpacked with the system's `tar`; targets must stay inside the voices folder.

### Update check

(`apps/desktop/src/updates.ts`, `packages/runtime/src/app-updates.ts`)

- **Only official builds look.** The release build writes `updateRepo` into the staged `package.json` when `GTT_UPDATE_REPO` is set; a development build, a build from source and the installer self-test never look.
- **Only after the user agreed.** The news window asks once (settings `updateCheck`, `updateAsked`); nothing is looked up before the answer. Then the app looks once at start, and whenever the user presses the update button.
- **GitHub only:** `https:` on `api.github.com`, `github.com`, `objects.githubusercontent.com` and `release-assets.githubusercontent.com` (`allowedUpdateUrl`; not `raw.` or `gist.`, which serve anyone's files), redirects checked one by one. Release files must be `https://github.com/<owner>/<name>/releases/download/<tag>/<file>` of this repository, checked on the parsed address. The release list, the checksum list and the signature have a time limit of 30 s.
- **Never a less tested channel:** a full release is offered full releases only, a beta betas and full releases, an alpha everything. Only strictly newer versions count.
- **The user decides:** a found release shows its notes; "Update" downloads the installer for this system, "Later" closes the window.
- **Signed:** `SHA256SUMS.txt` must carry a valid Ed25519 signature (`SHA256SUMS.txt.sig`) of the project's key `RELEASE_PUBLIC_KEY`, which only the approved publish job of the release workflow can make ([building.md](building.md#ci)). Without it, or with another, there is no update. The signed list names the installers with their version, so an old signed list cannot be replayed under a newer tag.
- **Checked:** the installer's size is checked, and its SHA-256 must match the signed list, else the file is deleted. On Windows it is saved in the app's data folder (`updates`), not in a temporary folder another user could prepare, then the installer runs; the app closes only once it started (an antivirus may block an unsigned installer: then an error). On macOS and Linux the file is opened for the user from the Downloads folder.
- **TLS:** the app removes `NODE_TLS_REJECT_UNAUTHORIZED` from its environment at start, so certificates are always checked (also for voice downloads). Errors shown in the window name no folders of the PC (streamer mode); the log, which is anonymous, keeps the whole message.

## Data and logs

- **Session logs** (`packages/runtime/src/session-log.ts`): anonymized when written. The driver's name becomes `<driver>`, other players `<player>`, the console's name `<console>`, the app's folders and the home folder `<references>`, `<home>` …, user names in paths `<user>`, e-mail addresses `<email>`, IP addresses `<lan-ip>` or `<ip>` (only `127.x` stays), MAC addresses `<mac>`. Longer names are replaced first. A recorded voice pack is logged by its id. A log stops at 64 MB.
- **A fixed rule:** logs stay anonymous. They end up in public issues, so every line goes through this anonymizer, in the normal and the detailed log alike; new identifying values (a new kind of name, a new folder) are added to its lists, and nothing writes a log file around it. `tests/session-log.test.ts` guards it ([CONTRIBUTING.md](../../CONTRIBUTING.md#logs-stay-anonymous)).
- **Log export** ("Log for a GitHub issue") cleans the log once more and starts it with the app version, system, Electron version and log level. The page gets only the file name back, not the path.
- **Streamer mode** hides on screen the PlayStation's IP and name, file paths, other players' names and device names; the coach does not say other players' names either.
- **Files are written atomically** (`writeFileAtomic`) and read with suspicion: `config.json`, references (at most 64 MB, structure checked), language packs (data only, at most 400 characters per text), voice packs (file names must be content hashes).
- **"Reset data"** (`apps/desktop/src/reset.ts`) writes a marker; the next start empties the data folder before anything opens a file there. A folder given with `GTT_DATA_DIR` is emptied only if GT Toolz created it.
- **Recorded voices** stay local; export only after the user confirms consent; import is checked like any untrusted file ([voices.md](voices.md#recorded-voice-packs)).

## Dependency policy

| Rule | How |
|---|---|
| **As few dependencies as possible** | What ships in the app: Electron, `@noble/ciphers` (Salsa20, no dependencies of its own), and the UI libraries Angular, `@ngrx/signals`, RxJS and tslib (bundled). Everything else is a build or development tool and is not shipped. A small helper is written ourselves rather than added. |
| **Exact versions** | `.npmrc` `save-exact=true`; no `^` or `~` in any `package.json`; the lockfile is committed; installs use `npm ci`. `overrides` in the root `package.json` pin fixed versions of transitive tools. |
| **No install scripts** | `.npmrc` `ignore-scripts=true`. The Electron binary comes from `node node_modules/electron/install.js`, checked against the npm package's `checksums.json`. |
| **No fresh versions** | A new version is adopted only once it has been published for **at least 14 days**. For a new tree, `npm install --before=<date 14 days ago>` keeps every transitive version at least that old. |
| **Check provenance** | Before every update: `npm audit` and `npm audit signatures` (registry signatures and provenance). Release step 2 runs both; signatures must verify, a critical finding stops the release. |
| **Review new packages** | Maintainers, downloads, dependency tree, install scripts, latest release, license. A package that ships needs a permissive license. |
| **Licenses shown** | Every shipped dependency is on the in-app licenses page (`apps/desktop/src/licenses.ts`; its text is collected at build time by `apps/desktop/scripts/build.mjs`, whose `shipped` list must name it) and in `THIRD-PARTY-NOTICES.md`. |
| **Vendored data** | Only with source, commit, SHA-256 and the license of every part (`packages/telemetry/data/SOURCE.md`, `packages/coach/data/SOURCE.md`); updated only with app updates, and the 14-day rule applies to the data commit. |
| **Own work** | No copied snippets: write it yourself, or credit it and check its license first. Icons are drawn for the project (`apps/ui/src/app/ui/icon.ts`), never taken from an icon set. |
| **CI actions** | Pinned to exact version tags (`actions/checkout@v7.0.1`), each at least 14 days old when pinned. Dependabot proposes newer ones with a 14-day cooldown (`.github/dependabot.yml`); npm packages are updated by hand after the checks above. Release installers carry build provenance (`gh attestation verify`). |

**Adding or updating a dependency:**

1. Check the version's publish date (14 days) and the package (review row above).
2. Install with an exact version: `npm install <pkg>@<version> -w <workspace>`.
3. Run `npm audit` and `npm audit signatures`.
4. If it ships in the app: add it to `apps/desktop/src/licenses.ts`, to the `shipped` list in `apps/desktop/scripts/build.mjs` and to `THIRD-PARTY-NOTICES.md`.
5. If it opens a connection: it needs a reason in `tests/network.test.ts` and a review against this page.
6. Run `npm run typecheck`, `npm test` and a production build.
