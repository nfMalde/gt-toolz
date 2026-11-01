# Third-party notices

GT Toolz is free software under the GNU General Public License v3.0 (see [LICENSE](LICENSE)). It is built on the open-source components, data and optional downloads listed here. The app shows the same list with the **full license texts** under “About & licenses” → “Third-party licenses”. The texts of bundled packages are collected from their own license files at build time (`apps/desktop/scripts/build.mjs`); the list itself lives in `apps/desktop/src/licenses.ts`. Keep this file in sync with that list.

## 1. Included in the app

| Component | Version | Used for | License | Notice |
|---|---|---|---|---|
| [Electron](https://github.com/electron/electron) | 43.8.4 | app framework (contains Chromium and Node.js) | MIT | Copyright (c) Electron contributors; Copyright (c) 2013-2020 GitHub Inc. Chromium’s and Node.js’ licenses are in `LICENSES.chromium.html` next to the app’s executable (linked on the app’s licenses page). |
| FFmpeg (part of Electron) | as in Electron 43.8.4 | media library of Chromium | LGPL-2.1-or-later | Ships as a separate, unmodified library (`ffmpeg.dll` / `libffmpeg.so` / `libffmpeg.dylib`) that can be replaced. Source: Chromium’s `third_party/ffmpeg` for this Electron version. The license is in `LICENSES.chromium.html`. |
| [Angular](https://github.com/angular/angular) (`core`, `common`, `platform-browser`, `router`) | 22.2.1 | user interface | MIT | Copyright (c) 2010-2026 Google LLC. |
| [NgRx Signals](https://github.com/ngrx/platform) | 22.0.1 | UI state | MIT | Copyright (c) 2017-2023 Brandon Roberts, Mike Ryan, Victor Savkin, Rob Wormald. |
| [RxJS](https://github.com/ReactiveX/rxjs) | 7.8.2 | used by Angular | Apache-2.0 | Full license text in the app; the package has no NOTICE file. |
| [tslib](https://github.com/microsoft/tslib) | 2.8.1 | TypeScript helpers | 0BSD | Copyright (c) Microsoft Corporation. |
| [@noble/ciphers](https://github.com/paulmillr/noble-ciphers) | 2.4.0 | Salsa20 decryption of the telemetry | MIT | Copyright (c) 2022 Paul Miller (https://paulmillr.com); Copyright (c) 2016 Thomas Pornin <pornin@bolet.org>. |

The exact copyright lines and full texts of all bundled packages are the ones shown in the app (taken from each package’s LICENSE file).

**Installers** ([docs/dev/building.md](docs/dev/building.md)) are made with [electron-builder](https://github.com/electron-userland/electron-builder) (MIT), a build tool that is not part of the app. The Windows installer runs on [NSIS](https://nsis.sourceforge.io/) (zlib/libpng license); the Linux package carries electron-builder's install scripts and AppArmor profile (MIT).

## 2. Included data

| Data | Version | Used for | License | Notice |
|---|---|---|---|---|
| [gt7-datalogger-track-data](https://github.com/jbhoorasingh/gt7-datalogger-track-data) | `df4b73f` | track signatures (25 of 78 rows) and all corner names | CC0 1.0 | Track data by Jermaine Bhoorasingh and contributors, public domain; credited voluntarily. See `packages/telemetry/data/SOURCE.md` and `track-signatures.LICENSE` (track signatures), `packages/coach/data/SOURCE.md` and `corner-names.LICENSE` (corner names). |
| [gt-telemetry](https://github.com/zetetos/gt-telemetry) circuit recordings | via the same commit (`vendor/circuits.json`) | track signatures (53 of 78 rows) | MIT | Copyright (c) 2024 vwhitteron. License text: `packages/telemetry/data/gt-telemetry.LICENSE`. |
| [gt7info](https://github.com/ddm999/gt7info) | `707b463` | car names (code → maker, model; 584 cars) | MIT-0 | Copyright 2022 Daniel Lee / @ddm999; no attribution required, credited voluntarily. See `packages/telemetry/data/SOURCE.md` and `gt7info.LICENSE`. |

The track geometry comes from recorded telemetry, not from game files; configuration ids, track names and one length come from the official GT7 track list (gran-turismo.com) via the upstream catalogue and only identify the track. The car list holds only codes and names (makers' model names) to identify a car; upstream does not document how it was compiled. The data is used offline and never downloaded at runtime.

## 3. Optional downloads

Nothing here ships with GT Toolz. The user chooses these packages in the app; they are downloaded only after the user confirms, straight from the original source, with a fixed version and SHA-256 (`packages/runtime/voice-packages.json`). The engines run as separate programs.

| Component | Version | Used for | License | Notice |
|---|---|---|---|---|
| [Piper](https://github.com/rhasspy/piper) | 2023.11.14-2 | offline speech engine | MIT | Copyright (c) 2022 Michael Hansen. |
| [piper-phonemize](https://github.com/rhasspy/piper-phonemize) | in the Piper engine | phonemes | MIT | Copyright (c) 2023 Michael Hansen. |
| [libtashkeel](https://github.com/mush42/libtashkeel) model | in the Piper engine | Arabic diacritics model shipped with Piper | MIT | Copyright (c) 2023 Musharraf. |
| [onnxruntime](https://github.com/microsoft/onnxruntime) | in both voice engines (Piper, sherpa-onnx; on macOS sherpa-onnx only) | runs the voice models | MIT | Copyright (c) Microsoft Corporation. |
| [espeak-ng](https://github.com/espeak-ng/espeak-ng) | in the Piper and sherpa-onnx engines | phonemes | GPL-3.0-or-later | Part of the downloaded engines, not of GT Toolz. GT Toolz only starts the engines as separate programs. Source: https://github.com/espeak-ng/espeak-ng |
| Piper voices `de_DE-ramona-low`, `de_DE-eva_k-x_low` ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)) | revision `c10ece1` | German voices | M-AILABS license (BSD-style) | Trained on the M-AILABS Speech Dataset (audio from LibriVox, public domain). “Copyright (c) 2017-2019 by the original creators @ M-AILABS”; the full license text, including its disclaimer, is shown in the app. Archived source: https://web.archive.org/web/20240421010552/https://www.caito.de/2019/01/03/the-m-ailabs-speech-dataset/ |
| Piper voice `de_DE-mls-medium` (speaker 53, “Jan”) | revision `c10ece1` | German male voice | CC BY 4.0 (dataset) | Voice model by the Piper project, trained on “Multilingual LibriSpeech (MLS)” by Vineel Pratap, Qiantong Xu, Anuroop Sriram, Gabriel Synnaeve and Ronan Collobert (https://www.openslr.org/94/), licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). The model is derived from the dataset (trained from scratch); the dataset is based on LibriVox recordings. No endorsement by the authors. |
| Piper voices `en_GB-cori-high`, `en_US-ljspeech-high`, `en_US-kristin-medium`, `en_US-norman-medium`, `en_US-john-medium` ([rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices)) | revision `c10ece1` | English voices | MIT (repository); public domain (author) | Voices by Bryce Beattie (https://brycebeattie.com/files/tts/), trained from scratch on public-domain recordings: LibriVox (cori, kristin, norman, john) and the LJ Speech Dataset (https://keithito.com/LJ-Speech-Dataset/). John is finetuned from Kristin. |
| [CSS10 German VITS](https://huggingface.co/neongeckocom/tts-vits-css10-de) (Neon, packaged by sherpa-onnx) | `vits-coqui-de-css10` | German voice | BSD-3-Clause | Copyright (c) Neongecko.com Inc.; the full licence text is shown in the app. Trained on CSS10 German by Kyubyong Park (https://github.com/Kyubyong/css10, CC0), LibriVox audiobooks read by Hokuspokus (public domain). |
| [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | 1.13.8 | speech engine for CSS10; on macOS also for the Piper voices | Apache-2.0 | Full license text in the app; the release has no NOTICE file. |
| Piper voices for macOS, packaged by sherpa-onnx (`vits-piper-de_DE-ramona-low`, `…-eva_k-x_low`, `vits-piper-en_GB-cori-high`, `vits-piper-en_US-ljspeech-high`, `…-kristin-medium`, `…-norman-medium`, `…-john-medium`) | `tts-models` release | the Piper voices above on a Mac (Piper's own macOS build does not start) | as the Piper voices above | The same voice models with sherpa-onnx's `tokens.txt`; each archive also holds espeak-ng's data (GPL-3.0-or-later), read only by the engine as a separate program. |
| Jan (Piper `de_DE-mls-medium`) for macOS (2026-10-28) | the Piper files above; `espeak-ng-data.tar.bz2` from sherpa-onnx's `tts-models` release | Jan on a Mac: sherpa-onnx packages no MLS voice | CC BY 4.0 (the model), GPL-3.0-or-later (espeak-ng's data) | The app makes the downloaded Piper files ready for sherpa-onnx on the Mac, the way sherpa-onnx packages Piper voices: `tokens.txt` from the model's phoneme table and its settings as ONNX metadata. No other change to the model. espeak-ng's data is read only by the engine as a separate program. |

Windows voices (OneCore, SAPI) and macOS voices are part of the user’s system and are only used through the system’s speech functions (Windows speech APIs, `/usr/bin/say`); nothing is redistributed.

## 4. Credits

Published knowledge that helped build GT Toolz. **No code was taken from these projects**; GT Toolz implements the publicly documented facts (packet offsets, the decryption key and nonce layout, port numbers, protocol messages) in its own code.

| Source | License | What helped |
|---|---|---|
| [Nenkai/PDTools](https://github.com/Nenkai/PDTools) (SimulatorInterface) | MIT, Copyright (c) 2021 Nenkai | packet layout, field names and decryption of the GT7 telemetry |
| [MacManley/gt7-udp](https://github.com/MacManley/gt7-udp) | MIT, Copyright (c) 2024 MacManley | packet types A, B, ~ and C and their field names |
| [vwhitteron/gt-telemetry](https://github.com/vwhitteron/gt-telemetry) | MIT, Copyright (c) 2024 vwhitteron | documentation of fields and flags |
| [chiaki-ng](https://github.com/chiaki-ng/chiaki-ng) | AGPL-3.0 | facts about the PlayStation discovery protocol; no code used |
| [GTPlanet](https://www.gtplanet.net/gran-turismo-7s-secret-api-discovered-enabling-motion-rigs-telemetry-info-and-more/) | – | the discovery of the telemetry interface |
| [Ben N on Super User](https://superuser.com/a/1342416) | CC BY-SA 4.0 | the technique of waiting for WinRT operations from PowerShell (Windows voices); written in our own form |
| [Linux hid-playstation driver](https://github.com/torvalds/linux/blob/master/drivers/hid/hid-playstation.c) | GPL-2.0 | the layout of the DualSense output report (rumble flags and motors, Bluetooth report with sequence, tag and CRC-32 seed) for vibration through the PS5 controller; implemented in our own code |

## 5. Trademarks

GT Toolz is an independent tool. It is not affiliated with, endorsed, sponsored or approved by Sony Interactive Entertainment Inc. or Polyphony Digital Inc. “Gran Turismo”, “GT7”, “PlayStation” and “PS5” are trademarks or registered trademarks of Sony Interactive Entertainment Inc. Track, corner and car names are used only for identification and belong to their respective owners.
