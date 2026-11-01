import fs from 'node:fs';
import path from 'node:path';
import { CAPTURE_HEADER, encodeCaptureRecord, type TelemetryPacket } from '@gt-toolz/telemetry';

/** Writes decrypted packets to a .gtcap file (format: see packages/telemetry/src/capture-file.ts). */
export class CaptureRecorder {
  private readonly stream: fs.WriteStream;
  private open = true;
  count = 0;

  constructor(readonly filePath: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.stream = fs.createWriteStream(filePath);
    // A full disk ends the recording, not the app (release check 2026-10-28).
    this.stream.on('error', (err) => {
      if (this.open) console.error(`Telemetry recording stopped: ${err.message}`);
      this.open = false;
    });
    this.stream.write(CAPTURE_HEADER);
  }

  write(packet: TelemetryPacket): void {
    if (!this.open) return;
    this.stream.write(encodeCaptureRecord({ time: packet.receivedAt, type: packet.type, data: packet.data }));
    this.count++;
  }

  close(): Promise<void> {
    this.open = false;
    return new Promise((resolve) => this.stream.end(resolve));
  }
}
