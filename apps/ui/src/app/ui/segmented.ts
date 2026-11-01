import { Component, input, model } from '@angular/core';

export interface SegmentOption<T> {
  value: T;
  label: string;
}

/** A row of mutually exclusive options. */
@Component({
  selector: 'gtt-segmented',
  template: `
    <div class="segmented" role="radiogroup">
      @for (option of options(); track option.value) {
        <button type="button" role="radio" class="focusable" [class.active]="option.value === value()"
                [attr.aria-checked]="option.value === value()" [disabled]="disabled()" (click)="value.set(option.value)">
          {{ option.label }}
        </button>
      }
    </div>
  `,
  styles: `
    .segmented {
      display: inline-flex; flex-wrap: wrap; padding: 3px; gap: 2px; border-radius: 11px;
      background: var(--bg-elevated); border: 1px solid var(--border);
    }
    button {
      appearance: none; border: 0; background: transparent; color: var(--text-2); font: inherit; font-size: 13px;
      font-weight: 600; height: 30px; padding: 0 12px; border-radius: 8px; cursor: pointer; white-space: nowrap;
      transition: background .15s, color .15s;
    }
    button:hover { color: var(--text); }
    button.active {
      background: var(--surface-3); color: var(--text);
      box-shadow: 0 1px 0 rgba(255,255,255,.06) inset, 0 2px 8px rgba(0,0,0,.35);
    }
    button.active::before {
      content: ""; display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--accent); margin-right: 7px; vertical-align: 1px;
    }
    button:disabled { opacity: .45; cursor: default; }
  `,
})
export class Segmented<T> {
  readonly options = input.required<SegmentOption<T>[]>();
  readonly value = model.required<T>();
  readonly disabled = input(false);
}
