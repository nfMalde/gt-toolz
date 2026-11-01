# Troubleshooting

Something does not work? Find your problem below. If nothing helps, [report it](#report-a-bug) with a log. We read every report.

> **Beta.** Windows is fully tested. macOS and Linux are only partly tested and may show errors or crashes. Reports from Mac and Linux users help a lot.

## Installing

**Windows says "Windows protected your PC".** The installer is not signed. Click **More info**, then **Run anyway**. See [Getting started → Windows](getting-started.md#windows).

**macOS says it cannot check the app.** Open **System Settings → Privacy & Security** and click **Open Anyway** next to GT Toolz.

**macOS says "GT Toolz is damaged and can't be opened".** The app is fine. Open the **Terminal** app once and run:

```bash
xattr -dr com.apple.quarantine "/Applications/GT Toolz.app"
```

**Linux: the package does not open in the software installer.** Install it in a terminal in the download folder:

```bash
sudo apt install ./gt-toolz_<version>_amd64.deb
```

**A second window does not open.** GT Toolz runs only once. Starting it again brings the open window to the front.

## Connection

### The PS5 is not found

- Are the PS5 and the computer in the **same network**? A guest Wi-Fi or a separate network for devices often keeps them apart.
- Is a **VPN** running on the computer? GT Toolz never searches through a VPN. Connect the computer to your home network directly.
- **Firewall:**
  - Windows: if you clicked "Cancel" or allowed only public networks, allow GT Toolz for **private networks** in Windows Security → Firewall & network protection → Allow an app through firewall. Also check that your home network is set to **Private** in Windows (Settings → Network & internet → your network → Network profile type).
  - macOS: allow GT Toolz under System Settings → Privacy & Security → Local Network (newer macOS versions). If the macOS firewall is on, also allow incoming connections for GT Toolz under System Settings → Network → Firewall → Options.
  - Linux: open **UDP port 33740** for your home network in your firewall.
- **Enter the address by hand:** on the PS5, open **Settings → Network → Connection Status → View Connection Status** and note the IP address. Enter it in **Telemetry → Settings → PS5 address** (or in the setup step) and click **Save**.
- After a router restart the PS5 may have a new address. With the field empty, GT Toolz searches again by itself. With an address entered, update it.

### "PS5 found · waiting for GT7"

The console answers, but GT7 sends nothing yet.

- Start Gran Turismo 7.
- Drive (a time trial is fine) or play a replay. In menus, loading screens and GT7's intro there is nothing useful to receive.

### "Port 33740 is in use"

Another telemetry tool is running on this computer and holds the port. Close it and restart GT Toolz. Run only one telemetry tool at a time: two tools can also change what the PS5 sends in the middle of a session.

### The connection drops now and then

- Use a cable for the computer if you can, and 5 GHz Wi-Fi or a cable for the PS5.
- GT Toolz reconnects by itself.

## The coach

### I hear nothing

- Is **Calls** at the bottom left on? The Cockpit shows **Muted** while it is off.
- Check the **Volume** under Calls, and the coach's share under **Coach → Settings → Coach**.
- Is the right output device chosen in your system? GT Toolz plays on the system's default output. Set your earbud as the default.
- Is the voice still being prepared? The Cockpit shows **Preparing voice … · 12/31**.
- **Voice problem: …** in the Cockpit: pick another voice under [Voices](voices.md).
- On **Linux**, the coach needs a downloaded neural voice.
- Try **Sound check → Play everything**. It plays even when muted.

### The coach is quiet on track

That is often on purpose. The coach is quiet:

- **on the out lap**: coaching starts at the start/finish line (**Silent out lap**);
- **in races**: the [race crew](crew.md) talks there. GT Toolz counts more than three cars, or a race with laps, as a race;
- **in an online lobby and its qualifying**: GT7 reports them as a race;
- **in replays**, unless **Calls during replays** is on;
- **off the reference line**: the Cockpit shows **Off the reference line · coach paused**. You may be on another track, or the reference is for another layout;
- **while learning** a new reference: the Cockpit shows **Learning mode**.

Also check that the **Coach** module is on (**Modules**).

### "now" comes too late (or too early)

- **Calibrate** (or calibrate again with a new earbud): [Calibration](coach.md#calibration).
- Or change **Coach → Settings → Audio delay** by hand: raise it if "now" comes too late, lower it if it comes too early.
- Braking points of another car may not fit. Check for the warning **Different car than the reference**.

### Too many calls, or calls run into each other

- Set **How much the coach says** to **Little**.
- Lower the **Countdown** to 1 or 0 numbers.
- Switch **Call style** to **Pace notes**.
- Keep **Combine corner sequences** on.
- Switch off what you do not need, for example **Corners without braking** or **Turn-in**.

### The voice is hard to understand

Some German voices can be hard to understand at times; we are working on it. Try another voice, lower the **Speed**, or raise the pauses under **Voices → Speed & pitch**. Test it with **Play test call**.

## References

### The reference is not learned

- Let **one complete lap** play, from the start/finish line to the line. If nothing is learned after a full lap, let the replay play one more lap.
- Do not skip or rewind the replay. Pausing is fine.
- In a menu or GT7's intro nothing is recorded. The Cockpit says so.
- In a race no reference is learned. Use a replay or a time trial.
- From your own laps, three complete laps are needed; the fastest clean one counts. A pause or a restart makes a lap unclean.
- Something wrong was recorded? Click **Start over** in the setup, or **Learn new reference** on the References page.

### The wrong reference is used

- Check **I drive** in the Cockpit. The automatic pick only takes references for that mode and BoP.
- Pick the reference by hand: **References → Use**.
- Check the mode of the reference: **References → Edit**.
- Turn **Pick the reference automatically** off in **Telemetry → Settings** if you always want to choose yourself.

## Race crew

**The crew says nothing.** It talks only in a race that runs, from the start on. Not in the lobby, not before the start, not after the chequered flag. A race over a time against only one or two opponents looks like practice. Check that the **Crew** module is on.

**The tyre advice is wrong after a spin or in the rain.** The crew estimates tyre wear from your lap times. GT7 sends no wear and no weather, so wet laps can look like worn tyres.

## OBS overlays

- **The page "Browser sources" is missing:** switch on the **OBS overlays** module on the **Modules** page.
- **Port … is already in use:** pick another **Port**, click **Save**, and copy the new address into OBS.
- **The overlay is cut off or too big:** set the browser source's width and height to your OBS canvas size, and pick the same **Canvas** in the editor.
- **The overlay is invisible:** with **Hide automatically** on, it shows only on track in races, time trials and qualifying.
- **The overlay looks old after an update:** in OBS, open the browser source's properties and click **Refresh cache of current page**, or restart OBS.

More: [OBS overlays](overlays.md).

## Vibration

See the checklist in [Vibration → Not felt?](haptics.md#not-felt-things-to-check).

## Recording your voice

**No access to the microphone.** Allow it:

- Windows: Settings → Privacy & security → Microphone → let desktop apps access it.
- macOS: System Settings → Privacy & Security → Microphone → allow GT Toolz.
- Linux: check in the sound settings that a microphone is connected and not muted.

**"Nothing to hear"**: check the microphone and speak a little louder.

## Start fresh

If settings are badly mixed up, **Settings → Diagnostics → Reset data** brings GT Toolz back to the first day. You can keep the downloaded voices. See [Reset data](settings.md#reset-data).

## Logs

GT Toolz writes a **session log** every time it runs: what the coach did, the connection, laps, mistakes and errors. Logs are **always anonymous**. Before a line is written, GT Toolz replaces your name, other players' names, the PlayStation's name, folder paths, user names, e-mail addresses and IP addresses with placeholders such as `<driver>` or `<lan-ip>`.

### Switch on the detailed log

For timing problems ("now" too late, calls cut off, the crew too early), the detailed log helps more:

1. Open **Settings → Diagnostics**.
2. Switch **Detailed log** on. It also records every call, crew message and help step. The log gets much longer, and stays anonymous.
3. Reproduce the problem.

Switch it off again afterwards if you like.

### Where the logs are

| System | Folder |
|---|---|
| Windows | `%APPDATA%\GT Toolz\sessions` |
| macOS | `~/Library/Application Support/GT Toolz/sessions` |
| Linux | `~/.config/GT Toolz/sessions` |

**Settings → Diagnostics → Session logs → Open folder** opens it. Each start writes a new `.log` file, named by date and time. The last 30 logs are kept.

### Save a log for a GitHub issue

1. Reproduce the problem. Do not close GT Toolz yet.
2. Open **Settings → Diagnostics**.
3. Next to **Log for a GitHub issue**, click **Save**.
4. Choose where to save it. Your **Downloads** folder is suggested; the file is called `gt-toolz-log-<date-time>.txt`. It starts with the app version, your system, the log level and the app language.

The app sends nothing. You decide what you attach.

GT Toolz crashed, or you already closed it? The logs of earlier sessions are in the log folder above. They are anonymous too. Take the newest one from the time of the problem.

## Report a bug

1. Open [github.com/nfMalde/gt-toolz/issues/new/choose](https://github.com/nfMalde/gt-toolz/issues/new/choose). You need a free GitHub account.
2. Choose the template that fits, for example a bug report.
3. Describe what you did, what you expected, and what happened instead. Add your system (Windows, macOS or Linux) and the GT Toolz version (shown at the bottom left of the navigation, and in the log file).
4. **Drag the log file** into the text box to attach it.
5. Send it.

Ideas and feedback are welcome there too.
