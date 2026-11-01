import { Component, computed, input, linkedSignal, output } from '@angular/core';

/** Range slider with a filled track and its value next to it; emits when released. */
@Component({
  selector: 'gtt-slider',
  template: `
    <input type="range" [min]="min()" [max]="max()" [step]="step()" [value]="current()" [attr.aria-label]="label()"
           [style.--fill]="fill()" (input)="onInput($event)" (change)="onChange($event)" />
    <span class="value num">{{ format()(current()) }}</span>
  `,
  styles: `
    :host { display: flex; align-items: center; gap: 12px; width: 100%; }
    input { flex: 1; }
    .value { min-width: 56px; text-align: right; font-weight: 650; color: var(--text); }
  `,
})
export class Slider {
  readonly value = input.required<number>();
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly label = input('');
  /** Text for a value (shown next to the slider). */
  readonly format = input<(value: number) => string>((value) => String(value));
  readonly changed = output<number>();

  /** Follows the input, and the thumb while dragging. */
  protected readonly current = linkedSignal(() => this.value());
  protected readonly fill = computed(() => `${((this.current() - this.min()) / (this.max() - this.min() || 1)) * 100}%`);

  protected onInput(event: Event): void {
    this.current.set(Number((event.target as HTMLInputElement).value));
  }

  protected onChange(event: Event): void {
    this.changed.emit(Number((event.target as HTMLInputElement).value));
  }
}
