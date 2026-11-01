import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { modeBop, REFERENCE_MODES, type ReferenceMode, type ReferenceSummary } from '@gtt/api';
import { carLabel, date, parseLapTime } from '@shell/core/format';
import { I18n, type TextKey } from '@shell/i18n/i18n';
import { CoachStore } from '@shell/stores/coach.store';
import { ReferencesStore } from '../../stores/references.store';
import { Icon } from '@shell/ui/icon';
import { Secret, SecretField } from '@shell/ui/secret';
import { Segmented, type SegmentOption } from '@shell/ui/segmented';
import { Toggle } from '@shell/ui/toggle';
import { LearnDialog } from './learn-dialog';

interface EditState {
  id: string;
  driver: string;
  carName: string;
  target: string;
  /** What the reference is (docs/dev/telemetry.md); undefined: not said yet. */
  mode?: ReferenceMode;
  bop: boolean;
  label: string;
}

@Component({
  selector: 'gtt-references',
  imports: [Icon, LearnDialog, Secret, SecretField, Segmented, Toggle],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('telemetry.refs.eyebrow') }}</div>
          <h1>{{ t('telemetry.refs.title') }}</h1>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" (click)="store.openFolder()"><gtt-icon name="folder" />{{ t('telemetry.refs.openFolder') }}</button>
          <button type="button" class="btn primary" data-tour="refs-learn" (click)="learnOpen.set(true)"><gtt-icon name="sparkle" />{{ t('telemetry.refs.learnNew') }}</button>
        </div>
      </div>

      @if (coach.learning()) {
        <div class="banner info"><gtt-icon name="sparkle" /><span>{{ t('telemetry.refs.learningActive') }}</span></div>
      }

      @if (store.list().length) {
        <div class="ref-grid">
          @for (ref of store.list(); track ref.id) {
            <article class="card ref" [class.active]="ref.id === activeId()">
              <div class="ref-head">
                <div class="track-badge"><gtt-icon name="flag" [size]="20" /></div>
                <div class="ref-title">
                  <h2>{{ ref.label || (ref.track ?? t('common.unknownTrack')) }}</h2>
                  <div class="muted small">
                    @if (ref.label) { {{ ref.track ?? t('common.unknownTrack') }} · }
                    {{ carLabel(ref) }}
                    @if (ref.reversed) { · {{ t('telemetry.refs.reversed') }} }
                    · {{ t('telemetry.refs.length', { km: km(ref.lengthMeters) }) }}
                  </div>
                </div>
                @if (ref.id === activeId()) {
                  <span class="chip ok"><span class="dot"></span>{{ t('telemetry.refs.active') }}</span>
                }
              </div>

              @if (editing()?.id === ref.id) {
                <div class="edit">
                  <div class="field">
                    <span class="label">{{ t('telemetry.refs.mode') }}</span>
                    <gtt-segmented [options]="modeOptions()" [value]="editing()!.mode ?? null" (valueChange)="setMode($event)" />
                    <span class="bop">
                      <gtt-toggle [checked]="editing()!.bop" [disabled]="!editing()!.mode || editing()!.mode === 'daily'" [label]="t('telemetry.refMode.bop')"
                                  (checkedChange)="setEdit({ bop: $event })" />
                      <span class="small">{{ t('telemetry.refMode.bop') }}</span>
                      @if (editing()!.mode === 'daily') { <span class="faint small">{{ t('telemetry.refMode.dailyBop') }}</span> }
                    </span>
                  </div>
                  <div class="field">
                    <label [for]="'label-' + ref.id">{{ t('telemetry.refs.label') }}</label>
                    <input class="input" [id]="'label-' + ref.id" maxlength="60" spellcheck="false" [placeholder]="t('telemetry.modeDialog.labelPlaceholder')"
                           [value]="editing()!.label" (input)="setEdit({ label: inputValue($event) })" />
                  </div>
                  <div class="field">
                    <label [for]="'driver-' + ref.id">{{ t('telemetry.refs.driver') }}</label>
                    <gtt-secret-field>
                      <input class="input" [id]="'driver-' + ref.id" maxlength="60" spellcheck="false" [placeholder]="t('telemetry.refs.driverPlaceholder')"
                             [value]="editing()!.driver" (input)="setEdit({ driver: inputValue($event) })" />
                    </gtt-secret-field>
                  </div>
                  @if (!ref.carListed) {
                    <div class="field">
                      <label [for]="'car-' + ref.id">{{ t('telemetry.refs.car') }}</label>
                      <input class="input" [id]="'car-' + ref.id" maxlength="60" spellcheck="false" [placeholder]="t('telemetry.refs.carPlaceholder')"
                             [value]="editing()!.carName" (input)="setEdit({ carName: inputValue($event) })" />
                      <span class="faint small">{{ t('telemetry.refs.carHint', { code: ref.carCode }) }}</span>
                    </div>
                  }
                  <div class="field">
                    <label [for]="'target-' + ref.id">{{ t('telemetry.refs.target') }}</label>
                    <input class="input mono" [id]="'target-' + ref.id" spellcheck="false" [class.invalid]="!targetValid()" [placeholder]="ref.lapTime"
                           [value]="editing()!.target" (input)="setEdit({ target: inputValue($event) })" (keydown.enter)="save(ref)" />
                    <span class="small" [class.faint]="targetValid()" [class.error-text]="!targetValid()">
                      {{ targetValid() ? t('telemetry.refs.targetHint') : t('telemetry.refs.targetInvalid') }}
                    </span>
                  </div>
                  <div class="row">
                    <span class="spacer"></span>
                    <button type="button" class="btn sm ghost" (click)="editing.set(null)">{{ t('common.cancel') }}</button>
                    <button type="button" class="btn sm primary" [disabled]="!targetValid()" (click)="save(ref)">{{ t('common.save') }}</button>
                  </div>
                </div>
              } @else {
                <div class="times">
                  <div>
                    <div class="eyebrow">{{ t('telemetry.refs.target') }}</div>
                    <div class="ref-time num">{{ ref.targetTime }}</div>
                  </div>
                  <div class="details">
                    <!-- The space inside the span: Angular drops whitespace between elements. -->
                    <div class="small"><span class="faint">{{ t('telemetry.refs.driver') }}: </span><b>@if (ref.driver) { <gtt-secret [value]="ref.driver" /> } @else { {{ t('telemetry.refs.noDriver') }} }</b></div>
                    @if (ref.customTarget) {
                      <div class="small faint">{{ t('telemetry.refs.lapTime', { time: ref.lapTime }) }}</div>
                    }
                  </div>
                </div>
              }

              <div class="ref-facts">
                <span class="chip" [class.accent]="!ref.mode || !ref.modeConfirmed">{{ modeText(ref) }}</span>
                <span class="chip">{{ t('telemetry.refs.zones', { n: ref.zones }) }}</span>
                @if (ref.origin) {
                  <span class="chip">{{ t(ref.origin === 'live' ? 'telemetry.refs.origin.live' : 'telemetry.refs.origin.replay') }}</span>
                }
                @if (ref.remembered) {
                  <span class="chip accent">{{ t('telemetry.refs.remembered', { n: ref.remembered }) }}</span>
                }
                <span class="faint small">{{ when(ref.createdAt) }}</span>
              </div>

              <div class="ref-actions">
                @if (store.confirmDelete() === ref.id) {
                  <span class="small confirm">{{ t('telemetry.refs.confirmDelete') }}</span>
                  <button type="button" class="btn sm ghost" (click)="store.askDelete(null)">{{ t('common.cancel') }}</button>
                  <button type="button" class="btn sm danger" (click)="store.remove(ref.id)">{{ t('telemetry.refs.delete') }}</button>
                } @else {
                  @if (ref.id !== activeId()) {
                    <button type="button" class="btn sm primary" (click)="store.activate(ref.id)">{{ t('telemetry.refs.use') }}</button>
                  }
                  <button type="button" class="btn sm ghost" (click)="edit(ref)">{{ t('telemetry.refs.edit') }}</button>
                  @if (ref.remembered) {
                    <button type="button" class="btn sm ghost" (click)="store.forget(ref.id)">{{ t('telemetry.refs.forget') }}</button>
                  }
                  <span class="spacer"></span>
                  <button type="button" class="btn sm ghost icon-only" [title]="t('telemetry.refs.delete')" (click)="store.askDelete(ref.id)">
                    <gtt-icon name="trash" [size]="16" />
                  </button>
                }
              </div>
            </article>
          }
        </div>
      } @else if (!store.loading()) {
        <div class="card empty">
          <div class="card-icon accent"><gtt-icon name="flag" [size]="22" /></div>
          <h2>{{ t('telemetry.refs.empty.title') }}</h2>
          <p class="muted">{{ t('telemetry.refs.empty.text') }}</p>
          <ol class="steps empty-steps">
            <li>{{ t('telemetry.learn.step1') }}</li>
            <li>{{ t('telemetry.learn.step2') }}</li>
            <li>{{ t('telemetry.learn.step3') }}</li>
          </ol>
        </div>
      }
    </div>

    @if (learnOpen()) {
      <gtt-learn-dialog (closed)="learnOpen.set(false)" />
    }
  `,
  styles: `
    .ref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .ref { display: flex; flex-direction: column; gap: 14px; transition: border-color .2s; }
    .ref:hover { border-color: var(--border-strong); }
    .ref.active { border-color: rgba(52,211,153,.35); box-shadow: var(--shadow), 0 0 0 1px rgba(52,211,153,.12); }
    .ref-head { display: flex; gap: 12px; align-items: center; }
    .ref-title { flex: 1; min-width: 0; }
    .ref-title h2 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .track-badge {
      width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; flex: none;
      background: var(--accent-soft); color: var(--accent);
    }
    .times { display: flex; align-items: flex-end; gap: 18px; }
    .ref-time { font-family: var(--font-display); font-size: 34px; font-weight: 700; letter-spacing: -.02em; line-height: 1; margin-top: 4px; }
    .details { display: flex; flex-direction: column; gap: 2px; padding-bottom: 2px; min-width: 0; }
    .details b { font-weight: 650; }
    .edit { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 12px; background: var(--bg-elevated); border: 1px solid var(--border); }
    .edit .label { font-weight: 600; font-size: 13px; }
    .bop { display: flex; align-items: center; gap: 8px; }
    .error-text { color: #ff8aa0; }
    .ref-facts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .ref-actions { display: flex; gap: 8px; align-items: center; padding-top: 12px; border-top: 1px solid var(--border); }
    .confirm { flex: 1; color: #ffc2cd; font-weight: 600; }
    .empty-steps { text-align: left; margin-top: 8px; }
  `,
})
export class References {
  protected readonly store = inject(ReferencesStore);
  protected readonly coach = inject(CoachStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly activeId = computed(() => this.coach.reference()?.id ?? null);
  protected readonly learnOpen = signal(false);
  protected readonly editing = signal<EditState | null>(null);
  protected readonly targetValid = computed(() => {
    const target = this.editing()?.target.trim() ?? '';
    return target === '' || parseLapTime(target) !== undefined;
  });

  constructor() {
    // Reload when the coach switches or learns a reference.
    effect(() => {
      this.activeId();
      untracked(() => void this.store.load());
    });
  }

  protected readonly modeOptions = computed<SegmentOption<ReferenceMode>[]>(() =>
    REFERENCE_MODES.map((mode) => ({ value: mode, label: this.t(`telemetry.refMode.short.${mode}` as TextKey) })),
  );

  /** "Daily Race · BoP", "Zeitrennen", or that the mode is still the app's guess. */
  protected modeText(ref: ReferenceSummary): string {
    if (!ref.mode || !ref.modeConfirmed) return this.t('telemetry.refMode.unknown');
    const mode = this.t(`telemetry.refMode.short.${ref.mode}` as TextKey);
    return modeBop(ref.mode, ref.bop) ? `${mode} · ${this.t('telemetry.refMode.bop')}` : mode;
  }

  protected edit(ref: ReferenceSummary): void {
    this.editing.set({
      id: ref.id,
      driver: ref.driver ?? '',
      carName: ref.carListed ? '' : (ref.carName ?? ''),
      target: ref.customTarget ? ref.targetTime : '',
      mode: ref.mode,
      bop: ref.mode ? modeBop(ref.mode, ref.bop) : true,
      label: ref.label ?? '',
    });
  }

  protected setEdit(change: Partial<EditState>): void {
    const current = this.editing();
    if (current) this.editing.set({ ...current, ...change });
  }

  /** A Daily Race always has BoP. */
  protected setMode(mode: ReferenceMode | null): void {
    if (!mode) return;
    this.setEdit({ mode, ...(mode === 'daily' ? { bop: true } : {}) });
  }

  protected async save(ref: ReferenceSummary): Promise<void> {
    const edit = this.editing();
    if (!edit || !this.targetValid()) return;
    const target = edit.target.trim();
    await this.store.update(ref.id, {
      driver: edit.driver.trim(),
      ...(ref.carListed ? {} : { carName: edit.carName.trim() }),
      targetTimeMs: target ? parseLapTime(target)! : null,
      label: edit.label.trim(),
      // Saying the mode here is the same as in the dialog after learning.
      ...(edit.mode ? { mode: edit.mode, bop: modeBop(edit.mode, edit.bop), modeConfirmed: true } : {}),
    });
    this.editing.set(null);
  }

  protected readonly carLabel = carLabel;

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected km(meters: number): string {
    return this.i18n.number(meters / 1000, 2);
  }

  protected when(iso: string): string {
    return date(iso, this.i18n.locale());
  }
}
