import { Injectable, signal } from '@angular/core';

/** Plays a WAV in the page (a recording to listen to); one at a time. */
@Injectable({ providedIn: 'root' })
export class ClipPlayer {
  /** Id of the clip playing. */
  readonly playing = signal<string | null>(null);

  private context: AudioContext | undefined;
  private source: AudioBufferSourceNode | undefined;

  /** Resolves when the clip has ended (or was stopped). */
  async play(id: string, wav: Uint8Array): Promise<void> {
    this.stop();
    this.context ??= new AudioContext();
    // decodeAudioData takes the buffer over: a copy.
    const buffer = await this.context.decodeAudioData(wav.slice().buffer);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    this.source = source;
    this.playing.set(id);
    await new Promise<void>((resolve) => {
      source.onended = () => resolve();
      source.start();
    });
    if (this.source === source) {
      this.source = undefined;
      this.playing.set(null);
    }
  }

  stop(): void {
    const source = this.source;
    this.source = undefined;
    this.playing.set(null);
    source?.stop();
  }
}
