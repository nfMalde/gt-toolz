# GT Toolz user guide

GT Toolz is a free desktop app for **Gran Turismo 7** on the PlayStation 5. It reads the telemetry that GT7 sends over your home network. With it you get:

- a **coach** in your ear: braking points with a countdown, the corner plan, gears, curbs and feedback after each lap;
- a **race crew** on a radio voice in races: position, laps, sectors, fuel and tyres;
- **overlays for OBS**: throttle, brake, speed, gear, tyres and laps live on your stream;
- **vibration** instead of sound, for drivers who hear badly or not at all;
- **voices** of your choice, including your own recorded voice;
- your **own wording** for everything the coach and the crew say.

Everything runs on your computer. There is no account and no tracking.

> **Beta.** This is GT Toolz 1.0.0 Beta. Windows is fully tested. macOS and Linux are only partly tested and may show errors or crashes. Some German voices can be hard to understand at times; we are working on it. GT Toolz is a hobby project, and feedback is very welcome: [report a problem or an idea](https://github.com/nfMalde/gt-toolz/issues/new/choose).

## Quick start (about 5 minutes)

You need a PC or Mac in the same home network as your PS5, and ideally a wireless earbud connected to the computer. The game sound stays on your TV or headset; the coach talks in the earbud.

1. **Download** the installer for your system from the [releases page](https://github.com/nfMalde/gt-toolz/releases):
   - Windows: `GT-Toolz-Setup-<version>-x64.exe`
   - macOS: `GT-Toolz-<version>-mac-arm64.dmg` (Apple silicon) or `GT-Toolz-<version>-mac-x64.dmg` (Intel)
   - Linux (Ubuntu, Debian): `gt-toolz_<version>_amd64.deb`
2. **Install** it. The installers are not signed yet, so your system warns once. [Getting started](getting-started.md#install) shows how to get past the warning.
3. **Start GT Toolz.** The welcome window opens. Pick **DE** or **EN** at the top, then click **Start setup**.
4. **Allow the network.** If Windows asks about the firewall, allow **private networks**. On a Mac, allow the local network.
5. **Start GT7 on the PS5.** Drive or play a replay. The setup step **PlayStation** goes on as soon as telemetry arrives. Nothing needs to be set up in the game.
6. **Pick a voice.** On Windows and macOS the system voice works at once. Better offline voices are optional downloads. On Linux, download one voice.
7. **Learn your first reference.** In GT7, open **Sport mode → Daily Race**, start the replay of a fast driver from the leaderboard and let one full lap play. GT Toolz learns the braking points by itself.
8. **Calibrate once.** Start any time trial, click **Start calibration**, and brake exactly at "now" five times. Then click **Apply**.
9. **Drive.** Start a time trial on the same track. The out lap is quiet. From the start line on, the coach counts down every braking point: "Full braking ahead. Hairpin right. In with first gear. Two, one, now."

The full walkthrough is in [Getting started](getting-started.md).

## Pages of this guide

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | Install on Windows, macOS and Linux, the install warnings, first start, the setup assistant, connecting the PS5 |
| [Telemetry and references](telemetry.md) | The connection, the Cockpit, recording, learning and picking reference laps, "I drive" and the reference modes |
| [Coach](coach.md) | Braking calls, corner plans, feedback, help, briefing, debrief, the cheeky coach, calibration |
| [Race crew](crew.md) | The race engineer on the radio, the team boss, position, fuel, tyres, talk levels, tyre calls in qualifying |
| [OBS overlays](overlays.md) | The browser source for OBS, the overlay editor, hiding the overlay automatically |
| [Vibration](haptics.md) | Feel the calls: bass shakers, haptic vests, headsets with haptics, game controllers |
| [Voices](voices.md) | System voices, neural voice downloads, the radio filter, languages per role, your own recorded voice pack |
| [Texts](texts.md) | Change what the coach and the crew say, in your own words |
| [Settings and modules](settings.md) | App-wide settings (language, name, streamer mode, talk levels, data reset) and switching modules on and off |
| [Updates and news](updates.md) | How GT Toolz looks for new versions and installs them |
| [Troubleshooting](troubleshooting.md) | Common problems, the logs, and how to report a bug |
| [Privacy](privacy.md) | What GT Toolz connects to, and what stays on your computer |

## Where things are in the app

- **Left side:** the navigation. At the top **Modules**. Below it one group per module that is on: **Telemetry** (Cockpit, References, Settings), **Coach** (Settings, Calibration), **Crew** (Settings), **OBS overlays** (Browser sources) and **Vibration**. Then the pages for the whole app: **Voices**, **Texts**, **Recordings**, **Sound check**, **Settings**, **Setup**, **Tour** and **About & licenses**.
- **Bottom left:** the **Calls** switch mutes the coach and the crew in one click. The slider below it is the overall volume.
- **Title bar:** the connection to the PS5, the **Streamer** eye button and the **DE | EN** language switch.
- **Cockpit:** the page you keep open while driving. Every module that is on shows its cards there.

## For developers

Building from source, the architecture and how to contribute: see the [developer docs](../dev/README.md).

## Legal

GT Toolz is an independent tool. It is not affiliated with, endorsed, sponsored or approved by Sony Interactive Entertainment Inc. or Polyphony Digital Inc. "Gran Turismo", "GT7", "PlayStation" and "PS5" are trademarks or registered trademarks of Sony Interactive Entertainment Inc. Track, corner and car names are used only for identification and belong to their respective owners.
