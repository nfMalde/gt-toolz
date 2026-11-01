import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import type { HapticOutput } from '@gt-toolz/haptics/api';
import { hapticOutputKey, HapticPlayer } from '../../core/haptic-player';
import { Reveal, StreamerMode } from '@shell/core/streamer';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Slider } from '@shell/ui/slider';
import { Toggle } from '@shell/ui/toggle';
import { HapticsStore } from '../../stores/haptics.store';
import { HapticTest } from './haptic-test';

/**
 * Where the vibration goes, the device test, and (once the device works) strength, sides and a whole
 * braking zone to feel. Accessibility page and setup assistant.
 */
@Component({
  selector: 'gtt-haptic-device',
  imports: [HapticTest, Icon, Segmented, Slider, Toggle],
  template: `
    @if (haptics(); as h) {
      <div class="setting">
        <div class="text">
          <div class="title">{{ t('haptics.output') }}</div>
          <div class="hint">{{ h.output === 'audio' ? t('haptics.output.audioHint') : t('haptics.output.gamepadHint') }}</div>
        </div>
        <div class="control">
          <gtt-segmented [options]="outputOptions()" [value]="h.output" (valueChange)="store.update({ output: $event })" />
        </div>
      </div>

      @if (h.output === 'audio') {
        <div class="setting">
          <div class="text">
            <div class="title">{{ t('haptics.device') }}</div>
            <div class="hint">{{ t('haptics.deviceHint') }}</div>
          </div>
          <div class="control device-row">
            <select class="input" [value]="h.audioDevice" (change)="store.update({ audioDevice: selectValue($event) })" [attr.aria-label]="t('haptics.device')">
              <option value="">{{ t('haptics.deviceDefault') }}</option>
              @for (device of player.outputs(); track device.id; let i = $index) {
                <!-- Streamer mode: Bluetooth names often carry the owner's name ("AirPods von …"). -->
                <option [value]="device.id" [selected]="device.id === h.audioDevice">{{ devices.hidden() ? t('haptics.streamer.device', { n: i + 1 }) : device.label }}</option>
              }
            </select>
            @if (streamer.enabled()) {
              <button type="button" class="btn ghost icon-only" [title]="devices.hidden() ? t('streamer.hidden') : t('streamer.hide')"
                      [attr.aria-label]="devices.hidden() ? t('streamer.hidden') : t('streamer.hide')" (click)="devices.toggle()">
                <gtt-icon [name]="devices.hidden() ? 'eye' : 'eyeOff'" [size]="16" />
              </button>
            }
          </div>
        </div>
        @if (player.outputMissing()) {
          <div class="banner warn"><gtt-icon name="alert" /><span>{{ t('haptics.deviceMissing') }}</span></div>
        }
        @if (player.isControllerAudio(h.audioDevice)) {
          <div class="banner info"><gtt-icon name="gamepad" /><span>{{ t('haptics.controllerAudio') }}</span></div>
        }
      } @else {
        <div class="gamepads" [class.found]="rumbling()" [class.partial]="player.gamepads().length && !rumbling()">
          <gtt-icon [name]="rumbling() ? 'check' : player.gamepads().length ? 'alert' : 'gamepad'" [size]="18" />
          <div class="pads">
            @for (pad of player.gamepads(); track pad.id) {
              <div>
                <b>{{ pad.rumble ? t('haptics.gamepadFound', { name: pad.name }) : t('haptics.gamepadNoRumble', { name: pad.name }) }}</b>
                <div class="faint small id">{{ pad.id }}</div>
              </div>
            } @empty {
              <b>{{ t('haptics.gamepadNone') }}</b>
            }
            <div class="faint small">{{ t('haptics.gamepadWindow') }}</div>
            @if (hasDualSense()) {
              <div class="faint small">{{ t('haptics.dualsenseAudioTip') }}</div>
            }
          </div>
        </div>
      }

      <!-- Right after choosing the device: does it work at all? -->
      <gtt-haptic-test />

      @if (h.output === 'audio') {
        <div class="setting">
          <div class="text">
            <div class="title">{{ t('haptics.frequency') }}</div>
            <div class="hint">{{ t('haptics.frequencyHint') }}</div>
          </div>
          <div class="control wide">
            <gtt-slider [value]="h.frequency" [min]="20" [max]="150" [step]="5" [format]="hertz" [label]="t('haptics.frequency')"
                        (changed)="store.update({ frequency: $event })" />
          </div>
        </div>
      }
      <div class="setting">
        <div class="text"><div class="title">{{ t('haptics.intensity') }}</div></div>
        <div class="control wide">
          <gtt-slider [value]="h.intensity" [min]="0.1" [max]="1" [step]="0.05" [format]="percent" [label]="t('haptics.intensity')"
                      (changed)="store.update({ intensity: $event })" />
        </div>
      </div>
      @if (verified()) {
      @if (h.output === 'gamepad') {
        <div class="setting">
          <div class="text">
            <div class="title">{{ t('haptics.controllerPause') }}</div>
            <div class="hint">{{ t('haptics.controllerPauseHint') }}</div>
          </div>
          <div class="control wide">
            <gtt-slider [value]="h.controllerPause" [min]="100" [max]="800" [step]="10" [format]="ms" [label]="t('haptics.controllerPause')"
                        (changed)="store.update({ controllerPause: $event })" />
          </div>
        </div>
      }
      <div class="setting">
        <div class="text">
          <div class="title">{{ t('haptics.tempo') }}</div>
          <div class="hint">{{ t('haptics.tempoHint') }}</div>
        </div>
        <div class="control wide">
          <gtt-slider [value]="h.tempo" [min]="1" [max]="2.5" [step]="0.1" [format]="factor" [label]="t('haptics.tempo')"
                      (changed)="store.update({ tempo: $event })" />
        </div>
      </div>
      <div class="setting">
        <div class="text">
          <div class="title">{{ t('haptics.directions') }}</div>
          <div class="hint">{{ t('haptics.directionsHint') }}</div>
        </div>
        <div class="control">
          <gtt-toggle [checked]="h.directions" [label]="t('haptics.directions')" (checkedChange)="store.update({ directions: $event })" />
        </div>
      </div>

      <div class="test">
        <button type="button" class="btn primary" [disabled]="testing()" (click)="testZone()">
          <gtt-icon name="vibrate" [size]="16" />{{ t('haptics.testZone') }}
        </button>
        <span class="faint small">{{ t('haptics.testZoneHint') }}</span>
      </div>
      }
    }
  `,
  styles: `
    .device-row { display: flex; align-items: center; gap: 6px; }
    :host { display: flex; flex-direction: column; }
    select.input { min-width: 240px; max-width: 320px; }
    .gamepads { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; margin: 8px 0; border-radius: 12px; border: 1px dashed var(--border-strong); }
    .gamepads.found { border-style: solid; border-color: rgba(52, 211, 153, .35); background: var(--ok-soft); }
    .gamepads.partial { border-style: solid; border-color: rgba(251, 191, 36, .35); background: var(--warn-soft); }
    .pads { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .id { word-break: break-all; }
    .test { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  `,
})
export class HapticDevice {
  protected readonly store = inject(HapticsStore);
  protected readonly player = inject(HapticPlayer);
  protected readonly streamer = inject(StreamerMode);
  /** The output devices' names, shown after the warning in streamer mode. */
  protected readonly devices = new Reveal();
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly haptics = computed(() => this.store.settings());
  /** The device test passed for this output: the rest is worth setting up. */
  protected readonly verified = computed(() => {
    const haptics = this.haptics();
    return !!haptics && haptics.verified === hapticOutputKey(haptics);
  });
  protected readonly testing = signal(false);
  protected readonly rumbling = computed(() => this.player.gamepads().some((pad) => pad.rumble));
  protected readonly hasDualSense = computed(() => this.player.gamepads().some((pad) => /dualsense/i.test(pad.name)));
  protected readonly outputOptions = computed<SegmentOption<HapticOutput>[]>(() => [
    { value: 'audio', label: this.t('haptics.output.audio') },
    { value: 'gamepad', label: this.t('haptics.output.gamepad') },
  ]);

  protected readonly hertz = (value: number) => `${value} Hz`;
  protected readonly percent = (value: number) => `${Math.round(value * 100)} %`;
  protected readonly factor = (value: number) => `${this.i18n.number(value, 1)}×`;
  protected readonly ms = (value: number) => `${value} ms`;

  constructor() {
    void this.player.listOutputs();
    this.player.listGamepads();
    // A controller shows up after a button press, without an event in every case: look every second.
    const timer = setInterval(() => this.player.listGamepads(), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected selectValue(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected async testZone(): Promise<void> {
    this.testing.set(true);
    try {
      await this.store.test('zone');
    } finally {
      this.testing.set(false);
    }
  }
}
