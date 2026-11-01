import fs from 'node:fs';
import type { PacketType } from './packet';

// .gtcap format: header "GTCAP1\n", then per packet: u16 length, f64 receivedAt (ms epoch), u8 type char, data.
export const CAPTURE_HEADER = 'GTCAP1\n';
export const CAPTURE_RECORD_HEADER_SIZE = 11;

export interface CapturedPacket {
  time: number;
  type: PacketType;
  data: Uint8Array;
}

/** Reads a .gtcap file. A truncated last record (recording still running) is ignored. */
export function readCaptureFile(path: string): CapturedPacket[] {
  const buffer = fs.readFileSync(path);
  if (buffer.subarray(0, CAPTURE_HEADER.length).toString('ascii') !== CAPTURE_HEADER) {
    throw new Error(`${path} is not a .gtcap file`);
  }
  const packets: CapturedPacket[] = [];
  let pos = CAPTURE_HEADER.length;
  while (pos + CAPTURE_RECORD_HEADER_SIZE <= buffer.length) {
    const length = buffer.readUInt16LE(pos);
    const start = pos + CAPTURE_RECORD_HEADER_SIZE;
    if (start + length > buffer.length) break;
    packets.push({
      time: buffer.readDoubleLE(pos + 2),
      type: String.fromCharCode(buffer.readUInt8(pos + 10)) as PacketType,
      data: buffer.subarray(start, start + length),
    });
    pos = start + length;
  }
  return packets;
}

export function encodeCaptureRecord(packet: CapturedPacket): Buffer {
  const header = Buffer.alloc(CAPTURE_RECORD_HEADER_SIZE);
  header.writeUInt16LE(packet.data.length, 0);
  header.writeDoubleLE(packet.time, 2);
  header.writeUInt8(packet.type.charCodeAt(0), 10);
  return Buffer.concat([header, packet.data]);
}
