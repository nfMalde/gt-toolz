# Coach

The **Coach** module talks you through every braking zone, tells you where you lose time, and helps you fix it. It is on by default. Its pages are **Coach → Settings** and **Coach → Calibration**; in the Cockpit it adds its cards.

The coach needs a [reference](telemetry.md#references) for the track and car class. It works in **time trials, free runs and practice**. In races it is quiet; there the [race crew](crew.md) talks.

## On track: what you hear

The out lap is quiet. Coaching starts when you cross the start/finish line for the first time.

Before every braking zone, in this order:

| Call | Example |
|---|---|
| Attention tone | a short chime |
| Feedback (only for a problem corner) | "Feedback 1: braked 20 meters early." |
| Announcement | "Full braking ahead." or "40 percent braking ahead." |
| Corner plan | "Hairpin right. Ease off the brake into the corner. In with first gear, two wheels on the inside curb. Out with second gear, all four on the outside curb." |
| Countdown | "two, one" |
| Braking point | "now" |
| Gear after "now" (off by default) | "gear two" |
| Turn-in | "right, sharp" |

The coach plans every call against the reference's timing. If there is not enough time, it takes a shorter version: first the short plan ("Hairpin right. First in, second out."), then the shape only ("Hairpin right."), then fewer countdown numbers. Anything that would come too late is left out, never played late. "now" is never talked over.

**Corner shapes:** hairpin, tight, medium, fast, chicane ("chicane, right left"), always with the direction.

**Curbs:** where the reference used them, inside towards the apex and outside on the exit, and how much of the car: one wheel, two wheels (one side, front and rear), or all four (the whole car).

**Gears:** the gear to shift down to, a further downshift after the apex if the reference does one ("In with third gear. Then down to second. Out with third gear."), and the exit gear.

**Trail braking:** where the reference still brakes when it turns in and eases off towards the apex, the plan says "Ease off the brake into the corner."

**Corners without braking:** corners taken flat, with a lift or on part throttle: "Flat right, two wheels on the curb." or "Lift to 125, left." If such a corner comes right after a braking zone, that zone's plan says it too: "… Then lift to 140, right."

**Corner sequences:** when a braking zone comes less than 6 seconds after the previous one, the first plan names it: "… Then medium left." In the sequence the coach only calls the braking points and gears, without explanations.

**Corner names:** official corner names where the app knows them ("Braking zone 4, Bruxelles"), otherwise "Turn 6", "Braking zone 3" or "Fast corner 2".

### After the corner and after the lap

- **Feedback:** corners where you lose at least a tenth of a second get a number: Feedback 1, 2 … The number stays the same for the whole session. On the next approach you hear what went wrong, as long as there is time:
  - long: "Heads up, the corner for feedback 1 is coming. What went wrong: braked 20 meters early."
  - short: "Feedback 1: braked 20 meters early."
  - mini: "Feedback 1: too early."
  - When you get it right: "Feedback 1 fixed, nice job."
- **Mistakes the coach finds:** braked early or late, no braking, wrong gear, too slow or too fast at the apex, late on the throttle, too little or too much brake pressure, brake already off at turn-in where the reference trail-brakes, braked too far into the corner.
- **Right after the corner** (talk level **Much** only): when you came out at least 5 km/h slower than the reference: "You were 12 kilometers per hour too slow out of the right-hander. Try: Throttle sooner."
- **Lap difference:** after every lap, against the target time: "1.7 seconds faster", "2.3 seconds slower" or "Right on the target time".
- **Sectors against the ghost** (talk level **Much** only): after each sector: "Sector one: ghost 0.8 seconds ahead."

### Help before cheekiness: the help ladder

When the same mistake keeps coming in a corner, the coach helps step by step:

1. **Feedback** (first time), as above.
2. **Tip** (second time), with the reference's numbers: "Heads up, feedback 1. Last time again braked 20 meters early. Tip: Wait until I say now. Don't brake at one."
3. **Helping cue** (third time): the calls in that corner help you directly. The coach says once what it does, for example "I'll say wait. Brake only when I say now."
4. **Focus exercise** (fourth time): "Little exercise: we focus only on Turn 5 now. For two laps I'll only talk there." The other corners keep their braking calls but get no feedback. A clean run ends it early: "Turn 5 works now. Exercise done, well done."
5. **Help used up**: only now can the [cheeky coach](#cheeky-coach) lose patience.

Two clean runs in a row end the help for that corner. If the mistake gets clearly smaller, you get praise: "Better! Only braked 10 meters early now."

| Mistake | Helping cue |
|---|---|
| Braked too early | "wait" instead of the last number: "two, wait, now" |
| Braked too late | "now" comes a little earlier |
| Wrong gear | the gears after "now" and where the reference shifts in the corner |
| Apex too slow or too fast | the target speed at turn-in: "apex 120" |
| Late on the throttle | "Throttle!" at the reference's full-throttle point |
| Brake off too early at turn-in | "ease off" at turn-in |
| Braked too far into the corner | "Off the brake!" where the reference lets go |
| Brake pressure, no braking | the announcement with the brake pressure |

### Problem corners: called through the corner

A feedback corner that cost half a second or more gets extra calls after "now", at the reference's points: the gears, "ease off", "apex 110", "Throttle!". The feedback says once: "I'll take you through the corner: gear, brake and throttle."

### Spins and slides

When the car spins or the rear steps out, the coach says what started it and how to avoid it:

- "Spin. You were on the throttle with wheels in the grass. Off the track, lift off and keep the wheel straight. Only get back on the throttle on the tarmac."
- "The rear stepped out. You braked too hard while turning in. Ease off the brake gradually as you turn in. That keeps the rear calm."

Causes it knows: too much throttle with the wheel turned, throttle on a curb, throttle, braking or steering with wheels in the grass or gravel, braking too hard (while turning in or straight), lifting off abruptly in the corner, contact, holding the counter-steer too long. In races you get only the cause of a spin, no tip, on the crew's radio when the crew is on. A corner run with a big slide does not count as a mistake.

### When the coach is quiet

- on the out lap (with **Silent out lap** on),
- in races (the crew takes over),
- during replays (unless **Calls during replays** is on),
- in menus, loading screens and results,
- when you are off the reference's line,
- while calibrating.

## Briefing and debrief

Both are started with a button on the coach's **Last call** card in the Cockpit. They play when you are not driving: standing, in a menu or paused. Driving off ends them. Click **Stop** to end them early.

- **Briefing**: all braking zones in order, with your last mistakes. For example: "Briefing for Circuit de Spa-Francorchamps. 10 braking zones. Braking zone 4, Bruxelles. Hairpin right. Full braking at 190 kilometers per hour. Start in first gear, out in second gear. This is feedback 3. Last time: braked 15 meters early." Where the reference trail-brakes, the briefing also explains once what trail braking is.
- **Debrief**: your biggest mistakes, sorted by time loss. For example: "Your four biggest mistakes. Braking zone 8, Campus: braked 15 meters late and 14 kilometers per hour too slow at the apex. That cost 3.1 seconds."

## Cheeky coach

With **Coach style: Cheeky** (in the app [Settings](settings.md#personality), on by default), the coach makes remarks when a mistake keeps coming even after all the help. Braking calls, the countdown and the plan always stay factual. The remarks are cheeky, never insulting.

- Every repeat raises the coach's mood, a lap without one lowers it. The Cockpit shows it: **Coach relaxed**, **amused**, **annoyed**, **lost it**.
- Level 1: "Braked too early again. The brake is not an anchor." Level 3: "Unbelievable! Turn 19! Again! I quit!"
- **Patience of the coach** (in Settings) sets how fast it gets annoyed.
- **Level 4, coach quits**: "I quit. I cannot watch this anymore. Find someone else!" A **stand-in** with another voice takes over for a few laps: "Hello, this is the stand-in. Your coach needs a break. I will take it from here." Then the coach is back: "Right. I am back. I have calmed down. Almost."
- A clean problem corner gives relief: "There you go! Told you so!"
- **Cheeky bonus mistake** in the debrief, with lots of mistakes: "And mistake number five: installing GT7. And then starting it."

## The Cockpit cards

- **Last call**: the call just made, in large type, with the **Briefing** and **Debrief** buttons. Chips show the mood and a running focus exercise ("Focus: Turn 5 · 2× left").
- **Braking zones**: every zone with its braking point, gears (braking → entry → mid → exit), apex speed, curbs, "Trail 60 %" where the reference trail-brakes, and your last run against the reference. From the second repeat it shows the help step: "3× in a row · Tip given".
- **Open feedback**: the numbered feedback that is still open. "No open feedback. Clean driving!"
- A banner **Not calibrated yet.** with **Calibrate now**, until you calibrate.

## Calibration

Between "now" and your foot on the brake lie the earbud's delay (Bluetooth: about 0.2 seconds) and your reaction. The calibration measures both together. The coach then calls every braking point exactly that much earlier.

Open it with **Calibration** in the navigation (it has a warning dot until you calibrate), **Calibrate now** in the Cockpit, or **Calibrate** next to **Audio delay** in Coach → Settings.

1. Start a time trial of your choice in GT7.
2. Click **Start calibration** and drive off. Normal coaching pauses.
3. On a straight, go full throttle above 80 km/h. After a moment the coach plays the countdown: "two, one, now".
4. Brake at "now". Braked too early or too late? That try does not count ("Too early. Once more.").
5. After five valid tries: "Calibration done. You brake about 0.3 seconds after I say now." The app shows **Your lead time**.
6. Click **Apply**.

Do it again with a new earbud. You can also set the value by hand with **Audio delay**: if "now" comes too late, raise it. With [vibration](haptics.md) on, the countdown comes as vibration too: brake at the long pulse.

## Settings

Open **Coach → Settings**. The talk level ([How much the coach says](#how-much-the-coach-says)) switches some calls off on top of the single settings.

### Braking calls

| Setting | Default | What it does |
|---|---|---|
| **Countdown** | 2 numbers | "two, one, now, brake" before every braking point. 0 to 5 numbers; 0 = **Only "now"**. |
| **Pause between the numbers** | 1 s | Silence after each number when there is enough time. 0.2 to 2 s. |
| **Pause when time is short** | 0.8 s | The pause when announcement, plan and countdown would not fit otherwise. |
| **Attention tone** | on | Short chime before each braking zone. |
| **Announcement** | on | "Full braking ahead" or "40 percent braking ahead". |
| **Call style** | Sentences | **Sentences**: "In with second gear, two wheels on the inside curb." **Pace notes**: short, in one line, like a co-driver: "Hairpin right, gear two, two wheels on the curb." |
| **Corner shape** | on | What the corner looks like, right after the announcement: "hairpin right", "fast left", "chicane, right left". |
| **Corner plan** | on | Gear in and out, right after the announcement; and the gear where the reference shifts in the corner: "gear one" at the apex of a hairpin taken down to first, "gear three" on the way out. |
| **Curbs in the plan** | on | Where and how far the reference used the curbs. Needs the corner plan or corners without braking. |
| **Call trail braking** | on | "Ease off the brake into the corner." where the reference trail-brakes. Mistakes with trail braking are always reported. Needs the corner plan. |
| **Corners without braking** | on | Flat, lift and part-throttle corners: "Flat right, two wheels on the curb.", "Lift to 125, left." |
| **Combine corner sequences** | on | Braking zones less than 6 s apart are named together, without explanations in between. |
| **Countdown to the first action** | on | The countdown runs to the first thing to do and names it: "now, brake". Where the reference turns in before it brakes, it runs to the turn-in: "now, right, sharp", then "brake" at the braking point. If the words do not fit between the two, braking goes first. Off: only "now" at the braking point. |
| **Gear after "now"** | off | The entry gear right after the braking point, again ("now, brake, gear two."). |
| **Turn-in** | on | Direction and strength before turning in: "right, sharp". Where the car turns in at the braking point, it comes right after "now, brake". |
| **Silent out lap** | on | Coaching starts at the first start/finish crossing. |
| **Calls during replays** | off | On: watch a ghost replay with its calls to learn the track. Learning a reference from a replay works either way. |

### Audio

| Setting | Default | What it does |
|---|---|---|
| **Coach speaks** | Like the app | The coach's language. The stand-in speaks it too. |
| **Coach** (volume) | 100 % | Coach and stand-in with countdown and tone, as a share of the overall volume. The play button plays a test call. |
| **Audio delay** | 0.2 s | How much earlier every call comes. Set by the calibration, or by hand from 0 to 1 s. |
| **Play test call** | – | Plays a test call with the current voice. |

### Feedback

| Setting | Default | What it does |
|---|---|---|
| **How much the coach says** | Normal | **Much**, **Normal** or **Little**. See below. |
| **Live feedback per lap** | 2 | How many corners get feedback per lap: **Every corner**, **1**, **2**, **3** or **Off**. With a number, the corners with the biggest time loss. |
| **Call me through problem corners** | on | Corners that cost half a second or more get gear, brake and throttle calls in the corner. |
| **Right after the corner** | on | A short tip directly after the mistake, if there is time. Only at talk level **Much**. |
| **Cause after spins** | on | What started a spin or slide, and how to avoid it. |
| **In races too** | on | In races only for spins, only the cause, on the crew's radio when the crew is on. |
| **Lap difference** | on | After every lap: faster or slower than the target time. |
| **Sectors against the ghost** | 3 | In time trials and practice, after every sector: your gap to the reference lap. 0 to 6; 0 = off. Only at talk level **Much**. |
| **Help first, then cheeky** | on | The help ladder: tip, helping cue, focus exercise, and only then remarks. |
| **Helping cues** | on | "wait", "Throttle!", the gear or the target speed, only in the corner that needs help. |
| **Focus exercise** | 2 | Laps in which the coach only talks about one problem corner: **Off**, **1**, **2** or **3**. |
| **Coach quits** | on | Level 4 of the cheeky coach: a stand-in with another voice takes over. Cheeky style only. |
| **Stand-in for** | 2 | Laps until the coach comes back: 1, 2 or 3. |

### Briefing

| Setting | Default | What it does |
|---|---|---|
| **Track briefing** | Automatic | **Automatic**: all zones while nothing is known yet, then only zones with mistakes. **All zones**, **Mistakes only**, or **Off** (hides the button). |
| **Debrief** | 4 mistakes | How many of your biggest mistakes the debrief goes through: 1 to 10, or **Off**. |
| **Also start it with the handbrake** | off | In a time trial or free run: stop and pull the handbrake after driving there to start the debrief. Releasing the handbrake ends it. Never while loading, in or after races. |
| **Cheeky bonus mistake** | on | In the cheeky style and with lots of mistakes, the debrief adds a joke mistake. |

### How much the coach says

The talk level switches calls off on top of the settings above. Your own settings stay as they are.

| Level | What you get |
|---|---|
| **Much** | Everything the settings allow. |
| **Normal** (default) | No sector calls against the ghost and no tip right after the corner. The feedback comes on the next approach. |
| **Little** | Braking points and one feedback corner only: no corner plan, no corners without braking, no calls through problem corners, no lap difference, no cheeky remarks. |

The braking calls (tone, announcement, countdown, "now") always stay.

## Tips

- **Too much talk?** Set the talk level to **Little**, the countdown to fewer numbers, or switch to **Pace notes**.
- **Corners close together get mixed up?** Keep **Combine corner sequences** on and the countdown at 2 numbers or fewer.
- **"now" comes late?** Calibrate again, or raise **Audio delay**.
- **Learn a new track** by watching a ghost replay with **Calls during replays** on.
- Hear every call with your voice and reference on the **Sound check** page. It plays even when the coach is muted.
- Change the words the coach uses on the [Texts](texts.md) page.
