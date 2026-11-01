// Learns a reference lap from a recording: finds complete laps, picks one and lists its corners.
// Usage: npm run reference -- <file.gtcap> [--lap <number>] [--out references]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { formatLapTime, readCaptureFile, readFrame, splitLaps } from '@gt-toolz/telemetry';
import { buildReference, builtInPhrases, cornerLabel, fastCornerLabel, type CurbLevel } from '@gt-toolz/coach';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    lap: { type: 'string' },
    out: { type: 'string', default: 'references' },
  },
});

const file = positionals[0];
if (!file) {
  console.error('Usage: reference <file.gtcap> [--lap <number>] [--out references]');
  process.exit(1);
}

const frames = readCaptureFile(file).map((p) => readFrame(p.data, p.time));
const laps = splitLaps(frames);
console.log(`${frames.length} frames, ${laps.length} complete lap(s)`);
for (const lap of laps) {
  const first = lap.frames[0]!;
  console.log(
    `  lap ${lap.lapNumber}: ${formatLapTime(lap.lapTimeMs)}  ${lap.frames.length} frames` +
      `  ${lap.live ? 'live' : 'replay'}${lap.clean ? '' : '  (not clean: pause or cut)'}` +
      `  car ${first.carCode}${first.carCategory ? ` ${first.carCategory}` : ''}`,
  );
}

const candidates = laps.filter((lap) => lap.clean);
const chosen = values.lap
  ? laps.find((lap) => lap.lapNumber === Number(values.lap))
  : candidates.sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0];
if (!chosen) {
  console.log('No usable lap found.');
  process.exit(1);
}

const reference = buildReference(chosen, path.basename(file));
const track = reference.track;
console.log(
  track
    ? `\nTrack: ${track.name} (mean ${track.meanDistanceM.toFixed(1)} m, max ${track.maxDistanceM.toFixed(1)} m off the signature line)` +
        (track.ambiguousWith.length ? `, also fits: ${track.ambiguousWith.join(', ')}` : '')
    : '\nTrack: not recognized (not in the signature data)',
);
console.log(
  `\nReference: lap ${chosen.lapNumber}, ${formatLapTime(reference.lapTimeMs)}, ${reference.lengthMeters.toFixed(0)} m,` +
    ` steering from ${reference.steerSource}, ${reference.corners.length} braking zones\n`,
);
// Curbs: '-' unused, 'used' (side only, older data), else how much of the car: touch, half, full.
const curb = (used: boolean | undefined, level: CurbLevel | undefined) => (used ? (level ?? 'used') : '-');
const phrases = builtInPhrases('en');
console.log(' #   brake at   speed    brake   turn-in    steer     apex    min speed  gear  curb in/out    name');
for (const c of reference.corners) {
  const turnIn = c.turnInS === undefined ? '      -' : `${c.turnInS.toFixed(0).padStart(6)} m`;
  const steerDeg = ((c.maxSteer * 180) / Math.PI).toFixed(1);
  console.log(
    `${String(c.index).padStart(2)}  ${c.brakeS.toFixed(0).padStart(6)} m  ${c.brakeSpeedKmh.toFixed(0).padStart(4)} km/h` +
      `  ${(c.peakBrake * 100).toFixed(0).padStart(4)} %  ${turnIn}  ${steerDeg.padStart(6)}°  ${c.apexS.toFixed(0).padStart(6)} m` +
      `  ${c.apexSpeedKmh.toFixed(0).padStart(5)} km/h  ${String(c.apexGear).padStart(3)}` +
      `   ${`${curb(c.curbIn, c.curbInLevel)}/${curb(c.curbOut, c.curbOutLevel)}`.padEnd(12)}   ${cornerLabel(c, phrases)}`,
  );
}

const fast = reference.fastCorners ?? [];
console.log(`\n${fast.length} corner(s) without braking (docs/dev/coach-and-texts.md):`);
console.log(' #   kind   from      to      turn   lift at   min speed  curb in/out    name');
for (const f of fast) {
  const lift = f.liftS === undefined ? '      -' : `${f.liftS.toFixed(0).padStart(6)} m`;
  console.log(
    `${String(f.index).padStart(2)}  ${f.kind.padEnd(4)}  ${f.startS.toFixed(0).padStart(5)} m  ${f.endS.toFixed(0).padStart(5)} m` +
      `  ${`${f.turnDeg.toFixed(0)}° ${f.direction === 'right' ? 'R' : 'L'}`.padStart(6)}  ${lift}  ${f.minSpeedKmh.toFixed(0).padStart(5)} km/h` +
      `   ${`${curb(f.curbIn, f.curbInLevel)}/${curb(f.curbOut, f.curbOutLevel)}`.padEnd(12)}   ${fastCornerLabel(f, phrases)}${f.chained ? ' (right after the previous corner)' : ''}`,
  );
}

fs.mkdirSync(values.out, { recursive: true });
const outFile = path.join(values.out, `${path.basename(file, '.gtcap')}_lap${chosen.lapNumber}.json`);
fs.writeFileSync(outFile, JSON.stringify(reference));
console.log(`\nSaved ${outFile}`);
