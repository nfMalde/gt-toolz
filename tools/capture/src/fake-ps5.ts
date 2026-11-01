// Simulates a PS5 running GT7 so the tools can be tested without a console.
// Answers discovery requests at once and sends telemetry after --gt7-delay seconds ("GT7 starting").
//
// Default: synthetic scenario (30 s loop): lights on at 3 s, bit 12 blinks 6–12 s, bit 13 blinks 14–20 s.
// --replay <file.gtcap>: plays a recording in real time instead (optionally from --start-at seconds, looping).
//
// Usage: npm run fake-ps5 -- [--gt7-delay 8] [--replay captures/x.gtcap [--start-at 60]]
//        then: npm run capture -- --ip 127.0.0.1   (or npm run coach -- --ip 127.0.0.1 ...)

import dgram from 'node:dgram';
import { parseArgs } from 'node:util';
import {
  encryptPacket,
  FLAGS_OFFSET,
  PACKET_MAGIC,
  PACKET_SIZES,
  PACKET_TYPES,
  PS5_DISCOVERY_PORT,
  PS5_HEARTBEAT_PORT,
  readCaptureFile,
  type CapturedPacket,
  type PacketType,
} from '@gt-toolz/telemetry';

const BLINK_HZ = 1.4;

const { values } = parseArgs({
  options: {
    'gt7-delay': { type: 'string', default: '8' },
    replay: { type: 'string' },
    'start-at': { type: 'string', default: '0' },
    'end-at': { type: 'string' },
  },
});
const gt7StartsAt = Date.now() + Number(values['gt7-delay']) * 1000;

interface Receiver {
  address: string;
  port: number;
  type: PacketType;
  lastHeartbeat: number;
}

const discoverySocket = dgram.createSocket('udp4');
discoverySocket.on('message', (msg, rinfo) => {
  if (!msg.toString('utf8').startsWith('SRCH')) return;
  const gt7Running = Date.now() >= gt7StartsAt;
  const response =
    'HTTP/1.1 200 Ok\nhost-id:000000000000\nhost-type:PS5\nhost-name:Fake-PS5\nhost-request-port:997\n' +
    'device-discovery-protocol-version:00030010\nsystem-version:99999999\n' +
    (gt7Running ? 'running-app-name:Gran Turismo 7\nrunning-app-titleid:PPSA01316\n' : '');
  discoverySocket.send(response, rinfo.port, rinfo.address);
});
discoverySocket.bind(PS5_DISCOVERY_PORT);

const socket = dgram.createSocket('udp4');
let receiver: Receiver | undefined;

socket.on('message', (msg, rinfo) => {
  const type = msg.toString('ascii') as PacketType;
  if (!PACKET_TYPES.includes(type)) return;
  if (!receiver || receiver.type !== type) console.log(`Heartbeat "${type}" from ${rinfo.address}:${rinfo.port}`);
  receiver = { address: rinfo.address, port: rinfo.port, type, lastHeartbeat: Date.now() };
});

socket.bind(PS5_HEARTBEAT_PORT, () =>
  console.log(
    `Fake PS5 ready (discovery ${PS5_DISCOVERY_PORT}, telemetry ${PS5_HEARTBEAT_PORT}), GT7 starts in ${values['gt7-delay']} s` +
      (values.replay ? `, replaying ${values.replay}` : ''),
  ),
);

const receiving = () => !!receiver && Date.now() >= gt7StartsAt && Date.now() - receiver.lastHeartbeat <= 10_000;

function send(plain: Uint8Array, type: PacketType): void {
  if (!receiver) return;
  const iv = (Math.random() * 0xffffffff) >>> 0;
  socket.send(encryptPacket(plain, type, iv), receiver.port, receiver.address);
}

if (values.replay) startReplay(values.replay, Number(values['start-at']), values['end-at'] ? Number(values['end-at']) : Infinity);
else startScenario();

/** Plays recorded packets with their original timing, looping at the end. */
function startReplay(file: string, startAtSeconds: number, endAtSeconds: number): void {
  const all = readCaptureFile(file);
  const first = all[0];
  if (!first) throw new Error(`${file} has no packets`);
  const packets: CapturedPacket[] = all.filter(
    (p) => p.time - first.time >= startAtSeconds * 1000 && p.time - first.time <= endAtSeconds * 1000,
  );
  console.log(`Loaded ${packets.length} packets (${((packets.at(-1)!.time - packets[0]!.time) / 1000).toFixed(0)} s)`);

  let index = 0;
  let clockStart = 0;
  setInterval(() => {
    if (!receiving()) {
      clockStart = 0;
      return;
    }
    if (!clockStart) clockStart = Date.now() - (packets[index]!.time - packets[0]!.time);
    const elapsed = Date.now() - clockStart;
    while (index < packets.length && packets[index]!.time - packets[0]!.time <= elapsed) {
      send(packets[index]!.data, packets[index]!.type);
      index++;
    }
    if (index >= packets.length) {
      console.log('Replay finished, starting over');
      index = 0;
      clockStart = 0;
    }
  }, 4);
}

function startScenario(): void {
  let packetId = 0;
  setInterval(() => {
    if (!receiving() || !receiver) return;
    const seconds = (Date.now() - gt7StartsAt) / 1000;
    send(buildPacket(receiver.type, seconds, packetId++), receiver.type);
  }, 1000 / 60);
}

function buildPacket(type: PacketType, seconds: number, id: number): Uint8Array {
  const data = new Uint8Array(PACKET_SIZES[type]);
  const view = new DataView(data.buffer);
  const phase = seconds % 30;
  const blinkOn = Math.floor(seconds * 2 * BLINK_HZ) % 2 === 0;

  let flags = 1 << 0; // CarOnTrack
  if (phase >= 3) flags |= (1 << 7) | (1 << 9); // Lights + LowBeam
  if (blinkOn && phase >= 6 && phase < 12) flags |= 1 << 12;
  if (blinkOn && phase >= 14 && phase < 20) flags |= 1 << 13;
  if (blinkOn && phase >= 22 && phase < 28) flags |= (1 << 12) | (1 << 13);

  view.setUint32(0x00, PACKET_MAGIC, true);
  view.setFloat32(0x3c, 850 + Math.random() * 30, true); // idle rpm
  view.setInt32(0x70, id, true);
  view.setInt32(0x80, Math.floor(seconds * 1000), true);
  view.setUint16(FLAGS_OFFSET, flags, true);
  view.setUint8(0x90, 0x10);
  view.setInt32(0x124, 3333, true);
  if (data.length >= 0x15c) view.setFloat32(0x158, Math.random(), true); // noisy unknown value
  return data;
}
