import { fieldMap, flagName, FLAG_NAMES, FLAGS_OFFSET, type FieldDef, type PacketType } from '@gt-toolz/telemetry';

/** Moving average weight for the per-byte change rate. */
const NOISE_ALPHA = 0.1;
/** Bytes whose change rate exceeds this are treated as noise (a 4 Hz blink peaks at ~0.18). */
const NOISE_THRESHOLD = 0.3;
/** A bit that toggles this often within the window counts as blinking. */
const BLINK_MIN_TOGGLES = 4;
const BLINK_WINDOW_MS = 3000;
/** Faster toggling is noise, not a lamp. */
const BLINK_MAX_HZ = 5;
/** A blinking bit that stays unchanged this long has stopped blinking. */
const BLINK_END_MS = 2000;

interface BitState {
  toggles: number[];
  blinking: boolean;
  value: number;
}

/**
 * Watches every byte that is not a known continuous value or counter and reports
 * bit changes. Bits that toggle periodically are reported once as blinking.
 */
export class ChangeAnalyzer {
  private type: PacketType | undefined;
  private fields: FieldDef[] = [];
  private previous: Uint8Array | undefined;
  private rate = new Float32Array(0);
  private readonly noisy = new Set<number>();
  private readonly bits = new Map<number, BitState>();

  constructor(private readonly log: (line: string) => void) {}

  onPacket(type: PacketType, data: Uint8Array, time: number): void {
    const previous = this.previous;
    if (type !== this.type || !previous || previous.length !== data.length) {
      this.reset(type, data);
      return;
    }

    const changes: string[] = [];
    for (let i = 0; i < data.length; i++) {
      const field = this.fields[i];
      if (!field || field.kind === 'continuous' || field.kind === 'counter') continue;

      const before = previous[i]!;
      const after = data[i]!;
      const diff = before ^ after;
      this.rate[i] = this.rate[i]! * (1 - NOISE_ALPHA) + (diff ? NOISE_ALPHA : 0);
      if (!diff || this.noisy.has(i)) continue;

      if (this.rate[i]! > NOISE_THRESHOLD) {
        this.markNoisy(i, field);
        continue;
      }

      const reported: number[] = [];
      let noise = false;
      for (let bit = 0; bit < 8 && !noise; bit++) {
        if (!(diff & (1 << bit))) continue;
        const result = this.trackToggle(i, bit, (after >> bit) & 1, time);
        if (result === 'report') reported.push(bit);
        noise = result === 'noise';
      }
      if (noise) this.markNoisy(i, field);
      else if (reported.length) changes.push(describeChange(i, field, before, after, reported));
    }

    if (changes.length) this.log(`CHANGE    ${changes.join(' | ')}`);
    this.previous = data.slice();
  }

  /** Detects the end of blinking. Call regularly. */
  tick(time: number): void {
    for (const [key, state] of this.bits) {
      const last = state.toggles.at(-1) ?? 0;
      if (!state.blinking || time - last < BLINK_END_MS) continue;
      state.blinking = false;
      state.toggles = [];
      this.log(`■ STOPPED BLINKING  ${this.describeBit(key >> 3, key & 7)}  final value ${state.value}`);
    }
  }

  get noisyOffsets(): number[] {
    return [...this.noisy];
  }

  private reset(type: PacketType, data: Uint8Array): void {
    this.type = type;
    this.fields = fieldMap(type);
    this.previous = data.slice();
    this.rate = new Float32Array(data.length);
    this.noisy.clear();
    this.bits.clear();
    this.log(`PACKET    type ${type} (${data.length} bytes), analysis started`);
  }

  /** Marks a noisy byte. In unknown fields the whole aligned 4-byte word goes with it, as it is most likely a float. */
  private markNoisy(offset: number, field: FieldDef): void {
    const word = field.kind === 'unknown' ? offset - ((offset - field.offset) % 4) : offset;
    const end = field.kind === 'unknown' ? Math.min(word + 4, field.offset + field.length) : offset + 1;
    for (let i = word; i < end; i++) {
      this.noisy.add(i);
      for (let bit = 0; bit < 8; bit++) this.bits.delete(i * 8 + bit);
    }
    const range = end - word > 1 ? `${describeByte(word, field)} (4 bytes)` : describeByte(offset, field);
    this.log(`NOISE     ${range} changes constantly, ignored from now on`);
  }

  /** Decides whether a toggle is a single change to report, part of a blink, or noise. */
  private trackToggle(offset: number, bit: number, value: number, time: number): 'report' | 'silent' | 'noise' {
    const key = offset * 8 + bit;
    let state = this.bits.get(key);
    if (!state) {
      state = { toggles: [], blinking: false, value };
      this.bits.set(key, state);
    }
    state.value = value;
    state.toggles.push(time);
    while (state.toggles.length && time - state.toggles[0]! > BLINK_WINDOW_MS) state.toggles.shift();

    if (state.blinking) return 'silent';
    if (state.toggles.length < BLINK_MIN_TOGGLES) return 'report';

    const seconds = (time - state.toggles[0]!) / 1000;
    const hz = (state.toggles.length - 1) / 2 / seconds;
    if (hz > BLINK_MAX_HZ) return 'noise';

    state.blinking = true;
    this.log(`★ BLINKING  ${this.describeBit(offset, bit)}  ~${hz.toFixed(1)} Hz`);
    return 'silent';
  }

  private describeBit(offset: number, bit: number): string {
    const field = this.fields[offset];
    if (field?.kind === 'flags') {
      const index = (offset - FLAGS_OFFSET) * 8 + bit;
      return `flags bit ${index} (${flagName(index)})${index >= FLAG_NAMES.length ? ' ★' : ''}`;
    }
    return `${field ? describeByte(offset, field) : hex(offset)} bit ${bit}`;
  }
}

function describeByte(offset: number, field: FieldDef): string {
  const index = field.length > 1 ? `[+${offset - field.offset}]` : '';
  return `${hex(offset)} ${field.name}${index}${field.kind === 'unknown' ? ' ★' : ''}`;
}

function describeChange(offset: number, field: FieldDef, before: number, after: number, bits: number[]): string {
  if (field.kind === 'flags') {
    const parts = bits.map((bit) => {
      const index = (offset - FLAGS_OFFSET) * 8 + bit;
      const sign = (after >> bit) & 1 ? '+' : '-';
      return `${sign}${flagName(index)}${index >= FLAG_NAMES.length ? ' ★' : ''}`;
    });
    return `flags: ${parts.join(' ')}`;
  }
  return `${describeByte(offset, field)} ${hex(before, 2)}→${hex(after, 2)}`;
}

function hex(value: number, digits = 3): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, '0')}`;
}
