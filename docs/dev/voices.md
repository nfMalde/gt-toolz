# Voices

Coach, crew and stand-in speak with voices the user picks. Speech is rendered offline into WAV clips, cached on disk, and played by the app itself. This page covers the engines, the voice catalogue and its downloads, recorded voice packs, the radio filter, and the licensing rules every voice must pass.

For the user's side (picking voices, recording one's own), see the [user guide](../user/voices.md).

## Roles

| Role | Speaks | Voice setting |
|---|---|---|
| `coach` | the coach's calls and sentences | `voices.coach` |
| `crew` | the race crew, on the radio | `voices.crew` |
| `standin` | the coach's stand-in when the cheeky coach quits | `voices.standin` |
| team boss (`boss`) | the crew's stand-in in races | the stand-in's voice, in the crew's language |

Each role has its speed, pitch, pauses after a comma and after a sentence, and a voice per language (`RoleVoice.byLanguage`). Without a choice, `ShellVoices.resolve` picks one: an installed optional voice first, then a system voice; the crew gets another voice than the coach, the stand-in one that differs from both. Each role speaks its own language (`coachLanguage`, `crewLanguage`; empty: the app's).

`ShellVoices` (`packages/runtime/src/shell-voices.ts`) is the shell's service for all of this: `resolve(settings, speaker)`, `open(…)`, `phrases(language)`, `address(text, important, phrases)` (the driver's name in front of a sentence), the recorded packs (`packs`, `recordings`, `pack`), the volumes per channel (coach with stand-in, crew with team boss), and the crew's `radio`.

## Speech engines

| Engine | Platforms | How it runs | Voice ids |
|---|---|---|---|
| Windows OneCore and SAPI voices | Windows | Windows PowerShell 5.1 (`%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`, full path) with a fixed script; the voice name goes in through an environment variable, never into the script | the voice's name (`Microsoft Katja`) |
| macOS system voices | macOS | `/usr/bin/say`, one process per clip, the text on stdin (`mac-speech.ts`) | `macos:<name>` |
| Piper 2023.11.14-2 | Windows, Linux | its own program, a long-running process per voice (`piper.ts`) | `piper:<model>` |
| sherpa-onnx 1.13.8 | Windows, Linux, macOS | its own program, one process per clip (`sherpa.ts`); on the Mac it also runs the Piper voices | `vits:<id>` |

- **All engines run as separate programs.** None is loaded into the app's process.
- **Rendering** (`ClipVoice` in `packages/runtime/src/voice.ts`): every text is split at commas and sentence ends, each part rendered on its own with its mark, then joined with the role's fixed pauses (`joinWithPauses`). Silence at the start is trimmed, the end faded out.
- **The cache:** clips are cached in the voice cache folder by text, engine, voice, speed, pitch, pauses and effect, plus `CLIP_CACHE_VERSION`. Raise that constant when rendering changes, so every clip is rendered again.
- **Pitch** of a neural voice comes from faster playback; the voice then speaks slower by the same factor, so its tempo stays.
- **The name** ("Maldö:") is rendered on its own, slower (`nameSlower`) and with Piper's randomness off, with pauses before and after it (`namePauseBefore`, `namePauseAfter`).
- **Playback** happens in the hidden audio window ([architecture.md](architecture.md#processes)). The console tools use the system's player instead (`SYSTEM_AUDIO`: PowerShell's SoundPlayer on Windows, `afplay` on macOS, `paplay` or `aplay` on Linux).
- **Linux:** the engines' libraries sit next to them; the app sets `LD_LIBRARY_PATH` for those processes only.

## The voice catalogue

Every optional engine and voice is listed in `packages/runtime/voice-packages.json` with a pinned URL, size and SHA-256. The app accepts only voices from this manifest.

```json
{
  "id": "piper:de_DE-ramona-low",
  "kind": "voice",
  "engine": "piper",
  "requires": "piper-engine",
  "name": "de_DE-ramona-low",
  "inference": { "noiseW": 0.4 },
  "language": "de-DE",
  "gender": "female",
  "license": "allowed: M-AILABS (BSD-style, commercial use permitted; keep copyright notice and disclaimer, no endorsement); trained from scratch",
  "dataset": "M-AILABS, trained from scratch",
  "source": "https://huggingface.co/rhasspy/piper-voices (revision c10ece1aade47bb51c153c893d14e5bf8e5b7117)",
  "files": [
    {
      "url": "https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/de/de_DE/ramona/low/de_DE-ramona-low.onnx",
      "sha256": "a1068592532aad8c49bf3d1a01b8749c11d7dba726689ee28ad64e7b627ae4c5",
      "size": 63104526,
      "to": "piper/voices/de_DE-ramona-low.onnx"
    }
  ],
  "preselectedFor": ["de"]
}
```

(One of the two files shown.) The fields (`VoicePackage` in `packages/runtime/src/voice-packages.ts`):

| Field | What |
|---|---|
| `id`, `kind` | `engine`, `model` (a file with several voices, listed in `voices`) or `voice` |
| `engine`, `requires` | `piper` or `sherpa`; the engine package it needs |
| `files` | `url`, `sha256`, `size`; `to` (a plain file) or `archive` (`zip`, `tar.gz`, `tar.bz2`) with `extract` (`from`, `to`, `keep`: only these files land on disk); `platform` (`win32-x64`, `linux-x64`, `darwin-arm64`, `darwin-x64`) for engines |
| `license`, `source`, `dataset` | Why the voice is allowed, where it comes from (a pinned revision) |
| `inference` | Piper settings (`noiseW`: randomness of phoneme lengths; 0 for the same rendering every time) |
| `format`, `model`, `dir`, `prepare` | sherpa-onnx details; `prepare: 'piper-for-sherpa'` makes a Piper voice ready for sherpa-onnx on the Mac (`piper-for-sherpa.ts`) |
| `preselectedFor` | App languages for which the first start preselects the package |

`readVoicePackages(platform)` drops files for other platforms and packages without a file for this one. `notes` in the manifest records why voices were added or rejected.

### Downloads

`installPackages` (`voice-packages.ts`) runs in the main process (Node `fetch`, not Chromium), and only after the user confirmed:

1. **The user decides.** The Voices page and the setup assistant show every package with size and license. What fits the app language is preselected; the user deselects what they do not want. Nothing downloads before "Install selected".
2. **Allowed hosts only.** `allowedDownloadUrl` accepts `https:` URLs on `github.com`, `*.githubusercontent.com`, `huggingface.co`, `*.huggingface.co` and `*.hf.co`. Redirects are followed by hand and must stay on these hosts.
3. **Checked.** The download goes to a `.part` file; more bytes than the catalogue's `size` stop it; its SHA-256 must match, else it is deleted. A download idle too long is cancelled. Only then is the file renamed into place.
4. **Unpacked** with the system's `tar` (on Windows `%SystemRoot%\System32\tar.exe`, full path). Paths from the catalogue are checked to stay inside the voices folder (`insideDir`).
5. Removing packages (`removePackages`) tells the modules first (`voicesChanged('removing')`): every engine is closed before files are deleted.

`npm run voices -- --list | --install <ids> | --remove <ids>` runs the same code on the console, for developers.

### Adding a voice

1. Check its license against the [rules](#licensing-rules) below, at a pinned revision of the source, including the dataset it was trained on and every model it was fine-tuned from.
2. Download the files yourself, compute their SHA-256 and size.
3. Add the package to `voice-packages.json` (with `license`, `source`, `dataset`), and a line to `notes` if it needs explaining.
4. Add it to the licenses page (`apps/desktop/src/licenses.ts`) and to `THIRD-PARTY-NOTICES.md` with every attribution its license requires.
5. Run `npm test` (`tests/voice-catalogue.test.ts` checks the catalogue).

## Recorded voice packs

Users can record their own voice (or a consenting friend's) for coach, crew or stand-in. A pack holds the recordings for **one language** and is used on top of the role's normal voice. Code: `packages/runtime/src/voice-pack.ts` (format, matching, storage, export and import), `ClipVoice` (putting a text together), `apps/ui/src/app/pages/recordings/`.

- **Matching by words.** A text is found by its words, not its exact text: lower case, punctuation ignored, numbers as words of the pack's language (`spell.numbers` 0 to 20, `spell.decimal`). Each text is covered as cheaply as possible from the recordings; **the synthetic voice only ever speaks whole sentences**, never mixed with recordings inside one.
- **Storage:** one folder per pack (a random UUID) in the voice-packs folder, with `pack.json` and the recordings as `<sha256, 16 hex>.wav` (16-bit mono, 24 kHz). A file name that is not such a hash is ignored.
- **Recording:** `MediaRecorder` in the UI (the microphone, audio only, only while a take runs), resampled to 24 kHz mono, sent as 16-bit WAV over IPC (at most 30 s). The main process removes DC offset, trims silence, normalizes to −1 dBFS.
- **Export** (`.gttvoice`): only after the user confirms they are the speaker or have everyone's consent; the file records that confirmation (`EXPORT_CONSENT`). GT Toolz hosts no packs and uploads nothing.
- **Import** is untrusted input: at most 120 MB (`MAX_PACK_FILE_BYTES`), the right `format` and `version`, a known language, at most 3000 recordings, texts cleaned and cut to 400 characters, phrase keys computed anew, every recording at most 8 MB, 16-bit PCM, at most 30 s, decoded and written anew, at most 40 minutes of audio in all. A pack is data only.
- **Versions:** `version` is the file format (`VOICE_PACK_VERSION`); a newer one is refused. `textsVersion` is the language pack's texts version the recordings were made against; the Recordings page tells the user about new texts to record.

## The radio filter

The crew speaks over a team radio: `radioFilter(buffer)` in `packages/runtime/src/voice.ts`, applied to every clip a voice renders when it is opened with `effect: 'radio'`.

- a squelch burst when the button is pressed and released;
- the speech band-limited from 320 to 3000 Hz (high-pass and low-pass biquads);
- slightly overdriven, with a little hiss.

It is part of the clip's cache key. The app setting `radio` switches it (on by default). A recorded pack's sentences get the filter too.

## Licensing rules

**Only voices whose license clearly permits use in GT Toolz.** Unclear counts as not allowed.

- **Allowed licenses:** standard licenses that allow free use, including in open-source software: MIT, BSD, Apache-2.0, CC0, public domain, CC BY (with the attribution on the licenses page and in `THIRD-PARTY-NOTICES.md`), and dataset licenses of the same kind (for example M-AILABS).
- **The whole chain counts:** the model, the dataset it was trained on, and every model it was fine-tuned from. A voice derived from a research-only or non-commercial model is not allowed, whatever its own license says.
- **No "non-commercial", no "research only"**, no voices trained on audio of unknown origin (for example synthetic audio from closed models).
- **The user's own voices are allowed:** the Windows and macOS system voices (called through the system, nothing distributed) and recorded voice packs (the user records and shares them; GT Toolz ships and hosts none). Novelty macOS voices are left out.
- **GPL engines are never shipped and never run in-process.** Piper and sherpa-onnx contain espeak-ng (GPL-3.0-or-later). They are not part of the installers: the user downloads them from their original source on request, and GT Toolz only starts them as separate programs. The licenses page still carries their notices, licenses and a link to their source.

`notes` in `voice-packages.json` lists the voices that were rejected and why. A rejected voice never goes back into the catalogue without a new license review.
