# Vibration

**Feel instead of hear.** Coaching should work for everyone, also for drivers who hear badly or not at all. The **Vibration** module gives the braking points and other calls as vibration. All it takes is a device connected to your computer.

> **Experimental.** This feature is new. Tell us which device you use, which patterns you feel well and what is missing: **Give feedback** on the Vibration page opens our issue page on GitHub.

## Switch it on

The module is off by default. Switch it on in one of these places:

- the **Vibration** step of the setup assistant (also from **Set up vibration** in the welcome window),
- the **Modules** page.

The page **Vibration** then appears in the navigation.

## Which devices work?

| Device | How it is connected |
|---|---|
| **Bass shakers** (tactile transducers) on the seat or rig | as an audio output, through an amplifier |
| **Haptic vests, straps and mats** that turn sound into vibration | as an audio output |
| **Headsets with haptics**, if they turn low tones into vibration | as an audio output |
| **Game controllers**: an Xbox or PlayStation controller on the computer, by USB or Bluetooth, for example in a pocket or on your leg | as a controller |
| **Vibration wristbands** | only if they show up as an audio device or a controller |

Devices that only vibrate with their own software do not work (yet). Tell us which one you have.

## Set it up

### 1. Choose the output

**Output**: **Audio device** or **Controller**.

- **Audio device**: low pulses through an audio output. Choose the **Audio device**; best a device of its own, not the earbud for the voice. **System default output** is where the voice plays too; that is right only if your headset does the vibration.
- **Controller**: the vibration of a controller connected to the computer. Press a button once so the app finds it ("Found: …"). The app window must not be minimized meanwhile.

### 2. Test the device

The **Device test** comes first, before anything else can be set up.

1. Click **Test device**. The app checks the device and lets it vibrate three times at full strength.
2. **Did you feel the vibration?** Click **Yes, felt it** or **No, nothing**.

With **Yes**, the device counts as tested and the patterns become available. With **No**, the page shows tips (see below). Another output or device needs its own test.

### 3. Fine-tune

| Setting | Default | What it does |
|---|---|---|
| **Frequency** (audio device only) | 45 Hz | Bass shakers like it low (30 to 50 Hz), small vibration motors higher (60 to 120 Hz). 20 to 150 Hz. |
| **Strength** | 80 % | Overall strength of all pulses. 10 to 100 %. |
| **Pause between pulses** (controller only) | 400 ms | A controller runs on after every pulse. If the pulses blur together, set it longer. 100 to 800 ms. |
| **Pattern tempo** | 1.5× | Makes the suggested patterns slower. Controllers usually need longer pauses than bass shakers. Your own patterns play exactly as designed. 1× to 2.5×. |
| **Sides** | off | Feel turning in on the left or right. Only with two shakers, a vest with sides, or a controller. A single shaker is often on one channel only. |

**Feel a whole braking zone** plays signal, countdown, now, gear and turn-in, timed like on track.

## Patterns

Every call has its own pattern. Click the icon next to a pattern to feel it right away.

| Call | When | Default pattern |
|---|---|---|
| **Braking zone ahead** | with the attention tone before every braking zone | Three short |
| **Countdown** | every number of the countdown | One short |
| **Brake now** | at "now", the most important moment | Long |
| **Turn in** | with the turn-in call; with **Sides** on, on the side of the turn | Two short |
| **Gear** | with the gear call (if it is on) | Off |
| **Helping cue** | "wait", "Throttle!" or the target speed, only in a corner that needs help | Heartbeat |
| **Lap faster** | after the lap, faster than the target time | Rising |
| **Lap slower** | after the lap, slower than the target time | Falling |
| **Message** | the coach or the crew says something; the text is shown in the Cockpit | Off |

Patterns to choose from: **Off**, **One short**, **Two short**, **Three short**, **Long**, **Rising**, **Falling**, **Heartbeat** and **Count** (as many pulses as the number: three pulses for "three" or for third gear), plus your own.

Two patterns never play at once: one waits until the one before is over. Only **Brake now** never waits; it cuts off whatever is playing.

### Your own patterns

Click **New pattern** to design one with up to eight pulses. For each pulse set its **Length** (30 to 1000 ms), **Strength** and the **Pause after** it (0 to 1000 ms). **Add pulse** and **Remove pulse** change the number of pulses. **Feel it** plays the pattern before you **Save** it. Up to 12 own patterns. They show up in every call's list and play exactly as designed (only the overall strength applies). A pattern too long for the countdown (one number per second) is marked.

## PS5 controller (DualSense)

- As **Controller** output, the app drives the controller's vibration directly, over USB and Bluetooth.
- **More precise, with a USB cable:** choose **Audio device** and there **Wireless Controller**. The pulses then go straight to the controller's haptic motors. A frequency of about 100 to 200 Hz works best. If nothing happens, unplug the controller and plug it in again.

## Tips

- **Calibrate with vibration:** with the module on, the calibration's countdown comes as vibration too. Brake at the long pulse. That way the timing fits your device. See [Calibration](coach.md#calibration).
- **Mute "Calls" at the bottom left**: the voice stops, the vibration keeps going.
- Everything the coach says is also shown in the Cockpit, large and live.

### Not felt? Things to check

**Audio device:**

- Is the device switched on, and is the amplifier loud enough? Check the device's volume in your system's sound settings too.
- Did you **hear** the test instead of feeling it? Then it is the wrong device. Choose another one.
- Raise the strength and change the frequency: lower for bass shakers, higher for small motors.
- **"The chosen device is not connected"**: the vibration goes to the default output until you connect it.

**Controller:**

- Connect it with a USB cable: some controllers do not vibrate over Bluetooth.
- Press a button once so the app finds it.
- The app window must not be minimized.
- Another controller program may take over the vibration. Close it.
