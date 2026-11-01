// Telemetry packets for the tests that drive the runner frame by frame.

import { PACKET_MAGIC, PACKET_SIZES } from '../packages/telemetry/src/packet';
import type { TelemetryPacket } from '../packages/telemetry/src/client';

/** A packet C after decryption (the runner reads decrypted packets), with the fields the coach reads. */
export function packet(time: number, id: number, values: { x: number; speed: number; flags: number; lapCount: number; lapsInRace: number; carsInRace: number }): TelemetryPacket {
  const data = new Uint8Array(PACKET_SIZES.C);
  const view = new DataView(data.buffer);
  view.setUint32(0, PACKET_MAGIC, true);
  view.setFloat32(0x04, values.x, true);
  view.setFloat32(0x0c, -432, true);
  view.setFloat32(0x4c, values.speed, true);
  view.setInt32(0x70, id, true);
  view.setInt16(0x74, values.lapCount, true);
  view.setInt16(0x76, values.lapsInRace, true);
  view.setInt16(0x86, values.carsInRace, true);
  view.setUint16(0x8e, values.flags, true);
  view.setUint8(0x90, 5);
  view.setInt32(0x124, 3609, true);
  data.set(Buffer.from('TTTT', 'ascii'), 0x158);
  return { type: 'C', data, address: '127.0.0.1', receivedAt: time };
}
