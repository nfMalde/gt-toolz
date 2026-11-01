import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { hapticOutputKey, HapticPlayer, type DeviceProblem } from '../../core/haptic-player';
import { StreamerMode } from '@shell/core/streamer';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { HapticsStore } from '../../stores/haptics.store';

const TIPS: Record<'audio' | 'gamepad', TextKey[]> = {
  audio: ['haptics.tips.audio1', 'haptics.tips.audio2', 'haptics.tips.audio3', 'haptics.tips.audio4'],
  gamepad: ['haptics.tips.gamepad1', 'haptics.tips.gamepad2', 'haptics.tips.gamepad3', 'haptics.tips.gamepad4'],
};

/**
 * The device test, before anything else: is the device there and able to vibrate, and does the driver feel
 * it? Only a confirmed test unlocks the patterns, so nobody fine-tunes a device that does not work.
 */
@Component({
  selector: 'gtt-haptic-test',
  imports: [Icon],
  template: `
    <div class="check" [class.ok]="verified() && state() === 'idle'" [class.bad]="state() === 'failed' || state() === 'problem'">
      <div class="head">
        <div class="icon"><gtt-icon [name]="verified() ? 'check' : 'vibrate'" [size]="20" /></div>
        <div class="grow">
          <div class="title-row">
            <b>{{ t('haptics.check.title') }}</b>
            <span class="chip" [class.ok]="verified()" [class.warn]="!verified()">{{ verified() ? t('haptics.check.tested') : t('haptics.check.untested') }}</span>
          </div>
          <p class="faint small">{{ t('haptics.check.text') }}</p>
        </div>
      </div>

      @switch (state()) {
        @case ('running') {
          <p class="status"><gtt-icon name="vibrate" [size]="16" />{{ t('haptics.check.running') }}</p>
        }
        @case ('ask') {
          @if (connected(); as name) {
            <p class="faint small">{{ t('haptics.check.connected', { name: streamer.enabled() ? t('streamer.hiddenShort') : name }) }}</p>
          }
          <b class="question">{{ t('haptics.check.ask') }}</b>
          <div class="row">
            <button type="button" class="btn primary" (click)="answer(true)"><gtt-icon name="check" [size]="16" />{{ t('haptics.check.yes') }}</button>
            <button type="button" class="btn" (click)="answer(false)"><gtt-icon name="x" [size]="16" />{{ t('haptics.check.no') }}</button>
            <button type="button" class="btn ghost" (click)="run()"><gtt-icon name="refresh" [size]="16" />{{ t('haptics.check.again') }}</button>
          </div>
        }
        @case ('problem') {
          <p class="problem"><gtt-icon name="alert" [size]="16" />{{ problemText() }}</p>
          <ul class="tips">
            @for (tip of tips(); track tip) { <li>{{ t(tip) }}</li> }
          </ul>
          <div class="row"><button type="button" class="btn primary" (click)="run()"><gtt-icon name="refresh" [size]="16" />{{ t('haptics.check.again') }}</button></div>
        }
        @case ('failed') {
          <p class="problem"><gtt-icon name="alert" [size]="16" />{{ t('haptics.check.failed') }}</p>
          <ul class="tips">
            @for (tip of tips(); track tip) { <li>{{ t(tip) }}</li> }
          </ul>
          <div class="row"><button type="button" class="btn primary" (click)="run()"><gtt-icon name="refresh" [size]="16" />{{ t('haptics.check.again') }}</button></div>
        }
        @default {
          @if (verified()) {
            <div class="row">
              <span class="ok-text">{{ t('haptics.check.ok') }}</span>
              <button type="button" class="btn sm ghost" (click)="run()"><gtt-icon name="refresh" [size]="14" />{{ t('haptics.check.again') }}</button>
            </div>
          } @else {
            <div class="row">
              <button type="button" class="btn primary lg" (click)="run()"><gtt-icon name="vibrate" [size]="18" />{{ t('haptics.check.start') }}</button>
            </div>
          }
        }
      }

      @if (onDefault() && state() !== 'problem') {
        <p class="faint small note">{{ t('haptics.check.sameAsVoice') }}</p>
      }
    </div>
  `,
  styles: `
    .check { display: flex; flex-direction: column; gap: 12px; padding: 16px; margin: 10px 0; border-radius: 14px; border: 1px solid rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .08), transparent 75%); }
    .check.ok { border-color: rgba(52, 211, 153, .45); background: linear-gradient(90deg, rgba(52, 211, 153, .08), transparent 75%); }
    .check.bad { border-color: rgba(251, 72, 104, .45); background: linear-gradient(90deg, rgba(251, 72, 104, .08), transparent 75%); }
    .head { display: flex; gap: 12px; align-items: flex-start; }
    .icon { flex: none; width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; color: var(--on-accent); background: var(--accent-gradient); }
    .ok .icon { background: var(--ok); }
    .grow { flex: 1; min-width: 0; }
    .title-row { display: flex; align-items: center; gap: 8px; }
    p { margin: 4px 0 0; }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .status, .problem { display: flex; align-items: center; gap: 8px; margin: 0; font-weight: 600; }
    .status gtt-icon { animation: buzz .4s linear infinite; }
    @keyframes buzz { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2px); } 75% { transform: translateX(2px); } }
    .problem { color: #ffc2cd; }
    .question { font-size: 15px; }
    .tips { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; color: var(--text-2); font-size: 13px; }
    .ok-text { color: var(--ok); font-weight: 600; flex: 1; }
    .note { margin: 0; }
  `,
})
export class HapticTest {
  private readonly store = inject(HapticsStore);
  private readonly player = inject(HapticPlayer);
  protected readonly streamer = inject(StreamerMode);
  protected readonly t = inject(I18n).t;

  protected readonly state = signal<'idle' | 'running' | 'ask' | 'failed' | 'problem'>('idle');
  private readonly problem = signal<DeviceProblem | null>(null);
  /** The device the test reached (shown with the question). */
  protected readonly connected = signal('');

  private readonly haptics = computed(() => this.store.settings());
  private readonly key = computed(() => {
    const haptics = this.haptics();
    return haptics ? hapticOutputKey(haptics) : '';
  });
  protected readonly verified = computed(() => !!this.key() && this.haptics()?.verified === this.key());
  protected readonly onDefault = computed(() => this.haptics()?.output === 'audio' && !this.haptics()?.audioDevice);
  protected readonly tips = computed(() => TIPS[this.haptics()?.output ?? 'audio']);
  protected readonly problemText = computed(() => (this.problem() ? this.t(`haptics.check.problem.${this.problem()}` as TextKey) : ''));

  constructor() {
    // Another output or device: a test still running or answered is about the old one.
    effect(() => {
      this.key();
      untracked(() => this.state.set('idle'));
    });
  }

  protected async run(): Promise<void> {
    const haptics = this.haptics();
    if (!haptics) return;
    this.state.set('running');
    this.problem.set(null);
    const result = await this.player.check(haptics);
    if (!result.ok) {
      this.problem.set(result.problem);
      this.state.set('problem');
      return;
    }
    this.connected.set(result.name || (haptics.output === 'audio' ? this.t('haptics.deviceDefault') : ''));
    // The three pulses take about 1.7 s; the question comes once they are over.
    await new Promise((resolve) => setTimeout(resolve, 1800));
    if (this.state() === 'running') this.state.set('ask');
  }

  /** Felt: this output is confirmed. Not felt: what to check. */
  protected answer(felt: boolean): void {
    if (!felt) {
      this.state.set('failed');
      return;
    }
    void this.store.update({ verified: this.key() });
    this.state.set('idle');
  }
}
