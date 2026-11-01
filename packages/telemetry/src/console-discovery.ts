// PlayStation device discovery (the protocol Remote Play uses, see chiaki-ng discovery.c).
// Finds the console even before GT7 runs and reports the running app.

import dgram from 'node:dgram';
import { discoveryTargets, isHomeAddress } from './client';

export const PS5_DISCOVERY_PORT = 9302;
export const PS4_DISCOVERY_PORT = 987;
const PS5_PROTOCOL_VERSION = '00030010';
const PS4_PROTOCOL_VERSION = '00020020';
const LOCAL_PORT_MIN = 9303;
const LOCAL_PORT_MAX = 9319;
/** Header values (the console's name, the running app) are cut to this: they go to the log and the screen. */
const MAX_VALUE_LENGTH = 64;

export interface ConsoleInfo {
  address: string;
  state: 'ready' | 'standby' | 'unknown';
  hostType?: string;
  hostName?: string;
  systemVersion?: string;
  runningAppName?: string;
  runningAppTitleId?: string;
}

export class ConsoleDiscovery {
  private socket: dgram.Socket | undefined;
  private pending: ((info: ConsoleInfo) => void) | undefined;

  async open(): Promise<void> {
    for (let port = LOCAL_PORT_MIN; port <= LOCAL_PORT_MAX && !this.socket; port++) {
      this.socket = await tryBind(port);
    }
    this.socket ??= await tryBind(0);
    if (!this.socket) throw new Error('Could not open a UDP socket for console discovery');
    this.socket.setBroadcast(true);
    // A send that fails (no network) must not end the app; the search simply finds nothing.
    this.socket.on('error', () => undefined);
    this.socket.on('message', (msg, rinfo) => {
      // Only consoles on the home network (release check 2026-10-28).
      if (!isHomeAddress(rinfo.address)) return;
      const info = parseDiscoveryResponse(msg.toString('utf8'), rinfo.address);
      if (info) this.pending?.(info);
    });
  }

  /** Searches the given address (or all local networks) and resolves with the first console that answers. */
  search(address: string | undefined, timeoutMs: number): Promise<ConsoleInfo | undefined> {
    const socket = this.socket;
    if (!socket) throw new Error('ConsoleDiscovery.open() must be called first');

    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(undefined), timeoutMs);
      const finish = (info: ConsoleInfo | undefined) => {
        clearTimeout(timer);
        this.pending = undefined;
        resolve(info);
      };
      // Searching one address: only that one may answer.
      this.pending = (info) => {
        if (!address || info.address === address) finish(info);
      };

      const ps5 = Buffer.from(`SRCH * HTTP/1.1\ndevice-discovery-protocol-version:${PS5_PROTOCOL_VERSION}\n`);
      const ps4 = Buffer.from(`SRCH * HTTP/1.1\ndevice-discovery-protocol-version:${PS4_PROTOCOL_VERSION}\n`);
      for (const target of address ? [address] : discoveryTargets()) {
        socket.send(ps5, PS5_DISCOVERY_PORT, target);
        socket.send(ps4, PS4_DISCOVERY_PORT, target);
      }
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}

export function parseDiscoveryResponse(text: string, address: string): ConsoleInfo | undefined {
  const [statusLine, ...lines] = text.split(/\r?\n/);
  const status = /^HTTP\/1\.1 (\d+)/.exec(statusLine ?? '');
  if (!status) return undefined;

  const headers = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator > 0) headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim());
  }

  const code = Number(status[1]);
  const value = (name: string) => headers.get(name)?.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, MAX_VALUE_LENGTH);
  return {
    address,
    state: code === 200 ? 'ready' : code === 620 ? 'standby' : 'unknown',
    hostType: value('host-type'),
    hostName: value('host-name'),
    systemVersion: value('system-version'),
    runningAppName: value('running-app-name'),
    runningAppTitleId: value('running-app-titleid'),
  };
}

function tryBind(port: number): Promise<dgram.Socket | undefined> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    socket.once('error', () => {
      socket.close();
      resolve(undefined);
    });
    socket.bind(port, () => {
      socket.removeAllListeners('error');
      resolve(socket);
    });
  });
}
