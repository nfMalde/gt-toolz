// Compares two time windows of a .gtcap recording bit by bit (all bytes, nothing filtered)
// and lists bits that blink regularly or hold a different value only in the test window.
// Usage: npm run compare -- <file.gtcap> --baseline 18:22:20-18:22:42 --test 18:24:00-18:24:15

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { fieldMap, FLAGS_OFFSET, flagName, type PacketType } from '@gt-toolz/telemetry';

interface Recorded {
  time: number;
  type: PacketType;
  data: Uint8Array;
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    baseline: { type: 'string' },
    test: { type: 'string' },
  },
});

const file = positionals[0];
if (!file || !values.baseline || !values.test) {
  console.error('Usage: compare <file.gtcap> --baseline HH:MM:SS-HH:MM:SS --test HH:MM:SS-HH:MM:SS');
  process.exit(1);
}

const packets = readCapture(file);
const first = packets[0];
if (!first) {
  console.error('Recording is empty.');
  process.exit(1);
}

const baseline = select(packets, parseWindow(values.baseline, first.time));
const test = select(packets, parseWindow(values.test, first.time));
console.log(`Baseline: ${baseline.length} packets, test: ${test.length} packets, type ${first.type}`);

const fields = fieldMap(first.type);
const size = first.data.length;

interface Candidate {
  label: string;
  detail: string;
  score: number;
}
const periodic: Candidate[] = [];
const statics: Candidate[] = [];

for (let offset = 0; offset < size; offset++) {
  for (let bit = 0; bit < 8; bit++) {
    const b = bitStats(baseline, offset, bit);
    const t = bitStats(test, offset, bit);
    const label = describeBit(offset, bit);

    // Regular blinking in the test window that is absent (or much weaker) in the baseline.
    if (t.toggles >= 6 && t.hz >= 0.5 && t.hz <= 3 && t.regularity < 0.35 && t.toggles > b.toggles * 3) {
      periodic.push({
        label,
        detail: `test ${t.toggles} toggles ~${t.hz.toFixed(2)} Hz (regularity ${t.regularity.toFixed(2)}), baseline ${b.toggles} toggles`,
        score: t.toggles - b.toggles,
      });
    }

    // Constant in both windows, but with a different value.
    if (b.toggles === 0 && t.toggles === 0 && b.firstValue !== t.firstValue) {
      statics.push({ label, detail: `baseline ${b.firstValue} → test ${t.firstValue}`, score: 1 });
    }
  }
}

print('Bits that blink only in the test window', periodic);
print('Bits that are constant in both windows but differ', statics);

function print(title: string, candidates: Candidate[]): void {
  console.log(`\n${title}: ${candidates.length}`);
  for (const c of candidates.sort((a, b) => b.score - a.score).slice(0, 40)) {
    console.log(`  ${c.label.padEnd(44)} ${c.detail}`);
  }
}

function bitStats(window: Recorded[], offset: number, bit: number) {
  const times: number[] = [];
  let previous: number | undefined;
  let firstValue = -1;
  for (const p of window) {
    const value = ((p.data[offset] ?? 0) >> bit) & 1;
    if (firstValue < 0) firstValue = value;
    if (previous !== undefined && value !== previous) times.push(p.time);
    previous = value;
  }
  const intervals = times.slice(1).map((t, i) => t - times[i]!);
  const mean = intervals.reduce((a, b) => a + b, 0) / (intervals.length || 1);
  const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / (intervals.length || 1);
  return {
    toggles: times.length,
    // Two toggles per blink period.
    hz: mean > 0 ? 1000 / (2 * mean) : 0,
    // Coefficient of variation of the toggle intervals: 0 = perfectly regular.
    regularity: mean > 0 ? Math.sqrt(variance) / mean : Infinity,
    firstValue,
  };
}

function describeBit(offset: number, bit: number): string {
  const field = fields[offset];
  if (field?.kind === 'flags') {
    const index = (offset - FLAGS_OFFSET) * 8 + bit;
    return `0x${offset.toString(16).toUpperCase()} flags bit ${index} (${flagName(index)})`;
  }
  const index = field && field.length > 1 ? `[+${offset - field.offset}]` : '';
  return `0x${offset.toString(16).toUpperCase()} ${field?.name ?? '?'}${index} bit ${bit} (${field?.kind ?? '?'})`;
}

function readCapture(path: string): Recorded[] {
  const buffer = fs.readFileSync(path);
  const header = 'GTCAP1\n';
  if (buffer.subarray(0, header.length).toString('ascii') !== header) throw new Error('Not a .gtcap file');
  const result: Recorded[] = [];
  let pos = header.length;
  // The last record may be incomplete while the recording is still running.
  while (pos + 11 <= buffer.length) {
    const length = buffer.readUInt16LE(pos);
    if (pos + 11 + length > buffer.length) break;
    result.push({
      time: buffer.readDoubleLE(pos + 2),
      type: String.fromCharCode(buffer.readUInt8(pos + 10)) as PacketType,
      data: buffer.subarray(pos + 11, pos + 11 + length),
    });
    pos += 11 + length;
  }
  return result;
}

/** Parses "HH:MM:SS-HH:MM:SS" in local time on the recording's day. */
function parseWindow(text: string, reference: number): [number, number] {
  const [from, to] = text.split('-');
  if (!from || !to) throw new Error(`Invalid window "${text}"`);
  return [atTime(from, reference), atTime(to, reference)];
}

function atTime(clock: string, reference: number): number {
  const [h, m, s] = clock.split(':').map(Number);
  const date = new Date(reference);
  date.setHours(h ?? 0, m ?? 0, 0, 0);
  return date.getTime() + (s ?? 0) * 1000;
}

function select(all: Recorded[], [from, to]: [number, number]): Recorded[] {
  return all.filter((p) => p.time >= from && p.time <= to);
}
