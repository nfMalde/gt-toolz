import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { LinkId } from '@gtt/api';
import { HAPTIC_CUES, type HapticCue, type HapticPattern, type HapticPatternRef } from '@gt-toolz/haptics/api';
import { GTT } from '@shell/core/gtt';
import { hapticOutputKey, HapticPlayer } from '../../core/haptic-player';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { HapticsStore } from '../../stores/haptics.store';
import { CustomPatterns } from './custom-patterns';
import { HapticDevice } from './haptic-device';

/** Patterns offered per cue; 'number' only where there is a number (countdown, gear). */
const PATTERNS: HapticPattern[] = ['off', 'tap', 'double', 'triple', 'long', 'rise', 'fall', 'heartbeat'];
const WITH_NUMBER: HapticCue[] = ['count', 'gear'];

/**
 * Accessibility: the braking points as vibration, for drivers who hear badly or not at all. Experimental;
 * the page asks for feedback. Device, strength and a pattern per cue; every pattern can be felt right here.
 */
@Component({
  selector: 'gtt-accessibility',
  imports: [CustomPatterns, Icon, HapticDevice],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('haptics.eyebrow') }}</div>
          <h1>{{ t('haptics.title') }} <span class="chip warn">{{ t('haptics.experimental') }}</span></h1>
        </div>
      </div>

      <section class="hero on">
        <div class="hero-icon" [class.pulse]="pulsing()"><gtt-icon name="vibrate" [size]="40" /></div>
        <div class="hero-text">
          <h2>{{ t('haptics.heroTitle') }}</h2>
          <p>{{ t('haptics.heroText') }}</p>
          @if (feltLabel(); as label) {
            <p class="felt small">{{ t('haptics.felt', { cue: label }) }}</p>
          }
          @if (!verified()) {
            <p class="untested small">{{ t('haptics.enabledUntested') }}</p>
          }
        </div>
      </section>

      <div class="banner info feedback">
        <gtt-icon name="heart" />
        <div class="grow">
          <b>{{ t('haptics.feedbackTitle') }}</b>
          <div>{{ t('haptics.feedbackText') }}</div>
        </div>
        @if (links()['issues']) {
          <button type="button" class="btn sm" (click)="openLink('issues')"><gtt-icon name="external" [size]="14" />{{ t('haptics.feedbackButton') }}</button>
        }
      </div>

      <div class="columns">
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="vibrate" /></div>
            <h2>{{ t('haptics.deviceTitle') }}</h2>
          </div>
          <gtt-haptic-device />
        </section>

        <div class="stack">
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="sliders" /></div>
            <h2>{{ t('haptics.patterns') }}</h2>
          </div>
          @if (!verified()) {
            <div class="locked">
              <gtt-icon name="vibrate" [size]="22" />
              <span>{{ t('haptics.patternsLocked') }}</span>
            </div>
          } @else {
          <p class="faint small">{{ t('haptics.patternsHint') }}</p>
          @for (cue of cues; track cue) {
            <div class="setting">
              <div class="text">
                <div class="title">{{ cueLabel(cue) }}</div>
                <div class="hint">{{ cueHint(cue) }}</div>
              </div>
              <div class="control">
                <select class="input" [value]="pattern(cue)" (change)="setPattern(cue, $event)" [attr.aria-label]="cueLabel(cue)">
                  @for (p of patternsFor(cue); track p) {
                    <option [value]="p" [selected]="p === pattern(cue)">{{ patternLabel(p) }}</option>
                  }
                  @if (custom().length) {
                    <optgroup [label]="t('haptics.custom.title')">
                      @for (c of custom(); track c.id) {
                        <option [value]="'custom:' + c.id" [selected]="pattern(cue) === 'custom:' + c.id">{{ c.name }}</option>
                      }
                    </optgroup>
                  }
                </select>
                <button type="button" class="btn sm ghost icon-only" [title]="t('haptics.feel')" [disabled]="pattern(cue) === 'off'" (click)="test(cue)">
                  <gtt-icon name="vibrate" [size]="15" />
                </button>
              </div>
            </div>
          }
          }
        </section>

        @if (verified()) {
          <section class="card">
            <div class="card-header">
              <div class="card-icon accent"><gtt-icon name="sparkle" /></div>
              <h2>{{ t('haptics.custom.title') }}</h2>
            </div>
            <gtt-custom-patterns />
          </section>
        }
        </div>
      </div>

      <div class="columns">
        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="headphones" /></div>
            <h2>{{ t('haptics.devicesTitle') }}</h2>
          </div>
          <ul class="devices">
            @for (item of devices; track item.title) {
              <li>
                <b>{{ t(item.title) }}</b>
                <span class="muted small">{{ t(item.text) }}</span>
              </li>
            }
          </ul>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="timer" /></div>
            <h2>{{ t('haptics.tipsTitle') }}</h2>
          </div>
          <ul class="tips">
            <li>
              <span>{{ t('haptics.tipCalibrate') }}</span>
              <button type="button" class="btn sm" (click)="settings.openGuide('calibrate')"><gtt-icon name="timer" [size]="14" />{{ t('coach.nav.calibrate') }}</button>
            </li>
            <li><span>{{ t('haptics.tipMute') }}</span></li>
            <li><span>{{ t('haptics.tipScreen') }}</span></li>
          </ul>
        </section>
      </div>
    </div>
  `,
  styles: `
    h1 .chip { vertical-align: 4px; margin-left: 6px; }
    .hero {
      display: flex; align-items: center; gap: 22px; padding: 26px 28px; border-radius: 20px;
      border: 1px solid rgba(var(--accent-rgb), .35);
      background: radial-gradient(700px 260px at 0% 0%, rgba(var(--accent-rgb), .18), transparent 70%), linear-gradient(180deg, var(--surface-2), var(--surface));
    }
    .hero.on { border-color: rgba(52, 211, 153, .45); }
    .hero-icon {
      flex: none; width: 84px; height: 84px; border-radius: 24px; display: grid; place-items: center; color: var(--on-accent);
      background: var(--accent-gradient); box-shadow: 0 16px 40px -16px rgba(var(--accent-rgb), .7);
    }
    .hero-icon.pulse { animation: buzz .45s linear; }
    @keyframes buzz {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-3px) rotate(-2deg); }
      40% { transform: translateX(3px) rotate(2deg); }
      60% { transform: translateX(-2px); }
      80% { transform: translateX(2px); }
    }
    .hero-text { flex: 1; min-width: 0; }
    .hero-text h2 { margin: 0 0 6px; font-size: 22px; }
    .hero-text p { margin: 0; color: var(--text-2); max-width: 720px; }
    .hero-text .felt { margin-top: 8px; color: var(--ok); }
    .hero-text .untested { margin-top: 8px; color: var(--warn); }
    .locked { display: flex; align-items: center; gap: 12px; padding: 18px; border-radius: 12px; border: 1px dashed var(--border-strong); color: var(--text-2); }
    .feedback { align-items: flex-start; }
    .feedback b { display: block; margin-bottom: 2px; }
    .grow { flex: 1; }
    .stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 1100px) { .columns { grid-template-columns: 1fr; } .hero { flex-wrap: wrap; } }
    .control { display: flex; align-items: center; gap: 6px; }
    select.input { min-width: 170px; }
    .devices, .tips { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .devices li { display: flex; flex-direction: column; gap: 2px; }
    .tips li { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-2); font-size: 13.5px; }
  `,
})
export class Accessibility {
  protected readonly settings = inject(SettingsStore);
  private readonly store = inject(HapticsStore);
  private readonly player = inject(HapticPlayer);
  private readonly gtt = inject(GTT);
  protected readonly t = inject(I18n).t;

  protected readonly cues = HAPTIC_CUES;
  protected readonly devices: { title: TextKey; text: TextKey }[] = [
    { title: 'haptics.devices.shaker', text: 'haptics.devices.shakerText' },
    { title: 'haptics.devices.vest', text: 'haptics.devices.vestText' },
    { title: 'haptics.devices.headset', text: 'haptics.devices.headsetText' },
    { title: 'haptics.devices.gamepad', text: 'haptics.devices.gamepadText' },
    { title: 'haptics.devices.band', text: 'haptics.devices.bandText' },
  ];
  protected readonly links = signal<Partial<Record<LinkId, string>>>({});

  /** Patterns are offered once the device test passed for the chosen output. */
  protected readonly verified = computed(() => {
    const haptics = this.store.settings();
    return !!haptics && haptics.verified === hapticOutputKey(haptics);
  });
  /** The icon shakes for each pattern that is played, so it can be followed without a device too. */
  protected readonly pulsing = signal(false);
  protected readonly feltLabel = computed(() => {
    const felt = this.player.felt();
    return felt ? this.cueLabel(felt.cue) : null;
  });

  constructor() {
    void this.gtt.links().then((links) => this.links.set(links));
    let timer: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      if (!this.player.felt()) return;
      untracked(() => {
        // Restart the animation: off, then on in the next frame.
        this.pulsing.set(false);
        clearTimeout(timer);
        requestAnimationFrame(() => this.pulsing.set(true));
        timer = setTimeout(() => this.pulsing.set(false), 500);
      });
    });
  }

  /** The driver's own patterns, offered for every cue. */
  protected readonly custom = computed(() => this.store.settings()?.custom ?? []);

  protected pattern(cue: HapticCue): HapticPatternRef {
    return this.store.settings()?.patterns[cue] ?? 'off';
  }

  protected patternsFor(cue: HapticCue): HapticPattern[] {
    return WITH_NUMBER.includes(cue) ? [...PATTERNS, 'number'] : PATTERNS;
  }

  protected setPattern(cue: HapticCue, event: Event): void {
    const haptics = this.store.settings();
    if (!haptics) return;
    const value = (event.target as HTMLSelectElement).value as HapticPatternRef;
    void this.store.update({ patterns: { ...haptics.patterns, [cue]: value } });
  }

  protected test(cue: HapticCue): void {
    void this.store.test(cue);
  }

  protected openLink(id: LinkId): void {
    void this.gtt.openLink(id);
  }

  protected cueLabel(cue: HapticCue): string {
    return this.t(`haptics.cue.${cue}` as TextKey);
  }

  protected cueHint(cue: HapticCue): string {
    return this.t(`haptics.cue.${cue}.hint` as TextKey);
  }

  protected patternLabel(pattern: HapticPattern): string {
    return this.t(`haptics.pattern.${pattern}` as TextKey);
  }
}
