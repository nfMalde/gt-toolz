# Settings and modules

GT Toolz has one **Settings** page for the whole app (in the navigation below **Sound check**) and a settings page for each module: [Telemetry](telemetry.md#settings), [Coach](coach.md#settings) and [Crew](crew.md#settings). [OBS overlays](overlays.md) and [Vibration](haptics.md) are set up on their own pages.

Every change applies at once. There is no save button, except for text fields like the PS5 address and the overlay port.

## Settings for the whole app

### Personal

| Setting | Default | What it does |
|---|---|---|
| **Streamer mode** | off | Hides private values on screen. See [Streamer mode](#streamer-mode). |
| **Your name** | empty | Coach and crew address you by name. Write it the way it should be spoken. Letters, spaces, hyphens and apostrophes, up to 30 characters. **Listen** plays the greeting. |
| **Address** | In every message | **In every message** or **Now and then** (important messages always, others every third time). Braking calls stay short, without the name. |
| **Say the name slower** | 3× | Neural voices say a name on its own very briefly. 1× is as fast as the rest. 1× to 4×. |
| **Pause before the name** | 0.5 s | Silence before the name, so its start is not swallowed. 0 to 2 s. |
| **Pause after the name** | 1 s | Between the name and the sentence. 0 to 2 s. |

The last three show once you entered a name. Example with the name "Alex": "Alex! Reference loaded. Spa. You can start."

### Language

| Setting | Default | What it does |
|---|---|---|
| **Language** | Deutsch | The app's language: **Deutsch** or **English**. Coach and crew speak it unless you set their own language. |

The **DE | EN** switch in the title bar does the same, on every page. The coach's and the crew's own languages are set on their pages; see [Languages per role](voices.md#languages-per-role).

### Audio

| Setting | Default | What it does |
|---|---|---|
| **Volume** | 100 % | Everything GT Toolz says: coach, crew, countdown and tones. Also at the bottom left under **Calls**. |

The coach's and the crew's share of it are on their settings pages.

### Personality

The coach and the crew share their personality.

| Setting | Default | What it does |
|---|---|---|
| **Coach style** | Cheeky | **Cheeky**: remarks when a mistake keeps coming despite the help, and at some point the coach loses it. **Factual**: no remarks. Braking calls stay factual in both. |
| **Patience of the coach** | Normal | How fast the cheeky coach gets annoyed: **A lot**, **Normal** or **Little**. Only with the cheeky style. |
| **Patience of the crew** | Normal | The same for the cheeky crew. Only with the cheeky style. |

### Updates

| Setting | Default | What it does |
|---|---|---|
| **Look for updates** | as you answered in the news window (ticked there) | Looks for a newer version on GitHub at start. Only official installed builds can look. |

Below it you see your installed version, the result of the last look, and **Look now** (or **Show update** when a newer version is out). In builds that cannot look (development, built from source) the card says so instead. Details: [Updates and news](updates.md).

### Diagnostics

| Setting | Default | What it does |
|---|---|---|
| **Session logs** | – | What the coach did, for bug reports. Always anonymous: no names, IP addresses or folder paths. **Open folder** opens the log folder. |
| **Log for a GitHub issue** | – | **Save** writes this session's log as a text file, with app version and system. Drag the file into your bug report. |
| **Detailed log** | off | Also every call, crew message and help step. Helps with timing issues; the log gets much longer. Anonymous too. |
| **Reset data** | – | Deletes everything GT Toolz has saved and restarts the app as on the first day. See below. |

How to report a bug with a log: [Troubleshooting → Logs](troubleshooting.md#logs).

## Talk levels

How much the coach and the crew say is set per role, at the top of their settings:

- **Coach → Settings → Feedback → How much the coach says**
- **Crew → Settings → Race crew → How much the crew says**

| Level | Coach | Crew |
|---|---|---|
| **Much** | everything the settings allow | everything, sector times too |
| **Normal** (default) | no sector calls against the ghost, no tip right after the corner | lap time and position at the line, no sector times |
| **Little** | braking points and one feedback corner only: no corner plan, no corners without braking, no calls through problem corners, no lap difference, no cheeky remarks | position, laps to go near the end, fuel and tyres only: no lap times, no remarks, no corner calls |

The level works on top of the single settings. Your own settings stay as they are; switch back to **Much** and they all apply again. The braking calls (tone, announcement, countdown, "now") always stay.

## Mute: the Calls switch

**Calls** at the bottom left mutes the coach and the crew in one click, and turns them back on. The Cockpit shows **Muted** meanwhile. [Vibration](haptics.md) keeps going while muted. The **Sound check** plays even when muted.

## Streamer mode

Streamer mode hides on screen:

- the PlayStation's IP address and its name,
- file paths,
- other players' names (from references),
- device names (audio outputs on the Vibration page show as "Output 1, 2 …").

The coach does not say other players' names either. Your own name and the speakers of voice packs are not hidden.

Switch it on with the eye button **Streamer** in the title bar, under **Settings → Personal**, or in the first step of the setup assistant.

**Show a hidden value:** click it. A warning asks **Visible on stream?**; click **Show anyway**. The value shows for 10 seconds, then it is hidden again. A click hides it at once.

## Modules

GT Toolz is made of modules. Open **Modules** at the top of the navigation. Switch on what you use: a module that is off does nothing and has no pages in the navigation.

| Module | Default | What it does |
|---|---|---|
| **Telemetry** | always on | The connection to the PS5: live values, learning and picking reference laps, recording. Every other module reads it. |
| **Coach** | on | Braking points with a countdown, corner plans, feedback after the corner, briefing and debrief. Cheeky if you like. |
| **Crew** | on | Your race engineer on the radio in races: position, gaps and sector times, tyres and fuel, when to pit. |
| **OBS overlays** | off | Browser sources for OBS: live values on your stream, served from this computer only. |
| **Vibration** | off | Feel instead of hear: the calls as vibration, through an audio output or a controller. Experimental. |

**Open** goes to the module's first page. A module that is off shows **Off: its pages are hidden and it does not run.**

Good to know:

- With the **Coach** off, there are no braking calls, no briefing or debrief, and no corner calls in races. The telemetry still learns references.
- With the **Crew** off, there is no race radio and no tyre calls in qualifying. The coach still says the cause of a spin in races.
- The setup assistant's first step has the same switches.

## Where your data is

Everything GT Toolz saves stays in one folder on your computer:

| System | Data folder |
|---|---|
| Windows | `%APPDATA%\GT Toolz` |
| macOS | `~/Library/Application Support/GT Toolz` |
| Linux | `~/.config/GT Toolz` |

| Inside | What |
|---|---|
| `config.json` | your settings, the calibration, your own texts |
| `references` | your reference laps and their remembered mistakes |
| `sessions` | session logs (the last 30) and telemetry recordings (the last 5) |
| `voices` | downloaded voice engines and voices |
| `cache` | prepared voice clips |
| `voice-packs` | your recorded voice packs |

The folder stays when you uninstall GT Toolz.

## Reset data

**Settings → Diagnostics → Reset data → Reset …** shows what will be deleted, with counts and sizes:

- all settings, the calibration and the setup,
- your references, with their memory of mistakes,
- logs and telemetry recordings,
- your own voice packs (recordings),
- downloaded voices.

Tick **Keep the downloaded voices** if you want to keep them. Click **Delete everything and restart**. This cannot be undone. GT Toolz restarts as on the first day, with the welcome window and the setup assistant.

## Other pages

- **Sound check**: plays everything you can hear while driving, with your voice, settings and reference. **Play everything**, or one call at a time.
- **Setup**: opens the setup assistant again.
- **Tour**: a short tour of the app.
- **About & licenses**: the version, privacy, how to support the project, and all third-party licenses.
