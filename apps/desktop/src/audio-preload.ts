/// <reference lib="dom" />
// The player in the hidden audio window (see audio.ts): Web Audio, one channel per voice, each with its own volume
// (coach and crew can be set apart). A clip is decoded when it is loaded; a new clip cuts off only the clip playing
// on the same channel. Nothing is exposed to the page (there is none).

import { ipcRenderer } from 'electron';

interface Channel {
  buffers: Map<string, Promise<AudioBuffer | undefined>>;
  playing?: AudioBufferSourceNode;
  volume: GainNode;
}

const context = new AudioContext({ latencyHint: 'interactive' });
const channels = new Map<number, Channel>();

function channelOf(id: number): Channel {
  let channel = channels.get(id);
  if (!channel) {
    const volume = context.createGain();
    volume.connect(context.destination);
    channel = { buffers: new Map(), volume };
    channels.set(id, channel);
  }
  return channel;
}

function stop(channel: Channel): void {
  try {
    channel.playing?.stop();
  } catch {
    // Already ended.
  }
  channel.playing = undefined;
}

ipcRenderer.on('audio:load', (_event, id: number, name: string, data: Uint8Array) => {
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const decoded = context.decodeAudioData(bytes).catch((err: unknown) => {
    console.error(`clip ${name}: ${String(err)}`);
    return undefined;
  });
  channelOf(id).buffers.set(name, decoded);
});

ipcRenderer.on('audio:play', async (_event, id: number, name: string) => {
  const channel = channelOf(id);
  const buffer = await channel.buffers.get(name);
  if (!buffer) {
    console.error(`clip ${name} is not loaded`);
    return;
  }
  if (context.state !== 'running') await context.resume();
  stop(channel);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(channel.volume);
  source.onended = () => {
    if (channel.playing === source) channel.playing = undefined;
  };
  source.start();
  channel.playing = source;
});

ipcRenderer.on('audio:volume', (_event, id: number, gain: number) => {
  channelOf(id).volume.gain.value = Number.isFinite(gain) ? Math.max(0, Math.min(1, gain)) : 1;
});

ipcRenderer.on('audio:stop', (_event, id: number) => {
  const channel = channels.get(id);
  if (channel) stop(channel);
});

ipcRenderer.on('audio:close', (_event, id: number) => {
  const channel = channels.get(id);
  if (channel) {
    stop(channel);
    channel.volume.disconnect();
  }
  channels.delete(id);
});

ipcRenderer.send('audio:ready');
