// Developer tool only: end users never use npm. In the app, the same logic (voice-packages.ts) runs
// behind the voice dialog at first start and in settings, where the user deselects what they do not want.
// Usage: npm run voices -- --list
//        npm run voices -- --install piper:de_DE-ramona-low vits-css10-de
//        npm run voices -- --remove vits-css10-de
//        [--dir .cache/tts]

import { parseArgs } from 'node:util';
import { DEFAULT_VOICES_DIR, installPackages, isInstalled, readVoicePackages, removePackages } from '@gt-toolz/runtime';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: 'string', default: DEFAULT_VOICES_DIR },
    list: { type: 'boolean', default: false },
    install: { type: 'boolean', default: false },
    remove: { type: 'boolean', default: false },
  },
});

const manifest = readVoicePackages();
const log = (line: string) => console.log(line);

if (values.install) await installPackages(positionals, values.dir, { log }, manifest);
else if (values.remove) removePackages(positionals, values.dir, log, manifest);

if (values.list || (!values.install && !values.remove)) {
  console.log('Optional voice packages (Windows voices need none):\n');
  for (const pkg of manifest.packages) {
    const state = isInstalled(values.dir, pkg) ? 'installed' : '-';
    const voices = pkg.voices ? `  voices: ${pkg.voices.map((v) => v.id).join(', ')}` : '';
    console.log(`${state.padEnd(10)} ${pkg.id.padEnd(26)} ${pkg.kind.padEnd(7)} ${pkg.language ?? ''}`);
    console.log(`${''.padEnd(10)} ${pkg.name}; ${pkg.license}${voices ? `\n${''.padEnd(10)}${voices}` : ''}`);
  }
}
