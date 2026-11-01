import { Component, computed, inject, signal } from '@angular/core';
import { MAX_CUSTOM_HAPTIC_PATTERNS, MAX_CUSTOM_HAPTIC_PULSES, type CustomHapticPattern, type CustomHapticPulse, type HapticPulse } from '@gt-toolz/haptics/api';
import { HapticPlayer } from '../../core/haptic-player';
import { HapticsStore } from '../../stores/haptics.store';
import { I18n } from '@shell/i18n/i18n';
import { Icon } from '@shell/ui/icon';
import { Slider } from '@shell/ui/slider';

/** Longer than this, a pattern would push the next countdown number back (one per second). */
const COUNTDOWN_MS = 900;

/** One piece of the drawing: a pulse (height = strength) or a pause; width = length. */
interface Segment {
  pulse: boolean;
  ms: number;
  strength: number;
}

/** The pulses one after another, as the coach plays them (the last pause does not count). */
function toPulses(pulses: readonly CustomHapticPulse[]): HapticPulse[] {
  let at = 0;
  return pulses.map((p) => {
    const pulse = { at, duration: p.duration, strength: p.strength };
    at += p.duration + p.pause;
    return pulse;
  });
}

function totalMs(pulses: readonly CustomHapticPulse[]): number {
  return pulses.reduce((sum, p, i) => sum + p.duration + (i < pulses.length - 1 ? p.pause : 0), 0);
}

function segments(pulses: readonly CustomHapticPulse[]): Segment[] {
  return pulses.flatMap((p, i) => [
    { pulse: true, ms: p.duration, strength: p.strength },
    ...(i < pulses.length - 1 && p.pause > 0 ? [{ pulse: false, ms: p.pause, strength: 0 }] : []),
  ]);
}

/**
 * The driver's own vibration patterns: up to eight pulses, each with its length, strength and the pause after
 * it, drawn as bars and felt before saving. They are offered for every cue and play exactly as designed.
 */
@Component({
  selector: 'gtt-custom-patterns',
  imports: [Icon, Slider],
  template: `
    <p class="faint small">{{ t('haptics.custom.hint') }}</p>

    <div class="list">
      @for (pattern of patterns(); track pattern.id) {
        <div class="item" [class.editing]="draft()?.id === pattern.id">
          <div class="viz">
            @for (seg of segmentsOf(pattern.pulses); track $index) {
              <span class="seg" [class.pulse]="seg.pulse" [style.flex-grow]="seg.ms" [style.height.%]="seg.pulse ? 30 + seg.strength * 70 : 0"></span>
            }
          </div>
          <div class="item-text">
            <b>{{ pattern.name }}</b>
            <span class="faint small">{{ t('haptics.custom.total', { ms: total(pattern.pulses) }) }}</span>
          </div>
          <button type="button" class="btn sm ghost icon-only" [title]="t('haptics.custom.feel')" (click)="feel(pattern.pulses)"><gtt-icon name="vibrate" [size]="15" /></button>
          <button type="button" class="btn sm ghost" (click)="edit(pattern)">{{ t('haptics.custom.edit') }}</button>
          <button type="button" class="btn sm ghost icon-only" [title]="t('haptics.custom.delete')" (click)="remove(pattern)"><gtt-icon name="trash" [size]="15" /></button>
        </div>
      } @empty {
        @if (!draft()) {
          <p class="faint small">{{ t('haptics.custom.none') }}</p>
        }
      }
    </div>

    @if (draft(); as d) {
      <div class="editor">
        <div class="field">
          <label for="pattern-name">{{ t('haptics.custom.name') }}</label>
          <input id="pattern-name" class="input" maxlength="30" spellcheck="false" [value]="d.name" (input)="rename($event)" />
        </div>

        <div class="viz big" aria-hidden="true">
          @for (seg of segmentsOf(d.pulses); track $index) {
            <span class="seg" [class.pulse]="seg.pulse" [style.flex-grow]="seg.ms" [style.height.%]="seg.pulse ? 30 + seg.strength * 70 : 0"></span>
          }
        </div>
        <div class="total faint small">
          {{ t('haptics.custom.total', { ms: total(d.pulses) }) }}
          @if (total(d.pulses) > countdownMs) { · <span class="warn-text">{{ t('haptics.custom.longHint') }}</span> }
        </div>

        @for (pulse of d.pulses; track $index; let i = $index; let last = $last) {
          <div class="pulse">
            <span class="num">{{ i + 1 }}</span>
            <div class="sliders">
              <div class="slider-row">
                <span class="small">{{ t('haptics.custom.length') }}</span>
                <gtt-slider [value]="pulse.duration" [min]="30" [max]="1000" [step]="10" [format]="ms" [label]="t('haptics.custom.length')"
                            (changed)="setPulse(i, 'duration', $event)" />
              </div>
              <div class="slider-row">
                <span class="small">{{ t('haptics.custom.strength') }}</span>
                <gtt-slider [value]="pulse.strength" [min]="0.1" [max]="1" [step]="0.05" [format]="percent" [label]="t('haptics.custom.strength')"
                            (changed)="setPulse(i, 'strength', $event)" />
              </div>
              @if (!last) {
                <div class="slider-row">
                  <span class="small">{{ t('haptics.custom.pause') }}</span>
                  <gtt-slider [value]="pulse.pause" [min]="0" [max]="1000" [step]="10" [format]="ms" [label]="t('haptics.custom.pause')"
                              (changed)="setPulse(i, 'pause', $event)" />
                </div>
              }
            </div>
            <button type="button" class="btn sm ghost icon-only" [title]="t('haptics.custom.removePulse')" [disabled]="d.pulses.length === 1" (click)="removePulse(i)">
              <gtt-icon name="x" [size]="15" />
            </button>
          </div>
        }

        <div class="row">
          <button type="button" class="btn sm" [disabled]="d.pulses.length >= maxPulses" (click)="addPulse()">{{ t('haptics.custom.addPulse') }}</button>
          <span class="spacer"></span>
          <button type="button" class="btn" (click)="feel(d.pulses)"><gtt-icon name="vibrate" [size]="16" />{{ t('haptics.custom.feel') }}</button>
          <button type="button" class="btn ghost" (click)="draft.set(null)">{{ t('common.cancel') }}</button>
          <button type="button" class="btn primary" [disabled]="!d.name.trim()" (click)="save()">{{ t('haptics.custom.save') }}</button>
        </div>
      </div>
    } @else {
      <div class="row">
        <button type="button" class="btn" [disabled]="patterns().length >= maxPatterns" (click)="create()">
          <gtt-icon name="sparkle" [size]="16" />{{ t('haptics.custom.new') }}
        </button>
        @if (patterns().length >= maxPatterns) {
          <span class="faint small">{{ t('haptics.custom.max', { n: maxPatterns }) }}</span>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 12px; }
    p { margin: 0; }
    .list { display: flex; flex-direction: column; gap: 6px; }
    .item { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); }
    .item.editing { border-color: rgba(var(--accent-rgb), .45); }
    .item-text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .viz { flex: none; width: 120px; height: 28px; display: flex; align-items: flex-end; gap: 0; padding: 3px; border-radius: 8px; background: var(--surface-2); }
    .viz.big { width: 100%; height: 56px; }
    .seg { min-width: 2px; border-radius: 3px; }
    .seg.pulse { background: var(--accent-gradient); }
    .editor { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 14px; border: 1px solid rgba(var(--accent-rgb), .45); background: var(--bg-elevated); }
    .total { margin-top: -6px; }
    .warn-text { color: var(--warn); }
    .pulse { display: flex; align-items: flex-start; gap: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
    .num { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); font-size: 12px; font-weight: 700; margin-top: 2px; }
    .sliders { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .slider-row { display: grid; grid-template-columns: 110px 1fr; align-items: center; gap: 10px; color: var(--text-2); }
    .row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .spacer { flex: 1; }
  `,
})
export class CustomPatterns {
  private readonly store = inject(HapticsStore);
  private readonly player = inject(HapticPlayer);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly maxPatterns = MAX_CUSTOM_HAPTIC_PATTERNS;
  protected readonly maxPulses = MAX_CUSTOM_HAPTIC_PULSES;
  protected readonly countdownMs = COUNTDOWN_MS;
  protected readonly patterns = computed(() => this.store.settings()?.custom ?? []);
  /** The pattern being designed (a copy until saved). */
  protected readonly draft = signal<CustomHapticPattern | null>(null);

  protected readonly ms = (value: number) => `${value} ms`;
  protected readonly percent = (value: number) => `${Math.round(value * 100)} %`;
  protected readonly segmentsOf = segments;
  protected readonly total = totalMs;

  protected create(): void {
    const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    this.draft.set({
      id,
      name: this.t('haptics.custom.newName', { n: this.patterns().length + 1 }),
      pulses: [
        { duration: 150, strength: 1, pause: 200 },
        { duration: 150, strength: 1, pause: 0 },
      ],
    });
  }

  protected edit(pattern: CustomHapticPattern): void {
    this.draft.set(structuredClone(pattern));
  }

  protected rename(event: Event): void {
    const name = (event.target as HTMLInputElement).value;
    this.draft.update((d) => d && { ...d, name });
  }

  protected setPulse(index: number, field: keyof CustomHapticPulse, value: number): void {
    this.draft.update((d) => d && { ...d, pulses: d.pulses.map((p, i) => (i === index ? { ...p, [field]: value } : p)) });
  }

  protected addPulse(): void {
    this.draft.update((d) => {
      if (!d || d.pulses.length >= MAX_CUSTOM_HAPTIC_PULSES) return d;
      const last = d.pulses.at(-1)!;
      // The pulse before the new one needs a pause to be felt apart.
      const pulses = [...d.pulses.slice(0, -1), { ...last, pause: last.pause || 200 }, { ...last, pause: 0 }];
      return { ...d, pulses };
    });
  }

  protected removePulse(index: number): void {
    this.draft.update((d) => (d && d.pulses.length > 1 ? { ...d, pulses: d.pulses.filter((_, i) => i !== index) } : d));
  }

  protected feel(pulses: readonly CustomHapticPulse[]): void {
    void this.player.preview(toPulses(pulses));
  }

  protected save(): void {
    const draft = this.draft();
    if (!draft) return;
    const pattern = { ...draft, name: draft.name.trim(), pulses: draft.pulses.map((p, i) => (i === draft.pulses.length - 1 ? { ...p, pause: 0 } : p)) };
    const custom = this.patterns();
    const next = custom.some((c) => c.id === pattern.id) ? custom.map((c) => (c.id === pattern.id ? pattern : c)) : [...custom, pattern];
    void this.store.update({ custom: next });
    this.draft.set(null);
  }

  /** Cues that used it go back to their suggested pattern (the main process does that on the next save). */
  protected remove(pattern: CustomHapticPattern): void {
    if (this.draft()?.id === pattern.id) this.draft.set(null);
    void this.store.update({ custom: this.patterns().filter((c) => c.id !== pattern.id) });
  }
}
