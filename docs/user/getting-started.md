# Getting started

This page takes you from the download to your first drive with the coach.

> **Beta.** Windows is fully tested. macOS and Linux are only partly tested and may show errors or crashes. If something goes wrong, [Troubleshooting](troubleshooting.md) shows how to send us a log.

## What you need

| | Minimum | Recommended |
|---|---|---|
| **System** | Windows 10 64-bit · macOS 13 Ventura (Apple silicon or Intel) · Ubuntu 22.04 or Debian 12, 64-bit | Windows 11 · a current macOS · a current Ubuntu |
| **Processor** | 2 cores | 4 cores or more |
| **Memory** | 4 GB | 8 GB |
| **Disk space** | 600 MB (app and one voice) | 1.5 GB (app, several voices, a few recordings) |
| **Screen** | 1280 × 720 | 1920 × 1080 |
| **Sound** | any output device | a wireless earbud connected to the computer, for example by Bluetooth |
| **Network** | computer and PS5 in the same home network (Wi-Fi or cable) | computer on cable, PS5 on cable or 5 GHz Wi-Fi |
| **Console** | PS5 with Gran Turismo 7 (not the PS4) | – |
| **Internet** | not needed while driving | only to download optional voices and updates |

**Why an earbud?** The coach talks through your computer. With an earbud the game sound stays on your TV or headset, and you hear the coach on top. Bluetooth adds a small delay; the [calibration](coach.md#calibration) takes care of it.

**PS4:** GT Toolz has not been tested with GT7 on a PS4, and the PS4 is not officially supported.

## Install

Download the file for your system from the [releases page](https://github.com/nfMalde/gt-toolz/releases). `<version>` stands for the version number.

The installers are **not signed** yet. That costs money we do not have for a hobby project. So every system warns you once. The steps below show how to go on.

> Optional: every release lists the SHA-256 checksum of each file in `SHA256SUMS.txt`. If you know how to compare checksums, you can check your download against it. The automatic [updates](updates.md) always do this check for you.

### Windows

1. Download `GT-Toolz-Setup-<version>-x64.exe`. If your browser says the file is not commonly downloaded, choose to keep it.
2. Double-click the file.
3. Windows shows **"Windows protected your PC"**. Click **More info**, then **Run anyway**.
4. GT Toolz installs for your user only. You need no admin rights. It adds a Start menu entry and a desktop shortcut, and starts right away.

| | |
|---|---|
| Program folder | `%LOCALAPPDATA%\Programs\gt-toolz` |
| Your data | `%APPDATA%\GT Toolz` |
| Uninstall | Windows Settings → Apps → Installed apps → GT Toolz → Uninstall |

Uninstalling keeps your data (settings, references, voices, recordings). To delete it too, use [Reset data](settings.md#reset-data) first, or delete the data folder afterwards.

### macOS

1. Download the disk image for your Mac:
   - `GT-Toolz-<version>-mac-arm64.dmg` for **Apple silicon** (M1 and later),
   - `GT-Toolz-<version>-mac-x64.dmg` for **Intel** Macs.

   Not sure? Apple menu → About This Mac. "Chip: Apple M…" means Apple silicon; "Processor: Intel" means Intel.
2. Open the disk image and drag **GT Toolz** to **Applications**.
3. Start GT Toolz from Applications. macOS says it cannot check the app. Close the message, but never choose **Move to Trash**.
4. Open **System Settings → Privacy & Security**. Scroll down and click **Open Anyway** next to GT Toolz. Confirm once more.
5. When macOS asks whether GT Toolz may find devices on your local network, click **Allow**. That is how the app finds your PS5.

**"GT Toolz is damaged and can't be opened"?** The app is fine. Newer macOS versions say this about apps without an Apple signature that came from the internet. Open the **Terminal** app once and run:

```bash
xattr -dr com.apple.quarantine "/Applications/GT Toolz.app"
```

Then start GT Toolz again.

| | |
|---|---|
| Program | `/Applications/GT Toolz.app` |
| Your data | `~/Library/Application Support/GT Toolz` |
| Uninstall | drag GT Toolz from Applications to the Trash |

### Linux (Ubuntu, Debian)

1. Download `gt-toolz_<version>_amd64.deb`.
2. Double-click it to open it in your software installer and install it there. Or open a terminal in the download folder and run:

   ```bash
   sudo apt install ./gt-toolz_<version>_amd64.deb
   ```

3. Start GT Toolz from the app menu.

| | |
|---|---|
| Program | `/opt/GT Toolz` |
| Your data | `~/.config/GT Toolz` |
| Uninstall | remove GT Toolz in your software manager, or run `sudo apt remove gt-toolz` |

Linux has no system voices GT Toolz can use. The setup assistant downloads an offline voice for you (see below). You need a desktop session with sound (PulseAudio or PipeWire).

## First start

The **welcome window** opens. It shows in short how GT Toolz works: connect, learn a reference, calibrate, drive and listen.

- The language switch **DE | EN** is at the top of the window. Pick yours first. You can change it any time later.
- **New: feel instead of hear** leads straight to the vibration setup, if you want the calls as vibration.
- Click **Start setup**.

The first setup must be finished once before you see the rest of the app. Until then the welcome comes back at every start. Have the PS5 with GT7 ready: you learn your first reference and calibrate once. That takes a few minutes.

## The setup assistant

The steps are shown at the top. **Next** stays locked until a required step is done, and a line at the bottom says what is still missing. **Back** goes one step back. Later you can open the assistant any time with **Setup** on the left; then you can close it and skip steps.

### 1. Basics

- **Language**: for the app, the coach and the crew. Each can get its own later.
- **Coach style**: **Cheeky** (default) makes remarks when you repeat mistakes. **Factual** keeps it neutral. Braking calls are always factual.
- **What GT Toolz does for you**: switch the modules on or off. By default **Coach** and **Crew** are on, **OBS overlays** and **Vibration** are off. **Telemetry** (the connection to the PS5) is always on. You can change this later on the [Modules](settings.md#modules) page.
- **Streamer mode**: hides IP addresses, the PlayStation's name, file paths and other players' names. See [Streamer mode](settings.md#streamer-mode).

### 2. Vibration (optional)

Only if you want to feel the calls. Switch it on, choose the device and test it. Details: [Vibration](haptics.md). Not needed? Just click **Next**.

### 3. PlayStation

GT Toolz looks for your PS5 in the home network by itself. Check:

- The PS5 and this computer are in the **same network** (cable or Wi-Fi).
- **Gran Turismo 7 is running.**
- The firewall lets GT Toolz in:
  - **Windows:** when Windows Defender Firewall asks, allow access for **private networks**. Public networks are not needed.
  - **macOS:** when macOS asks whether GT Toolz may accept incoming connections or find devices on the local network, click **Allow**.
  - **Linux:** if a firewall runs (for example ufw), open **UDP port 33740** for your home network.

The step shows the progress: **Searching for your PlayStation…**, then **Found:** with your console, then **Waiting for Gran Turismo 7…**, and finally **GT7 is sending telemetry**.

**What to do in GT7:** nothing needs to be switched on in the game. Just drive (a time trial is fine) or play a replay. In menus and loading screens GT7 sends no useful data, so GT Toolz waits there.

**PS5 not found?** Enter its address by hand. You find it on the PS5 under **Settings → Network → Connection Status → View Connection Status** ("IP address", for example `192.168.1.20`). Only addresses of your home network are accepted. More help: [Troubleshooting](troubleshooting.md#the-ps5-is-not-found).

### 4. Voices

The coach needs a voice.

- **Windows:** the Windows voices work right away. Click **Windows voice is enough** to go on without a download.
- **macOS:** the macOS voices work right away. Click **macOS voice is enough**. Better macOS voices: System Settings → Accessibility → Spoken Content → System Voice → Manage Voices.
- **Linux:** download one offline neural voice. The coach stays silent without one.

**Offline neural voices** sound more natural. The ones for your language are preselected; untick what you do not want. Nothing is downloaded until you click **Install selected**. The voice is then prepared for a moment ("Preparing the voice …"). Pick the **Coach voice** on the right and click **Listen** to hear it. More: [Voices](voices.md).

### 5. Name (optional)

- **Your name**: coach and crew address you by it ("Alex! Reference loaded."). Write it the way it should sound.
- **Address**: **In every message** or **Now and then**. Braking calls stay short, without the name.
- Click the big play button to hear the greeting on your earbud. If the name sounds wrong, change the spelling. You can also set **Say the name slower** and the pauses around it.

Without a name, the play button plays a test call: a chime, "Full braking ahead", the countdown and a gear.

### 6. Reference

The coach needs one **reference lap** per track and car class. It learns braking points, gears and curbs from it.

1. In GT7 open **Sport mode → Daily Race**.
2. In the leaderboard, start the replay of a fast driver.
3. Let one complete lap play, from the line to the line. GT Toolz saves it by itself.

You can also drive yourself: drive three laps, and the fastest clean one becomes your reference.

The step shows what is happening, for example **Replay detected** and **Recording · … samples**. In a menu or GT7's intro nothing is recorded; in a race no reference is learned. Recorded something you do not want? Click **Start over**. After learning, a dialog asks what the reference is (Daily Race, lobby, time trial, own race). Details: [Telemetry and references](telemetry.md#references).

### 7. Calibration

The app measures how long after "now" you actually brake: the earbud's delay plus your reaction. The coach then calls every braking point exactly that much earlier.

1. Start a time trial of your choice in GT7.
2. Click **Start calibration** and drive off.
3. On a straight at full throttle (above 80 km/h) the coach counts down: "two, one, now".
4. Hit the brake exactly at "now". You need five valid tries; the coach tells you how many are left.
5. Click **Apply**.

Details and tips: [Coach → Calibration](coach.md#calibration).

### 8. Ready

A summary shows what is ready (PlayStation, voice, reference, calibration) and some tips. Click **Go to the cockpit**. A short **tour** then shows you the app. You can start it again any time with **Tour** on the left; **Esc** ends it, the arrow keys step through it.

## Your first drive

1. Open the **Cockpit**. At the top you see whether the PS5 is sending, and the active reference.
2. Under **I drive**, choose what you drive now (for example **Daily Race**), so the right reference is picked.
3. Start a time trial on the track of your reference.
4. The **out lap is quiet**. Coaching starts at the start/finish line.
5. Before every braking point you hear, for example: a chime, "Full braking ahead.", "Hairpin right. In with first gear, two wheels on the inside curb. Out with second gear.", then "two, one, now".
6. Corners where you lose time get a number. On the next lap you hear before the corner: "Feedback 1: braked 20 meters early."
7. After the lap: "1.7 seconds slower" against the target time.
8. Stopped or paused? Click **Debrief** in the Cockpit to hear your biggest mistakes, or **Briefing** for all braking zones.

Want to hear everything first? Open **Sound check** on the left and click **Play everything**.

## Next steps

- Adjust what the coach says: [Coach](coach.md).
- Race online or offline with the crew on the radio: [Race crew](crew.md).
- Streaming? Add the overlay to OBS: [OBS overlays](overlays.md).
- Change the voices or record your own: [Voices](voices.md).
