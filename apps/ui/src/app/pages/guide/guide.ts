import { NgComponentOutlet } from '@angular/common';
import { Component, computed, effect, inject, isSignal, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { PRODUCT_NAME, type Addressing, type CoachStyle } from '@gtt/api';
import { GTT } from '../../core/gtt';
import type { GuideCheck, GuideStep, GuideTip } from '../../core/module-ui';
import { I18n, type TextKey } from '../../i18n/i18n';
import { MODULE_UIS } from '../../modules';
import { CoachStore } from '../../stores/coach.store';
import { SettingsStore } from '../../stores/settings.store';
import { VoicesStore } from '../../stores/voices.store';
import { Icon, type IconName } from '../../ui/icon';
import { Segmented, type SegmentOption } from '../../ui/segmented';
import { Slider } from '../../ui/slider';
import { Toggle } from '../../ui/toggle';
import { VoicePackages } from '../voices/voice-packages';
import { VoicePicker } from '../voices/voice-picker';

/** A step: the shell's own (its content is in guide.html) or a module's (its component). */
type Step = Pick<GuideStep, 'id' | 'order' | 'label' | 'icon'> & Partial<GuideStep>;

/** The shell's steps; the modules' fit in between by their order (docs/dev/modules.md). */
const SHELL_STEPS: Step[] = [
  { id: 'basics', order: 10, label: 'guide.step.basics', icon: 'sliders' },
  { id: 'voices', order: 40, label: 'guide.step.voices', icon: 'mic' },
  { id: 'name', order: 50, label: 'guide.step.name', icon: 'heart' },
];
/** Always the last one: what is ready, and how it goes on the track. */
const DONE: Step = { id: 'done', order: Number.MAX_SAFE_INTEGER, label: 'guide.step.done', icon: 'check' };

/**
 * Setup assistant: the basics with the modules to use, the voice and the driver's name with a listening test; the
 * modules add theirs (vibration for drivers who hear badly, the PlayStation, the first reference, the calibration of
 * the cue lead time). Opens from the welcome, the navigation or a module (the coach: calibration).
 */
@Component({
  selector: 'gtt-guide',
  imports: [Icon, NgComponentOutlet, Segmented, Slider, Toggle, VoicePackages, VoicePicker],
  templateUrl: './guide.html',
  styleUrl: './guide.css',
  host: { role: 'dialog', 'aria-modal': 'true' },
})
export class Guide {
  protected readonly settings = inject(SettingsStore);
  protected readonly coach = inject(CoachStore);
  protected readonly voices = inject(VoicesStore);
  private readonly gtt = inject(GTT);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.t;
  protected readonly product = PRODUCT_NAME;

  /** Every module's part (made once each time the assistant opens: their state lives while it is open). */
  private readonly parts = MODULE_UIS.map((module) => ({ id: module.id, ...module.guide?.() }));
  private readonly active = computed(() => this.parts.filter((part) => this.settings.moduleEnabled(part.id)));
  /** The modules that can be switched off, for the basics. */
  protected readonly switchable = MODULE_UIS.filter((module) => !module.required);

  /** A module's steps while it is on; a step that offers its module also while it is off. */
  protected readonly steps = computed<Step[]>(() => [
    ...[...SHELL_STEPS, ...this.parts.flatMap((part) => (part.steps ?? []).filter((step) => step.offer || this.settings.moduleEnabled(part.id)))].sort(
      (a, b) => a.order - b.order,
    ),
    DONE,
  ]);
  /** By id, not by place: switching a module in the basics adds or removes steps. */
  private readonly current = signal(this.settings.guideStep() ?? SHELL_STEPS[0]!.id);
  protected readonly index = computed(() => Math.max(0, this.steps().findIndex((step) => step.id === this.current())));
  protected readonly step = computed(() => this.steps()[this.index()]!);
  protected readonly last = computed(() => this.steps().length - 1);
  /** A module step's inputs, signals read. */
  protected readonly stepInputs = computed(() =>
    Object.fromEntries(Object.entries(this.step().inputs ?? {}).map(([name, value]) => [name, isSignal(value) ? value() : value])),
  );

  protected readonly languageOptions = computed<SegmentOption<string>[]>(() =>
    this.settings.languages().map((l) => ({ value: l.id, label: l.name })),
  );
  protected readonly styleOptions = computed<SegmentOption<CoachStyle>[]>(() => [
    { value: 'cheeky', label: this.t('settings.style.cheeky') },
    { value: 'neutral', label: this.t('settings.style.neutral') },
  ]);
  protected readonly addressingOptions = computed<SegmentOption<Addressing>[]>(() => [
    { value: 'always', label: this.t('settings.addressing.always') },
    { value: 'sometimes', label: this.t('settings.addressing.sometimes') },
  ]);

  // --- Name and earbud ---
  protected readonly testing = signal(false);
  protected readonly voiceReady = computed(() => this.coach.coachVoice()?.state === 'ready');
  protected readonly seconds = (value: number) => this.t('settings.seconds', { n: this.i18n.number(value, 2) });
  /** How much slower the name is said: "3×", "1,5×". */
  protected readonly factor = (value: number) => this.t('settings.factor', { n: this.i18n.number(value, value % 1 ? 1 : 0) });

  // --- The last step ---
  private readonly voiceCheck: GuideCheck = { order: 20, label: 'guide.done.voice', icon: 'mic', ok: this.voiceReady };
  protected readonly checks = computed(() => [this.voiceCheck, ...this.active().flatMap((part) => part.checks ?? [])].sort((a, b) => a.order - b.order));
  protected readonly warnings = computed(() => this.active().flatMap((part) => (part.warning?.shown() ? [part.warning] : [])));
  private readonly settingsTip: GuideTip = { order: 100, icon: 'sliders', text: computed(() => this.t('guide.done.tip4')) };
  protected readonly tips = computed(() =>
    [...this.active().flatMap((part) => part.tips ?? []), this.settingsTip].filter((tip) => tip.shown?.() ?? true).sort((a, b) => a.order - b.order),
  );

  // --- The first setup: finished once, completely, before the app opens (the user, 2026-10-24) ---
  protected readonly firstRun = this.settings.firstRun;
  /** What the step still needs before "Next" in the first setup; undefined: nothing (name and vibration are optional). */
  protected readonly missing = computed<TextKey | undefined>(() => {
    if (!this.firstRun()) return undefined;
    const step = this.step();
    if (step.id === 'voices') return this.voiceReady() ? undefined : 'guide.required.voice';
    return step.missing?.();
  });

  /**
   * The footer's text for what is missing. A voice that is still being prepared, or failed, says so: on the user's Mac
   * (alpha 0.0.4) a just-installed voice was chosen and still rendering, and the step only said "pick one".
   */
  protected readonly missingText = computed(() => {
    const need = this.missing();
    if (!need) return undefined;
    const voice = this.coach.coachVoice();
    if (need === 'guide.required.voice' && voice?.state === 'preparing') {
      return this.t('guide.required.voicePreparing', { voice: voice.name, done: voice.done ?? 0, total: voice.total ?? 0 });
    }
    if (need === 'guide.required.voice' && voice?.state === 'error') return this.t('guide.required.voiceFailed', { error: voice.error ?? '' });
    return this.t(need);
  });

  constructor() {
    // The voice packages, preselected for the language chosen in the first step.
    effect(() => {
      if (this.step().id === 'voices') untracked(() => void this.voices.load());
    });
  }

  protected tipIcon(tip: GuideTip): IconName | undefined {
    return typeof tip.icon === 'string' ? tip.icon : undefined;
  }

  protected tipKey(tip: GuideTip): string | undefined {
    return typeof tip.icon === 'string' ? undefined : tip.icon.key;
  }

  protected go(index: number): void {
    const steps = this.steps();
    this.current.set(steps[Math.max(0, Math.min(steps.length - 1, index))]!.id);
  }

  protected next(): void {
    if (this.missing()) return;
    if (this.index() === this.last()) return this.finish();
    this.go(this.index() + 1);
  }

  protected back(): void {
    this.go(this.index() - 1);
  }

  /** The last step: setup done (after the first one the tour starts in the Cockpit). */
  protected finish(): void {
    void this.settings.finishGuide();
    void this.router.navigate(['/']);
  }

  /** The X: closes the assistant, not during the first setup. */
  protected close(): void {
    this.settings.closeGuide();
    if (!this.firstRun()) void this.router.navigate(['/']);
  }

  protected setLanguage(language: string): void {
    void this.settings.update({ language });
  }

  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected saveName(event: Event): void {
    const name = this.inputValue(event).trim();
    if (name !== (this.settings.settings()?.driverName ?? '')) void this.settings.update({ driverName: name });
  }

  /** The greeting with the name (or the earbud test without one), so the name can be checked by ear. */
  protected async listen(): Promise<void> {
    this.testing.set(true);
    try {
      if (this.settings.settings()?.driverName) {
        // A name typed right before the click is saved on blur; give it a moment to arrive.
        await new Promise((resolve) => setTimeout(resolve, 200));
        await this.gtt.samples();
        await this.gtt.playSample('reference-loaded');
      } else {
        await this.coach.testAudio();
      }
    } finally {
      this.testing.set(false);
    }
  }

  protected stepState(i: number): 'done' | 'current' | 'todo' {
    return i < this.index() ? 'done' : i === this.index() ? 'current' : 'todo';
  }
}
