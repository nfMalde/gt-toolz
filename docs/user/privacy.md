# Privacy

GT Toolz is free. There is no account, no login, no e-mail, no ads and no tracking. Your data stays on your computer.

## What GT Toolz connects to

GT Toolz makes only these connections. There is nothing else: no analytics, no crash reports, no usage statistics.

| Connection | When | What is sent |
|---|---|---|
| **Your PS5, in your home network** | while GT Toolz runs | A search for the console (UDP ports 9302 and 987, the PlayStation's own search ports), then a one-byte signal to the PS5 (UDP port 33739) that keeps GT7 sending. GT7's telemetry comes back to UDP port 33740. |
| **The OBS overlay server on this computer** | only while the **OBS overlays** module is on | Nothing leaves the computer. The server listens on `127.0.0.1` only, so only programs on this computer, like OBS, can reach it. It sends the driving values and the overlay's layout. |
| **Voice downloads** | only after you click **Install selected** | The download of the voices you picked, straight from their original source (GitHub or Hugging Face). Each file is checked against a fixed SHA-256 checksum. |
| **The update check on GitHub** | only in official installed builds, only after you agreed, at start or when you click **Look now** (Settings → Updates) | A request for the list of releases of `nfMalde/gt-toolz` (api.github.com). The installer is downloaded from GitHub only after you click **Update**. See [Updates](updates.md). |
| **Links you click** | only on your click | Donation, channel and GitHub links open in your web browser. GT Toolz itself loads nothing from these pages. |

Like every website, GitHub and Hugging Face see your IP address when you download from them. The update request also names the GT Toolz version. No ID, no name and no settings are sent.

### Only your home network

- GT Toolz searches for the PS5 only on private home networks, never through a VPN or a tunnel.
- A PS5 address you enter by hand must be a home-network address.
- Once GT Toolz knows your PS5, it accepts telemetry from that console only. Another device in your network cannot feed the coach.
- The telemetry is about **your own car** only. GT7 sends nothing about other drivers except your race position.

### Not even name lookups

The app's window (everything you see) cannot look up any internet address, so even a request that slipped through could not reach a server. Voice downloads and the update check run separately and go only to the addresses named above.

## What stays on your computer

Everything GT Toolz saves is in its [data folder](settings.md#where-your-data-is): your settings, your references, the session logs, telemetry recordings, downloaded voices and your recorded voice packs.

- **References** contain the lap data and the player name you entered.
- **Session logs** are anonymous. Your name, other players' names, the PlayStation's name, folder paths, user names, e-mail addresses and IP addresses are replaced before anything is written.
- **Log for a GitHub issue** saves a log file where you choose. GT Toolz sends nothing; you decide what you attach to a report.
- **Telemetry recordings** (off by default) stay on your computer.

**Reset data** in Settings → Diagnostics deletes all of it in one go. You can keep the downloaded voices.

## Microphone

GT Toolz uses the microphone only while you record a take for your own voice pack. It is never open otherwise. Your recordings stay on your computer. GT Toolz has no hosting and uploads nothing; sharing a pack is a file you pass on yourself.

## Audio devices and controllers

To play vibration, GT Toolz lists your audio outputs and may talk to a PS5 controller (DualSense). Nothing is recorded, and nothing leaves the computer. [Streamer mode](settings.md#streamer-mode) hides the device names on screen.

## Streamer mode

When you stream, [streamer mode](settings.md#streamer-mode) hides IP addresses, the PlayStation's name, file paths, other players' names and device names on screen. The coach does not say other players' names either.

## Questions

Something unclear? Ask on [GitHub](https://github.com/nfMalde/gt-toolz/issues/new/choose). How the app is built, and the security details: see the [developer docs](../dev/README.md).
