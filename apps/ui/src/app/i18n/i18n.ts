import { computed, inject, Injectable } from '@angular/core';
import type { Platform } from '@gtt/api';
import { de as coachDe } from '@modules/coach/ui/i18n/de';
import { en as coachEn, type CoachTextKey } from '@modules/coach/ui/i18n/en';
import { de as crewDe } from '@modules/crew/ui/i18n/de';
import { en as crewEn, type CrewTextKey } from '@modules/crew/ui/i18n/en';
import { de as hapticsDe } from '@modules/haptics/ui/i18n/de';
import { en as hapticsEn, type HapticsTextKey } from '@modules/haptics/ui/i18n/en';
import { de as overlaysDe } from '@modules/overlays/ui/i18n/de';
import { en as overlaysEn, type OverlaysTextKey } from '@modules/overlays/ui/i18n/en';
import { de as telemetryDe } from '@modules/telemetry/ui/i18n/de';
import { en as telemetryEn, type TelemetryTextKey } from '@modules/telemetry/ui/i18n/en';
import { SettingsStore } from '../stores/settings.store';
import { de } from './de';
import { en, type ShellTextKey } from './en';

/** The shell's keys and those of every built-in module (each starts with the module's id). */
export type TextKey = ShellTextKey | TelemetryTextKey | CoachTextKey | CrewTextKey | OverlaysTextKey | HapticsTextKey;
export type UiLanguage = 'de' | 'en';

const TEXTS: Record<UiLanguage, Record<TextKey, string>> = {
  de: { ...de, ...telemetryDe, ...coachDe, ...crewDe, ...overlaysDe, ...hapticsDe },
  en: { ...en, ...telemetryEn, ...coachEn, ...crewEn, ...overlaysEn, ...hapticsEn },
};

/** The system's name in the texts ({os}). */
const OS_NAMES: Record<Platform, string> = { windows: 'Windows', mac: 'macOS', linux: 'Linux' };

/** Until the app's info has arrived: what the window itself reports. */
function platformFromAgent(): Platform {
  const agent = navigator.userAgent;
  return /Macintosh|Mac OS X/.test(agent) ? 'mac' : /Windows/.test(agent) ? 'windows' : 'linux';
}

/**
 * UI texts follow the coach language. Languages without UI texts (extra language packs) show English.
 * Templates call t(): it reads the language signal, so views update when the language changes.
 *
 * The texts fit the system the app runs on: {computer} is "PC" or "Mac", {os} the system's name, and a text with a
 * variant for the platform ("guide.connect.check3.mac") uses that one (steps that differ, like the firewall).
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly settings = inject(SettingsStore);

  readonly lang = computed<UiLanguage>(() => (this.settings.language().startsWith('de') ? 'de' : 'en'));
  readonly locale = computed(() => (this.lang() === 'de' ? 'de-DE' : 'en-GB'));
  readonly platform = computed<Platform>(() => this.settings.info()?.platform ?? platformFromAgent());
  private readonly platformWords = computed<Record<string, string>>(() => ({
    computer: this.platform() === 'mac' ? 'Mac' : 'PC',
    os: OS_NAMES[this.platform()],
  }));

  readonly t = (key: TextKey, params?: Record<string, string | number>): string => {
    const texts = TEXTS[this.lang()];
    const variant = `${key}.${this.platform()}` as TextKey;
    const text = texts[variant] ?? TEXTS.en[variant] ?? texts[key] ?? TEXTS.en[key];
    const values: Record<string, string | number> = { ...this.platformWords(), ...params };
    return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
  };

  /** Formats a number in the UI language. */
  readonly number = (value: number, digits = 0): string =>
    value.toLocaleString(this.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
