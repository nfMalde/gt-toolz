import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import os from 'node:os';
import { decryptAny } from './crypto';
import { packetTypeForSize, type PacketType } from './packet';

/** The PS5 listens for heartbeats on this port. */
export const PS5_HEARTBEAT_PORT = 33739;
/** The PS5 sends telemetry to this port on the heartbeat's sender. */
export const LOCAL_TELEMETRY_PORT = 33740;
/** Other senders of GT7 packets reported, at most. */
const MAX_FOREIGN = 32;

export interface TelemetryClientOptions {
  /** PS5 address. If omitted, the client searches the local networks. */
  ps5Address?: string;
  packetType: PacketType;
  heartbeatIntervalMs?: number;
  discoveryIntervalMs?: number;
}

export interface TelemetryPacket {
  type: PacketType;
  data: Uint8Array;
  address: string;
  receivedAt: number;
}

interface TelemetryClientEvents {
  packet: [TelemetryPacket];
  discovered: [address: string];
  invalid: [size: number, address: string];
  /** Telemetry from another address than the PS5's, dropped (reported once per address). */
  foreign: [address: string];
  listening: [];
  error: [Error];
}

export class TelemetryClient extends EventEmitter<TelemetryClientEvents> {
  private readonly socket = dgram.createSocket({ type: 'udp4', reuseAddr: false });
  private target: string | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private lastDiscovery = 0;
  private bound = false;
  private readonly foreignSeen = new Set<string>();

  constructor(private readonly options: TelemetryClientOptions) {
    super();
    this.target = options.ps5Address;
  }

  get ps5Address(): string | undefined {
    return this.target;
  }

  get packetType(): PacketType {
    return this.options.packetType;
  }

  /** Requests another packet type. GT7 only switches once the current stream has ended (~15 s without heartbeat). */
  setPacketType(type: PacketType): void {
    this.options.packetType = type;
    this.sendHeartbeat();
  }

  /** Sends heartbeats to this address from now on instead of searching; only its telemetry is accepted. */
  setTarget(address: string): void {
    this.target = address;
    this.sendHeartbeat();
  }

  /** Searches again (the PS5 is gone, e.g. a new address); the next PS5 that sends becomes the target. */
  clearTarget(): void {
    this.target = undefined;
    this.foreignSeen.clear();
  }

  start(): void {
    this.socket.on('error', (err) => this.emit('error', err));
    this.socket.on('message', (msg, rinfo) => this.onMessage(msg, rinfo.address));
    this.socket.bind(LOCAL_TELEMETRY_PORT, () => {
      this.bound = true;
      this.socket.setBroadcast(true);
      this.emit('listening');
      this.sendHeartbeat();
      this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.options.heartbeatIntervalMs ?? 1500);
    });
  }

  /** Resolves once the port is free again (a new client can bind it). */
  stop(): Promise<void> {
    clearInterval(this.heartbeatTimer);
    return new Promise((resolve) => {
      try {
        this.socket.close(() => resolve());
      } catch {
        // Never bound or already closed (e.g. after EADDRINUSE).
        resolve();
      }
    });
  }

  private onMessage(msg: Buffer, address: string): void {
    // Only whole GT7 packets from the home network (release check 2026-10-28): a shorter one made the frame reader
    // throw in the main process, and a sender from outside could have become "the PS5".
    if (!packetTypeForSize(msg.length) || !isHomeAddress(address)) {
      this.emit('invalid', msg.length, address);
      return;
    }
    const decrypted = decryptAny(msg);
    if (!decrypted) {
      this.emit('invalid', msg.length, address);
      return;
    }
    // Keeps to its PS5 (security audit 2026-10-24): another device on the network that sends GT7 packets, a second
    // PS5 or a spoofer, neither takes over nor mixes its data in.
    if (this.target && this.target !== address) {
      // Each address once, and only so many (spoofed senders must not grow the list and the log without end).
      if (!this.foreignSeen.has(address) && this.foreignSeen.size < MAX_FOREIGN) {
        this.foreignSeen.add(address);
        this.emit('foreign', address);
      }
      return;
    }
    if (!this.target) {
      this.target = address;
      this.emit('discovered', address);
      this.sendHeartbeat();
    }
    this.emit('packet', { ...decrypted, address, receivedAt: Date.now() });
  }

  private sendHeartbeat(): void {
    // Sending on an unbound socket would bind it to a random port.
    if (!this.bound) return;
    const heartbeat = Buffer.from(this.options.packetType, 'ascii');
    if (this.target) {
      this.socket.send(heartbeat, PS5_HEARTBEAT_PORT, this.target);
      return;
    }
    const now = Date.now();
    if (now - this.lastDiscovery < (this.options.discoveryIntervalMs ?? 3000)) return;
    this.lastDiscovery = now;
    for (const address of discoveryTargets()) {
      this.socket.send(heartbeat, PS5_HEARTBEAT_PORT, address);
    }
  }
}

/**
 * Network adapters of VPNs and tunnels: their "local" network is somewhere else, so the search would leave the home
 * network through them (security audit 2026-10-24).
 */
const TUNNEL_ADAPTER = /vpn|wireguard|\bwg\d*\b|\btun\d*\b|\btap\b|tailscale|zerotier|hamachi|nordlynx|mullvad|proton/i;

/** A private (home network) IPv4 address: 10/8, 172.16/12, 192.168/16. */
export function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** A sender on the home network (private or link-local) or this PC (the fake PS5): nothing from elsewhere is taken. */
export function isHomeAddress(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return isPrivateIpv4(address) || a === 127 || (a === 169 && b === 254);
}

/**
 * Broadcast addresses plus every host of each local /24 (or smaller) IPv4 network, on private home networks only:
 * no VPN or tunnel adapters, no public addresses.
 */
export function discoveryTargets(): string[] {
  const targets = new Set<string>(['255.255.255.255']);
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (TUNNEL_ADAPTER.test(name)) continue;
    for (const info of addresses ?? []) {
      // No hardware address: a tunnel (WireGuard, tun) under a name of the user's choice.
      if (info.family !== 'IPv4' || info.internal || !isPrivateIpv4(info.address) || info.mac === '00:00:00:00:00:00') continue;
      const ip = toInt(info.address);
      const mask = toInt(info.netmask);
      const network = (ip & mask) >>> 0;
      const broadcast = (network | ~mask) >>> 0;
      targets.add(toIp(broadcast));
      if (broadcast - network > 256) continue;
      for (let host = network + 1; host < broadcast; host++) {
        if (host !== ip) targets.add(toIp(host));
      }
    }
  }
  return [...targets];
}

function toInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => ((acc << 8) | Number(part)) >>> 0, 0);
}

function toIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}
