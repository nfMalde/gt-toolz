// GT7 "Simulator Interface" packet layout.
// Sources: Nenkai/PDTools (SimulatorPacket.cs), MacManley/gt7-udp. See docs/dev/telemetry.md.

// Any other heartbeat character (probed D–G on 2026-10-18) returns a 148-byte packet that is
// just the first 0x94 bytes of packet A, so it carries no extra data.
export type PacketType = 'A' | 'B' | '~' | 'C';

export const PACKET_TYPES: readonly PacketType[] = ['A', 'B', '~', 'C'];

/** "0S7G" read as little-endian uint32. */
export const PACKET_MAGIC = 0x47375330;

export const PACKET_SIZES: Record<PacketType, number> = {
  A: 296,
  B: 316,
  '~': 344,
  C: 368,
};

export function packetTypeForSize(size: number): PacketType | undefined {
  return PACKET_TYPES.find((type) => PACKET_SIZES[type] === size);
}

export const FLAGS_OFFSET = 0x8e;

/** Index = bit number in the int16 flags field. Bits 12–15 are undocumented. */
export const FLAG_NAMES: readonly string[] = [
  'CarOnTrack',
  'Paused',
  'Loading',
  'InGear',
  'HasTurbo',
  'RevLimiter',
  'Handbrake',
  'Lights',
  'HighBeam',
  'LowBeam',
  'ASM',
  'TCS',
];

export function flagName(bit: number): string {
  return FLAG_NAMES[bit] ?? `UNKNOWN_${bit}`;
}

/**
 * continuous: changes all the time (floats, pedals)
 * counter:    increments every packet (packet id, time of day, IV)
 * discrete:   known value that changes rarely
 * flags:      the documented bit field
 * unknown:    undocumented, candidate for new findings
 */
export type FieldKind = 'continuous' | 'counter' | 'discrete' | 'flags' | 'unknown';

export interface FieldDef {
  offset: number;
  length: number;
  name: string;
  kind: FieldKind;
}

const BASE_FIELDS: FieldDef[] = [
  { offset: 0x00, length: 4, name: 'magic', kind: 'discrete' },
  { offset: 0x04, length: 12, name: 'position', kind: 'continuous' },
  { offset: 0x10, length: 12, name: 'velocity', kind: 'continuous' },
  { offset: 0x1c, length: 16, name: 'rotation', kind: 'continuous' },
  { offset: 0x2c, length: 12, name: 'angularVelocity', kind: 'continuous' },
  { offset: 0x38, length: 4, name: 'bodyHeight', kind: 'continuous' },
  { offset: 0x3c, length: 4, name: 'engineRpm', kind: 'continuous' },
  { offset: 0x40, length: 4, name: 'iv', kind: 'counter' },
  { offset: 0x44, length: 4, name: 'fuelLevel', kind: 'continuous' },
  { offset: 0x48, length: 4, name: 'fuelCapacity', kind: 'discrete' },
  { offset: 0x4c, length: 4, name: 'speed', kind: 'continuous' },
  { offset: 0x50, length: 4, name: 'turboBoost', kind: 'continuous' },
  { offset: 0x54, length: 4, name: 'oilPressure', kind: 'continuous' },
  { offset: 0x58, length: 4, name: 'waterTemp', kind: 'continuous' },
  { offset: 0x5c, length: 4, name: 'oilTemp', kind: 'continuous' },
  { offset: 0x60, length: 16, name: 'tireTemp', kind: 'continuous' },
  { offset: 0x70, length: 4, name: 'packetId', kind: 'counter' },
  { offset: 0x74, length: 2, name: 'lapCount', kind: 'discrete' },
  { offset: 0x76, length: 2, name: 'lapsInRace', kind: 'discrete' },
  { offset: 0x78, length: 4, name: 'bestLapMs', kind: 'discrete' },
  { offset: 0x7c, length: 4, name: 'lastLapMs', kind: 'discrete' },
  { offset: 0x80, length: 4, name: 'timeOfDayMs', kind: 'counter' },
  { offset: 0x84, length: 2, name: 'racePosition', kind: 'discrete' },
  { offset: 0x86, length: 2, name: 'numCars', kind: 'discrete' },
  { offset: 0x88, length: 2, name: 'minAlertRpm', kind: 'discrete' },
  { offset: 0x8a, length: 2, name: 'maxAlertRpm', kind: 'discrete' },
  { offset: 0x8c, length: 2, name: 'calcMaxSpeed', kind: 'discrete' },
  { offset: FLAGS_OFFSET, length: 2, name: 'flags', kind: 'flags' },
  { offset: 0x90, length: 1, name: 'gears', kind: 'discrete' },
  { offset: 0x91, length: 1, name: 'throttle', kind: 'continuous' },
  { offset: 0x92, length: 1, name: 'brake', kind: 'continuous' },
  { offset: 0x93, length: 1, name: 'unk_0x93', kind: 'unknown' },
  { offset: 0x94, length: 12, name: 'roadPlane', kind: 'continuous' },
  { offset: 0xa0, length: 4, name: 'roadPlaneDistance', kind: 'continuous' },
  { offset: 0xa4, length: 16, name: 'wheelRps', kind: 'continuous' },
  { offset: 0xb4, length: 16, name: 'tireRadius', kind: 'continuous' },
  { offset: 0xc4, length: 16, name: 'suspensionHeight', kind: 'continuous' },
  { offset: 0xd4, length: 32, name: 'reserved_0xD4', kind: 'unknown' },
  { offset: 0xf4, length: 4, name: 'clutchPedal', kind: 'continuous' },
  { offset: 0xf8, length: 4, name: 'clutchEngagement', kind: 'continuous' },
  { offset: 0xfc, length: 4, name: 'rpmClutchToGearbox', kind: 'continuous' },
  { offset: 0x100, length: 4, name: 'transmissionTopSpeed', kind: 'discrete' },
  { offset: 0x104, length: 28, name: 'gearRatios', kind: 'discrete' },
  { offset: 0x120, length: 4, name: 'gearRatio8', kind: 'discrete' },
  { offset: 0x124, length: 4, name: 'carCode', kind: 'discrete' },
];

const B_FIELDS: FieldDef[] = [
  { offset: 0x128, length: 4, name: 'wheelRotation', kind: 'continuous' },
  { offset: 0x12c, length: 4, name: 'unk_fillerFloat', kind: 'unknown' },
  { offset: 0x130, length: 4, name: 'sway', kind: 'continuous' },
  { offset: 0x134, length: 4, name: 'heave', kind: 'continuous' },
  { offset: 0x138, length: 4, name: 'surge', kind: 'continuous' },
];

const TILDE_FIELDS: FieldDef[] = [
  { offset: 0x13c, length: 1, name: 'throttleFiltered', kind: 'continuous' },
  { offset: 0x13d, length: 1, name: 'brakeFiltered', kind: 'continuous' },
  { offset: 0x13e, length: 1, name: 'unk_carType', kind: 'unknown' },
  { offset: 0x13f, length: 1, name: 'unk_noGasConsumption', kind: 'unknown' },
  { offset: 0x140, length: 16, name: 'torqueVectors', kind: 'continuous' },
  { offset: 0x150, length: 4, name: 'energyRecovery', kind: 'continuous' },
  { offset: 0x154, length: 4, name: 'unk_0x154', kind: 'unknown' },
];

// C extends ~ (not B as MacManley/gt7-udp documents). Verified against a real
// recording on 2026-10-18: surface "TTTT"/"GGGG", wheel base 2.75 m, category "GR4".
const C_FIELDS: FieldDef[] = [
  { offset: 0x158, length: 4, name: 'surfaceType', kind: 'discrete' },
  { offset: 0x15c, length: 4, name: 'currentLapMs', kind: 'counter' },
  { offset: 0x160, length: 8, name: 'wheelSteeringAngle', kind: 'continuous' },
  // Jitters in the last digits while standing.
  { offset: 0x168, length: 4, name: 'wheelBase', kind: 'continuous' },
  { offset: 0x16c, length: 4, name: 'carCategory', kind: 'discrete' },
];

export function fieldLayout(type: PacketType): FieldDef[] {
  switch (type) {
    case 'A':
      return BASE_FIELDS;
    case 'B':
      return [...BASE_FIELDS, ...B_FIELDS];
    case '~':
      return [...BASE_FIELDS, ...B_FIELDS, ...TILDE_FIELDS];
    case 'C':
      return [...BASE_FIELDS, ...B_FIELDS, ...TILDE_FIELDS, ...C_FIELDS];
  }
}

/** Maps every byte offset of a packet to the field it belongs to. */
export function fieldMap(type: PacketType): FieldDef[] {
  const size = PACKET_SIZES[type];
  const map = new Array<FieldDef>(size);
  for (const field of fieldLayout(type)) {
    for (let i = field.offset; i < field.offset + field.length && i < size; i++) {
      map[i] = field;
    }
  }
  for (let i = 0; i < size; i++) {
    map[i] ??= { offset: i, length: 1, name: `gap_0x${i.toString(16)}`, kind: 'unknown' };
  }
  return map;
}

export interface TelemetrySnapshot {
  packetId: number;
  flags: number;
  speedKmh: number;
  engineRpm: number;
  currentGear: number;
  suggestedGear: number;
  throttle: number;
  brake: number;
  carCode: number;
}

export function readSnapshot(data: Uint8Array): TelemetrySnapshot {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const gears = view.getUint8(0x90);
  return {
    packetId: view.getInt32(0x70, true),
    flags: view.getUint16(FLAGS_OFFSET, true),
    speedKmh: view.getFloat32(0x4c, true) * 3.6,
    engineRpm: view.getFloat32(0x3c, true),
    currentGear: gears & 0x0f,
    suggestedGear: gears >> 4,
    throttle: view.getUint8(0x91),
    brake: view.getUint8(0x92),
    carCode: view.getInt32(0x124, true),
  };
}

/** Bits of the flags field that the coach relies on. */
/** Bits of TelemetryFrame.curb. */
export const CURB_LEFT = 1;
export const CURB_RIGHT = 2;
/** Bits of TelemetryFrame.curbWheels: each wheel on a curb. */
export const CURB_FL = 1;
export const CURB_FR = 2;
export const CURB_RL = 4;
export const CURB_RR = 8;

export const Flags = {
  CarOnTrack: 1 << 0,
  Paused: 1 << 1,
  Loading: 1 << 2,
  Handbrake: 1 << 6,
} as const;

/** One decoded telemetry sample with everything the coach needs. */
export interface TelemetryFrame {
  /** Receive time in ms (epoch). */
  time: number;
  packetId: number;
  flags: number;
  x: number;
  y: number;
  z: number;
  /** m/s */
  speed: number;
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  gear: number;
  lapCount: number;
  lapsInRace: number;
  bestLapMs: number;
  lastLapMs: number;
  carCode: number;
  /**
   * Own position in the race and the number of cars (-1 outside sessions, 1/1 alone on track). Live during
   * races according to recordings of gt-racing-broadcast (issue #854); the only data about other cars.
   */
  racePosition: number;
  carsInRace: number;
  /** Fuel in liters (or charge for EVs); stays at capacity when the session has no fuel use. */
  fuelLevel: number;
  fuelCapacity: number;
  /** Tyre surface temperatures in °C: front left, front right, rear left, rear right. */
  tyreTemps: [number, number, number, number];
  /** Steering wheel rotation in rad (packet B and newer). */
  steeringWheel?: number;
  /** Mean front wheel angle in rad (packet C). */
  frontWheelAngle?: number;
  /** Running lap time in ms (packet C). */
  currentLapMs?: number;
  /** Packet C: wheels on a curb, CURB_LEFT and/or CURB_RIGHT (surface type "C" under a wheel). */
  curb?: number;
  /** Packet C: each wheel on a curb, CURB_FL / CURB_FR / CURB_RL / CURB_RR (how much of the car is on it). */
  curbWheels?: number;
  /** Packet C: wheels on grass ("G") or sand/gravel ("S"), 0..4. */
  offTrackWheels?: number;
  /** Packet C: the surface under each wheel (FL, FR, RL, RR): "T" tarmac, "C" curb, "G" grass, "S" sand or gravel. */
  surface?: string;
  /**
   * The angle between where the car points and where it goes, in rad (positive: the nose points left of the
   * direction of travel, like steeringWheel); 0 below 3 m/s. A sliding rear makes it big (docs/dev/telemetry.md).
   */
  slipAngle?: number;
  /** Per wheel (FL, FR, RL, RR): wheel speed against car speed − 1; above 0 spinning, below 0 locking; 0 below 3 m/s. */
  wheelSlip?: [number, number, number, number];
  /** e.g. "GR4", "GRN" (packet C). */
  carCategory?: string;
}

/** Slip angle and wheel slip below this speed (m/s) are noise. */
const SLIP_MIN_SPEED = 3;

export function readFrame(data: Uint8Array, time: number): TelemetryFrame {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < PACKET_SIZES.A) throw new Error(`Telemetry packet too short (${data.length} bytes)`);
  // NaN or Infinity (a broken or forged packet) would spread through the coach's arithmetic and the references.
  const f32 = (offset: number) => {
    const value = view.getFloat32(offset, true);
    return Number.isFinite(value) ? value : 0;
  };
  const frame: TelemetryFrame = {
    time,
    packetId: view.getInt32(0x70, true),
    flags: view.getUint16(FLAGS_OFFSET, true),
    x: f32(0x04),
    y: f32(0x08),
    z: f32(0x0c),
    speed: f32(0x4c),
    throttle: view.getUint8(0x91) / 255,
    brake: view.getUint8(0x92) / 255,
    gear: view.getUint8(0x90) & 0x0f,
    lapCount: view.getInt16(0x74, true),
    lapsInRace: view.getInt16(0x76, true),
    bestLapMs: view.getInt32(0x78, true),
    lastLapMs: view.getInt32(0x7c, true),
    carCode: view.getInt32(0x124, true),
    racePosition: view.getInt16(0x84, true),
    carsInRace: view.getInt16(0x86, true),
    fuelLevel: f32(0x44),
    fuelCapacity: f32(0x48),
    tyreTemps: [f32(0x60), f32(0x64), f32(0x68), f32(0x6c)],
    slipAngle: 0,
    wheelSlip: [0, 0, 0, 0],
  };
  if (frame.speed > SLIP_MIN_SPEED) {
    // Velocity is a world vector; rotation a quaternion whose forward axis looks along -z (docs/dev/telemetry.md).
    const [qx, qy, qz, qw] = [f32(0x1c), f32(0x20), f32(0x24), f32(0x28)];
    const heading = Math.atan2(2 * (qx * qz + qw * qy), 1 - 2 * (qx * qx + qy * qy)) + Math.PI;
    const angle = heading - Math.atan2(f32(0x10), f32(0x18));
    frame.slipAngle = Math.atan2(Math.sin(angle), Math.cos(angle));
    // Wheel speeds are in rad/s.
    const slip = (w: number) => (Math.abs(f32(0xa4 + 4 * w)) * f32(0xb4 + 4 * w)) / frame.speed - 1;
    frame.wheelSlip = [slip(0), slip(1), slip(2), slip(3)];
  }
  if (data.length >= PACKET_SIZES.B) frame.steeringWheel = f32(0x128);
  if (data.length >= PACKET_SIZES.C) {
    frame.frontWheelAngle = (f32(0x160) + f32(0x164)) / 2;
    frame.currentLapMs = view.getInt32(0x15c, true);
    // Surface under each wheel (FL, FR, RL, RR): "T" tarmac, "C" curb, "G" grass or gravel.
    const surface = data.subarray(0x158, 0x15c);
    frame.surface = String.fromCharCode(...surface);
    const curb = 0x43;
    frame.curb = (surface[0] === curb || surface[2] === curb ? CURB_LEFT : 0) | (surface[1] === curb || surface[3] === curb ? CURB_RIGHT : 0);
    frame.curbWheels =
      (surface[0] === curb ? CURB_FL : 0) | (surface[1] === curb ? CURB_FR : 0) | (surface[2] === curb ? CURB_RL : 0) | (surface[3] === curb ? CURB_RR : 0);
    frame.offTrackWheels = [...surface].filter((c) => c === 0x47 || c === 0x53).length;
    frame.carCategory = String.fromCharCode(...data.subarray(0x16c, 0x170)).split('\0', 1)[0];
  }
  return frame;
}

export function describeFlags(flags: number): string[] {
  const names: string[] = [];
  for (let bit = 0; bit < 16; bit++) {
    if (flags & (1 << bit)) names.push(flagName(bit));
  }
  return names;
}
