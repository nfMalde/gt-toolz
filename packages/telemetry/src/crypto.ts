import { salsa20 } from '@noble/ciphers/salsa.js';
import { PACKET_MAGIC, PACKET_TYPES, packetTypeForSize, type PacketType } from './packet';

const KEY = new TextEncoder().encode('Simulator Interface Packet GT7 ver 0.0').subarray(0, 32);

const IV_OFFSET = 0x40;

const NONCE_XOR: Record<PacketType, number> = {
  A: 0xdeadbeaf,
  B: 0xdeadbeef,
  '~': 0x55fabb4f,
  C: 0xdeadbeef,
};

function nonceFor(iv1: number, type: PacketType): Uint8Array {
  const nonce = new Uint8Array(8);
  const view = new DataView(nonce.buffer);
  view.setUint32(0, (iv1 ^ NONCE_XOR[type]) >>> 0, true);
  view.setUint32(4, iv1, true);
  return nonce;
}

function readIv(packet: Uint8Array): number {
  return new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(IV_OFFSET, true);
}

function hasMagic(packet: Uint8Array): boolean {
  return new DataView(packet.buffer, packet.byteOffset, packet.byteLength).getUint32(0, true) === PACKET_MAGIC;
}

/** Decrypts a packet as the given type. Returns null if the magic does not match. */
export function decryptPacket(raw: Uint8Array, type: PacketType): Uint8Array | null {
  if (raw.length <= IV_OFFSET + 4) return null;
  const plain = salsa20(KEY, nonceFor(readIv(raw), type), raw);
  return hasMagic(plain) ? plain : null;
}

/** Decrypts a packet, guessing the type from its size first and falling back to all known types. */
export function decryptAny(raw: Uint8Array): { type: PacketType; data: Uint8Array } | null {
  const bySize = packetTypeForSize(raw.length);
  const candidates = bySize ? [bySize, ...PACKET_TYPES.filter((t) => t !== bySize)] : PACKET_TYPES;
  for (const type of candidates) {
    const data = decryptPacket(raw, type);
    if (data) return { type: bySize ?? type, data };
  }
  return null;
}

/** Encrypts a plaintext packet the way GT7 does. Used by the fake PS5 and tests. */
export function encryptPacket(plain: Uint8Array, type: PacketType, iv1: number): Uint8Array {
  const encrypted = salsa20(KEY, nonceFor(iv1, type), plain);
  new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength).setUint32(IV_OFFSET, iv1, true);
  return encrypted;
}
