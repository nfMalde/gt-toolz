# Telemetry and references

The **Telemetry** module is the connection to your PS5. It is always on, because every other module reads from it. It has three pages: **Cockpit**, **References** and **Settings**.

## How the connection works

GT7 has a built-in interface that sends telemetry over the home network: the car's position, speed, pedals, gear, tyres and more, 60 times a second. GT Toolz:

1. looks for your PS5 in the home network,
2. tells it to start sending,
3. receives the data and reads it.

Nothing needs to be switched on in GT7. GT Toolz only reads what GT7 sends about **your own car**. GT7 sends nothing about other cars except your race position.

The title bar and the Cockpit show the state in four steps: **This PC** (or **This Mac**) → **PlayStation** → **Gran Turismo 7** → **Telemetry**.

| Message | Meaning |
|---|---|
| **Searching for PS5…** | GT Toolz looks for the console in the network. |
| **PS5 not found · retry in … s** | No answer yet. It tries again by itself. |
| **PS5 found · waiting for GT7** | The console answers, but GT7 sends nothing yet. Start GT7 and drive or play a replay. |
| **Live** | Telemetry arrives. |
| **Port 33740 is in use** | Another telemetry tool is running on this computer. Close it and restart GT Toolz. |

GT Toolz only looks on private home networks, never through a VPN. Once it knows your PS5, it accepts data from that console only.

## What GT7 is doing: the session mode

GT7 does not say which mode you are in. GT Toolz works it out, and the Cockpit shows it as a chip at the top:

| Mode | When | What happens |
|---|---|---|
| **Race** | GT7 reports a race with laps, or more than three cars | The coach is quiet. The [race crew](crew.md) talks on the radio. |
| **Practice** | Time trial, free run, qualifying | The [coach](coach.md) is active. |
| **Replay** | GT7 shows a replay | The coach is quiet by default. References can be learned. |
| **Menu / preparation** | Menus, loading screens, the race preparation screen, results | Nothing happens. |

A race over a time against only one or two opponents looks like practice to GT Toolz. An online lobby and its qualifying count as a race.

## The Cockpit

The Cockpit is the page you keep open while driving. Every module that is on adds its cards. The Telemetry module shows:

- **Session**: the connection steps, the active **Reference** (track, mode, car, target time, player, number of braking zones) with **Change**, the **I drive** switch, and the coach's state, for example **Out lap · coaching starts at the line** or **Coaching · lap 3**.
- **Live telemetry**: speed, gear, throttle, brake, the current, last and best lap.
- **Timeline**: what happened, for example "Reference loaded", "Lap 3: 1:33.812", "Feedback 1: braked 20 meters early", spins with their cause.
- **Learn the track**: while a reference is being learned, with step-by-step help.

Warnings at the top:

- **Off the reference line · coach paused**: you are far from the reference's line (another track, or a big detour). The coach waits until you are back.
- **Different car than the reference: you drive the …, the reference drove the …**: braking points of another car may not fit. The coach says it once too.
- **Same car as the reference** shows a check mark when everything fits.

## References

A **reference** is one fast lap that the coach compares you with. GT Toolz learns from it: braking points, brake pressure, gears (also shifts in the corner), the apex speed, the turn-in point, the corner shape, curbs and where the reference trail-brakes.

You need one reference per **track and car class** (Gr.3, Gr.4 …). Another car of the same class works, with a warning.

### Learn from a replay (best)

A ghost replay of a fast driver gives you the best reference.

1. In GT7 open **Sport mode → Daily Race**.
2. In the leaderboard, start the replay of a fast driver.
3. Let one complete lap play, from the start/finish line to the line. GT Toolz saves it by itself.

Tips:

- Pausing the replay is fine. Do not skip or rewind: a jump breaks the lap.
- GT Toolz takes the **first clean lap** of the replay.
- Any replay with a full lap works, not only Daily Race ghosts.
- GT7 sends no player names. Enter the player's name from the leaderboard, so you know later whose lap you are chasing.

### Learn from your own laps

No replay at hand? Drive three laps. The fastest clean one becomes your reference. The Cockpit shows **Own laps: 2 of 3**. A lap is not clean if you pause, the game loads, or the car jumps (a restart). If none of the three is clean, the next clean lap counts.

No reference is learned in a race. Learning goes on afterwards, or in a time trial.

### Learn a new reference by hand

On the **References** page, click **Learn new reference**. The dialog asks:

- **Who drove this lap? (optional)**: the player from the leaderboard. Your own laps get your name by themselves.
- **Existing data**: **Keep** your other references, **Delete all**, or **Choose** which to delete. Tick **Only delete the remembered mistakes, keep the references** to start fresh with the same references.

Click **Start learning**. The next clean lap (replay or own) becomes the new reference. Until then no saved reference is picked automatically.

### What is this reference? (mode and BoP)

Lap times from a Daily Race (always with BoP) and from a single-player session (with or without BoP) cannot be compared. GT7 does not tell which mode a lap comes from, so GT Toolz asks you. After learning, the dialog **What is this reference?** opens:

- **Mode**: **Daily Race**, **Online lobby**, **Time trial (single player)** or **Own race / free run**.
- **BoP**: on or off. Daily Races always have BoP. In a lobby BoP is on by default, in single player off.
- **Own name (optional)**: shown instead of the track name, for example "Daily A, week 42".
- The player.

The dialog is prefilled with a guess: a ghost replay is taken as a Daily Race lap; your own lap as what **I drive** says. Click **Apply** to save, or **Later** to be asked again at the next start. A reference without a confirmed mode shows **Mode not set** and fits any mode.

### The References page

Each reference is a card with the track (or its own name), the car, the length, the target time and the player. Chips show the mode, the number of braking zones, where it comes from (**Ghost replay** or **Own lap**), how many zones have remembered mistakes, and the date.

| Button | What it does |
|---|---|
| **Use** | makes this reference the active one |
| **Edit** | change the mode, BoP, own name, player, target time, and the car name for cars the app does not know yet |
| **Forget mistakes** | deletes the remembered mistakes of this reference (the briefing and the race crew use them) |
| **Delete** | deletes the reference after a question |
| **Open folder** | opens the folder with the reference files |

**Target time:** by default the reference's own lap time. Enter another one as `m:ss.000`, for example `2:16.500` (the official leaderboard time). Leave it empty to go back to the lap time. The coach's lap difference compares against it.

**Memory:** GT Toolz remembers the last result of every braking zone per reference. So the briefing and the race crew know your problem corners also in the next session.

## I drive

The **I drive** switch in the Cockpit says what you are driving right now: **Daily Race**, **Lobby**, **Time trial** or **Own**, with **BoP** on or off (always on for a Daily Race). Default: **Daily Race**.

The automatic pick only takes references for what you drive. Your own laps are learned as this mode. References without a mode fit everything.

When you choose a reference yourself (**Use** on the References page, or **Change** in the Cockpit), the switch follows it: a Daily Race reference puts **I drive** on **Daily Race** with **BoP**. So the reference you chose is not dropped for not matching the switch. Flip the switch afterwards if you really drive something else.

## Pick the reference automatically

With **Telemetry → Settings → Pick the reference automatically** on (default), GT Toolz picks the reference for the track you drive:

1. It checks whether you drive on the active reference's line, in its direction, with a car of its class and the mode of **I drive**.
2. If not, it watches all saved references of your car class. After about 10 seconds of driving on a fitting one, it switches and says: "Track recognized: Circuit de Spa-Francorchamps. Reference: Jaguar F-type Group 3."
3. If several fit, it takes the one you used last; if you never used any of them, the fastest.
4. If none fits after about 30 seconds of driving, it learns your own laps: "No reference for this track and class yet. I will ride along quietly for three laps and take your fastest."

A short trip into the gravel does not lose the reference. In races a fitting saved reference is picked too, but none is learned there. With the setting off, the coach always uses the reference you chose.

## Settings

**Telemetry → Settings** has three cards.

| Setting | Default | What it does |
|---|---|---|
| **PS5 address** | empty (automatic) | Leave it empty to search the network. Enter an address only if the PS5 is not found, for example `192.168.1.20`. Only home-network addresses are accepted. Click **Save**. |
| **Pick the reference automatically** | on | Picks the fitting saved reference for the track and car class, as described above. |
| **Record telemetry** | off | Saves the session's telemetry to a file for bug reports, about 80 MB per hour. It stays on your computer. The last five recordings are kept. The Cockpit shows **Recording telemetry** while it runs. |

Recordings are stored in the `sessions` folder of your [data folder](settings.md#where-your-data-is). Only turn recording on if a developer asks for it.
