# Changelog

All notable changes to GT Toolz. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versions follow [Semantic Versioning](https://semver.org/). Each release on GitHub shows its section of this file.

## [Unreleased]

### Fixed

- The crew's radio stayed silent in races (no radio check, no positions, no fuel) while the Cockpit's timeline showed
  the lines: every sentence was dropped as "no quiet moment". The coach reported no quiet moment whenever it had no
  position or had not started (the out lap, a reference for another car class), and the runner asked it even while it
  got no frames. Now a coach that cannot cue leaves every moment quiet, and on the out lap only the corners beyond the
  line count.
- A reference chosen in the app was dropped again after 30 s of driving and the app began to learn a new one, when
  the Cockpit's "I drive" switch did not match what the reference is for (still on "own race" from the race before,
  the reference a Daily Race). Choosing a reference now sets the switch to the reference's mode and BoP.
- The turn-in call ("right, sharp") was lost in most corners: a turn-in at or shortly after the braking point would
  have talked over "now" and was dropped. It now comes right after "now, brake" (and the gear), as long as that is
  before the apex.
- Corners of a chain, and corners where the plan with the gears did not fit, went without any gear and without the
  brake pressure. They now get a short call before the countdown ("20 percent in second gear.", "In two out three."),
  which takes the place of countdown numbers if it has to. Where even that does not fit and the driver has to change
  gear, the gear comes right after "now, brake".
- A gear at its shift point was lost to the turn-in in a hairpin. It now waits for the turn-in up to the apex.
- The lap's last corner lost its turn-in when it lay in the first half of the lap's distance.
- "Tyres are up to temperature" came every 5 minutes in a race. It now comes once; cold and hot tyres are still repeated.
- A licence test or a mission (one car, one lap) got the radio check, the tyres and the chequered flag on every try. The
  crew stays out of it now, and the tyres are said once.
- At the chequered flag the crew could say "Fuel for 0 laps. Box this lap!". There is no fuel call at the flag any more,
  and one lap of fuel is "Fuel for one lap", not "1 laps".
- At the reference's pace the next corner's announcement could run into "now, brake", and under hard braking the words
  after "now" ran into each other, which could cost the turn-in.

### Added

- The coach tells you when you were in the wrong place at the turn-in: from 2 meters beside the reference where it starts
  to steer, after the corner ("At the turn-in 3 meters too far right. The reference is further left, over the curb.") and
  on the next approach ("Start steering from the left curb."). Switch it off under Coach → Settings → Position
  at the turn-in.
- Discord in the app's links.

### Changed

- The turn-in always comes, so you know when to steer. Where the phrase does not fit, only the direction: "now, brake,
  right". Where the apex follows right behind the braking point, the direction takes the place of "brake". Only a second
  braking inside the same bend has none.
- The countdown runs to the first action and names it: "two, one, now, brake". Where the reference turns in before it
  brakes, it runs to the turn-in: "two, one, now, right, sharp", then "brake" at the braking point. If the words do not
  fit between the two, braking goes first. Switch it off under Coach → Settings → Countdown to the first action.
- In a lightly braked corner (up to 70 %) the braking point names the pressure: "now, 20 percent" instead of "now, brake".
- The turn-in goes before the gears; the entry gear waits for it up to the apex, the others up to their shift.
- Coach and crew each have their own patience under Settings → Personality. A setting saved before applies to both
  until you change one.
- The coach calls the gears where the reference shifts in the corner whenever the corner plan is on: down into the
  entry gear when that comes later than the braking point (first gear at the apex of a hairpin), further down after
  the apex, up into the exit gear. Before, these came only with "Gear after now". That setting now only adds the
  entry gear right after "now".

## [1.0.0-beta] - 2026-11-01

The first public release: GT Toolz is open source now. The app, the coach and the crew speak German and English. It
is a beta. Windows is fully tested; macOS and Linux are only partly tested and may still show errors or crashes. Some
German voices can be hard to understand at times.

### What GT Toolz does

GT Toolz reads the official telemetry that Gran Turismo 7 sends on your home network. A coach and a race crew talk to
you while you drive, and overlays show your driving in OBS. Everything runs on your PC, with no account and no cloud.

### Coach

- Braking points ahead of every braking zone, as a countdown and a tone, learned from a reference lap.
- A corner plan: gear, braking, apex speed and turn-in. Fast corners are called as flat, lift or feathering.
  Trail braking and chains of corners are called too.
- Feedback after the lap on the corners that cost the most, with the cause and what to try. Big problem corners are
  guided through the corner.
- The cause of a slide or a spin, with a tip.
- Lap difference against your target, sectors against the ghost, a briefing before and a debrief after a session.
- Talk levels (little, normal, much) and two personalities: neutral or cheeky, with a stand-in who takes over when the
  coach has had enough. It can call you by your name.

### References

- Learned from your own driving (the best of three laps) or from a GT7 replay, also an event replay you paused.
- Picked automatically by track, car class, mode and Balance of Performance. 78 track layouts are recognised from the
  line you drive.

### Race crew

- A race engineer on a radio voice: radio check at the start, positions, lap times and sectors against your best lap
  and the ghost, laps to go.
- Strategy: fuel per lap and the pit lap, tyre temperatures and tyre wear, and when new tyres pay off.
- Only in a race that runs: quiet in the lobby, in qualifying and from the chequered flag on. Tyre calls also come in
  practice and qualifying.
- A cheeky crew that gets annoyed by trips into the gravel. If you keep going off, the team boss takes over the radio.

### OBS overlays

- One browser source for OBS, put together in the app by drag and drop: speed, gear, pedals, pedal trace, tyre
  temperatures, lap, lap times, delta, position and steering angle.
- Light or transparent. It hides outside sessions and from the chequered flag on, and reloads itself after an update.
- Runs on your PC only (127.0.0.1), and only while it is switched on.

### Vibration

- Cues you can feel: through the PS5 controller (DualSense) or through an audio output, e.g. a bass shaker or a
  haptic vest.

### Voices and texts

- German and English, each role with its own language, voice and volume.
- The system's voices out of the box (Windows, macOS), plus neural voices (Piper, sherpa-onnx) to download in the app's
  voice manager, only after you confirm.
- Record your own voice pack.
- Change the wording of every spoken text on the Texts page.

### App

- Modules you can switch on and off: telemetry, coach, crew, overlays, vibration.
- A setup assistant, a guided tour, a cockpit with the live state, and streamer mode, which hides IPs, paths and player
  names.
- Anonymous session logs for bug reports (Settings → Diagnostics), with an optional detailed log.
- Updates from the GitHub releases: the app shows what changed and you choose when to update. It asks first, and you
  can switch it off.
- A short news window once after each update.
- Installers for Windows (x64), macOS (Apple silicon and Intel) and Linux (deb, x64). They are not signed yet.

[Unreleased]: https://github.com/nfMalde/gt-toolz/compare/v1.0.0-beta...HEAD
[1.0.0-beta]: https://github.com/nfMalde/gt-toolz/releases/tag/v1.0.0-beta
