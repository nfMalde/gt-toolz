import { Component, input, model } from '@angular/core';

/** On/off switch. */
@Component({
  selector: 'gtt-toggle',
  template: `
    <button type="button" role="switch" class="switch focusable" [class.on]="checked()" [attr.aria-checked]="checked()"
            [attr.aria-label]="label()" [disabled]="disabled()" (click)="checked.set(!checked())">
      <span class="knob"></span>
    </button>
  `,
  styles: `
    .switch {
      width: 44px; height: 26px; border-radius: 26px; border: 1px solid var(--border-strong);
      background: var(--surface-3); position: relative; cursor: pointer; padding: 0;
      transition: background .18s, border-color .18s;
    }
    .switch.on { background: var(--accent-gradient); border-color: transparent; box-shadow: var(--accent-glow); }
    .switch:disabled { opacity: .45; cursor: default; }
    .knob {
      position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.4); transition: transform .18s cubic-bezier(.3,.7,.4,1.2);
    }
    .on .knob { transform: translateX(18px); }
  `,
})
export class Toggle {
  readonly checked = model(false);
  readonly label = input('');
  readonly disabled = input(false);
}
