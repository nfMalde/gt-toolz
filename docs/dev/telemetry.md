# Telemetry

GT7 sends its "Simulator Interface" telemetry over UDP, about 60 packets a second, encrypted with Salsa20. This page covers the connection, the packet, the fields the app reads, how the session's mode, laps, race start and end and the track are worked out, and the reference laps the coach works with.

Code: `packages/telemetry` (the library), `packages/runtime/src/connection.ts` (finding the PS5), `modules/telemetry/main/session.ts` (`TelemetrySession`, the module that runs it all). The packet layout follows public community documentation (PDTools, gt7-udp, gt-telemetry); the implementation is our own.

## Connection

| Step | Code | What happens |
|---|---|---|
| Find the PS5 | `ConsoleDiscovery` (`console-discovery.ts`) | `SRCH * HTTP/1.1` to UDP 9302 (PS5) and 987 (PS4), from a local port in 9303 to 9319. The answer gives the console's name and the running app. |
| Find GT7 | `Gt7Connection` (`packages/runtime/src/connection.ts`) | Waits for telemetry after the PS5 answered; retries every 5 s, with a countdown in the UI. |
| Ask for telemetry | `TelemetryClient` (`client.ts`) | Sends a one-byte heartbeat to the PS5's UDP **33739** every 1.5 s. The byte is the packet type letter (`A`, `B`, `~`, `C`). |
| Receive | `TelemetryClient` | Listens on UDP **33740**. |
| Fall back | `Gt7Connection` (`fallbackTypes: ['B', 'A']`) | If GT7 sends nothing for type C, the connection tries B, then A. |
| Lost | `Gt7Connection` | No packet for 5 s: the stage goes back and the search starts again (unless the user entered an address). |

- GT7 keeps the packet type of a running stream. A new type takes effect only once the stream has stopped, about 15 s after the last heartbeat.
- Another telemetry tool on the network with a different heartbeat letter changes the packet type in the middle of a session.
- The connection's stages (`Stage` in `app-api.ts`): `ps5` (looking for the console), `gt7` (waiting for the game), `live`, `error` (`port-in-use`).

**Network rules** (also in [security.md](security.md#network)):

- Discovery goes out only on interfaces with a private IPv4 address (10/8, 172.16/12, 192.168/16) and a hardware address, never on VPN or tunnel adapters (`discoveryTargets`).
- Only senders on the home network (private, link-local or this PC) are accepted (`isHomeAddress`). Once the PS5 is known, telemetry from any other address is dropped and logged once.
- A datagram must have one of the four packet sizes.
- A manual PS5 address must pass `isLanAddress` (`app-api.ts`): private ranges, `127.x`, `169.254.x`; no leading zeros.
- Discovery answers are cleaned of control characters and cut to 64 characters.

## The packet

| Type | Heartbeat | Size | Nonce XOR | Adds |
|---|---|---|---|---|
| A | `A` | 296 bytes | `0xDEADBEAF` | the base packet |
| B | `B` | 316 bytes | `0xDEADBEEF` | steering wheel angle, sway, heave, surge |
| ~ | `~` | 344 bytes | `0x55FABB4F` | filtered throttle and brake, torque vectoring, energy recovery |
| C | `C` | 368 bytes | `0xDEADBEEF` | surface per wheel, running lap time, front wheel angle, wheelbase, car category |

C extends `~` (verified against real recordings). Any other heartbeat letter gives a 148-byte packet: the first `0x94` bytes of A, nothing more.

### Decryption

`packages/telemetry/src/crypto.ts`, with Salsa20 from `@noble/ciphers`:

- **Key:** the first 32 bytes of `"Simulator Interface Packet GT7 ver 0.0"`.
- **IV:** `iv1` is the little-endian `uint32` at offset `0x40` of the encrypted packet; `iv2 = iv1 ^ XOR` (the type's value above).
- **Nonce** (8 bytes): `iv2` (LE), then `iv1` (LE).
- **Check:** after decryption the magic at `0x00` must be `0x47375330` (`"0S7G"`).

```ts
// packages/telemetry/src/crypto.ts
function nonceFor(iv1: number, type: PacketType): Uint8Array {
  const nonce = new Uint8Array(8);
  const view = new DataView(nonce.buffer);
  view.setUint32(0, (iv1 ^ NONCE_XOR[type]) >>> 0, true);
  view.setUint32(4, iv1, true);
  return nonce;
}
```

`decryptAny(raw)` guesses the type from the size first and tries the others after it. `encryptPacket(plain, type, iv1)` does the reverse; the fake PS5 and the tests use it.

### Fields the app reads

`readFrame(data, time)` (`packages/telemetry/src/packet.ts`) turns a decrypted packet into a `TelemetryFrame`. All values are little-endian. A float that is NaN or infinite becomes 0. A packet shorter than type A throws.

| Offset | Field | `TelemetryFrame` | Notes |
|---|---|---|---|
| `0x04` | position X/Y/Z (3 × float) | `x`, `y`, `z` | metres, world coordinates |
| `0x10` | velocity (3 × float) | (slip angle) | a world vector |
| `0x1C` | rotation (quaternion, 4 × float) | (slip angle) | the car looks along −z |
| `0x44`, `0x48` | fuel level, capacity | `fuelLevel`, `fuelCapacity` | |
| `0x4C` | speed (float, m/s) | `speed` | |
| `0x60` | tyre temperatures FL, FR, RL, RR | `tyreTemps` | °C |
| `0x70` | packet id | `packetId` | |
| `0x74`, `0x76` | current lap, laps in the race (int16) | `lapCount`, `lapsInRace` | `lapsInRace` 0 outside races over laps |
| `0x78`, `0x7C` | best and last lap time (ms) | `bestLapMs`, `lastLapMs` | −1 when not set |
| `0x84`, `0x86` | position, number of cars (int16) | `racePosition`, `carsInRace` | −1 outside a session |
| `0x8E` | flags (uint16) | `flags` | below |
| `0x90` | gear (low nibble) | `gear` | high nibble: suggested gear (not used) |
| `0x91`, `0x92` | throttle, brake (0–255) | `throttle`, `brake` | scaled to 0..1 |
| `0xA4`, `0xB4` | wheel speed (rad/s), tyre radius | (wheel slip) | |
| `0x124` | car code (int32) | `carCode` | |
| `0x128` | steering wheel angle (rad) | `steeringWheel` | type B and newer; positive is left |
| `0x158` | surface per wheel (4 chars) | `surface`, `curb`, `curbWheels`, `offTrackWheels` | type C: `T` tarmac, `C` curb, `G` grass, `S` sand or gravel |
| `0x15C` | running lap time (ms) | `currentLapMs` | type C |
| `0x160` | front wheel angles (2 × float) | `frontWheelAngle` | type C, their mean |
| `0x16C` | car category (4 chars) | `carCategory` | type C, for example `GR3`, `GR4`, `GRN` |

Worked out in `readFrame` (above 3 m/s; 0 below):

- `slipAngle`: the angle between where the car points (from the quaternion) and where it goes (the velocity), in rad, positive when the nose points left of the direction of travel. Slides and spins use it (`packages/coach/src/slides.ts`).
- `wheelSlip`: per wheel, wheel speed against car speed minus 1; above 0 spinning, below 0 locking.

`fieldLayout(type)` and `fieldMap(type)` describe every byte of every packet type, known or not. The data tools (`npm run signals`, `npm run compare`) use them.

### Flags

The `uint16` at `0x8E`. `FLAG_NAMES` has bits 0 to 11; bits 12 to 15 are unknown.

| Bit | Name | Used by the app (`Flags`) |
|---|---|---|
| 0 | `CarOnTrack` | yes: off in replays and menus |
| 1 | `Paused` | yes |
| 2 | `Loading` | yes |
| 3 | `InGear` | |
| 4 | `HasTurbo` | |
| 5 | `RevLimiter` | |
| 6 | `Handbrake` | yes: the debrief by handbrake |
| 7 | `Lights` | |
| 8 | `HighBeam` | |
| 9 | `LowBeam` | |
| 10 | `ASM` | |
| 11 | `TCS` | |

GT7 sends no turn signals, no weather, no gaps to other cars, no tyre wear, no player names, no track id, and no session type.

## Session mode

GT7 has no field for the session type. `detectMode(frame)` (`packages/telemetry/src/mode.ts`) works it out from one frame:

```ts
export function detectMode(frame: TelemetryFrame): SessionMode {
  if (!(frame.flags & Flags.CarOnTrack)) {
    return frame.speed > 1 && frame.carsInRace > 0 ? 'replay' : 'menu';
  }
  return frame.lapsInRace > 0 || frame.carsInRace > TIME_TRIAL_MAX_CARS ? 'race' : 'practice';
}
```

| Mode | Rule |
|---|---|
| `race` | on track, and the race reports its laps (`lapsInRace > 0`), or more cars than a time trial with its ghosts (`carsInRace > 3`; a time trial reports 1 to 3) |
| `practice` | on track otherwise: time trial, free run, a Sport mode practice or qualifying |
| `replay` | not on track, moving, and part of a session (`carsInRace > 0`) |
| `menu` | not on track otherwise (menus, the race preparation screen's video, which has no session) |

`TelemetrySession.watchMode` adds two rules:

- **Debounced:** a new mode counts once it holds for 3 s (restarts briefly look like a replay). Paused and loading frames do not count.
- **Frozen is a menu:** a results screen repeats the last packet: speed but no movement. Less than 1 mm of movement at speed for 1 s makes the mode `menu` (`frozen`).

**Driving** (`watchDriving`): on track, faster than 2 m/s, not paused, not loading, not frozen.

**Known limits:** a race over a time against one or two opponents looks like a time trial. A lobby and its qualifying look like a race over a time (no laps, many cars); `RaceRunning` tells them apart.

## Race start and end

Two small state machines in `packages/telemetry/src/mode.ts`; every frame goes through them.

**`RaceRunning`**: whether a race actually runs, not just its lobby or qualifying.

- A race over laps runs while it reports its laps, from its grid on (lap 0 of N).
- A race over a time runs once the lap counter goes from 0 to 1 while the car moves faster than 2 m/s. A qualifying is loaded standing in the pits at lap 1, so it never starts one.
- It stops when the counter is back at 0 (results, the lobby) or the car is off the track. Pause and loading change nothing.
- The crew uses it: nothing is said until a race runs, and every race starts from scratch (`modules/crew/main/session.ts`).
- Not covered: a race over a time joined after its start.

**`RaceEnd`**: from the chequered flag on.

- A race over laps is over once its last lap is done (`lapCount > lapsInRace`). GT7 then counts on ("lap 6 of 5") and drives the car round itself, then shows the results.
- Over until the car is off the track (a menu, a replay) or a race starts again (a restart: lap 0 of 5).
- Races over a time report no laps: never over.
- The coach uses it: no calls and no results from the flag on. The overlays wrap it in `AfterFlag` (`modules/overlays/src/frame.ts`): hidden from the flag until the session is left, the race starts again or the car drives again.

## Laps

`packages/telemetry/src/laps.ts`.

`splitLaps(frames)` cuts frames into complete laps:

- A lap starts when `lapCount` goes **up by one** to N (N ≥ 1), at the line, and ends when it goes up to N + 1. A lap that began with a jump (a replay starting again, a jump out of a menu, lap −1 to 2) is no lap.
- Loading frames make the lap unclean. A pause in one's own driving makes it unclean; a pause in a replay does not: the pause is taken out of the frames' times.
- Two positions more than 25 m apart are a cut (a replay skipped, a reset): unclean.
- The lap time is GT7's `lastLapMs` from the frame after the line if it is within 2 s of the measured time, else the measured time.
- `live` is true for one's own driving (`CarOnTrack` on), false for a replay.

`lapToLearn(laps)` picks the lap a reference is learned from: a replay's first clean lap (a ghost), or from one's own driving the fastest clean lap once `OWN_LAPS` (3) are complete.

The coach times laps itself (`CoachRunner`, `checkLapTime`), in this order: GT7's `lastLapMs` if it arrives close to the line, else the last value of GT7's running lap timer (`currentLapMs`) before it jumps back, else its own measurement. In Daily Race time trials GT7 does not update `lastLapMs`. The lap against the target time is what `host.telemetry.lastLap()` gives modules.

## Track detection

There is no track id in the telemetry. `recognizeTrack(points)` (`packages/telemetry/src/tracks.ts`) compares the driven line with track signatures:

- **Data:** `packages/telemetry/data/track-signatures.json` (vendored from gt7-datalogger-track-data, partly CC0, partly MIT from gt-telemetry recordings) and `own-track-signatures.json` (lines recorded by GT Toolz for tracks the vendored data lacks). Source, commit, SHA-256 and the license of every part: `packages/telemetry/data/SOURCE.md`.
- **Method:** the driven line is sampled every 20 m. Signatures whose bounding box (plus 50 m) holds at least 90 % of the samples are scored by the mean distance to their line. The best one counts if its mean is at most 10 m. Others within 3 m of it are reported as `ambiguousWith` (layouts with shared sections).
- **Direction:** driving against the signature's direction picks its reverse layout, if it has one.
- A reference learned before its track was known is recognized again when it is loaded (`prepareReference`).

**Cars:** the telemetry sends only a code. `carName(code)` (`cars.ts`) gives the name from `data/cars.json` (gt7info, MIT-0); a newer car has no name, and the user can name it on the reference. The class is GT7's category from packet C (`carCategory`), else the car itself.

## References

A reference is a lap the coach compares the driver with. It is a JSON file, `ReferenceLap` (`packages/coach/src/reference.ts`):

| Field | What |
|---|---|
| `version` | 1 |
| `points` | every frame of the lap as a `ReferencePoint`: distance `s`, time `t`, position, speed, throttle, brake, gear, steering, curbs |
| `lapTimeMs`, `lengthMeters`, `targetTimeMs` | lap time, length, the time to beat (default: the lap's own) |
| `track` | the `TrackMatch`, if recognized |
| `carCode`, `carCategory`, `carName` | the car |
| `origin` | `replay` (a ghost) or `live` (one's own lap) |
| `driver` | the player, entered by the user (GT7 sends no names) |
| `mode`, `bop`, `modeConfirmed`, `label` | what the reference is (Daily Race, lobby, time trial, own race; BoP), said by the user |
| `corners`, `fastCorners` | the analysis: braking zones and corners without braking, computed again on every load |

Files, in the references folder (dev: `references/`):

| File | What |
|---|---|
| `<date-time>_lap<N>.json` | the reference; its id is the file name without `.json` |
| `<id>.history.json` | the coach's memory: the last result per braking zone (briefing, debrief, race calls) |
| `last-used.json` | when each reference was last used (picking prefers the one used last) |

`readReference(file)` (`packages/runtime/src/references.ts`) treats a file as untrusted: at most 64 MB, the structure checked, text fields must be strings.

### Learning

`TelemetrySession.learn` (`modules/telemetry/main/session.ts`), while there is no reference:

- Frames are collected (at most 30 minutes) outside races, menus and frozen screens.
- At every lap boundary `splitLaps` and `lapToLearn` run. A replay's clean lap is taken at once; one's own laps after three.
- `buildReference(lap, name)` makes the reference, `prepareReference` adds the analysis. The app guesses what it is (a replay is a Daily Race ghost, an own lap is what the Cockpit's "I drive" says) until the user confirms it.
- The file is written atomically, and the `reference` event goes out with `why: 'learned'`.

### Picking

`TelemetrySession.autoReference`, with the setting `autoReference` on, while driving on track (also in races):

- **Does the active reference fit?** `GhostWatch` (`packages/runtime/src/ghost.ts`) watches whether the car is on its line (within 30 m) and going its way. The reference is **lost** after 20 s of driving with at most 20 % on the line. It does not fit either for another car class (`sameClass`) or another mode or BoP than the driver drives (`fitsMode`).
- **Lost:** the coach stays quiet, and `ReferencePicker` (`packages/runtime/src/reference-picker.ts`) watches the saved references of the class and drive mode. One fits when the car was on its line 90 % of the last 30 s, after at least 10 s. Of several, the one used last wins, else the fastest. The event is `why: 'picked'`.
- **None fits** after 30 s of driving (at once when the class has no saved reference): outside races the driver's own laps are learned (`why: 'none-fits'`, then `learn-own`). In races the coach stays quiet.
- "Learn new reference" in the app stops picking until the new one is learned.

### Reference events

Coach and crew react to the telemetry's `reference` event (`ReferenceEvent` in `packages/runtime/src/telemetry-feed.ts`):

| `why` | When |
|---|---|
| `start` | at start: the reference the last session ended with (the telemetry setting `activeReference`), or none |
| `chosen` | the user chose one in the app |
| `learned` | a lap was learned |
| `picked` | a saved one fits the track being driven |
| `learn` | the user asked to learn a new one |
| `none-fits` | no saved one fits; the driver's own laps are learned |

The telemetry module saves the reference in use as `activeReference` after every change.

## Recordings

"Record telemetry" (the telemetry setting `record`) writes every decrypted packet to a `.gtcap` file in the sessions folder (`CaptureRecorder`, `packages/runtime/src/recorder.ts`). The installed app keeps the newest five.

```
"GTCAP1\n", then per packet: u16 length, f64 receivedAt (ms since 1970), u8 type letter, the decrypted data
```

`readCaptureFile(path)` (`packages/telemetry/src/capture-file.ts`) reads it; a truncated last record is ignored. Recordings are what the fake PS5 and the simulator replay ([testing.md](testing.md)).
