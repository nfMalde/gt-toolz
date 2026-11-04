# GT Toolz alpha for the Mac

Thanks for testing the GT Toolz alpha! GT Toolz is a toolkit for Gran Turismo 7: it reads the telemetry your PS5 sends on your home network. A coach and a pit crew call out braking points, corners and lap times, and overlays show your values in your stream.

This Mac alpha comes without an installer: the folder holds the built app, and Electron runs it. The start script downloads Electron once, on the first start, and checks it. You install nothing. (Deutsch: `README.de.md`.)

## What you need

- a Mac with **macOS 13 Ventura or later** (Apple chip or Intel);
- **internet** on the first start (about 100 MB);
- a **PS5 with Gran Turismo 7** on the same network as the Mac (Wi-Fi or cable);
- **headphones or an earbud on the Mac**: the coach speaks through the Mac, the game sound stays on the TV.

## 1. Unpack

Double-click the ZIP. Put the folder `GT-Toolz-…-mac` somewhere it can stay, e.g. your home folder. Not the Trash: the app runs from this folder.

## 2. Start

**The first time through Terminal.** macOS does not run a downloaded script without an Apple signature on a double-click and calls it "damaged". It is not damaged; through Terminal it starts straight away:

1. Open **Terminal**: Cmd+Space, type "Terminal", Enter.
2. Type `sh ` with a space after it.
3. Drag **`Start GT Toolz.command`** from the folder into the Terminal window and press **Enter**.

The `sh` in front matters. With `./Start…` or a double-click, macOS blocks the script the first time ("bad interpreter: Operation not permitted" or "damaged").

Or: type `xattr -dr com.apple.quarantine ` (with a space at the end), drag the folder `GT-Toolz-…-mac` into the Terminal window, Enter. That takes the download flag off the folder; after that a double-click on `Start GT Toolz.command` works.

- **The first time** it downloads Electron for your Mac (about 100 MB, a few minutes) and checks the file, then GT Toolz opens.
- **From then on a double-click** on `Start GT Toolz.command` is enough: on the first start the script takes the download flag off its folder. The app starts at once, without internet.
- The Terminal window stays open while GT Toolz runs. Close it after you quit the app.

**If macOS says "… is damaged and can't be opened. You should move it to the Trash":** click **"Cancel"** or **"Done"**, *not* "Move to Trash", and start it through Terminal as above.

During the alpha the app is called **"Electron"** in the Dock, with the Maldö mascot as its icon. That is expected.

## 3. Allow when macOS asks

- **Local network** (macOS 15 and later): **Allow**. Without it, GT Toolz cannot find your PS5. Because the app starts from Terminal, macOS may ask for "Terminal" or "Electron". You can change it later under Privacy & Security → Local Network.
- **Incoming connections** (if the firewall is on): **Allow**. This is how the PS5's telemetry arrives.
- **Microphone**: GT Toolz asks only when you record your own voice under "Recordings".

## 4. Set up

The setup assistant walks you through:

1. Pick the **language**.
2. Let it **find the PS5**: just drive in Gran Turismo 7 or play a replay.
3. Pick a **voice**:
   - The macOS voices work right away.
   - The offline neural voices sound more natural; they are downloaded only after you confirm.
   - For better macOS voices ("Premium"), go to System Settings → Accessibility → Spoken Content → System Voice → Manage Voices.
4. Enter **your name** if the coach should address you.
5. Learn a **reference lap**.
6. **Calibrate**: this matters, so the "now" comes exactly at the braking point.

## 5. Report problems

To send a log:

1. In GT Toolz, open **Settings → Diagnostics**.
2. Next to "**Log for a GitHub issue**", click **Save**. The file goes to Downloads.
3. Send the file with a short description to Maldö (as agreed).

The log is anonymous: no names, IP addresses or folder paths. For timing problems, switch on "**Detailed log**" first and drive the spot again. If the start itself fails, send what the Terminal window shows.

## 6. Good to know

- **Network:** GT Toolz talks only to your PS5 on your home network. It goes online only when you download voices yourself, and once on the first start for Electron. No account, no ads.
- **Streaming?** Under "Browser sources" on the left you put together overlays for OBS: throttle and brake, tyres, speed, gear and laps, as one browser source.
- **Your data** (settings, references, recordings) is in `~/Library/Application Support/GT Toolz`. A later version with an installer keeps it.
- **Remove:** delete the folder `GT-Toolz-…-mac` (Electron is inside it, in `runtime`). To delete your data too, delete the folder above.

Have fun driving!
