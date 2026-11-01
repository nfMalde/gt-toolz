// Sends heartbeat characters one by one and reports which packet sizes GT7 answers with,
// to find undocumented packet types.
// GT7 keeps the packet type of a running stream. The stream ends ~15 s after the last heartbeat,
// so the probe waits for that before trying the next character.
// Usage: npm run probe -- [--ip <PS5-IP>] [--chars DEFG...] [--seconds 3]

import dgram from 'node:dgram';
import { parseArgs } from 'node:util';
import {
  ConsoleDiscovery,
  decryptPacket,
  LOCAL_TELEMETRY_PORT,
  PACKET_SIZES,
  PACKET_TYPES,
  PS5_HEARTBEAT_PORT,
  type PacketType,
} from '@gt-toolz/telemetry';

const range = (from: string, to: string) =>
  Array.from({ length: to.charCodeAt(0) - from.charCodeAt(0) + 1 }, (_, i) => String.fromCharCode(from.charCodeAt(0) + i));
const DEFAULT_CHARS = [...range('D', 'Z'), ...range('a', 'z'), ...range('0', '9')].join('');

const { values } = parseArgs({
  options: {
    ip: { type: 'string' },
    chars: { type: 'string', default: DEFAULT_CHARS },
    seconds: { type: 'string', default: '3' },
  },
});

const listenMs = Number(values.seconds) * 1000;
const STREAM_END_SILENCE_MS = 1500;
const STREAM_END_MAX_WAIT_MS = 40_000;

const discovery = new ConsoleDiscovery();
await discovery.open();
const ps5 = values.ip ?? (await discovery.search(undefined, 3000))?.address;
discovery.close();
if (!ps5) {
  console.log('PS5 not found. Pass --ip <address>.');
  process.exit(1);
}

const socket = dgram.createSocket('udp4');
let lastPacketAt = 0;
const answers = new Map<string, number>();

socket.on('message', (msg) => {
  lastPacketAt = Date.now();
  const type = PACKET_TYPES.find((t) => decryptPacket(msg, t));
  const key = `${msg.length}B/${type ?? 'undecryptable'}`;
  answers.set(key, (answers.get(key) ?? 0) + 1);
});

await new Promise<void>((resolve) => socket.bind(LOCAL_TELEMETRY_PORT, resolve));

const knownSizes = new Set(Object.values(PACKET_SIZES));
const characters = [...values.chars];
const findings: string[] = [];
const started = Date.now();
console.log(`PS5 at ${ps5}, probing ${characters.length} characters (~${Math.round((characters.length * 19) / 60)} min)`);

for (const [index, char] of characters.entries()) {
  await waitForStreamEnd();
  answers.clear();

  const heartbeat = Buffer.from(char, 'ascii');
  socket.send(heartbeat, PS5_HEARTBEAT_PORT, ps5);
  const timer = setInterval(() => socket.send(heartbeat, PS5_HEARTBEAT_PORT, ps5), 300);
  await sleep(listenMs);
  clearInterval(timer);

  const summary = [...answers.entries()].map(([key, count]) => `${key} ×${count}`).join(', ') || 'no packets';
  const unusual = [...answers.keys()].some((key) => !knownSizes.has(Number(key.split('B')[0])) || key.includes('undecryptable'));
  const known = PACKET_TYPES.includes(char as PacketType);
  if (unusual && !known) findings.push(`'${char}': ${summary}`);
  const elapsed = Math.round((Date.now() - started) / 1000);
  console.log(`[${index + 1}/${characters.length}, ${elapsed}s] '${char}': ${summary}${unusual ? '  ★ NEW' : ''}`);
}

console.log(`\nDone. Characters with an unknown answer: ${findings.length}`);
for (const finding of findings) console.log(`  ${finding}`);
socket.close();

async function waitForStreamEnd(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < STREAM_END_MAX_WAIT_MS && Date.now() - lastPacketAt < STREAM_END_SILENCE_MS) {
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
