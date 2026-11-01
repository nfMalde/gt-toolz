// Shared startup flow: find the PS5, then GT7, with the countdown messages the user specified.

import {
  ConsoleDiscovery,
  LOCAL_TELEMETRY_PORT,
  TelemetryClient,
  type ConsoleInfo,
  type PacketType,
  type TelemetryPacket,
} from '@gt-toolz/telemetry';

const RETRY_SECONDS = 5;
const PS5_SEARCH_TIMEOUT_MS = 2000;
const GT7_WAIT_MS = 2000;
const CONNECTION_LOST_MS = 5000;

import type { ConnectionStatus, Stage } from './app-api';

export type { ConnectionStatus, Stage } from './app-api';

export interface ConnectionOptions {
  ip?: string;
  packetType: PacketType;
  /**
   * Packet types to try, in order, when GT7 does not answer the current one
   * (e.g. Sport Mode does not send B, and therefore not C either).
   */
  fallbackTypes?: PacketType[];
  log: (line: string) => void;
  onPacket: (packet: TelemetryPacket) => void;
  /** Called once per (re)connection, after "GT7 connected". */
  onConnected?: () => void;
  /** Called on every stage change and countdown step. */
  onStatus?: (status: ConnectionStatus) => void;
}

export class Gt7Connection {
  private readonly discovery = new ConsoleDiscovery();
  private readonly client: TelemetryClient;
  private stage: Stage = 'ps5';
  private consoleInfo: ConnectionStatus['console'];
  private retryIn: number | undefined;
  private error: ConnectionStatus['error'];
  private lastPacketAt = 0;
  private invalidPackets = 0;
  private packetErrors = 0;
  private watchdog: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(private readonly options: ConnectionOptions) {
    this.client = new TelemetryClient({ ps5Address: options.ip, packetType: options.packetType });
  }

  get currentStage(): Stage {
    return this.stage;
  }

  get status(): ConnectionStatus {
    return { stage: this.stage, console: this.consoleInfo, packetType: this.client.packetType, retryIn: this.retryIn, error: this.error };
  }

  async start(): Promise<void> {
    const { log } = this.options;
    this.client.on('packet', (packet) => {
      if (this.stage !== 'live') this.onGt7Connected(packet.address);
      this.lastPacketAt = packet.receivedAt;
      // A mistake in handling one packet costs that packet, not the app (release check 2026-10-28: an exception
      // here ended in a blocking error box in the main process, once per packet).
      try {
        this.options.onPacket(packet);
      } catch (err) {
        this.packetErrors++;
        if (this.packetErrors === 1 || this.packetErrors % 600 === 0) log(`ERROR     ${this.packetErrors} packet(s) failed: ${(err as Error).stack ?? err}`);
      }
    });
    this.client.on('foreign', (address) => log(`FOREIGN   telemetry from ${address} ignored: GT Toolz keeps to its PS5`));
    this.client.on('invalid', (size, address) => {
      this.invalidPackets++;
      if (this.invalidPackets === 1 || this.invalidPackets % 600 === 0) {
        log(`INVALID   ${this.invalidPackets} packet(s) could not be decrypted (last: ${size} bytes from ${address})`);
      }
    });
    this.client.on('error', (err) => {
      log(`ERROR     ${err.message}`);
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        log(`ERROR     UDP port ${LOCAL_TELEMETRY_PORT} is in use. Is another telemetry tool running?`);
        this.error = 'port-in-use';
        this.setStage('error');
        void this.stop();
      }
    });

    this.watchdog = setInterval(() => {
      if (this.stage === 'live' && Date.now() - this.lastPacketAt > CONNECTION_LOST_MS) {
        this.setStage('gt7');
        log('GT7 connection lost. Scanning for GT7...');
        void this.scanForGt7();
      }
    }, 250);

    log('Tool running. Scanning for PS5...');
    this.setStage('ps5');
    await this.discovery.open();
    this.client.start();
    await this.scanForPs5();
    await this.scanForGt7();
  }

  /** Resolves once the telemetry port is free again. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.watchdog);
    this.discovery.close();
    await this.client.stop();
  }

  private setStage(stage: Stage): void {
    this.stage = stage;
    this.retryIn = undefined;
    this.options.onStatus?.(this.status);
  }

  private onPs5Found(info: ConsoleInfo | undefined, address: string): void {
    this.consoleInfo = { name: info?.hostName ?? 'PlayStation', address, app: info?.runningAppName };
    this.options.log('PS5 Found. Scanning for GT7...');
    const app = info?.runningAppName ? `, running: ${info.runningAppName}` : '';
    this.options.log(`          ${info?.hostName ?? 'PlayStation'} at ${address}${app}`);
    this.client.setTarget(address);
    this.setStage('gt7');
  }

  private onGt7Connected(address: string): void {
    if (this.stage === 'ps5') this.onPs5Found(undefined, address);
    this.setStage('live');
    this.options.log('GT7 connected. Waiting for Inputs...');
    this.options.onConnected?.();
  }

  private async scanForPs5(): Promise<void> {
    while (this.stage === 'ps5' && !this.stopped) {
      const info = await this.discovery.search(this.options.ip, PS5_SEARCH_TIMEOUT_MS);
      if (this.stage !== 'ps5' || this.stopped) return;
      if (info) {
        this.onPs5Found(info, info.address);
        return;
      }
      this.options.log(`PS5 not found. Retry in ${RETRY_SECONDS}`);
      await this.countdown(() => this.stage !== 'ps5');
    }
  }

  private async scanForGt7(): Promise<void> {
    const fallbacks = [...(this.options.fallbackTypes ?? [])];
    while (this.stage === 'gt7' && !this.stopped) {
      await sleep(GT7_WAIT_MS);
      if (this.stage !== 'gt7' || this.stopped) return;

      // GT7 is running but silent: it may not offer this packet type in the current mode.
      const next = fallbacks[0];
      if (next && (await this.gt7Running())) {
        fallbacks.shift();
        this.options.log(`GT7 is running but sends no packet ${this.client.packetType}. Trying packet ${next}...`);
        this.client.setPacketType(next);
        this.options.onStatus?.(this.status);
        continue;
      }
      // The PS5 no longer answers at its address (switched off, a new address): search again, unless the user set it.
      if (!this.options.ip && !(await this.discovery.search(this.client.ps5Address, PS5_SEARCH_TIMEOUT_MS))) {
        if (this.stage !== 'gt7' || this.stopped) return;
        this.options.log('PS5 no longer answers. Scanning for PS5...');
        this.client.clearTarget();
        this.consoleInfo = undefined;
        this.setStage('ps5');
        await this.scanForPs5();
        continue;
      }
      if (this.stage !== 'gt7' || this.stopped) return;
      this.options.log(`GT7 not opened yet. Please start GT7. Retry in ${RETRY_SECONDS}`);
      await this.countdown(() => this.stage !== 'gt7');
    }
  }

  private async gt7Running(): Promise<boolean> {
    const info = await this.discovery.search(this.client.ps5Address, PS5_SEARCH_TIMEOUT_MS);
    if (info && this.consoleInfo) this.consoleInfo = { ...this.consoleInfo, app: info.runningAppName };
    return /gran turismo/i.test(info?.runningAppName ?? '');
  }

  /** Prints 4, 3, 2, 1 one second apart. Stops early when aborted. */
  private async countdown(aborted: () => boolean): Promise<void> {
    this.retryIn = RETRY_SECONDS;
    this.options.onStatus?.(this.status);
    for (let n = RETRY_SECONDS - 1; n >= 1; n--) {
      await sleep(1000);
      if (aborted() || this.stopped) return;
      this.options.log(String(n));
      this.retryIn = n;
      this.options.onStatus?.(this.status);
    }
    await sleep(1000);
    this.retryIn = undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
