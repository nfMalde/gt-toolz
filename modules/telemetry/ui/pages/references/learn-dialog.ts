import { Component, computed, inject, output, signal } from '@angular/core';
import { carLabel, date } from '@shell/core/format';
import { I18n } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { ReferencesStore } from '../../stores/references.store';
import { Icon } from '@shell/ui/icon';
import { SecretField } from '@shell/ui/secret';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';

type Scope = 'keep' | 'all' | 'some';

/**
 * Starts learning a new reference. Optionally deletes existing data first: all references or the chosen
 * ones, or only their remembered mistakes. The button says what will happen; there is no undo.
 */
@Component({
  selector: 'gtt-learn-dialog',
  imports: [Icon, SecretField, Segmented],
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <section class="dialog" role="dialog" aria-modal="true" [attr.aria-label]="t('telemetry.learnDialog.title')">
      <header class="head">
        <div class="card-icon accent"><gtt-icon name="sparkle" /></div>
        <h2>{{ t('telemetry.learnDialog.title') }}</h2>
        <button type="button" class="btn ghost sm icon-only close" [title]="t('common.close')" (click)="closed.emit()"><gtt-icon name="x" /></button>
      </header>

      <div class="body">
        <p class="muted">{{ t('telemetry.learnDialog.text') }}</p>

        <div class="field">
          <label for="learn-driver">{{ t('telemetry.learnDialog.driver') }}</label>
          <gtt-secret-field>
            <input id="learn-driver" class="input" maxlength="60" spellcheck="false" [placeholder]="t('telemetry.refs.driverPlaceholder')"
                   [value]="driver()" (input)="driver.set(inputValue($event))" />
          </gtt-secret-field>
          <span class="faint small">{{ t('telemetry.learnDialog.driverHint') }}</span>
        </div>

        @if (store.list().length) {
          <div class="section">
            <div class="label">{{ t('telemetry.learnDialog.existing') }}</div>
            <gtt-segmented [options]="scopeOptions()" [value]="scope()" (valueChange)="scope.set($event)" />
          </div>

          @if (scope() === 'some') {
            <div class="pick-list">
              @for (ref of store.list(); track ref.id) {
                <button type="button" role="checkbox" class="pick focusable" [class.checked]="picked().has(ref.id)"
                        [attr.aria-checked]="picked().has(ref.id)" (click)="toggle(ref.id)">
                  <span class="check">@if (picked().has(ref.id)) { <gtt-icon name="check" [size]="13" [weight]="2.6" /> }</span>
                  <span class="pick-text">
                    <b>{{ ref.track ?? t('common.unknownTrack') }}</b>
                    <span class="faint small">{{ carLabel(ref) }} · {{ ref.lapTime }} · {{ when(ref.createdAt) }}</span>
                  </span>
                  @if (ref.id === coach.reference()?.id) { <span class="chip ok">{{ t('telemetry.refs.active') }}</span> }
                  @if (ref.remembered) { <span class="chip accent">{{ t('telemetry.refs.remembered', { n: ref.remembered }) }}</span> }
                </button>
              }
            </div>
          }

          @if (scope() !== 'keep') {
            <button type="button" role="checkbox" class="option focusable" [attr.aria-checked]="historyOnly()" (click)="historyOnly.set(!historyOnly())">
              <span class="check" [class.on]="historyOnly()">@if (historyOnly()) { <gtt-icon name="check" [size]="13" [weight]="2.6" /> }</span>
              {{ t('telemetry.learnDialog.historyOnly') }}
            </button>
            @if (targets().length) {
              <div class="banner" [class.danger]="!historyOnly()" [class.warn]="historyOnly()">
                <gtt-icon name="alert" />
                <span>{{ consequence() }}</span>
              </div>
            } @else {
              <p class="faint small">{{ t('telemetry.learnDialog.none') }}</p>
            }
          }
        }

        <ol class="steps compact">
          <li>{{ t('telemetry.learn.step1') }}</li>
          <li>{{ t('telemetry.learn.step2') }}</li>
          <li>{{ t('telemetry.learn.step3') }}</li>
        </ol>
      </div>

      <footer class="foot">
        <button type="button" class="btn ghost" (click)="closed.emit()">{{ t('common.cancel') }}</button>
        <span class="spacer"></span>
        <button type="button" class="btn" [class.primary]="!targets().length" [class.danger]="targets().length && !historyOnly()"
                [disabled]="busy() || (scope() === 'some' && !targets().length)" (click)="start()">
          <gtt-icon [name]="targets().length && !historyOnly() ? 'trash' : 'sparkle'" [size]="16" />{{ startLabel() }}
        </button>
      </footer>
    </section>
  `,
  styles: `
    :host { position: fixed; inset: var(--titlebar-height) 0 0 0; z-index: 60; display: grid; place-items: center; padding: 28px; }
    .backdrop { position: absolute; inset: 0; background: rgba(var(--shade-rgb), .78); backdrop-filter: blur(6px); animation: fade .2s ease-out; }
    @keyframes fade { from { opacity: 0; } }
    .dialog {
      position: relative; width: min(620px, 100%); max-height: 100%; display: flex; flex-direction: column;
      border-radius: 20px; border: 1px solid var(--border-strong);
      background: linear-gradient(180deg, var(--surface-2), var(--surface)); box-shadow: 0 30px 90px -30px rgba(0,0,0,.9);
      animation: rise .25s cubic-bezier(.2,.8,.3,1);
    }
    @keyframes rise { from { opacity: 0; transform: translateY(10px) scale(.985); } }
    .head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border); }
    .close { margin-left: auto; }
    .body { padding: 20px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .section { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .pick-list { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
    .pick, .option {
      appearance: none; font: inherit; color: inherit; text-align: left; display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer;
    }
    .pick.checked { border-color: rgba(251, 72, 104, .45); background: linear-gradient(90deg, rgba(251,72,104,.08), transparent 70%); }
    .option { border: 0; background: transparent; padding: 4px 0; }
    .pick-text { flex: 1; display: flex; flex-direction: column; min-width: 0; }
    .check {
      width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--border-strong); display: grid; place-items: center;
      flex: none; color: var(--on-accent);
    }
    .checked .check, .check.on { background: var(--accent-gradient); border-color: transparent; }
    .steps.compact { gap: 8px; font-size: 13px; color: var(--text-2); }
    .steps.compact li::before { width: 22px; height: 22px; font-size: 11.5px; }
    .foot { display: flex; align-items: center; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); }
  `,
})
export class LearnDialog {
  readonly closed = output<void>();

  protected readonly store = inject(ReferencesStore);
  protected readonly coach = inject(CoachStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly carLabel = carLabel;

  protected readonly scope = signal<Scope>('keep');
  protected readonly historyOnly = signal(false);
  protected readonly picked = signal(new Set<string>());
  protected readonly busy = signal(false);
  /** Player of the replay that is about to be learned. */
  protected readonly driver = signal('');

  protected readonly scopeOptions = computed<SegmentOption<Scope>[]>(() => [
    { value: 'keep', label: this.t('telemetry.learnDialog.keep') },
    { value: 'all', label: this.t('telemetry.learnDialog.deleteAll') },
    { value: 'some', label: this.t('telemetry.learnDialog.deleteSome') },
  ]);

  /** References whose data goes. */
  protected readonly targets = computed(() => {
    const ids = this.store.list().map((r) => r.id);
    if (this.scope() === 'all') return ids;
    if (this.scope() === 'some') return ids.filter((id) => this.picked().has(id));
    return [];
  });

  protected readonly consequence = computed(() => {
    const n = this.targets().length;
    if (this.historyOnly()) return this.t(n === 1 ? 'telemetry.learnDialog.willForgetOne' : 'telemetry.learnDialog.willForget', { n });
    return this.t(n === 1 ? 'telemetry.learnDialog.willDeleteOne' : 'telemetry.learnDialog.willDelete', { n });
  });

  protected readonly startLabel = computed(() => {
    const n = this.targets().length;
    if (!n) return this.t('telemetry.learnDialog.start');
    return this.historyOnly() ? this.t('telemetry.learnDialog.forgetAndStart') : this.t('telemetry.learnDialog.deleteAndStart', { n });
  });

  constructor() {
    void this.store.load();
  }

  protected toggle(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.picked.set(next);
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected when(iso: string): string {
    return date(iso, this.i18n.locale());
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    try {
      await this.store.learnNew(this.targets(), this.historyOnly(), { driver: this.driver().trim() || undefined });
      this.closed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
