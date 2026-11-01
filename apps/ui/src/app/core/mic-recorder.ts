import { Injectable, signal } from '@angular/core';

/** Takes are sent at this rate; the main process stores them at its own rate anyway. */
const RATE = 24_000;
/** A take stops by itself after this long (the main process accepts no longer ones). */
export const MAX_TAKE_SECONDS = 30;

export type MicState = 'idle' | 'starting' | 'recording' | 'processing';

/**
 * Records one take from the microphone and returns it as 16-bit mono WAV. The microphone is open only
 * while a take runs; the main process allows audio (never video) for the app's own page only.
 */
@Injectable({ providedIn: 'root' })
export class MicRecorder {
  readonly state = signal<MicState>('idle');
  /** Input level 0..1 while recording. */
  readonly level = signal(0);
  readonly seconds = signal(0);

  private recorder: MediaRecorder | undefined;
  private cancelled = false;

  /** Records until stop() (or the time limit); resolves with the take as WAV, or null when cancelled. */
  async record(): Promise<Uint8Array | null> {
    if (this.state() !== 'idle') return null;
    this.state.set('starting');
    this.cancelled = false;
    let stream: MediaStream;
    try {
      // The room's echo does not matter (nothing plays while recording); the level is evened out later.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: false },
        video: false,
      });
    } catch (err) {
      this.state.set('idle');
      throw err;
    }
    const context = new AudioContext();
    // Started without a click of its own (the permission prompt came first): make sure it runs.
    void context.resume();
    let frame = 0;
    let limit: ReturnType<typeof setTimeout> | undefined;
    try {
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      const started = performance.now();
      const meter = () => {
        analyser.getFloatTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v));
        this.level.set(Math.min(1, peak));
        this.seconds.set((performance.now() - started) / 1000);
        frame = requestAnimationFrame(meter);
      };
      meter();

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream);
      this.recorder = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
      recorder.start();
      this.state.set('recording');
      limit = setTimeout(() => this.stop(), MAX_TAKE_SECONDS * 1000);
      await stopped;
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      if (this.cancelled || !chunks.length) return null;

      this.state.set('processing');
      const recorded = await context.decodeAudioData(await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer());
      // Mono at a fixed rate; the browser resamples with proper filtering.
      const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(recorded.duration * RATE)), RATE);
      const source = offline.createBufferSource();
      source.buffer = recorded;
      source.connect(offline.destination);
      source.start();
      return encodeWav((await offline.startRendering()).getChannelData(0), RATE);
    } finally {
      clearTimeout(limit);
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      this.recorder = undefined;
      this.level.set(0);
      void context.close();
      this.state.set('idle');
    }
  }

  stop(): void {
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  /** Ends the take without keeping it. */
  cancel(): void {
    this.cancelled = true;
    this.stop();
  }
}

function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true));
  return new Uint8Array(buffer);
}
