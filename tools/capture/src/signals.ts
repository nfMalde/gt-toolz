// Data probe: which telemetry signals carry usable information for new coaching features?
// Reads recordings and reports, per file:
// - which packet parts are filled (B: steering wheel and forces, ~: filtered pedals, torque vectoring)
// - wheel speed against car speed: lock-ups when braking, wheelspin on the throttle
// - the car's heading and the direction it moves: slip angle (over- and understeer), yaw rate
// - TCS, ASM and rev limiter flags, the RPM at upshifts, the suggested gear
// - coasting (neither pedal), time of day and lights
// - with a reference: the lateral offset from the reference line (is a line coach precise enough?)
// Usage: npm run signals -- <recording.gtcap> [more.gtcap ...] [--reference references/x.json]

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { PACKET_SIZES, readCaptureFile } from '@gt-toolz/telemetry';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { reference: { type: 'string' } },
});
if (!positionals.length) {
  console.error('Usage: signals <recording.gtcap> [more.gtcap ...] [--reference references/x.json]');
  process.exit(1);
}

interface RefPoint {
  s: number;
  x: number;
  z: number;
}
const reference = values.reference ? (JSON.parse(fs.readFileSync(values.reference, 'utf8')) as { points: RefPoint[]; lengthMeters: number }) : undefined;

/** Everything the probe reads from one packet. */
interface Sample {
  time: number;
  flags: number;
  speed: number;
  vel: [number, number, number];
  rot: [number, number, number, number];
  ang: [number, number, number];
  x: number;
  z: number;
  rpm: number;
  gear: number;
  suggested: number;
  throttle: number;
  brake: number;
  minAlert: number;
  maxAlert: number;
  timeOfDayMs: number;
  lapCount: number;
  wheelRps: [number, number, number, number];
  radius: [number, number, number, number];
  b?: { wheelRotation: number; sway: number; heave: number; surge: number };
  tilde?: { throttleFiltered: number; brakeFiltered: number; torque: number[]; energy: number };
  steer?: number;
  surface?: string;
}

function decode(data: Uint8Array, time: number): Sample {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const f = (o: number) => v.getFloat32(o, true);
  const gearByte = v.getUint8(0x90);
  const sample: Sample = {
    time,
    flags: v.getUint16(0x8e, true),
    speed: f(0x4c),
    vel: [f(0x10), f(0x14), f(0x18)],
    rot: [f(0x1c), f(0x20), f(0x24), f(0x28)],
    ang: [f(0x2c), f(0x30), f(0x34)],
    x: f(0x04),
    z: f(0x0c),
    rpm: f(0x3c),
    gear: gearByte & 0x0f,
    suggested: gearByte >> 4,
    throttle: v.getUint8(0x91) / 255,
    brake: v.getUint8(0x92) / 255,
    minAlert: v.getUint16(0x88, true),
    maxAlert: v.getUint16(0x8a, true),
    timeOfDayMs: v.getUint32(0x80, true),
    lapCount: v.getInt16(0x74, true),
    wheelRps: [f(0xa4), f(0xa8), f(0xac), f(0xb0)],
    radius: [f(0xb4), f(0xb8), f(0xbc), f(0xc0)],
  };
  if (data.length >= PACKET_SIZES.B) sample.b = { wheelRotation: f(0x128), sway: f(0x130), heave: f(0x134), surge: f(0x138) };
  if (data.length >= PACKET_SIZES['~']) {
    sample.tilde = { throttleFiltered: v.getUint8(0x13c), brakeFiltered: v.getUint8(0x13d), torque: [f(0x140), f(0x144), f(0x148), f(0x14c)], energy: f(0x150) };
  }
  if (data.length >= PACKET_SIZES.C) {
    sample.steer = (f(0x160) + f(0x164)) / 2;
    sample.surface = String.fromCharCode(...data.subarray(0x158, 0x15c));
  }
  return sample;
}

// --- Helpers ---

const DEG = 180 / Math.PI;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const median = (xs: number[]) => quantile(xs, 0.5);
function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]!;
}
const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '–');
const pct = (part: number, total: number) => (total ? `${((100 * part) / total).toFixed(1)} %` : '–');
function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i]! - ma) * (b[i]! - mb);
    va += (a[i]! - ma) ** 2;
    vb += (b[i]! - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}
/** Runs of at least minFrames consecutive frames where test holds; returns [start, end) indices. */
function runs(samples: Sample[], test: (s: Sample, i: number) => boolean, minFrames: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= samples.length; i++) {
    const ok = i < samples.length && test(samples[i]!, i);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      if (i - start >= minFrames) out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

/** Forward direction of a quaternion (x, y, z, w) applied to (0, 0, 1), as a heading in the x/z plane. */
function quaternionHeading([x, y, z, w]: [number, number, number, number]): number {
  const fx = 2 * (x * z + w * y);
  const fz = 1 - 2 * (x * x + y * y);
  return Math.atan2(fx, fz);
}

// --- Analysis ---

for (const file of positionals) {
  const packets = readCaptureFile(file);
  const all = packets.map((p) => decode(p.data, p.time));
  // Driving: the car moves. Not the pause flag: some replay views set it while the car drives. Frozen
  // streams (the same packet again and again, speed above zero but no movement) are left out.
  let frozen = 0;
  const samples = all.filter((s, i) => {
    if (s.speed <= 1) return false;
    const prev = all[i - 1];
    const moved = !prev || (s.x - prev.x) ** 2 + (s.z - prev.z) ** 2 > 1e-8;
    if (!moved) frozen++;
    return moved;
  });
  const paused = samples.filter((s) => s.flags & 0x2).length;
  const types = new Map<string, number>();
  for (const p of packets) types.set(p.type, (types.get(p.type) ?? 0) + 1);
  const duration = samples.length ? (samples.at(-1)!.time - samples[0]!.time) / 1000 : 0;
  const onTrack = samples.filter((s) => s.flags & 0x1).length;

  console.log(`\n=== ${path.basename(file)}`);
  console.log(`packets ${[...types].map(([t, n]) => `${t}×${n}`).join(' ')}, driving ${fmt(duration / 60, 1)} min, CarOnTrack ${pct(onTrack, samples.length)} (${onTrack > samples.length / 2 ? 'live' : 'replay'}), paused flag while driving ${pct(paused, samples.length)}, frozen packets left out ${frozen}`);
  if (samples.length < 100) {
    console.log('too little driving');
    continue;
  }

  // Packet parts actually filled.
  const withB = samples.filter((s) => s.b);
  const bFilled = withB.filter((s) => s.b!.sway !== 0 || s.b!.heave !== 0 || s.b!.surge !== 0);
  // ~ is filled when its filtered throttle follows the throttle.
  const onGas = samples.filter((s) => s.tilde && s.throttle > 0.5);
  const tildeFilled = onGas.filter((s) => s.tilde!.throttleFiltered > 0);
  console.log(`B forces filled ${pct(bFilled.length, withB.length)}, ~ filtered throttle filled ${pct(tildeFilled.length, onGas.length)} of throttle frames`);
  if (bFilled.length) {
    const g = (k: 'sway' | 'heave' | 'surge') => bFilled.map((s) => s.b![k]);
    console.log(`  sway p5/p95 ${fmt(quantile(g('sway'), 0.05))}/${fmt(quantile(g('sway'), 0.95))}, surge p5/p95 ${fmt(quantile(g('surge'), 0.05))}/${fmt(quantile(g('surge'), 0.95))}, heave p5/p95 ${fmt(quantile(g('heave'), 0.05))}/${fmt(quantile(g('heave'), 0.95))}`);
  }

  // Wheel speed: |rps| × radius against car speed, on free-rolling frames (no pedal, straight).
  const rolling = samples.filter((s) => s.speed > 20 && s.brake < 0.02 && s.throttle < 0.3 && Math.abs(s.steer ?? 0) < 0.02);
  const scale = [0, 1, 2, 3].map((w) => median(rolling.map((s) => (Math.abs(s.wheelRps[w]!) * s.radius[w]!) / s.speed)));
  console.log(`wheel speed / car speed when rolling (FL FR RL RR): ${scale.map((x) => fmt(x, 3)).join(' ')}  (1 = rad/s, 0.159 = rev/s), radius ${samples[0]!.radius.map((r) => fmt(r, 3)).join(' ')} m, rolling frames ${rolling.length}`);
  const slip = (s: Sample, w: number) => (Math.abs(s.wheelRps[w]!) * s.radius[w]!) / (scale[w]! || 1) / s.speed - 1;
  const front = (s: Sample) => Math.min(slip(s, 0), slip(s, 1));
  const rear = (s: Sample) => Math.min(slip(s, 2), slip(s, 3));

  // Braking: how far the wheels slow below the car (ABS keeps it small).
  const braking = samples.filter((s) => s.brake > 0.3 && s.speed > 10);
  const bf = braking.map(front);
  const br = braking.map(rear);
  console.log(`braking frames ${braking.length}: front slip p5 ${fmt(quantile(bf, 0.05))} p50 ${fmt(median(bf))}, rear p5 ${fmt(quantile(br, 0.05))} p50 ${fmt(median(br))}`);
  console.log(`  front below -0.10 ${pct(bf.filter((x) => x < -0.1).length, bf.length)}, below -0.20 ${pct(bf.filter((x) => x < -0.2).length, bf.length)}, below -0.40 ${pct(bf.filter((x) => x < -0.4).length, bf.length)}`);
  const lockups = runs(samples, (s) => s.brake > 0.3 && s.speed > 10 && Math.min(front(s), rear(s)) < -0.2, 4);
  console.log(`  lock-up candidates (slip < -0.20 for ≥ 4 frames): ${lockups.length}${lockups.length ? ` e.g. at ${lockups.slice(0, 5).map(([a, b]) => `${fmt((samples[a]!.time - samples[0]!.time) / 1000, 1)} s (${b - a} fr, min ${fmt(Math.min(...samples.slice(a, b).map((s) => Math.min(front(s), rear(s)))))})`).join(', ')}` : ''}`);

  // Throttle: which axle drives (it spins more), and wheelspin.
  const power = samples.filter((s) => s.throttle > 0.5 && s.speed > 5 && s.brake < 0.02);
  const up = (s: Sample, a: 0 | 2) => Math.max(slip(s, a), slip(s, a + 1));
  const frontUp = power.map((s) => up(s, 0));
  const rearUp = power.map((s) => up(s, 2));
  const driven: 0 | 2 = median(rearUp) >= median(frontUp) ? 2 : 0;
  const drivenUp = driven === 2 ? rearUp : frontUp;
  console.log(`on the throttle ${power.length} frames: front slip p50/p95 ${fmt(median(frontUp))}/${fmt(quantile(frontUp, 0.95))}, rear p50/p95 ${fmt(median(rearUp))}/${fmt(quantile(rearUp, 0.95))} → driven: ${driven === 2 ? 'rear' : 'front'}`);
  const spins = runs(samples, (s) => s.throttle > 0.5 && s.speed > 5 && up(s, driven) > 0.15, 4);
  console.log(`  above 0.10 ${pct(drivenUp.filter((x) => x > 0.1).length, drivenUp.length)}, above 0.20 ${pct(drivenUp.filter((x) => x > 0.2).length, drivenUp.length)}; wheelspin candidates (> 0.15 for ≥ 4 frames): ${spins.length}${spins.length ? ` e.g. at ${spins.slice(0, 5).map(([a, b]) => `${fmt((samples[a]!.time - samples[0]!.time) / 1000, 1)} s (${b - a} fr, gear ${samples[a]!.gear})`).join(', ')}` : ''}`);

  // Direction of travel (from positions) against the velocity field and the rotation field.
  const moves: { dp: number; vWorld: number; q: number; rot: number[]; ang: number[]; dHeading: number; steer: number; speed: number }[] = [];
  for (let i = 2; i < samples.length - 2; i++) {
    const a = samples[i - 2]!;
    const b = samples[i + 2]!;
    const s = samples[i]!;
    if (b.time - a.time > 120 || s.speed < 15) continue;
    const dp = Math.atan2(b.x - a.x, b.z - a.z);
    const prev = samples[i - 1]!;
    const next = samples[i + 1]!;
    const dHeading = wrap(Math.atan2(next.x - s.x, next.z - s.z) - Math.atan2(s.x - prev.x, s.z - prev.z)) / ((next.time - prev.time) / 2000);
    moves.push({ dp, vWorld: Math.atan2(s.vel[0], s.vel[2]), q: quaternionHeading(s.rot), rot: s.rot, ang: s.ang, dHeading, steer: s.steer ?? 0, speed: s.speed });
  }
  const spread = (diffs: number[]) => {
    const m = Math.atan2(diffs.reduce((acc, d) => acc + Math.sin(d), 0), diffs.reduce((acc, d) => acc + Math.cos(d), 0));
    return { offset: m * DEG, p50: median(diffs.map((d) => Math.abs(wrap(d - m)) * DEG)), p95: quantile(diffs.map((d) => Math.abs(wrap(d - m)) * DEG), 0.95) };
  };
  const straight = moves.filter((m) => Math.abs(m.steer) < 0.01 && Math.abs(m.dHeading) < 0.02);
  const cmp = (label: string, pick: (m: (typeof moves)[0]) => number) => {
    const r = spread(straight.map((m) => wrap(m.dp - pick(m))));
    console.log(`  ${label.padEnd(30)} offset ${fmt(r.offset, 1)}°, deviation p50 ${fmt(r.p50, 2)}° p95 ${fmt(r.p95, 2)}°`);
  };
  console.log(`direction of travel vs. fields, on straights (${straight.length} frames; small deviation = same direction):`);
  cmp('velocity as world vector', (m) => m.vWorld);
  cmp('rotation as quaternion', (m) => m.q);
  for (let k = 0; k < 4; k++) cmp(`rotation[${k}] × π`, (m) => m.rot[k]! * Math.PI);

  // Yaw rate: which angular velocity component follows the turning of the path.
  const turning = moves.filter((m) => m.speed > 15);
  const corr = [0, 1, 2].map((k) => correlation(turning.map((m) => m.ang[k]!), turning.map((m) => m.dHeading)));
  console.log(`angular velocity vs. turning of the path, correlation x/y/z: ${corr.map((c) => fmt(c, 3)).join(' / ')}`);

  // Slip angle: velocity direction (world) against the car's heading (best rotation reading), in corners.
  const headingCandidates: [string, (m: (typeof moves)[0]) => number][] = [
    ['quaternion', (m) => m.q],
    ...[0, 1, 2, 3].map((k) => [`rotation[${k}]×π`, (m: (typeof moves)[0]) => m.rot[k]! * Math.PI] as [string, (m: (typeof moves)[0]) => number]),
  ];
  const best = headingCandidates
    .map(([name, pick]) => ({ name, pick, ...spread(straight.map((m) => wrap(m.vWorld - pick(m)))) }))
    .sort((a, b) => a.p95 - b.p95)[0]!;
  const corners = moves.filter((m) => Math.abs(m.steer) > 0.03);
  const slipAngles = corners.map((m) => Math.abs(wrap(m.vWorld - best.pick(m) - best.offset / DEG)) * DEG);
  console.log(`heading from ${best.name} (offset ${fmt(best.offset, 1)}°, p95 on straights ${fmt(best.p95, 2)}°): slip angle in corners p50 ${fmt(median(slipAngles), 1)}° p95 ${fmt(quantile(slipAngles, 0.95), 1)}° max ${fmt(Math.max(...slipAngles), 1)}°, above 5° ${pct(slipAngles.filter((a) => a > 5).length, slipAngles.length)}`);

  // Flags.
  const flag = (bit: number, label: string) => {
    const set = samples.filter((s) => s.flags & (1 << bit));
    let changes = 0;
    for (let i = 1; i < samples.length; i++) if ((samples[i]!.flags ^ samples[i - 1]!.flags) & (1 << bit)) changes++;
    const withThrottle = set.filter((s) => s.throttle > 0.3).length;
    return `${label} ${pct(set.length, samples.length)} (${changes} changes, ${pct(withThrottle, set.length)} on throttle)`;
  };
  console.log(`flags: ${flag(11, 'TCS')}, ${flag(10, 'ASM')}, ${flag(5, 'rev limiter')}, ${flag(4, 'turbo')}, ${flag(7, 'lights')}, ${flag(3, 'in gear')}`);

  // RPM at upshifts and the alert range; suggested gear.
  const shifts: number[] = [];
  for (let i = 3; i < samples.length; i++) {
    if (samples[i]!.gear === samples[i - 1]!.gear + 1 && samples[i - 1]!.gear > 0 && samples[i - 3]!.throttle > 0.8) shifts.push(samples[i - 3]!.rpm);
  }
  const suggested = samples.filter((s) => s.suggested !== 15);
  console.log(`upshifts ${shifts.length}: RPM before p10/p50/p90 ${fmt(quantile(shifts, 0.1), 0)}/${fmt(median(shifts), 0)}/${fmt(quantile(shifts, 0.9), 0)}, alert range ${samples[0]!.minAlert}–${samples[0]!.maxAlert}, max RPM ${fmt(Math.max(...samples.map((s) => s.rpm)), 0)}; suggested gear given ${pct(suggested.length, samples.length)} (differs from gear ${pct(suggested.filter((s) => s.suggested !== s.gear).length, samples.length)})`);

  // Coasting: neither pedal at speed.
  const coasting = runs(samples, (s) => s.speed > 15 && s.throttle < 0.05 && s.brake < 0.05, 15);
  const coastSeconds = coasting.reduce((sum, [a, b]) => sum + (samples[b - 1]!.time - samples[a]!.time) / 1000, 0);
  const laps = reference ? duration / (reference.lengthMeters / median(samples.map((s) => s.speed))) : duration / 136;
  console.log(`coasting ≥ 0.25 s: ${coasting.length} times, ${fmt(coastSeconds, 1)} s in all (about ${fmt(coastSeconds / Math.max(1, laps), 1)} s per lap)`);

  // Time of day.
  const tod = (ms: number) => `${String(Math.floor(ms / 3_600_000)).padStart(2, '0')}:${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}`;
  console.log(`time of day ${tod(samples[0]!.timeOfDayMs)} → ${tod(samples.at(-1)!.timeOfDayMs)}`);

  // Lateral offset from the reference line.
  if (reference) {
    const pts = reference.points;
    const offsets: number[] = [];
    let hint = 0;
    for (const s of samples) {
      let bestI = -1;
      let bestD = Infinity;
      // Search near the last match first; fall back to the whole lap.
      const window = hint >= 0 ? [hint - 50, hint + 200] : [0, pts.length];
      for (let pass = 0; pass < 2 && bestD > 25; pass++) {
        const [from, to] = pass === 0 ? window : [0, pts.length];
        for (let k = Math.max(0, from!); k < Math.min(pts.length, to!); k++) {
          const d = (pts[k]!.x - s.x) ** 2 + (pts[k]!.z - s.z) ** 2;
          if (d < bestD) {
            bestD = d;
            bestI = k;
          }
        }
      }
      if (bestI < 0 || bestD > 400) {
        hint = -1;
        continue;
      }
      hint = bestI;
      const a = pts[Math.max(0, bestI - 1)]!;
      const b = pts[Math.min(pts.length - 1, bestI + 1)]!;
      const tx = b.x - a.x;
      const tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      offsets.push(((s.x - pts[bestI]!.x) * tz - (s.z - pts[bestI]!.z) * tx) / len);
    }
    const abs = offsets.map(Math.abs);
    console.log(`lateral offset from the reference line: |offset| p50 ${fmt(median(abs))} m p90 ${fmt(quantile(abs, 0.9))} m p99 ${fmt(quantile(abs, 0.99))} m (${offsets.length} frames on the line)`);
  }
}
