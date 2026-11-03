// A lap the coach can learn and coach without a recording: an oval with two braking zones, driven on track.

import { Flags, type TelemetryFrame } from '../packages/telemetry/src/packet';

/** An oval: two straights of 500 m, two half circles of 60 m (or as given); braking into each half circle. */
export function ovalLap(lap: number, start: number, L = 500, R = 60): TelemetryFrame[] {
  const length = 2 * L + 2 * Math.PI * R;
  const at = (s: number) => {
    const u = ((s % length) + length) % length;
    if (u < L) return { x: 0, z: u, curve: false };
    if (u < L + Math.PI * R) {
      const a = (u - L) / R;
      return { x: R - R * Math.cos(a), z: L + R * Math.sin(a), curve: true };
    }
    if (u < 2 * L + Math.PI * R) return { x: 2 * R, z: L - (u - L - Math.PI * R), curve: false };
    const a = (u - 2 * L - Math.PI * R) / R;
    return { x: R + R * Math.cos(a), z: -R * Math.sin(a), curve: true };
  };
  // Fast on the straights, 20 m/s in the curves; 12 m/s² braking, 6 m/s² accelerating.
  const vMax = 55;
  const vCurve = 20;
  const ds = 1;
  const n = Math.ceil(length / ds);
  const limit = Array.from({ length: n }, (_, i): number => (at(i * ds).curve ? vCurve : vMax));
  const v = [...limit];
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n * 2; i++) v[i % n] = Math.min(v[i % n]!, Math.sqrt(v[(i - 1) % n]! ** 2 + 2 * 6 * ds));
    for (let i = n * 2; i > 0; i--) v[(i - 1) % n] = Math.min(v[(i - 1) % n]!, Math.sqrt(v[i % n]! ** 2 + 2 * 12 * ds));
  }
  const frames: TelemetryFrame[] = [];
  let s = 0;
  let t = 0;
  while (s < length) {
    const i = Math.floor(s / ds) % n;
    const speed = v[i]!;
    const next = v[(i + 3) % n]!;
    const p = at(s);
    frames.push({
      time: start + t,
      packetId: frames.length,
      flags: Flags.CarOnTrack,
      x: p.x,
      y: 0,
      z: p.z,
      speed,
      throttle: next > speed + 0.05 || (!p.curve && speed >= vMax - 0.1) ? 1 : p.curve ? 0.3 : 0,
      brake: next < speed - 0.05 ? 1 : 0,
      gear: speed > 40 ? 4 : speed > 25 ? 3 : 2,
      lapCount: lap,
      lapsInRace: 0,
      bestLapMs: -1,
      lastLapMs: -1,
      carCode: 1,
      racePosition: -1,
      carsInRace: 1,
      fuelLevel: 100,
      fuelCapacity: 100,
      tyreTemps: [80, 80, 80, 80],
      steeringWheel: p.curve ? -1 : 0,
      frontWheelAngle: p.curve ? -0.2 : 0,
    });
    s += speed / 60;
    t += 1000 / 60;
  }
  return frames;
}
