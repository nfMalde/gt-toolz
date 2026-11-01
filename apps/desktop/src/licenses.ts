// Third-party components for the in-app licenses page. License texts come from the packages themselves
// (collected at build time into licenses.json next to main.cjs, see scripts/build.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { LicenseEntry } from '@gt-toolz/runtime';

interface CollectedTexts {
  texts: Record<string, string>;
  versions: Record<string, string>;
}

const MIT = (copyright: string) => `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const MIT0 = (copyright: string) => `MIT No Attribution

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const BSD3 = (copyright: string) => `${copyright}

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
   disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the
   following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote
   products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

/** The M-AILABS Speech Dataset license (Piper voices Ramona and Eva K are trained on it). */
const M_AILABS = `Copyright (c) 2017-2019 by the original creators @ M-AILABS with the following license:

Redistribution and use in any form, including any commercial use, with or without modification are permitted provided that the following conditions are met:

Redistributions of source data must retain the above copyright notice, this list of conditions and the following disclaimer.

Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this downloaded data, source-code or binary-code without specific prior written permission.

THIS DATA IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE and/or DATA, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

function collected(): CollectedTexts {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'licenses.json'), 'utf8')) as CollectedTexts;
  } catch (err) {
    // Written by scripts/build.mjs; without it the license page would show entries without their texts.
    console.error(`licenses.json missing or unreadable: ${(err as Error).message}`);
    return { texts: {}, versions: {} };
  }
}

export function licenseEntries(): LicenseEntry[] {
  const { texts, versions } = collected();
  const apache = texts['apache-2.0'];
  return [
    {
      name: 'Electron',
      version: versions['electron'],
      license: 'MIT',
      usedFor: 'app',
      url: 'https://github.com/electron/electron',
      shipped: 'bundled',
      notice: 'chromium',
      text: texts['electron'],
    },
    {
      name: 'FFmpeg (part of Electron)',
      license: 'LGPL-2.1-or-later',
      usedFor: 'media',
      url: 'https://ffmpeg.org',
      shipped: 'bundled',
      notice: 'ffmpeg',
    },
    { name: 'Angular', version: versions['@angular/core'], license: 'MIT', usedFor: 'ui', url: 'https://github.com/angular/angular', shipped: 'bundled', text: texts['@angular/core'] },
    { name: 'NgRx Signals', version: versions['@ngrx/signals'], license: 'MIT', usedFor: 'ui', url: 'https://github.com/ngrx/platform', shipped: 'bundled', text: texts['@ngrx/signals'] },
    { name: 'RxJS', version: versions['rxjs'], license: 'Apache-2.0', usedFor: 'ui', url: 'https://github.com/ReactiveX/rxjs', shipped: 'bundled', text: texts['rxjs'] },
    { name: 'tslib', version: versions['tslib'], license: '0BSD', usedFor: 'ui', url: 'https://github.com/microsoft/tslib', shipped: 'bundled', text: texts['tslib'] },
    {
      name: '@noble/ciphers',
      version: versions['@noble/ciphers'],
      license: 'MIT',
      usedFor: 'telemetry',
      url: 'https://github.com/paulmillr/noble-ciphers',
      shipped: 'bundled',
      text: texts['@noble/ciphers'],
    },
    {
      name: 'gt7-datalogger-track-data',
      version: 'df4b73f',
      license: 'CC0-1.0',
      usedFor: 'tracks',
      url: 'https://github.com/jbhoorasingh/gt7-datalogger-track-data',
      shipped: 'data',
      notice: 'cc0',
    },
    {
      name: 'gt-telemetry circuit recordings (in the track signatures)',
      license: 'MIT',
      usedFor: 'tracks',
      url: 'https://github.com/zetetos/gt-telemetry',
      shipped: 'data',
      notice: 'gt-telemetry',
      text: MIT('Copyright (c) 2024 vwhitteron'),
    },
    {
      name: 'gt7info (car list)',
      version: '707b463',
      license: 'MIT-0',
      usedFor: 'cars',
      url: 'https://github.com/ddm999/gt7info',
      shipped: 'data',
      notice: 'gt7info',
      text: MIT0('Copyright 2022 Daniel Lee / @ddm999'),
    },
    {
      name: 'Piper',
      version: '2023.11.14-2',
      license: 'MIT',
      usedFor: 'voice',
      url: 'https://github.com/rhasspy/piper',
      shipped: 'download',
      text: MIT('Copyright (c) 2022 Michael Hansen'),
    },
    {
      name: 'Piper voices de_DE-ramona-low, de_DE-eva_k-x_low',
      license: 'M-AILABS (BSD-style)',
      usedFor: 'voice',
      url: 'https://huggingface.co/rhasspy/piper-voices',
      shipped: 'download',
      notice: 'm-ailabs',
      text: M_AILABS,
    },
    {
      name: 'Piper voice de_DE-mls-medium (Jan)',
      license: 'CC BY 4.0',
      usedFor: 'voice',
      url: 'https://www.openslr.org/94/',
      shipped: 'download',
      notice: 'mls',
    },
    {
      name: 'Piper voices en_GB-cori-high, en_US-ljspeech-high, en_US-kristin-medium, en_US-norman-medium, en_US-john-medium',
      license: 'MIT',
      usedFor: 'voice',
      url: 'https://huggingface.co/rhasspy/piper-voices',
      shipped: 'download',
      notice: 'public-domain-voices',
      text: MIT('Copyright (c) rhasspy/piper-voices contributors'),
    },
    {
      name: 'CSS10 German VITS (Neon)',
      license: 'BSD-3-Clause',
      usedFor: 'voice',
      url: 'https://huggingface.co/neongeckocom/tts-vits-css10-de',
      shipped: 'download',
      notice: 'css10',
      text: BSD3('Copyright (c) Neongecko.com Inc.'),
    },
    { name: 'sherpa-onnx', version: '1.13.8', license: 'Apache-2.0', usedFor: 'voice', url: 'https://github.com/k2-fsa/sherpa-onnx', shipped: 'download', text: apache },
    {
      name: 'onnxruntime',
      license: 'MIT',
      usedFor: 'voice-engine',
      url: 'https://github.com/microsoft/onnxruntime',
      shipped: 'download',
      text: MIT('Copyright (c) Microsoft Corporation'),
    },
    {
      name: 'espeak-ng',
      license: 'GPL-3.0-or-later',
      usedFor: 'voice-engine',
      url: 'https://github.com/espeak-ng/espeak-ng',
      shipped: 'download',
      notice: 'gpl',
    },
    {
      name: 'piper-phonemize',
      license: 'MIT',
      usedFor: 'voice-engine',
      url: 'https://github.com/rhasspy/piper-phonemize',
      shipped: 'download',
      notice: 'piper-part',
      text: MIT('Copyright (c) 2023 Michael Hansen'),
    },
    {
      name: 'libtashkeel model',
      license: 'MIT',
      usedFor: 'voice-engine',
      url: 'https://github.com/mush42/libtashkeel',
      shipped: 'download',
      notice: 'piper-part',
      text: MIT('Copyright (c) 2023 Musharraf'),
    },

    // Credits: published knowledge that helped. No code was taken from these projects.
    {
      name: 'PDTools (SimulatorInterface)',
      license: 'MIT',
      usedFor: 'research',
      url: 'https://github.com/Nenkai/PDTools',
      shipped: 'credit',
      notice: 'credit-pdtools',
      text: MIT('Copyright (c) 2021 Nenkai'),
    },
    {
      name: 'gt7-udp',
      license: 'MIT',
      usedFor: 'research',
      url: 'https://github.com/MacManley/gt7-udp',
      shipped: 'credit',
      notice: 'credit-gt7udp',
      text: MIT('Copyright (c) 2024 MacManley'),
    },
    {
      name: 'gt-telemetry',
      license: 'MIT',
      usedFor: 'research',
      url: 'https://github.com/vwhitteron/gt-telemetry',
      shipped: 'credit',
      notice: 'credit-gttelemetry',
    },
    { name: 'chiaki-ng', license: 'AGPL-3.0', usedFor: 'research', url: 'https://github.com/chiaki-ng/chiaki-ng', shipped: 'credit', notice: 'credit-chiaki' },
    {
      name: 'GTPlanet community',
      license: '–',
      usedFor: 'research',
      url: 'https://www.gtplanet.net/gran-turismo-7s-secret-api-discovered-enabling-motion-rigs-telemetry-info-and-more/',
      shipped: 'credit',
      notice: 'credit-gtplanet',
    },
    { name: 'Ben N (Super User)', license: 'CC BY-SA 4.0', usedFor: 'research', url: 'https://superuser.com/a/1342416', shipped: 'credit', notice: 'credit-winrt' },
    {
      name: 'Linux hid-playstation driver',
      license: 'GPL-2.0',
      usedFor: 'research',
      url: 'https://github.com/torvalds/linux/blob/master/drivers/hid/hid-playstation.c',
      shipped: 'credit',
      notice: 'credit-dualsense',
    },
  ];
}

/**
 * Chromium's license list ships next to the Electron executable. On macOS it sits in Contents/Resources of the
 * installed app (the installer build moves it into the .app bundle), and next to Electron.app for Electron from npm.
 */
export function chromiumLicensesFile(): string {
  const exeDir = path.dirname(process.execPath);
  if (process.platform !== 'darwin') return path.join(exeDir, 'LICENSES.chromium.html');
  return app.isPackaged ? path.join(process.resourcesPath, 'LICENSES.chromium.html') : path.join(exeDir, '..', '..', '..', 'LICENSES.chromium.html');
}
