import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RECORDING_SECTIONS, type RecordingEntry, type RecordingPackInfo, type RecordingSection, type VoiceRole } from '@gtt/api';
import { ClipPlayer } from '../../core/clip-player';
import { GTT } from '../../core/gtt';
import { MicRecorder } from '../../core/mic-recorder';
import { StreamerMode } from '../../core/streamer';
import { I18n, type TextKey } from '../../i18n/i18n';
import { RecordingsStore } from '../../stores/recordings.store';
import { SettingsStore } from '../../stores/settings.store';
import { Icon } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Toggle } from '../../ui/toggle';
import { ShareDialog } from './share-dialog';

const ROLES: VoiceRole[] = ['coach', 'crew', 'standin'];

/**
 * The user's own voice: packs of recordings, one language each. One text at a time is recorded (space
 * starts and stops), listened to, and the next missing one comes up. Packs are shared as files the user
 * passes on; the page says what that means legally before anything is exported or imported.
 */
@Component({
  selector: 'gtt-recordings',
  imports: [Icon, Segmented, Toggle, ShareDialog, RouterLink],
  host: { '(document:keydown)': 'onKey($event)', '(document:keyup)': 'onKeyUp($event)' },
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <div class="eyebrow">{{ t('recordings.eyebrow') }}</div>
          <h1>{{ t('recordings.title') }}</h1>
        </div>
        <div class="actions">
          <button type="button" class="btn ghost" (click)="dialog.set('import')"><gtt-icon name="download" [size]="16" />{{ t('recordings.import') }}</button>
          <button type="button" class="btn primary" (click)="startCreate()"><gtt-icon name="sparkle" [size]="16" />{{ t('recordings.new') }}</button>
        </div>
      </div>

      <div class="banner warn legal">
        <gtt-icon name="shield" />
        <div>
          <b>{{ t('recordings.legal.title') }}</b>
          <div>{{ t('recordings.legal.text') }}</div>
        </div>
      </div>

      @if (store.error(); as error) {
        <div class="banner danger" role="alert">
          <gtt-icon name="alert" />
          <span class="grow">{{ errorText(error) }}</span>
          <button type="button" class="btn ghost sm icon-only" [title]="t('common.close')" (click)="store.clearError()"><gtt-icon name="x" /></button>
        </div>
      }
      @if (notice(); as message) {
        <div class="banner info" role="status">
          <gtt-icon name="check" />
          <span class="grow">{{ message }}</span>
          <button type="button" class="btn ghost sm icon-only" [title]="t('common.close')" (click)="notice.set(null)"><gtt-icon name="x" /></button>
        </div>
      }

      <div class="columns">
        <!-- Packs -->
        <section class="card packs">
          <div class="card-header">
            <div class="card-icon accent"><gtt-icon name="folder" /></div>
            <h2>{{ t('recordings.packs') }}</h2>
            <span class="spacer"></span>
            <button type="button" class="btn ghost sm icon-only" [title]="t('recordings.openFolder')" (click)="openFolder()"><gtt-icon name="external" [size]="15" /></button>
          </div>
          <p class="faint small">{{ t('recordings.packsHint') }}</p>

          @if (creating()) {
            <div class="create">
              <div class="field">
                <label for="pack-name">{{ t('recordings.name') }}</label>
                <input id="pack-name" class="input" maxlength="60" spellcheck="false" [placeholder]="t('recordings.namePlaceholder')"
                       [value]="newName()" (input)="newName.set(value($event))" />
              </div>
              <div class="field">
                <span class="label">{{ t('recordings.language') }}</span>
                <gtt-segmented [options]="languageOptions()" [value]="newLanguage()" (valueChange)="newLanguage.set($event)" />
                <span class="faint small">{{ t('recordings.languageHint') }}</span>
              </div>
              <div class="field">
                <label for="pack-speaker">{{ t('recordings.speaker') }}</label>
                <input id="pack-speaker" class="input" maxlength="60" spellcheck="false" [value]="newSpeaker()" (input)="newSpeaker.set(value($event))" />
              </div>
              <div class="row-end">
                <button type="button" class="btn ghost" (click)="creating.set(false)">{{ t('common.cancel') }}</button>
                <button type="button" class="btn primary" [disabled]="!newName().trim() || !newLanguage()" (click)="create()">{{ t('recordings.create') }}</button>
              </div>
            </div>
          }

          <div class="pack-list">
            @for (pack of store.packs(); track pack.id) {
              <button type="button" class="pack focusable" [class.selected]="pack.id === store.selectedId()" (click)="select(pack.id)">
                <span class="pack-text">
                  <b>{{ pack.name }}</b>
                  <span class="faint small">{{ languageName(pack.language) }} · {{ t('recordings.packMeta', { n: pack.recordings, time: duration(pack.seconds) }) }}@if (pack.speaker) { · {{ pack.speaker }} }</span>
                  @if (usedBy(pack).length) {
                    <span class="small used">{{ t('recordings.inUse', { roles: usedBy(pack).join(', ') }) }}</span>
                  }
                </span>
                @if (pack.imported) { <span class="chip">{{ t('recordings.imported') }}</span> }
              </button>
            } @empty {
              @if (!creating() && !store.loading()) {
                <p class="muted small empty-text">{{ t('recordings.empty') }}</p>
              }
            }
          </div>

          <p class="faint small how">{{ t('recordings.how') }}</p>
        </section>

        <!-- The selected pack -->
        @if (store.selected(); as pack) {
          <div class="stack">
            <section class="card">
              <div class="card-header">
                <div class="card-icon accent"><gtt-icon name="mic" /></div>
                <h2>{{ pack.name }}</h2>
                <span class="chip">{{ languageName(pack.language) }}</span>
                <span class="spacer"></span>
                <button type="button" class="btn sm ghost" [disabled]="previewing() || !pack.recordings" (click)="preview()">
                  <gtt-icon [name]="previewing() ? 'volume' : 'play'" [size]="14" />{{ t('recordings.preview') }}
                </button>
                <button type="button" class="btn sm ghost" [disabled]="!pack.recordings" (click)="dialog.set('export')">
                  <gtt-icon name="external" [size]="14" />{{ t('recordings.export') }}
                </button>
                <button type="button" class="btn sm ghost icon-only" [title]="t('recordings.delete')" (click)="confirmDelete.set(true)"><gtt-icon name="trash" [size]="15" /></button>
              </div>
              @if (confirmDelete()) {
                <div class="banner danger">
                  <gtt-icon name="alert" />
                  <span class="grow">{{ t('recordings.deleteConfirm', { name: pack.name }) }}</span>
                  <button type="button" class="btn sm ghost" (click)="confirmDelete.set(false)">{{ t('common.cancel') }}</button>
                  <button type="button" class="btn sm danger" (click)="remove(pack)">{{ t('recordings.deleteYes') }}</button>
                </div>
              }
              @if (pack.imported) {
                <p class="faint small">{{ t('recordings.importedConsent') }}</p>
              }
              @if (store.catalog(); as catalog) {
                @if (catalog.pack.textsVersion < catalog.textsVersion) {
                  <div class="banner info"><gtt-icon name="sparkle" /><span>{{ t('recordings.textsNewer', { pack: catalog.pack.textsVersion, app: catalog.textsVersion }) }}</span></div>
                } @else if (catalog.pack.textsVersion > catalog.textsVersion) {
                  <div class="banner warn"><gtt-icon name="alert" /><span>{{ t('recordings.textsOlder', { pack: catalog.pack.textsVersion, app: catalog.textsVersion }) }}</span></div>
                }
              }

              <!-- One text at a time -->
              @if (current(); as entry) {
                <div class="take" [class.live]="mic.state() === 'recording'">
                  <div class="eyebrow">{{ sectionLabel(entry.section) }} · {{ position() }}</div>
                  <div class="say">„{{ entry.text }}“</div>
                  <div class="take-controls">
                    @if (mic.state() === 'recording') {
                      <button type="button" class="btn danger lg" (click)="mic.stop()"><gtt-icon name="stop" [size]="18" />{{ t('recordings.stop') }}</button>
                      <div class="meter" aria-hidden="true"><div [style.width.%]="mic.level() * 100"></div></div>
                      <span class="small mono">{{ t('recordings.recording', { seconds: mic.seconds().toFixed(1) }) }}</span>
                    } @else if (mic.state() === 'processing' || mic.state() === 'starting') {
                      <button type="button" class="btn lg" disabled><gtt-icon name="mic" [size]="18" />{{ t('recordings.processing') }}</button>
                    } @else {
                      <button type="button" class="btn primary lg" (click)="toggleRecord()">
                        <gtt-icon name="mic" [size]="18" />{{ entry.recorded ? t('recordings.retake') : t('recordings.record') }}
                      </button>
                      @if (entry.recorded) {
                        <button type="button" class="btn" (click)="play(entry.key)">
                          <gtt-icon [name]="player.playing() === entry.key ? 'volume' : 'play'" [size]="16" />{{ t('recordings.play') }}
                          @if (entry.seconds) { <span class="faint small">{{ duration(entry.seconds) }}</span> }
                        </button>
                        <button type="button" class="btn ghost icon-only" [title]="t('recordings.removeTake')" (click)="store.deleteTake(entry.key)"><gtt-icon name="trash" [size]="16" /></button>
                      }
                      <span class="spacer"></span>
                      <button type="button" class="btn ghost icon-only" [title]="t('recordings.previous')" (click)="step(-1)"><gtt-icon name="chevronLeft" /></button>
                      <button type="button" class="btn ghost icon-only" [title]="t('recordings.next')" (click)="step(1)"><gtt-icon name="chevronRight" /></button>
                    }
                  </div>
                  @if (takeError(); as error) {
                    <div class="banner danger small-banner" role="alert"><gtt-icon name="alert" /><span>{{ errorText(error) }}</span></div>
                  }
                  <div class="take-options">
                    <label class="option"><gtt-toggle [checked]="playAfter()" [label]="t('recordings.playAfter')" (checkedChange)="playAfter.set($event)" />{{ t('recordings.playAfter') }}</label>
                    <label class="option"><gtt-toggle [checked]="nextAfter()" [label]="t('recordings.nextAfter')" (checkedChange)="nextAfter.set($event)" />{{ t('recordings.nextAfter') }}</label>
                    <span class="faint small keys">{{ t('recordings.keys') }}</span>
                  </div>
                </div>
              }
            </section>

            <section class="card">
              <div class="sections" role="tablist">
                @for (s of sections(); track s.id) {
                  <button type="button" role="tab" class="section-tab focusable" [class.active]="section() === s.id" [attr.aria-selected]="section() === s.id" (click)="openSection(s.id)">
                    {{ sectionLabel(s.id) }}
                    <span class="count" [class.complete]="s.total > 0 && s.done === s.total">{{ s.done }}/{{ s.total }}</span>
                  </button>
                }
              </div>
              <div class="section-head">
                <p class="faint small grow">{{ sectionHint(section()) }}</p>
                <label class="option small"><gtt-toggle [checked]="onlyMissing()" [label]="t('recordings.onlyMissing')" (checkedChange)="onlyMissing.set($event)" />{{ t('recordings.onlyMissing') }}</label>
              </div>

              @if (section() === 'name') {
                @if (!settings.settings()?.driverName) {
                  <p class="muted small">{{ t('recordings.noName') }} <a routerLink="/settings">{{ t('nav.settings') }}</a></p>
                }
                <div class="add-name">
                  <input class="input" maxlength="30" spellcheck="false" [placeholder]="t('recordings.addName')" [value]="nameInput()"
                         (input)="nameInput.set(value($event))" (keydown.enter)="addName()" />
                  <button type="button" class="btn" [disabled]="!nameInput().trim()" (click)="addName()">{{ t('recordings.add') }}</button>
                </div>
                <p class="faint small">{{ t('recordings.addNameHint') }}</p>
              }

              <div class="entries">
                @for (entry of shown(); track entry.key) {
                  <div class="entry" [class.current]="entry.key === current()?.key" [class.recorded]="entry.recorded">
                    <button type="button" class="entry-main focusable" (click)="currentKey.set(entry.key)">
                      <span class="dot">@if (entry.recorded) { <gtt-icon name="check" [size]="12" [weight]="2.6" /> }</span>
                      <span class="entry-text">{{ entry.text }}</span>
                    </button>
                    @if (entry.recorded) {
                      <span class="faint small mono">{{ duration(entry.seconds ?? 0) }}</span>
                      <button type="button" class="btn sm ghost icon-only" [title]="t('recordings.play')" (click)="play(entry.key)">
                        <gtt-icon [name]="player.playing() === entry.key ? 'volume' : 'play'" [size]="14" />
                      </button>
                    }
                  </div>
                } @empty {
                  <p class="faint small">{{ t('recordings.done') }}</p>
                }
              </div>
            </section>
          </div>
        }
      </div>
    </div>

    @if (dialog(); as mode) {
      <gtt-share-dialog [mode]="mode" (closed)="dialog.set(null)" (confirmed)="share(mode)" />
    }
  `,
  styles: `
    .page-header .actions { display: flex; gap: 8px; }
    .legal { align-items: flex-start; }
    .legal b { display: block; margin-bottom: 2px; }
    .grow { flex: 1; }
    .columns { display: grid; grid-template-columns: minmax(260px, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
    @media (max-width: 1000px) { .columns { grid-template-columns: 1fr; } }
    .stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .packs { display: flex; flex-direction: column; gap: 10px; }
    .create { display: flex; flex-direction: column; gap: 12px; padding: 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); }
    .field .label { font-size: 12.5px; font-weight: 600; color: var(--text-2); }
    .row-end { display: flex; justify-content: flex-end; gap: 8px; }
    .pack-list { display: flex; flex-direction: column; gap: 6px; }
    .pack {
      appearance: none; font: inherit; color: inherit; text-align: left; display: flex; align-items: center; gap: 10px;
      padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated); cursor: pointer;
    }
    .pack.selected { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .08), transparent 70%); }
    .pack-text { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 2px; }
    .used { color: var(--ok); }
    .how { margin-top: 6px; }
    .take { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-elevated); transition: border-color .15s; }
    .take.live { border-color: rgba(251, 72, 104, .55); box-shadow: 0 0 0 3px rgba(251, 72, 104, .12); }
    .say { font-size: 22px; font-weight: 650; line-height: 1.35; }
    .take-controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .take-controls .spacer { flex: 1; }
    .meter { width: 160px; height: 8px; border-radius: 6px; background: var(--surface-2); overflow: hidden; }
    .meter > div { height: 100%; background: var(--accent-gradient); transition: width .05s linear; }
    .mono { font-variant-numeric: tabular-nums; }
    .take-options { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
    .option { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-2); cursor: pointer; }
    .keys { margin-left: auto; }
    .small-banner { padding: 8px 12px; }
    .sections { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .section-tab {
      appearance: none; font: inherit; font-size: 13px; color: var(--text-2); display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-radius: 999px; border: 1px solid var(--border); background: transparent; cursor: pointer;
    }
    .section-tab.active { color: var(--text); border-color: rgba(var(--accent-rgb), .45); background: var(--accent-soft); }
    .count { font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
    .count.complete { color: var(--ok); }
    .section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
    .add-name { display: flex; gap: 8px; margin: 4px 0; }
    .add-name .input { flex: 1; }
    .entries { display: flex; flex-direction: column; gap: 4px; max-height: 520px; overflow-y: auto; }
    .entry { display: flex; align-items: center; gap: 8px; padding: 2px 6px 2px 2px; border-radius: 10px; border: 1px solid transparent; }
    .entry.current { border-color: rgba(var(--accent-rgb), .45); background: linear-gradient(90deg, rgba(var(--accent-rgb), .08), transparent 70%); }
    .entry-main {
      appearance: none; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
      display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; padding: 6px; border-radius: 8px;
    }
    .entry-text { font-size: 13.5px; }
    .entry:not(.recorded) .entry-text { color: var(--text-2); }
    .dot {
      width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border-strong); flex: none; display: grid; place-items: center; color: #fff;
    }
    .recorded .dot { background: var(--ok); border-color: transparent; }
    .empty-text { padding: 8px 0; }
  `,
})
export class Recordings {
  protected readonly store = inject(RecordingsStore);
  protected readonly settings = inject(SettingsStore);
  protected readonly mic = inject(MicRecorder);
  protected readonly player = inject(ClipPlayer);
  private readonly gtt = inject(GTT);
  private readonly streamer = inject(StreamerMode);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;

  protected readonly creating = signal(false);
  protected readonly newName = signal('');
  protected readonly newLanguage = signal('');
  protected readonly newSpeaker = signal('');
  protected readonly section = signal<RecordingSection>('cues');
  protected readonly onlyMissing = signal(false);
  protected readonly currentKey = signal<string | null>(null);
  protected readonly playAfter = signal(true);
  protected readonly nextAfter = signal(true);
  protected readonly takeError = signal<string | null>(null);
  protected readonly confirmDelete = signal(false);
  protected readonly dialog = signal<'export' | 'import' | null>(null);
  protected readonly notice = signal<string | null>(null);
  protected readonly previewing = signal(false);
  /** Names added to record that have no recording yet. */
  protected readonly extraNames = signal<string[]>([]);
  protected readonly nameInput = signal('');

  protected readonly languageOptions = computed<SegmentOption<string>[]>(() => this.settings.languages().map((l) => ({ value: l.id, label: l.name })));

  /** Every section with something in it, with how much of it is recorded. */
  protected readonly sections = computed(() =>
    RECORDING_SECTIONS.map((id) => {
      const entries = this.entriesOf(id);
      return { id, total: entries.length, done: entries.filter((e) => e.recorded).length };
    }).filter((s) => s.total > 0 || s.id === 'name'),
  );

  /** The section's entries (the current one stays visible with "only missing"). */
  protected readonly shown = computed(() => {
    const entries = this.entriesOf(this.section());
    const current = this.currentKey();
    return this.onlyMissing() ? entries.filter((e) => !e.recorded || e.key === current) : entries;
  });

  protected readonly current = computed<RecordingEntry | null>(() => {
    const entries = this.entriesOf(this.section());
    return entries.find((e) => e.key === this.currentKey()) ?? entries.find((e) => !e.recorded) ?? entries[0] ?? null;
  });

  protected readonly position = computed(() => {
    const entries = this.entriesOf(this.section());
    const index = entries.findIndex((e) => e.key === this.current()?.key);
    return `${index + 1}/${entries.length}`;
  });

  constructor() {
    // Another pack: start with the corner calls.
    effect(() => {
      this.store.selectedId();
      this.section.set('cues');
      this.currentKey.set(null);
      this.confirmDelete.set(false);
      this.extraNames.set([]);
    });
  }

  private entriesOf(section: RecordingSection): RecordingEntry[] {
    const entries = this.store.entries().filter((e) => e.section === section);
    if (section !== 'name') return entries;
    const extra = this.extraNames()
      .filter((name) => !entries.some((e) => e.text.toLocaleLowerCase() === name.toLocaleLowerCase()))
      .map((name) => ({ key: `new:${name}`, text: name, section: 'name' as const, recorded: false }));
    return [...entries, ...extra];
  }

  protected startCreate(): void {
    this.newName.set('');
    this.newSpeaker.set('');
    this.newLanguage.set(this.settings.speechLanguage('coach'));
    this.creating.set(true);
  }

  protected async create(): Promise<void> {
    await this.store.create({ name: this.newName().trim(), language: this.newLanguage(), speaker: this.newSpeaker().trim() });
    this.creating.set(false);
  }

  protected async select(id: string): Promise<void> {
    this.mic.cancel();
    this.player.stop();
    await this.store.select(id);
  }

  protected async remove(pack: RecordingPackInfo): Promise<void> {
    this.confirmDelete.set(false);
    await this.store.remove(pack.id);
  }

  protected openSection(id: RecordingSection): void {
    this.section.set(id);
    this.currentKey.set(null);
    this.takeError.set(null);
  }

  protected addName(): void {
    const name = this.nameInput()
      .replace(/[^\p{L}\p{M}\s'-]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) return;
    if (!this.extraNames().includes(name)) this.extraNames.update((names) => [...names, name]);
    this.nameInput.set('');
    this.currentKey.set(`new:${name}`);
  }

  /** Starts a take of the current text, or ends the one running. */
  protected async toggleRecord(): Promise<void> {
    if (this.mic.state() === 'recording') {
      this.mic.stop();
      return;
    }
    const entry = this.current();
    if (!entry || this.mic.state() !== 'idle') return;
    this.player.stop();
    this.takeError.set(null);
    let wav: Uint8Array | null;
    try {
      wav = await this.mic.record();
    } catch {
      this.takeError.set('mic');
      return;
    }
    if (!wav) return;
    try {
      const saved = await this.store.save(entry, wav);
      this.extraNames.update((names) => names.filter((n) => n !== entry.text));
      this.currentKey.set(saved.key);
      if (this.playAfter()) await this.play(saved.key);
      if (this.nextAfter()) this.nextMissing();
    } catch (err) {
      this.takeError.set((err as Error).message);
    }
  }

  protected async play(key: string): Promise<void> {
    if (this.player.playing() === key) {
      this.player.stop();
      return;
    }
    try {
      await this.player.play(key, await this.store.audio(key));
    } catch (err) {
      this.store.setError((err as Error).message);
    }
  }

  protected step(direction: 1 | -1): void {
    const entries = this.shown();
    const index = entries.findIndex((e) => e.key === this.current()?.key);
    const next = entries[index + direction];
    if (next) {
      this.currentKey.set(next.key);
      this.takeError.set(null);
    }
  }

  /** The next text without a recording: in this section, then in the next ones. */
  private nextMissing(): void {
    const order = this.sections().map((s) => s.id);
    const start = order.indexOf(this.section());
    // Around once: the rest of this section, the other sections, then this section from its start.
    for (let i = 0; i <= order.length; i++) {
      const section = order[(start + i) % order.length]!;
      const entries = this.entriesOf(section);
      const from = i === 0 ? entries.findIndex((e) => e.key === this.currentKey()) + 1 : 0;
      const next = entries.slice(from).find((e) => !e.recorded);
      if (next) {
        this.section.set(section);
        this.currentKey.set(next.key);
        return;
      }
    }
  }

  protected async preview(): Promise<void> {
    this.previewing.set(true);
    try {
      await this.store.preview();
    } finally {
      this.previewing.set(false);
    }
  }

  protected async share(mode: 'export' | 'import'): Promise<void> {
    this.dialog.set(null);
    if (mode === 'export') {
      if (await this.store.exportPack()) this.notice.set(this.t('recordings.exported'));
      return;
    }
    const pack = await this.store.importPack();
    if (pack) this.notice.set(this.t('recordings.importedDone', { name: pack.name, n: pack.recordings }));
  }

  protected openFolder(): void {
    void this.gtt.openFolder('recordings');
  }

  /** Roles that use the pack for the language they speak. */
  protected usedBy(pack: RecordingPackInfo): string[] {
    const settings = this.settings.settings();
    if (!settings) return [];
    return ROLES.filter((role) => this.settings.speechLanguage(role) === pack.language && settings.voices[role].recordings?.[pack.language] === pack.id).map((role) =>
      this.t(`voices.role.${role}`),
    );
  }

  protected onKey(event: KeyboardEvent): void {
    if (this.dialog() || !this.store.selected() || this.isTyping(event)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) void this.toggleRecord();
    } else if (event.key === 'ArrowRight' && this.mic.state() === 'idle') {
      event.preventDefault();
      this.step(1);
    } else if (event.key === 'ArrowLeft' && this.mic.state() === 'idle') {
      event.preventDefault();
      this.step(-1);
    } else if (event.key.toLowerCase() === 'p' && this.current()?.recorded) {
      void this.play(this.current()!.key);
    }
  }

  /** A focused button would otherwise take the space bar as a click. */
  protected onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space' && !this.dialog() && !this.isTyping(event)) event.preventDefault();
  }

  private isTyping(event: KeyboardEvent): boolean {
    return !!(event.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]');
  }

  protected sectionLabel(section: RecordingSection): string {
    return this.t(`recordings.section.${section}` as TextKey);
  }

  protected sectionHint(section: RecordingSection): string {
    return this.t(`recordings.section.${section}.hint` as TextKey);
  }

  protected errorText(code: string): string {
    const key = `recordings.error.${code}` as TextKey;
    const text = this.t(key);
    // An unknown error is the raw message: in streamer mode without the folders of its paths.
    return text === key || !text ? this.t('common.error', { message: this.streamer.paths(code) }) : text;
  }

  protected languageName(id: string): string {
    return this.settings.languages().find((l) => l.id === id)?.name ?? id;
  }

  protected duration(seconds: number): string {
    if (seconds < 60) return `${this.i18n.number(seconds, 1)} s`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, '0')} min`;
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
