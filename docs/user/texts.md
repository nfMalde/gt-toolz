# Texts: your own wording

Every sentence and call of the coach and the crew can be said in your own words. Prefer "Lift" over "Lift off"? "Brake!" instead of "now"? Change it on the **Texts** page.

An own text applies at once. The standard stays in the language pack and comes back with **Back to the standard**.

## Find a text

Open **Texts** in the navigation.

- **Language**: if you use more than one language, pick the one to edit. It starts with the language the coach speaks.
- **Search texts …**: searches all texts.
- **Only own texts**: shows only the texts you changed. Next to it you see how many you have ("3 own").

The texts are sorted by area. The first tab, **Short calls**, holds the words of the braking calls and pace notes, each with a readable name:

| Short call | Standard (English) |
|---|---|
| **Countdown** | one, two, three, four, five |
| **Now (brake)** | now |
| **Gear** | gear {gearWord} |
| **Announcement: full braking** | Full braking ahead |
| **Announcement: brake pressure** | {percent} percent braking ahead |
| **Left**, **Right** | left, right |
| **Flat-out corner** | flat {direction} |
| **Lift or part throttle** | lift to {kmh}, {direction} |
| **Then (the next corner)** | then {note} |
| **Brake into the corner** | Trail the brake. |
| **Inside curb: half** … | two wheels on the curb … |
| **Hairpin, right** … | hairpin right … |
| **Help: wait**, **Help: throttle** … | wait, Throttle! … |

Keep these short. The countdown, "now" and the gears are timed to a tenth of a second. A long word makes the calls start earlier.

The other tabs: **Basic words**, **Pace notes, shapes, curbs**, **Corner plan**, **Feedback**, **Tips and help**, **Slides and spins**, **Track briefing**, **Laps, times, debrief**, **Cheeky coach**, **Race crew**, **Reference and session**, **Calibration** and **Numbers for recordings**. A tab shows how many own texts it has. Areas of a module that is off are hidden.

## Change a text

1. Click into the text's field and type your words.
2. Press **Enter** or click outside the field. The text is saved as soon as it can be used.
3. Click the play button (**Listen**) to hear it with the voice of whoever says it.

Below the field you see an example of how it will be said, with sample values filled in. Once you changed a text, it is marked **Own**, and the standard is shown below it: **Standard: "…"**.

### Placeholders

Words in braces are filled in when the text is said. For example `{kmh}` becomes the speed and `{direction}` becomes "left" or "right". The placeholders a text can use are shown as buttons below the field; click one to insert it at the cursor (**Insert at the cursor**).

Example: change **Lift or part throttle** from `lift to {kmh}, {direction}` to `off to {kmh}, {direction}`. The coach then says "Off to 125, left."

### Lists

Some texts are lists:

- **Remarks** (the cheeky coach, the crew's lines): one text per line. One of them is said each time, never the same twice in a row. More lines mean more variety.
- **Word lists** (the countdown, the number words): one word per line, exactly as many as the standard has. The countdown has five words, even if you count down from two.

### What GT Toolz checks

While you type, the app checks the text. A text that cannot be used is never spoken; the standard stays until you fix it.

| Message | Meaning |
|---|---|
| **The text is empty.** | Write something, or go back to the standard. |
| **At most … characters.** | A text can have up to 400 characters. |
| **At most … entries.** | A list can have up to 50 entries. |
| **Not available here: …** | You used a placeholder this text does not have. |
| **Exactly … entries, one per line.** | A word list needs exactly as many words as the standard. |
| **"km/h" is read letter by letter; better write it out.** | A hint only. Write "kilometers per hour". |
| **The standard also says … here; your text leaves it out.** | A hint only. For example, your text leaves out the speed. |

### Writing for speech

Everything is spoken, so write it the way it should sound:

- **Write everything out.** "kilometers per hour", not "km/h".
- **Place punctuation on purpose.** Every comma becomes a real pause. A period ends the sentence with a falling voice.
- **No digit right before a period.** Write numbers as words.

## Go back to the standard

- **Back to the standard** (the round-arrow button next to the text) removes your own text.
- When an update changes a standard you replaced, the text shows **An update changed the standard: "…"**. Choose **Use the standard** or **Keep mine**.

## Own texts and recordings

With your own [recorded voice pack](voices.md#your-own-recorded-voice): what you word differently is said by the voice until you record it. The **Recordings** page lists your new texts to record.

## Your texts are personal

Own texts are stored in your settings, per language. [Reset data](settings.md#reset-data) deletes them with all other settings.

Want to translate GT Toolz into a new language? See the [developer docs](../dev/README.md).
