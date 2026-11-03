# Voices

GT Toolz speaks with three **roles**, each with its own voice:

| Role | Who it is |
|---|---|
| **Coach** | braking points, feedback, briefing |
| **Box crew** | race information on the radio (races only) |
| **Stand-in** | takes over when the cheeky coach quits; in races, the team boss on the radio |

Open **Voices** in the navigation and click a role at the top. All settings below apply to that role.

> Some German voices can be hard to understand at times. We are working on it. If a voice is hard to understand, try another one, or lower its speed.

## Kinds of voices

| Kind | Systems | Download |
|---|---|---|
| **Windows voices** (for example Hedda, Katja, Stefan) | Windows | none, they come with Windows |
| **macOS voices** (for example Anna, Samantha, the Premium voices) | macOS | none, they come with macOS |
| **Offline neural voices** | Windows, macOS, Linux | optional, after you confirm |

The neural voices sound more natural. They run on your computer, offline:

| Language | Voices |
|---|---|
| German | Ramona, Eva K, Jan (Piper); CSS10 German (VITS) |
| English | Kristin, Norman, John, Cori, LJSpeech (Piper) |

- **Windows and Linux:** the Piper voices run in the Piper engine, CSS10 in the sherpa-onnx engine.
- **macOS:** all of them run in the sherpa-onnx engine. Better macOS system voices (Premium): System Settings → Accessibility → Spoken Content → System Voice → Manage Voices.
- **Linux** has no system voices GT Toolz can use, so you need at least one neural voice.

## Download neural voices (the voice manager)

The card **Voice packages** on the Voices page lists every optional voice with its size, its licence and its source.

1. Tick the voices you want. The ones for your language are preselected; untick what you do not want. A voice that needs an engine shows **incl. engine**.
2. Click **Install selected · …** (it shows the total size).
3. The app shows **Downloading …** and **Unpacking …**. **Cancel** stops it.
4. **Installed. The new voices are ready.**

Nothing is downloaded before you click. Every file comes straight from its original source (GitHub or Hugging Face) and is checked against a fixed SHA-256 checksum; a file that does not match is deleted. **Remove** deletes an installed voice.

Approximate download sizes: Piper engine about 25 MB, sherpa-onnx engine about 25 MB, Eva K 21 MB, Ramona 63 MB, Jan 77 MB, Kristin, Norman and John 63 MB each, Cori and LJSpeech 114 MB each, CSS10 German 67 MB.

The engines contain espeak-ng (GPL-3.0). They are not part of GT Toolz: GT Toolz only starts them as separate programs. All licences are under **About & licenses → Third-party licenses**.

## Choose a voice

The card **Voice for …** shows the voices for the language the role speaks.

- **Automatic** (default): the best installed voice for the language. For the coach that is an installed neural voice, else a Windows or macOS voice. The crew prefers a male neural voice, so it is easy to understand over the radio. The stand-in prefers a voice other than the coach's, of the other gender.
- Click a voice to use it. **In use** marks the current one.
- **Listen** plays a sample.
- A voice that is **Not installed** can be downloaded under **Voice packages**.

When you pick a new voice, it is prepared once ("Preparing voice … · 12/31"). Then every call comes from a cache and plays at once.

## Languages per role

GT Toolz speaks **German** and **English**. The app, the coach and the crew can each use their own language. Example: app in English, coach in German, crew in English.

| Where | Setting |
|---|---|
| App language | the **DE | EN** switch in the title bar, or **Settings → Language** |
| Coach | **Coach → Settings → Coach speaks**, or **Voices → Coach → Speaks** |
| Crew | **Crew → Settings → Crew speaks**, or **Voices → Box crew → Speaks** |
| Stand-in | always speaks the coach's language |

**Like the app** (default) follows the app language. The voice choice is saved per role and per language.

## Speed, pitch and pauses

The card **Speed & pitch** (for the selected role):

| Setting | Coach | Box crew | Stand-in | Range |
|---|---|---|---|---|
| **Speed** | 0 | +2 | 0 | −5 to +5 |
| **Pitch** | +10 % | −6 % | 0 % | −30 to +50 % |
| **Pause after a comma** | 0.5 s | 0.5 s | 0.5 s | 0 to 1.5 s |
| **Pause after a sentence** | 0.7 s | 0.7 s | 0.7 s | 0 to 2 s |

Every comma in a spoken text becomes a real pause, like in normal speech. If a voice sounds rushed or choppy, change the pauses. **Play test call** plays a call with the current settings.

How your **name** is said (slower, pauses before and after it) is set under [Settings → Personal](settings.md#personal).

## Radio filter

The crew sounds like team radio: a narrow band, a little crackle and a short noise when it keys the radio. Switch it off with **Crew → Settings → Radio filter**. The team boss in races uses the radio too.

## Volume

- The overall volume: the slider under **Calls** at the bottom left, or **Settings → Audio → Volume**.
- The coach's share: **Coach → Settings → Coach**. The stand-in follows the coach.
- The crew's share: **Crew → Settings → Race crew**. The team boss follows the crew.

## Your own recorded voice

You can record your own voice, or a friend's with their consent, for the coach, the crew or the stand-in. A **voice pack** holds the recordings for **one language**. The pack goes on top of the role's voice: sentences the pack can say completely come from your recordings; the voice says everything else. One sentence never mixes the two.

> **Only voices you may use.** Record only your own voice, or the voice of someone who has explicitly agreed. A person's voice is protected by their personality rights; clips from films, series, games, streams or videos are also protected by copyright. Imitating a well-known voice can be unlawful too. Your recordings stay on your computer; GT Toolz uploads nothing.

### Create a pack and record

1. Open **Recordings** in the navigation.
2. Click **New pack**. Enter a **Name** (for example "My coach"), the **Language** (fixed for the pack) and optionally **Who speaks**. Click **Create pack**.
3. Pick a section and record one text at a time:
   - **Space**: record / stop
   - **← →**: previous / next text
   - **P**: listen
4. Options: **Play after recording**, **Then the next missing one**, **Only missing**.
5. **Listen to a sample** plays two lap times and a corner call with your pack.

At most 30 seconds per recording. A recording without sound is rejected. The app cleans each take (trims silence, levels the volume).

| Section | What to record |
|---|---|
| **Corner calls** | short and crisp: "now", "brake", the countdown, the announcement, gears, turn-in. The timing depends on them. |
| **Name** | your name, the way the coach says it in front of a sentence. **Add another name** for friends who use the pack. Enter your name under Settings → Personal first. |
| **Lap times** | "seconds faster", "seconds slower" … together with the numbers. "1.7 seconds faster" is put together from "one", "point", "seven" and "seconds faster". |
| **Numbers** | 0 to 20 and "point". Say them evenly, without emphasis. |
| **Remarks** | the cheeky coach. Where a corner name or a number goes, the text is split; record those parts on their own. |
| **Corners** | the corner names of the active track, and the words for numbered corners. |
| **Race crew** | for a pack the crew uses. |
| **Everything else** | feedback, briefing, debrief and notices. Optional: the voice says whatever is missing. |
| **Other recordings** | recordings whose text the app no longer uses in this form. They are still used wherever their words fit. |

Tips: whole sentences recorded in one go sound best. Numbers above 20 are always said by the voice.

**Microphone access:** if the app cannot use the microphone:

- **Windows:** Settings → Privacy & security → Microphone → let desktop apps access it.
- **macOS:** System Settings → Privacy & Security → Microphone → allow GT Toolz.
- **Linux:** check in the sound settings that a microphone is connected and not muted.

The microphone is open only while a take runs.

### Use the pack

1. Open **Voices** and pick the role.
2. In the card **Own recordings**, choose the pack (or **None – only the voice**). Only packs in the role's language are listed.
3. **If your name is not in the pack**: **Leave it out** (default: the recording plays without your name) or **Voice says it** (the voice says the whole sentence with your name).

The stand-in's pack is also the team boss's in races.

### Share a pack

- **Export** writes one `.gttvoice` file that you pass on yourself. First you must confirm: "this is my own voice, or every person who can be heard has explicitly agreed to the recording and to sharing it". The confirmation is noted in the file. GT Toolz offers no hosting.
- **Import** a `.gttvoice` file from someone you trust. Confirm that you are responsible for using it, then **Choose file**. A pack contains only texts and audio, never program code. It is checked when imported; broken recordings are left out.

### After an update

New texts may come with a new version. The Recordings page then says so, and **Only missing** shows what is open. Until you record them, the voice says them. A pack from a newer version of GT Toolz may need an update of the app.
