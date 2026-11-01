import { inject, Injectable, signal } from '@angular/core';
import type { HapticCue, HapticEvent, HapticPulse, HapticSettings } from '@gt-toolz/haptics/api';
import { BRIDGE_AVAILABLE, GTT } from '@shell/core/gtt';
import { HapticsStore } from '../stores/haptics.store';
import { DualSense, DUALSENSE_FILTERS, isDualSense, isDualSensePad, webHid, type HidDevice } from './dualsense';

export interface AudioOutputDevice {
  id: string;
  label: string;
}

/** A connected controller; rumble: the browser can drive its vibration. */
export interface GamepadInfo {
  id: string;
  name: string;
  rumble: boolean;
}

export type DeviceProblem = 'device-missing' | 'audio-error' | 'no-gamepad' | 'no-vibration';
export type DeviceCheck = { ok: true; name: string } | { ok: false; problem: DeviceProblem };

/** The output a device test is for: another output or another device needs its own test. */
export function hapticOutputKey(haptics: HapticSettings): string {
  return haptics.output === 'gamepad' ? 'gamepad' : `audio:${haptics.audioDevice}`;
}

/**
 * The device test: three pulses at full strength with long pauses (about 1.7 s), so even a controller whose
 * motors run on after a pulse is felt three times.
 */
const TEST: HapticEvent = { cue: 'attention', side: 'both', pulses: [0, 700, 1400].map((at) => ({ at, duration: 250, strength: 1 })) };

/**
 * Accessibility: plays the coach's vibration patterns the moment they are due, on the output the driver
 * chose. Audio: low-frequency pulses on an audio output (bass shakers, haptic vests and mats, headsets with
 * haptics turn them into vibration). Gamepad: the rumble of a game controller connected to the computer;
 * a PS5 controller directly (WebHID), since the browser cannot make it vibrate.
 * Lives as long as the app window.
 */
@Injectable({ providedIn: 'root' })
export class HapticPlayer {
  private readonly gtt = inject(GTT);
  private readonly store = inject(HapticsStore);

  /** Audio outputs to choose from (without the system's "default" entries). */
  readonly outputs = signal<AudioOutputDevice[]>([]);
  /** Connected controllers, also those whose vibration the browser cannot drive (the browser lists one only after a button press). */
  readonly gamepads = signal<GamepadInfo[]>([]);
  /** The chosen audio output is gone (unplugged): the default output plays instead. */
  readonly outputMissing = signal(false);
  /** The last pattern played, so the page can show it (also without a device). */
  readonly felt = signal<{ cue: HapticCue; at: number } | null>(null);

  private context: AudioContext | undefined;
  private contextDevice = '';
  /** For the PS5 controller as audio device: channels 3 and 4 drive its haptic actuators. */
  private hapticChannels: ChannelMergerNode | undefined;
  /** What is still to be felt: scheduled oscillators and controller pulses. */
  private oscillators: OscillatorNode[] = [];
  private rumbles: ReturnType<typeof setTimeout>[] = [];
  /** A PS5 controller, opened directly. */
  private dualsense: DualSense | undefined;

  constructor() {
    if (!BRIDGE_AVAILABLE) return;
    this.gtt.haptics.onHaptic((event) => void this.play(event));
    navigator.mediaDevices?.addEventListener('devicechange', () => void this.listOutputs());
    window.addEventListener('gamepadconnected', () => this.listGamepads());
    window.addEventListener('gamepaddisconnected', () => this.listGamepads());
    // A PS5 controller the app may open (main process: DualSense only) is used without asking again.
    const hid = webHid();
    hid?.addEventListener('connect', () => void this.connectDualSense(false));
    hid?.addEventListener('disconnect', (event) => {
      if ((event as Event & { device?: HidDevice }).device !== this.dualsense?.device) return;
      this.dualsense = undefined;
      this.listGamepads();
    });
    // Never leave it vibrating.
    window.addEventListener('beforeunload', () => void this.dualsense?.rumble(0, 0).catch(() => undefined));
    void this.connectDualSense(false);
  }

  /** Opens a PS5 controller; ask: show the browser's request (needs a click; the app grants only a DualSense). */
  async connectDualSense(ask: boolean): Promise<DualSense | undefined> {
    if (this.dualsense) return this.dualsense;
    const hid = webHid();
    if (!hid) return undefined;
    try {
      let device = (await hid.getDevices()).find((d) => isDualSense(d.vendorId, d.productId));
      if (!device && ask) device = (await hid.requestDevice({ filters: DUALSENSE_FILTERS }))[0];
      if (!device) return undefined;
      this.dualsense = await DualSense.open(device);
      const ds = this.dualsense;
      console.warn(`[haptics] PS5 controller opened directly: ${ds.name}, firmware ${ds.firmware?.toString(16) ?? 'unknown'}, rumble ${ds.vibrationV2 ? 'v2' : 'v1'}`);
      this.listGamepads();
      return this.dualsense;
    } catch (err) {
      console.warn(`[haptics] PS5 controller: ${(err as Error).message}`);
      return undefined;
    }
  }

  async listOutputs(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices
        // Without the app's permission the browser lists one nameless entry per kind; that is the default.
        .filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
        .map((d, i) => ({ id: d.deviceId, label: d.label || `#${i + 1}` }));
      if (JSON.stringify(outputs) === JSON.stringify(this.outputs())) return;
      this.outputs.set(outputs);
      // Experimental: which outputs there are (in development it shows in the terminal).
      console.warn(`[haptics] audio outputs: ${outputs.map((o) => o.label).join(' | ') || 'none'}`);
    } catch {
      this.outputs.set([]);
    }
  }

  listGamepads(): void {
    const pads = connectedGamepads()
      // Devices that only claim to be a game controller (a microphone, a keyboard) are left out.
      .filter((pad) => pad.mapping === 'standard' || canRumble(pad) || isDualSensePad(pad.id))
      .map((pad) => ({ id: pad.id, name: gamepadName(pad.id), rumble: canRumble(pad) || (isDualSensePad(pad.id) && !!webHid()) }));
    // Opened directly but not seen by the browser yet (no button pressed).
    if (this.dualsense && !pads.some((pad) => isDualSensePad(pad.id))) pads.push({ id: this.dualsense.name, name: this.dualsense.name, rumble: true });
    // Polled every second: only a change is set, so the page does not redraw for nothing.
    if (JSON.stringify(pads) === JSON.stringify(this.gamepads())) return;
    this.gamepads.set(pads);
    // Experimental: what the browser reports about each controller (in development it shows in the terminal).
    const report = connectedGamepads().map((pad) => {
      const actuator = pad.vibrationActuator as (GamepadHapticActuator & { effects?: string[]; type?: string }) | null;
      return `${pad.id} [mapping ${pad.mapping || '-'}, vibration ${actuator ? (actuator.effects?.join('/') ?? actuator.type ?? 'yes') : 'none'}]`;
    });
    console.warn(`[haptics] controllers: ${report.join(' | ') || 'none'}`);
  }

  /**
   * Device test: is the chosen output there, and can it vibrate? Then it vibrates three times; whether that
   * was felt, only the driver can tell.
   */
  async check(haptics: HapticSettings): Promise<DeviceCheck> {
    this.cancel();
    if (haptics.output === 'gamepad') {
      // The test is a click: a PS5 controller may be asked for now.
      const dualsense = await this.connectDualSense(true);
      const pads = connectedGamepads();
      this.listGamepads();
      const rumbling = pads.filter(canRumble);
      if (!dualsense && !rumbling.length) {
        return { ok: false, problem: pads.some((pad) => pad.mapping === 'standard' || isDualSensePad(pad.id)) ? 'no-vibration' : 'no-gamepad' };
      }
      try {
        // A silent effect first: a controller that cannot rumble after all fails here.
        if (dualsense) await dualsense.rumble(0, 0);
        else await Promise.any(rumbling.map((pad) => pad.vibrationActuator!.playEffect('dual-rumble', { duration: 1, strongMagnitude: 0, weakMagnitude: 0 })));
      } catch {
        return { ok: false, problem: 'no-vibration' };
      }
      this.rumble(TEST, haptics.controllerPause);
      return { ok: true, name: [dualsense?.name, ...rumbling.map((pad) => gamepadName(pad.id))].filter(Boolean).join(', ') };
    }
    await this.listOutputs();
    if (haptics.audioDevice && !this.outputs().some((o) => o.id === haptics.audioDevice)) return { ok: false, problem: 'device-missing' };
    try {
      await this.pulse(TEST, haptics);
    } catch {
      return { ok: false, problem: 'audio-error' };
    }
    if (this.outputMissing()) return { ok: false, problem: 'device-missing' };
    return { ok: true, name: this.outputs().find((o) => o.id === haptics.audioDevice)?.label ?? '' };
  }

  /** Plays pulses on the chosen output right away (a pattern being designed), at the overall strength. */
  async preview(pulses: HapticPulse[]): Promise<void> {
    const haptics = this.store.settings();
    if (!haptics) return;
    const scaled = pulses.map((p) => ({ ...p, strength: Math.round(p.strength * haptics.intensity * 100) / 100 }));
    await this.play({ cue: 'attention', side: 'both', pulses: scaled });
  }

  private async play(event: HapticEvent): Promise<void> {
    const haptics = this.store.settings();
    if (!haptics) return;
    this.felt.set({ cue: event.cue, at: Date.now() });
    this.cancel();
    if (haptics.output === 'gamepad') this.rumble(event, haptics.controllerPause);
    else await this.pulse(event, haptics);
  }

  /**
   * Sine bursts at the chosen frequency, with short ramps (no clicks), panned to the turn's side. On a PS5
   * controller's audio device they go to its haptic channels (3: left, 4: right) instead of its speaker.
   */
  private async pulse(event: HapticEvent, haptics: HapticSettings): Promise<void> {
    const context = await this.audioContext(haptics.audioDevice);
    const start = context.currentTime + 0.01;
    const pan = event.side === 'left' ? -1 : event.side === 'right' ? 1 : 0;
    const actuators = this.hapticChannels;
    for (const pulse of event.pulses) {
      const from = start + pulse.at / 1000;
      const to = from + pulse.duration / 1000;
      const ramp = Math.min(0.012, pulse.duration / 4000);
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = haptics.frequency;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, from);
      gain.gain.linearRampToValueAtTime(pulse.strength, from + ramp);
      gain.gain.setValueAtTime(pulse.strength, to - ramp);
      gain.gain.linearRampToValueAtTime(0, to);
      oscillator.connect(gain);
      if (actuators) {
        if (event.side !== 'right') gain.connect(actuators, 0, 2);
        if (event.side !== 'left') gain.connect(actuators, 0, 3);
      } else {
        const panner = context.createStereoPanner();
        panner.pan.value = pan;
        gain.connect(panner).connect(context.destination);
      }
      oscillator.start(from);
      oscillator.stop(to + 0.02);
      this.oscillators.push(oscillator);
    }
  }

  /** Stops the pattern still being felt. */
  private cancel(): void {
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already over.
      }
    }
    this.oscillators = [];
    if (this.rumbles.length) void this.dualsense?.rumble(0, 0).catch(() => undefined);
    for (const timer of this.rumbles) clearTimeout(timer);
    this.rumbles = [];
  }

  /** One context per output; a new output gets a new one. */
  private async audioContext(device: string): Promise<AudioContext> {
    if (this.context && this.contextDevice === device) {
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context;
    }
    void this.context?.close();
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    this.contextDevice = device;
    this.outputMissing.set(false);
    if (device) {
      try {
        await (context as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(device);
      } catch {
        this.outputMissing.set(true);
      }
    }
    if (context.state === 'suspended') await context.resume();
    this.hapticChannels = undefined;
    if (device && this.isControllerAudio(device)) {
      const destination = context.destination;
      // Four discrete channels: 1 and 2 are the speaker, 3 and 4 the haptic actuators.
      if (destination.maxChannelCount >= 4) {
        destination.channelCount = 4;
        destination.channelCountMode = 'explicit';
        destination.channelInterpretation = 'discrete';
        this.hapticChannels = context.createChannelMerger(4);
        this.hapticChannels.connect(destination);
      }
      console.warn(`[haptics] PS5 controller as audio device: ${destination.maxChannelCount} channels, ${this.hapticChannels ? 'haptic channels 3 and 4' : 'no haptic channels (stereo only)'}`);
    }
    return context;
  }

  /** The chosen audio output is a PS5 controller (its USB audio). */
  isControllerAudio(device: string): boolean {
    const label = this.outputs().find((o) => o.id === device)?.label ?? '';
    return /wireless controller|dualsense/i.test(label);
  }

  /** Left side: the strong (left) motor, right side: the weak (right) motor, both: both. */
  private rumble(event: HapticEvent, minPause: number): void {
    for (const pulse of forMotors(event.pulses, minPause)) {
      const left = event.side === 'right' ? 0 : pulse.strength;
      const right = event.side === 'left' ? 0 : pulse.strength;
      // A new effect replaces the one running, so every pulse starts on its own.
      this.rumbles.push(
        setTimeout(() => {
          void this.dualsense?.rumble(left, right).catch(() => undefined);
          for (const pad of rumblingGamepads()) {
            void pad.vibrationActuator!.playEffect('dual-rumble', { duration: pulse.duration, strongMagnitude: left, weakMagnitude: right }).catch(() => undefined);
          }
        }, pulse.at),
      );
      // The PS5 controller vibrates until it is told to stop.
      if (this.dualsense) this.rumbles.push(setTimeout(() => void this.dualsense?.rumble(0, 0).catch(() => undefined), pulse.at + pulse.duration));
    }
  }
}

/**
 * A controller's motors (and the PS5 controller's imitation of them) need time to spin up and run on after a
 * pulse: shorter pulses are hardly felt, shorter pauses blur ("three short" felt like one long, then like two).
 * Pulses get at least this long and pauses at least the driver's setting; the pulses after a lengthened one
 * move back.
 */
const MOTOR_MIN_PULSE_MS = 150;

function forMotors(pulses: readonly HapticPulse[], minPause: number): HapticPulse[] {
  let shift = 0;
  let end = -Infinity;
  return pulses.map((p) => {
    const at = Math.max(p.at + shift, end + minPause);
    shift = at - p.at;
    const duration = Math.max(MOTOR_MIN_PULSE_MS, p.duration);
    end = at + duration;
    return { ...p, at, duration };
  });
}

function connectedGamepads(): Gamepad[] {
  return (navigator.getGamepads?.() ?? []).filter((pad): pad is Gamepad => !!pad?.connected);
}

/** Has a rumble motor the browser can drive (newer browsers list the effects a controller supports). */
function canRumble(pad: Gamepad): boolean {
  const actuator = pad.vibrationActuator as (GamepadHapticActuator & { effects?: string[] }) | null;
  return !!actuator && (!actuator.effects || actuator.effects.includes('dual-rumble'));
}

/** "DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" → "DualSense Wireless Controller". */
function gamepadName(id: string): string {
  return id.replace(/\s*\((STANDARD GAMEPAD|Vendor)[^)]*\)\s*$/i, '').trim() || id;
}

function rumblingGamepads(): Gamepad[] {
  return connectedGamepads().filter(canRumble);
}
