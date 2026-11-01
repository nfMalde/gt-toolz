// No spying (docs/dev/security.md): the app talks only to the PS5 on the home network, the overlay server on this PC
// and, after the user agreed, the voice downloads and the update check on GitHub. These tests keep it that way.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mock, test } from 'node:test';
import { isLanAddress } from '../packages/runtime/src/app-api';
import { discoveryTargets, isHomeAddress, isPrivateIpv4, TelemetryClient } from '../packages/telemetry/src/client';
import { parseDiscoveryResponse } from '../packages/telemetry/src/console-discovery';
import { encryptPacket } from '../packages/telemetry/src/crypto';
import { PACKET_MAGIC, PACKET_SIZES, readFrame, type PacketType } from '../packages/telemetry/src/packet';

const ROOT = path.resolve(import.meta.dirname, '..');

test('a manual PS5 address must be on the home network', () => {
  for (const ip of ['192.168.178.20', '10.0.0.5', '172.16.0.1', '172.31.255.254', '127.0.0.1', '169.254.10.10']) assert.ok(isLanAddress(ip), ip);
  // "08": Node takes that for a host name and asks DNS (release check 2026-10-28).
  for (const ip of ['8.8.8.8', '172.32.0.1', '192.169.0.1', '256.1.1.1', 'example.com', '', '1.2.3', '192.168.1.08', '010.0.0.1']) assert.ok(!isLanAddress(ip), ip);
});

/** A GT7 packet as the PS5 sends it: the magic, the rest zeros (or what fill writes). */
function gt7Packet(size: number, type: PacketType, fill?: (view: DataView) => void): Buffer {
  const plain = new Uint8Array(size);
  const view = new DataView(plain.buffer);
  view.setUint32(0, PACKET_MAGIC, true);
  fill?.(view);
  return Buffer.from(encryptPacket(plain, type, 0x1234_5678));
}

test('telemetry: only whole GT7 packets from the home network', async () => {
  const client = new TelemetryClient({ packetType: 'A' });
  const packets: string[] = [];
  const invalid: string[] = [];
  client.on('packet', (packet) => packets.push(packet.address));
  client.on('invalid', (size, address) => invalid.push(`${size} ${address}`));
  const receive = (msg: Buffer, address: string) => (client as unknown as { onMessage: (m: Buffer, a: string) => void }).onMessage(msg, address);
  try {
    // A short packet with a valid magic made the frame reader throw in the main process.
    receive(gt7Packet(100, 'A'), '192.168.178.41');
    // From outside the home network: never "the PS5".
    receive(gt7Packet(PACKET_SIZES.A, 'A'), '85.214.3.9');
    assert.deepEqual(packets, []);
    assert.deepEqual(invalid, ['100 192.168.178.41', '296 85.214.3.9']);
    receive(gt7Packet(PACKET_SIZES.A, 'A'), '192.168.178.41');
    assert.deepEqual(packets, ['192.168.178.41']);
    assert.equal(client.ps5Address, '192.168.178.41');
  } finally {
    await client.stop();
  }
  for (const ip of ['192.168.1.2', '10.1.2.3', '172.16.5.5', '127.0.0.1', '169.254.1.1']) assert.ok(isHomeAddress(ip), ip);
  for (const ip of ['85.214.3.9', '100.64.0.1', '8.8.8.8']) assert.ok(!isHomeAddress(ip), ip);
});

test('telemetry: a frame never carries NaN or Infinity, and a short packet is refused', () => {
  const plain = new Uint8Array(PACKET_SIZES.C);
  const view = new DataView(plain.buffer);
  view.setFloat32(0x4c, Number.NaN, true); // speed
  view.setFloat32(0x04, Number.POSITIVE_INFINITY, true); // x
  const frame = readFrame(plain, 0);
  assert.equal(frame.speed, 0);
  assert.equal(frame.x, 0);
  assert.throws(() => readFrame(new Uint8Array(200), 0), /too short/);
});

test('discovery: the console name is cleaned and cut', () => {
  const info = parseDiscoveryResponse(`HTTP/1.1 200 Ok\nhost-name:Wohn\rzimmer\u0007-PS5${'x'.repeat(5000)}\nrunning-app-name:Gran Turismo 7\n`, '192.168.178.41');
  assert.equal(info?.hostName, `Wohnzimmer-PS5${'x'.repeat(50)}`);
  assert.equal(info?.runningAppName, 'Gran Turismo 7');
});

test('discovery uses private interfaces only, never a VPN or tunnel', () => {
  assert.ok(isPrivateIpv4('192.168.1.2') && isPrivateIpv4('10.1.2.3') && isPrivateIpv4('172.20.0.1'));
  assert.ok(!isPrivateIpv4('100.64.0.1') && !isPrivateIpv4('8.8.8.8'));
  const iface = (address: string, netmask: string, mac = '3c:7c:3f:12:ab:9e') => ({ address, netmask, family: 'IPv4' as const, mac, internal: false, cidr: null });
  const restore = mock.method(os, 'networkInterfaces', () => ({
    Ethernet: [iface('192.168.178.30', '255.255.255.0')],
    // A tunnel under a name of its own: no hardware address.
    'Mein Netz': [iface('10.9.0.2', '255.255.255.0', '00:00:00:00:00:00')],
    'WireGuard Tunnel': [iface('10.8.0.2', '255.255.255.0')],
    tailscale0: [iface('100.101.102.103', '255.192.0.0')],
    'Public uplink': [iface('85.214.3.9', '255.255.255.0')],
  }));
  try {
    const targets = discoveryTargets();
    assert.ok(targets.includes('192.168.178.255') && targets.includes('192.168.178.1'));
    assert.ok(!targets.includes('192.168.178.30'), 'not this PC itself');
    assert.ok(!targets.some((t) => t.startsWith('10.8.') || t.startsWith('10.9.') || t.startsWith('100.') || t.startsWith('85.')), 'no VPN, tunnel or public network');
  } finally {
    restore.mock.restore();
  }
});

/** Every place in shipped code that may open a connection, and why. Anything new needs a reason here. */
const ALLOWED: [RegExp, string, string][] = [
  [/\bfetch\(/, 'packages/runtime/src/voice-packages.ts', 'voice downloads the user starts (pinned URLs, SHA-256)'],
  // Its one way out (fetchFollowing: GitHub hosts only, tests/app-updates.test.ts), and the option tests hand theirs in.
  [/source\.fetch \?\? fetch;|fetch\?: typeof fetch;/, 'packages/runtime/src/app-updates.ts', 'the update check after the user agreed: GitHub only, the installer checked against SHA256SUMS.txt'],
  [/await fetch\(url\)/, 'apps/ui/src/app/ui/news-dialog.ts', "the version's news, shipped with the UI (a relative URL under app://gtt)"],
  [/from 'node:dgram'/, 'packages/telemetry/src/client.ts', 'telemetry from the PS5'],
  [/from 'node:dgram'/, 'packages/telemetry/src/console-discovery.ts', 'finding the PS5 on the home network'],
  [/from 'node:http'/, 'modules/overlays/main/server.ts', 'browser sources for OBS on 127.0.0.1'],
  [/new EventSource\(/, 'modules/overlays/page/client.ts', 'the overlay page reading its own server'],
  [/openExternal\(/, 'apps/desktop/src/ipc.ts', 'fixed links, opened in the browser on a click'],
  [/openExternal\(/, 'apps/desktop/src/main.ts', "a module's page on this PC (http://127.0.0.1), opened in the browser on a click"],
];
// Every "fetch", also one handed on as a value (`options.fetch ?? fetch`), not only its calls.
const NETWORK = /(?<![-\w])fetch(?![-\w])|from '(node:)?(https?|net|tls|dgram|dns|http2)'|require\('(node:)?(https?|net|tls|dgram|dns)'|new (WebSocket|EventSource|XMLHttpRequest)\(|openExternal\(|net\.(request|fetch)\(|sendBeacon\(/;

test('shipped code opens connections only where allowed', () => {
  const shipped = ['packages/core/src', 'packages/runtime/src', 'packages/coach/src', 'packages/telemetry/src', 'apps/desktop/src', 'apps/ui/src', 'modules'];
  const found: string[] = [];
  for (const dir of shipped) {
    for (const file of listTs(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file).replaceAll('\\', '/');
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*(\/\/|\/?\*)/.test(line) || !NETWORK.test(line)) return;
          if (!ALLOWED.some(([pattern, allowedFile]) => allowedFile === rel && pattern.test(line))) found.push(`${rel}:${i + 1}: ${line.trim()}`);
        });
    }
  }
  assert.deepEqual(found, [], 'new network access in shipped code');
});

function listTs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listTs(full);
    return /\.ts$/.test(e.name) && !/\.(spec|test)\.ts$/.test(e.name) ? [full] : [];
  });
}
