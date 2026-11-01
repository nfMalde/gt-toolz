import { Component, computed, ElementRef, inject, input, linkedSignal, viewChild } from '@angular/core';
import type { OwnText, TextEntry, TextProblem } from '@gtt/api';
import { I18n, type TextKey } from '../../i18n/i18n';
import { TextsStore } from '../../stores/texts.store';
import { Icon } from '../../ui/icon';

/** A hint does not keep a text from being used (packages/coach/src/i18n/own-texts.ts). */
const isHint = (problem: TextProblem) => problem.kind === 'abbreviation' || problem.kind === 'dropped';

/** A list as the field shows it: one entry per line. */
const asField = (value: string | string[]) => (Array.isArray(value) ? value.join('\n') : value);

/** One text: the field with the own text (or the pack's), its placeholders, an example as it would be said. */
@Component({
  selector: 'gtt-text-row',
  imports: [Icon],
  template: `
    <div class="text" [class.own]="own()">
      <div class="head">
        @if (label()) {
          <span class="label">{{ label() }}</span>
        } @else {
          <span class="mono faint small">{{ entry().key }}</span>
        }
        @if (own()) { <span class="chip accent">{{ t('texts.own') }}</span> }
        <span class="spacer"></span>
        <button type="button" class="btn sm ghost icon-only" [title]="t('texts.listen')" [attr.aria-label]="t('texts.listen')"
                [disabled]="blocked() || store.playing() !== null" (click)="listen()">
          <gtt-icon [name]="store.playing() === entry().key ? 'volume' : 'play'" [size]="14" />
        </button>
        @if (own()) {
          <button type="button" class="btn sm ghost icon-only" [title]="t('texts.reset')" [attr.aria-label]="t('texts.reset')" (click)="store.reset(entry())">
            <gtt-icon name="refresh" [size]="14" />
          </button>
        }
      </div>

      @if (entry().kind === 'text') {
        <input #field class="input" maxlength="400" spellcheck="false" [class.invalid]="blocked()" [value]="draft()"
               [attr.aria-label]="label() || entry().key" (input)="edit(value($event))" (change)="commit()" (keydown.enter)="commit()" />
      } @else {
        <textarea #field class="input" spellcheck="false" [rows]="rows()" [class.invalid]="blocked()" [value]="draft()"
                  [attr.aria-label]="label() || entry().key" (input)="edit(value($event))" (change)="commit()"></textarea>
        <p class="faint small">{{ entry().kind === 'list' ? t('texts.listHint') : t('texts.wordsHint', { count: standardCount() }) }}</p>
      }

      @if (entry().placeholders.length) {
        <div class="placeholders">
          @for (name of entry().placeholders; track name) {
            <button type="button" class="chip focusable" [title]="t('texts.insert')" (click)="insert(name)">{{ '{' + name + '}' }}</button>
          }
        </div>
      }

      <div class="example small">„{{ example() }}“</div>

      @for (problem of problems(); track $index) {
        <div class="problem small" [class.hint]="hint(problem)">{{ problemText(problem) }}</div>
      }

      @if (own(); as own) {
        @if (standardChanged()) {
          <div class="banner info small-banner">
            <gtt-icon name="sparkle" />
            <span class="grow">{{ t('texts.standardChanged', { text: standardText() }) }}</span>
            <button type="button" class="btn sm" (click)="store.reset(entry())">{{ t('texts.takeStandard') }}</button>
            <button type="button" class="btn sm ghost" (click)="store.keep(entry())">{{ t('texts.keepOwn') }}</button>
          </div>
        } @else {
          <div class="faint small">{{ t('texts.standard', { text: standardText() }) }}</div>
        }
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .text {
      display: flex; flex-direction: column; align-items: stretch; gap: 6px; height: 100%; box-sizing: border-box;
      padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated);
    }
    .text.own { border-color: rgba(var(--accent-rgb), .35); }
    .head { display: flex; align-items: center; gap: 8px; min-height: 28px; }
    .label { font-size: 13.5px; color: var(--text); }
    .input { width: 100%; box-sizing: border-box; }
    textarea.input { height: auto; padding-top: 8px; padding-bottom: 8px; resize: vertical; line-height: 1.45; }
    .placeholders { display: flex; flex-wrap: wrap; gap: 4px; }
    .placeholders .chip { cursor: pointer; font-family: var(--mono, monospace); }
    .example { color: var(--text-2); }
    .problem { color: #ff8aa0; }
    .problem.hint { color: var(--warn); }
    .small-banner { padding: 8px 12px; flex-wrap: wrap; }
    .grow { flex: 1; }
  `,
})
export class TextRow {
  readonly entry = input.required<TextEntry>();
  /** The short calls' own name for it; the others show their key. */
  readonly label = input('');
  readonly samples = input.required<Record<string, string>>();

  protected readonly store = inject(TextsStore);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  private readonly field = viewChild<ElementRef<HTMLInputElement | HTMLTextAreaElement>>('field');
  protected readonly own = computed<OwnText | undefined>(() => this.store.own()[this.entry().key]);
  /** What the field shows: the own text, else the pack's; back to it when the own text changes (reset, saved). */
  protected readonly draft = linkedSignal(() => asField(this.own()?.text ?? this.entry().standard));
  protected readonly problems = linkedSignal<OwnText | undefined, TextProblem[]>({ source: this.own, computation: () => [] });
  protected readonly blocked = computed(() => this.problems().some((p) => !isHint(p)));
  protected readonly standardChanged = computed(() => {
    const own = this.own();
    return !!own && JSON.stringify(own.base) !== JSON.stringify(this.entry().standard);
  });
  protected readonly standardText = computed(() => {
    const standard = this.entry().standard;
    return Array.isArray(standard) ? standard.join(' / ') : standard;
  });
  protected readonly standardCount = computed(() => {
    const standard = this.entry().standard;
    return Array.isArray(standard) ? standard.length : 1;
  });
  protected readonly rows = computed(() => Math.min(8, Math.max(2, this.draft().split('\n').length)));

  /** As it would be said, with example values: the first of a list, the words of a word list in a row. */
  protected readonly example = computed(() => {
    const value = this.parse(this.draft());
    const template = Array.isArray(value) ? (this.entry().kind === 'words' ? value.join(', ') : (value[0] ?? '')) : value;
    // Only the text's own placeholders: one it cannot have stays as it is.
    const values: Record<string, string> = { ...this.samples(), ...this.entry().samples };
    const allowed = this.entry().placeholders;
    const filled = template
      .replace(/\{(\w+)\}/g, (match, name: string) => (allowed.includes(name) ? (values[name] ?? match) : match))
      .replace(/\s+/g, ' ')
      .trim();
    const text = filled.charAt(0).toUpperCase() + filled.slice(1);
    return /[.!?,;:]$/.test(text) ? text : `${text}.`;
  });

  private checking = 0;

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /** The field as the text it is: a list without empty lines. */
  private parse(draft: string): string | string[] {
    return this.entry().kind === 'text' ? draft : draft.split('\n').filter((line) => line.trim());
  }

  protected async edit(draft: string): Promise<void> {
    this.draft.set(draft);
    const run = ++this.checking;
    const problems = await this.store.check(this.entry(), this.parse(draft));
    if (run === this.checking) this.problems.set(problems);
  }

  /** Leaving the field (or Enter): saved once it can be used. */
  protected async commit(): Promise<void> {
    const value = this.parse(this.draft());
    if (JSON.stringify(value) === JSON.stringify(this.own()?.text ?? this.entry().standard)) return;
    const run = ++this.checking;
    const problems = await this.store.check(this.entry(), value);
    if (run !== this.checking) return;
    this.problems.set(problems);
    if (!problems.some((p) => !isHint(p))) await this.store.save(this.entry(), value);
  }

  /** A placeholder where the cursor is. */
  protected insert(name: string): void {
    const field = this.field()?.nativeElement;
    if (!field) return;
    const at = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? at;
    field.value = `${field.value.slice(0, at)}{${name}}${field.value.slice(end)}`;
    field.focus();
    field.setSelectionRange(at + name.length + 2, at + name.length + 2);
    void this.edit(field.value).then(() => this.commit());
  }

  protected listen(): void {
    void this.store.preview(this.entry(), this.example());
  }

  protected hint(problem: TextProblem): boolean {
    return isHint(problem);
  }

  protected problemText(problem: TextProblem): string {
    const key = `texts.problem.${problem.kind}` as TextKey;
    switch (problem.kind) {
      case 'too-long':
      case 'too-many':
        return this.t(key, { max: problem.max });
      case 'count':
        return this.t(key, { count: problem.count });
      case 'abbreviation':
        return this.t(key, { word: problem.word });
      case 'placeholder':
      case 'dropped':
        return this.t(key, { names: problem.names.map((name) => `{${name}}`).join(', ') });
      default:
        return this.t(key);
    }
  }
}
