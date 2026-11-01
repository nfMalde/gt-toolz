import { Component, inject } from '@angular/core';
import { I18n } from '@shell/i18n/i18n';
import { SettingsStore } from '@shell/stores/settings.store';
import { Icon } from '@shell/ui/icon';
import { Toggle } from '@shell/ui/toggle';
import { HapticDevice } from '../pages/vibration/haptic-device';

/**
 * The setup assistant: vibration for drivers who hear badly (experimental). Shown also while the module is off: its
 * switch is the module's.
 */
@Component({
  selector: 'gtt-haptics-step',
  imports: [Icon, HapticDevice, Toggle],
  template: `
    <section class="step two-col">
      <div class="col">
        <div class="step-icon"><gtt-icon name="vibrate" [size]="26" /></div>
        <h1>{{ t('haptics.guide.haptics.title') }} <span class="chip warn">{{ t('haptics.experimental') }}</span></h1>
        <p class="muted">{{ t('haptics.guide.haptics.text') }}</p>
        <ul class="checklist">
          <li><gtt-icon name="vibrate" [size]="16" />{{ t('haptics.guide.haptics.check1') }}</li>
          <li><gtt-icon name="gamepad" [size]="16" />{{ t('haptics.guide.haptics.check2') }}</li>
          <li><gtt-icon name="heart" [size]="16" />{{ t('haptics.guide.haptics.check3') }}</li>
        </ul>
      </div>
      <div class="col">
        <div class="field toggle-field">
          <div>
            <span class="label">{{ t('haptics.enable') }}</span>
            <span class="faint small">{{ t('haptics.guide.haptics.enableHint') }}</span>
          </div>
          <gtt-toggle [checked]="settings.moduleEnabled('haptics')" [label]="t('haptics.enable')" (checkedChange)="settings.setModuleEnabled('haptics', $event)" />
        </div>
        @if (settings.moduleEnabled('haptics')) {
          <gtt-haptic-device />
        } @else {
          <p class="faint small">{{ t('haptics.guide.haptics.skip') }}</p>
        }
      </div>
    </section>
  `,
})
export class HapticsStep {
  protected readonly settings = inject(SettingsStore);
  protected readonly t = inject(I18n).t;
}
