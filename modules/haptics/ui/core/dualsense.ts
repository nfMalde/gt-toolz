// The PS5 controller's vibration, sent straight to the controller (WebHID): Chromium reads its buttons but
// cannot make it vibrate on Windows. Written from the publicly documented layout of the DualSense output
// report (see the credits); no code was taken.

/** Sony DualSense and DualSense Edge; the app may open these and no other device. */
export const DUALSENSE_FILTERS = [
  { vendorId: 0x054c, productId: 0x0ce6 },
  { vendorId: 0x054c, productId: 0x0df2 },
];

/** USB: report 0x02 with the 47 common bytes. Bluetooth: report 0x31 with a sequence number, a tag and a CRC. */
const USB_REPORT = 0x02;
const BT_REPORT = 0x31;
const BT_TAG = 0x10;
const BT_CRC_SEED = 0xa2;
/** valid_flag0: rumble emulation on the haptic actuators, like the motors of earlier controllers. */
const COMPATIBLE_VIBRATION = 0x01;
const HAPTICS_SELECT = 0x02;
/**
 * valid_flag2 (byte 38): the newer rumble emulation ("vibration v2"), from firmware 2.21 and on the
 * DualSense Edge; it replaces COMPATIBLE_VIBRATION.
 */
const COMPATIBLE_VIBRATION2 = 0x04;
const VALID_FLAG2 = 38;
/** Feature report with the firmware info; the update version is a little-endian word at byte 44 (with the id). */
const FIRMWARE_REPORT = 0x20;
const VIBRATION_V2_FROM = 0x0215;
const EDGE_PRODUCT = 0x0df2;

// The parts of WebHID the app uses (TypeScript's DOM types do not have it).
export interface HidDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: { outputReports?: { reportId?: number }[] }[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
}

export interface Hid extends EventTarget {
  getDevices(): Promise<HidDevice[]>;
  requestDevice(options: { filters: { vendorId: number; productId: number }[] }): Promise<HidDevice[]>;
}

export function webHid(): Hid | undefined {
  return (navigator as Navigator & { hid?: Hid }).hid;
}

export function isDualSense(vendorId: number, productId: number): boolean {
  return DUALSENSE_FILTERS.some((f) => f.vendorId === vendorId && f.productId === productId);
}

/** A DualSense found by the Gamepad API ("... Vendor: 054c Product: 0ce6"). */
export function isDualSensePad(id: string): boolean {
  const ids = /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(id);
  return !!ids && isDualSense(parseInt(ids[1]!, 16), parseInt(ids[2]!, 16));
}

export class DualSense {
  private sequence = 0;

  private constructor(
    readonly device: HidDevice,
    readonly bluetooth: boolean,
    /** The controller's update version (0x0224 = 2.36), if it could be read. */
    readonly firmware: number | undefined,
    readonly vibrationV2: boolean,
  ) {}

  static async open(device: HidDevice): Promise<DualSense> {
    if (!device.opened) await device.open();
    const bluetooth = device.collections.some((c) => c.outputReports?.some((r) => r.reportId === BT_REPORT));
    let firmware: number | undefined;
    try {
      const view = await device.receiveFeatureReport(FIRMWARE_REPORT);
      // With or without the report id in front, depending on the platform.
      const at = view.getUint8(0) === FIRMWARE_REPORT && view.byteLength >= 46 ? 44 : 43;
      firmware = view.getUint16(at, true);
    } catch {
      // Unknown firmware: the older rumble mode, which every DualSense has.
    }
    const vibrationV2 = device.productId === EDGE_PRODUCT || (firmware !== undefined && firmware >= VIBRATION_V2_FROM);
    return new DualSense(device, bluetooth, firmware, vibrationV2);
  }

  get name(): string {
    return `${this.device.productName || 'DualSense'} (${this.bluetooth ? 'Bluetooth' : 'USB'})`;
  }

  /** Strength of the left (strong) and right (weak) side, 0..1; 0 and 0 stops. */
  async rumble(left: number, right: number): Promise<void> {
    const common = new Uint8Array(47);
    common[0] = HAPTICS_SELECT | (this.vibrationV2 ? 0 : COMPATIBLE_VIBRATION);
    if (this.vibrationV2) common[VALID_FLAG2] = COMPATIBLE_VIBRATION2;
    common[2] = level(right);
    common[3] = level(left);
    if (!this.bluetooth) {
      await this.device.sendReport(USB_REPORT, common);
      return;
    }
    // 78 bytes with the report id: sequence (high 4 bits), tag, the common part, padding, CRC-32 over a seed
    // byte, the report id and everything before the CRC.
    const data = new Uint8Array(77);
    data[0] = this.sequence << 4;
    this.sequence = (this.sequence + 1) % 16;
    data[1] = BT_TAG;
    data.set(common, 2);
    const crc = crc32(Uint8Array.of(BT_CRC_SEED, BT_REPORT, ...data.subarray(0, 73)));
    new DataView(data.buffer).setUint32(73, crc, true);
    await this.device.sendReport(BT_REPORT, data);
  }

  async close(): Promise<void> {
    try {
      await this.rumble(0, 0);
    } finally {
      await this.device.close();
    }
  }
}

function level(strength: number): number {
  return Math.round(Math.max(0, Math.min(1, strength)) * 255);
}

let table: Uint32Array | undefined;

/** CRC-32 (IEEE, as zlib). */
export function crc32(bytes: Uint8Array): number {
  table ??= Uint32Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
