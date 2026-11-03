# Race crew

The **Crew** module is your race engineer on the radio. In races it tells you your position, lap and sector times, fuel and tyres, and when to pit. It speaks with its own voice through a radio filter. It is on by default. Its page is **Crew → Settings**; in the Cockpit it shows the **Race crew** card during a race.

The crew needs **no reference**. It compares you with your own best lap in the race. GT7 sends nothing about other cars except your position, so there are no gaps to other drivers.

## When the crew talks

- **Only in a race that runs.** It starts on the grid and checks in once you are under way: "Radio check. Your crew here."
- **Not before the start**: on the loading screen and the grid it is quiet, even when players join and your position jumps.
- **Not in an online lobby or its qualifying.** In qualifying, time trials and free runs only the [tyre calls](#tyre-temperature-in-quali-too) come.
- **Every race from scratch**: laps, fuel and tyres start again with each race and each restart.
- **Silence after the chequered flag.**

The coach and the crew never talk at the same time. The crew waits for a quiet moment between the coach's calls.

## What the crew says

**At the line, after every lap:**

- "Lap 3: one minute 33.8. New best lap! P19 of 20."
- "Lap 4: 2 minutes 13.1. 39.3 seconds slower than your best lap."
- With a reference that fits the track, also the gap to its ghost.

**After a sector** (talk level **Much** only, from lap 3 on):

- "Sector one: 0.4 seconds faster than your best lap."
- With a reference that fits the track, also the gap to its ghost.

**Position:** when your position changes and stays for 3 seconds, at most every 20 seconds, with the sum: "P20 of 20, 12 places lost." The position at the start is the baseline.

**Laps to go:** "Three laps to go.", "Final lap! Bring it home.", "Chequered flag! Well done."

**Fuel** (average of the last three laps):

- "Fuel for 6 laps, 2.4 liters per lap."
- "Box for fuel in lap 7 at the latest." or "Enough to the finish."
- "Box this lap!"

**Tyre wear:** GT7 sends no tyre wear. The crew estimates it from your pace: your best of the last three laps against your best of the first three laps on these tyres. Laps with a trip off the track, slow laps after a spin or crash, and the start lap do not count.

- "Tyres are going off, 1.2 seconds a lap slower than fresh."
- "New tyres would pay off now." when the time you would win over the remaining laps is more than a pit stop costs.
- "Take new tyres at the fuel stop." when you have to stop for fuel anyway.

**Tyre temperature:**

| Call | When |
|---|---|
| "Tyres still cold, careful into the next corner." | below 55 °C |
| "Tyres are up to temperature, you can push." | from 62 °C |
| "Tyres are hot, take it a little easier." | above 100 °C |
| "Tyre temperature rising fast, 95 degrees now." / "Tyres cooling down fast, only 50 degrees." | a change of 10 °C within 20 seconds |
| "Tyre front left is hot, 108 degrees." | one tyre above 105 °C over a lap |

The state is said when it changes, only while you drive. "Cold" and "hot" are repeated every 5 minutes; "up to temperature" comes once, until the tyres were cold or hot in between.

**Rain:** GT7 sends no weather. In the wet, slower laps can be read as tyre wear, and "you can push" can come in the rain.

## Corner calls in races

In races the coach is quiet. With **Corner calls in races** on, the crew calls the braking points over the radio instead: tone, announcement, corner shape and plan, countdown, "now" and turn-in. Before a problem corner it says the mistake briefly: "Feedback 1: braked 20 meters early." Only the mistake, no tips.

- **Which corners**: **Biggest problem corners** (default): the two corners where you lose the most time, from this session, else from earlier sessions with this reference. Or **Always**: every corner.
- Problem corners that cost half a second or more are called through the corner (gear, brake, throttle), as in practice.
- The braking points come from the **reference of the track**. On a track without a fitting reference, nothing is called.
- The **coach module** makes these calls. With the coach off, this setting is greyed out.

> **Fair play:** leagues and tournaments may forbid real-time aids such as braking calls, also when practising in their lobbies. Check the rules before you join.

## Trips off the track and the team boss

With **Coach style: Cheeky** (in the app [Settings](settings.md#personality)), the crew comments on trips into the grass or gravel (at least two wheels for a moment), at most one remark every 30 seconds. The more trips, the more biting:

- "A little trip to the countryside?"
- "You know the grey stuff is the track, right?"
- "Did you know there are drivers who at least pretend they can drive?"

A lap without a trip calms the crew down a little. **Patience of the crew** in Settings sets how fast it gets annoyed.

**Race engineer quits** (level 4): "You know what? I am out. The team boss wants a word." The **team boss** takes the radio with the stand-in's voice, race information too: "This is the team boss. My race engineer needs a break. You need a track. Take the grey one." After a few laps the engineer is back: "I am back. The boss says you behaved. More or less."

## Tyre temperature in quali too

With this setting on (default), the crew also watches your tyres outside races: in Daily Race qualifying, time trials and free runs. It says on the radio when the tyres are up to temperature, when they get hot, and when one tyre ran hot over a lap. "Up to temperature" comes once; "cold" and "hot" are repeated every 5 minutes. A licence test or a mission (one car, one lap) counts as well: no crew, only the tyres, once over all your tries. The calls come between the coach's calls. With the crew module off, nobody says them.

## The Race crew card

During a race the Cockpit shows: **Position**, **Lap**, **Sector**, **This lap**, **Last lap** with the gap **to best**, the **Ghost** gap, **Fuel** ("2.4 l per lap · 6 laps", "enough to the finish" or "box in lap 7 at the latest"), **Tyres** ("1.2 s per lap slower than fresh", "new tyres would pay off") and your trips off track.

## Settings

Open **Crew → Settings**.

### Race crew

| Setting | Default | What it does |
|---|---|---|
| **How much the crew says** | Normal | **Much**, **Normal** or **Little**. See below. |
| **Corner calls in races** | on | The crew calls the braking points over the radio. Needs the coach module. |
| **Which corners** | Biggest problem corners | **Always** (every corner) or **Biggest problem corners** (the two that cost the most time). |
| **Sectors per lap** | 3 | A report after each sector; 1 = only after the lap. 1 to 6. Only at talk level **Much**. |
| **Fuel and tyres** | on | Fuel per lap, laps left, pit advice; tyre wear estimated from the pace. |
| **Tyre temperature in quali too** | on | The tyre calls also in time trials, free runs and qualifying. |
| **Pit stop costs** | 25 s | Time lost in the pit lane, for the tyre advice. 10 to 60 s. Set it to what a stop costs on your track. |
| **Race engineer quits** | on | Level 4 in races: the team boss takes over. Cheeky style only. |
| **Team boss for** | 2 | Laps until the race engineer comes back: 1, 2 or 3. |
| **Radio filter** | on | The crew sounds like team radio. |

### Audio

| Setting | Default | What it does |
|---|---|---|
| **Crew speaks** | Like the app | The crew's language. It can differ from the coach's. |
| **Race crew** (volume) | 100 % | The radio and the team boss, as a share of the overall volume. The play button plays a crew message. |

The crew's voice is chosen under **Voices → Box crew**; the team boss uses the **Stand-in** voice. See [Voices](voices.md).

### How much the crew says

| Level | What you get |
|---|---|
| **Much** | Everything the settings allow, sector times too. |
| **Normal** (default) | At the line the lap time and position, no sector times. |
| **Little** | Position, laps to go near the end, fuel and tyres only: no lap times, no remarks, no corner calls. |

## Tips

- **Set the pit stop cost** for your track. A long pit lane costs more than 25 seconds.
- **Want the braking calls in every corner?** Set **Which corners** to **Always**.
- **Racing in a league?** Switch **Corner calls in races** off if real-time aids are not allowed.
- **A race over a time against only one or two opponents** looks like practice to GT Toolz. The crew does not start then; the coach stays active.
- Hear the crew on the **Sound check** page under **Race crew (radio, races only)**.
