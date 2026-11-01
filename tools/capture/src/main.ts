// Phase 0: records GT7 telemetry and reports every changing bit, to find the turn signal state.
// Usage: npm run capture -- [--ip <PS5-IP>] [--type A|B|~|C] [--out captures]
// Console shows plain messages; the .log file next to the recording has timestamps.

import { parseArgs } from 'node:util';
import { describeFlags, PACKET_SIZES, PACKET_TYPES, readSnapshot, type PacketType, type TelemetryPacket } from '@gt-toolz/telemetry';
import { CaptureRecorder, Gt7Connection, openSessionLog } from '@gt-toolz/runtime';
import { ChangeAnalyzer } from './analyzer';

const STATUS_INTERVAL_MS = 30_000;

const { values } = parseArgs({
  options: {
    ip: { type: 'string' },
    type: { type: 'string', default: 'C' },
    out: { type: 'string', default: 'captures' },
  },
});

const packetType = values.type as PacketType;
if (!PACKET_TYPES.includes(packetType)) {
  console.error(`Unknown packet type "${values.type}". Allowed: ${PACKET_TYPES.join(', ')}`);
  process.exit(1);
}

const session = openSessionLog(values.out, packetType === '~' ? 'tilde' : packetType);
const { log } = session;
const recorder = new CaptureRecorder(`${session.baseName}.gtcap`);
const analyzer = new ChangeAnalyzer(log);

let latest: TelemetryPacket | undefined;
let packetsSinceStatus = 0;

const connection = new Gt7Connection({
  ip: values.ip,
  packetType,
  log,
  onConnected: () => session.logToFile(`Recording to ${session.baseName}.gtcap`),
  // The port is taken (another telemetry tool): nothing to record.
  onStatus: (status) => {
    if (status.stage === 'error') void shutdown(1);
  },
  onPacket: (packet) => {
    latest = packet;
    packetsSinceStatus++;
    recorder.write(packet);
    analyzer.onPacket(packet.type, packet.data, packet.receivedAt);
  },
});

setInterval(() => analyzer.tick(Date.now()), 250);

setInterval(() => {
  if (connection.currentStage !== 'live' || !latest) return;
  const rate = Math.round(packetsSinceStatus / (STATUS_INTERVAL_MS / 1000));
  packetsSinceStatus = 0;
  if (latest.data.length < PACKET_SIZES.A) {
    // Truncated packet (answer to an unknown heartbeat character): too short for the snapshot.
    log(`STATUS    ${latest.type}/${latest.data.length}B ${rate}/s | recorded ${recorder.count}`);
    return;
  }
  const s = readSnapshot(latest.data);
  const gear = s.currentGear === 0 ? 'N/R' : String(s.currentGear);
  const flags = `0x${s.flags.toString(16).toUpperCase().padStart(4, '0')} [${describeFlags(s.flags).join(', ')}]`;
  const noisy = analyzer.noisyOffsets.length;
  log(
    `STATUS    ${latest.type}/${latest.data.length}B ${rate}/s` +
      ` | ${s.speedKmh.toFixed(0)} km/h, gear ${gear}, ${s.engineRpm.toFixed(0)} rpm | flags=${flags}` +
      ` | recorded ${recorder.count}${noisy ? `, ${noisy} noisy bytes ignored` : ''}`,
  );
}, STATUS_INTERVAL_MS);

async function shutdown(code = 0): Promise<void> {
  log(`STOPPED   ${recorder.count} packets recorded`);
  await connection.stop();
  await recorder.close();
  await session.close();
  process.exit(code);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await connection.start();
