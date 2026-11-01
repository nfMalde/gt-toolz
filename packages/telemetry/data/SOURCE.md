# Track signatures

`track-signatures.json` is vendored data, used offline only. GT Toolz never downloads it at runtime.

| | |
|---|---|
| Source | https://github.com/jbhoorasingh/gt7-datalogger-track-data (`signatures.json`) |
| Commit | `df4b73ffe850868db5826d9efa32292e537a0328` |
| SHA-256 | `1f57a9b3c50069d94bc46954e6d79b6e4346bd4cf4394b04c47d6ffb12df1d1f` |
| License | CC0 1.0 for the 25 rows with `"provenance": "survey"`, see `track-signatures.LICENSE`. The 53 rows with `"provenance": "capture"` are derived from lap recordings in https://github.com/zetetos/gt-telemetry (`data/circuits`, via the upstream `vendor/circuits.json`), MIT License, Copyright (c) 2024 vwhitteron, see `gt-telemetry.LICENSE`. The LICENSE file upstream names only `tracks/` and `index.json`; the CC0 statement for `signatures.json` is the "Licence" section of the upstream README. |
| Retrieved | 2026-10-18 |

Content: 78 of 121 GT7 configurations with length, bounding box (x/z) and the racing line thinned to one point every 20 m, in GT7 telemetry coordinates.
Where the values come from: the geometry (length, bounding box, racing line) is recorded telemetry, not game files. The
configuration ids, the track names and one length (Red Bull Ring Short Track) come from the official GT7 track list
(gran-turismo.com) via the upstream catalogue; they are used only to identify the track.
Verified against our own Spa replay: mean distance 0.9 m to the signature path.

To update: download the file for a specific commit, check the SHA-256, review the diff, then update this table.

Checked 2026-10-28: three commits since the pin (up to `aa501ad`, 2026-10-21) add only a survey of the Circuit de Barcelona-Catalunya Rallycross Layout and fix Monza; not taken yet (younger than 14 days). SUGO International Racing Course is not in the upstream catalogue at all.

# Own track signatures

`own-track-signatures.json`: tracks the vendored data does not have yet, recorded by GT Toolz itself, in the same format. Our own data: the driven line of a reference lap from GT7's telemetry, sampled every 20 m (no game files, no third-party data).

| Id | Track | Recorded |
|---|---|---|
| `own-sugo` | SUGO International Racing Course (3,543 m driven) | 2026-10-28, the replay of a Daily Race qualifying lap (Nissan Fairlady Z (Z34) '08); GT7's track id is unknown, hence `own-…` |

A reference learned before its track was known is recognized again when it is loaded (`prepareReference`). Checked: the SUGO reference matches with a mean distance of 0.2 m; the Interlagos, Montreal and Suzuka references still match their own tracks.

# Car names

`cars.json` maps GT7's car code (the telemetry sends only the code) to maker and model, so the app can show
which car a reference was driven with and which car is driven now. Converted from `_data/db/cars.csv` and
`_data/db/maker.csv` (one entry per car: code → [maker, model]); nothing else is taken over.

| | |
|---|---|
| Source | https://github.com/ddm999/gt7info (`_data/db/cars.csv`, `_data/db/maker.csv`) |
| Commit | `707b4631e6f26033cb80cd3b369e12dfbdbf34f4` (2026-08-20, cars up to GT7 1.71; at least 14 days old) |
| SHA-256 | `cars.csv` `e654335cd6d0785e5e3c00b967d5bef1efaf3bc21f36fc03fb7d064fde909089`, `maker.csv` `d53dade3572349fe91e48ba10ce32d7381931a330e459893606c0c1e1f793022`; `cars.json` `c09de61314ba4e2bce3fdde70c697815bca12dd622a458f2c8cc1bd787a2bafe` |
| License | MIT No Attribution (MIT-0), Copyright 2022 Daniel Lee / @ddm999, see `gt7info.LICENSE`. No attribution required; credited voluntarily. |
| Retrieved | 2026-10-20 |

Content: 584 cars of 82 makers. The names are the makers' model names, used only to identify the car.
Upstream does not document how the list was compiled; the codes are the ones the telemetry sends, the names are facts,
and both are used only to identify the car.
A car newer than this list shows its code and class; the user can name it on the reference.

To update: take a commit at least 14 days old, download both files for it, check the SHA-256, convert them
again (same format, sorted by code), review the diff, then update this table.
