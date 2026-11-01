// Small formatting helpers shared by the pages.

export function lapTime(ms: number | undefined | null): string {
  if (ms === undefined || ms === null || ms <= 0 || !Number.isFinite(ms)) return '-:--.---';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/** "2:16.665", "2:16,6" or "136.5" → milliseconds; undefined if it is no lap time. */
export function parseLapTime(text: string): number | undefined {
  const match = /^\s*(?:(\d{1,2}):)?(\d{1,2}(?:[.,]\d{1,3})?)\s*$/.exec(text);
  if (!match) return undefined;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2]!.replace(',', '.'));
  if (match[1] !== undefined && seconds >= 60) return undefined;
  const ms = Math.round((minutes * 60 + seconds) * 1000);
  return ms >= 10_000 && ms <= 3_600_000 ? ms : undefined;
}

/** A car: its name, else its code and GT7 class ("#3600 (Gr.3)"), for a car newer than the bundled list. */
export function carLabel(car: { carName?: string; carCode: number; carCategory?: string }): string {
  return car.carName ?? `#${car.carCode}${car.carCategory ? ` (${car.carCategory})` : ''}`;
}

/** Difference in seconds with sign, e.g. "+1.234". */
export function deltaSeconds(ms: number, locale: string): string {
  const text = (Math.abs(ms) / 1000).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return `${ms >= 0 ? '+' : '−'}${text}`;
}

export function bytes(value: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = value;
  let unit = 0;
  while (n >= 1000 && unit < units.length - 1) {
    n /= 1000;
    unit++;
  }
  return `${n.toLocaleString(locale, { maximumFractionDigits: n < 10 && unit > 0 ? 1 : 0 })} ${units[unit]}`;
}

export function signedSeconds(value: number, locale: string): string {
  const text = Math.abs(value).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value >= 0 ? '+' : '−'}${text} s`;
}

export function date(iso: string, locale: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Names whose spelling the id does not show. */
const SPELLED: Record<string, string> = { ljspeech: 'LJSpeech' };

/**
 * "piper:de_DE-ramona-low" → "Ramona", "vits:css10-de" → "CSS10",
 * "Microsoft Hedda Desktop" → "Hedda Desktop".
 */
export function voiceName(id: string): string {
  if (!id) return '';
  // Piper voices, also as sherpa-onnx packages them for macOS ("vits:piper-de_DE-ramona-low").
  const piper = /^(?:piper:|vits:piper-)(.+)$/.exec(id)?.[1];
  if (piper) {
    const name = piper.split('-')[1] ?? piper;
    return SPELLED[name] ?? name.replace(/_k$/, ' K').replace(/^./, (c) => c.toUpperCase());
  }
  if (id.startsWith('vits:')) return (id.slice(5).split('-')[0] ?? id).toUpperCase();
  if (id.startsWith('macos:')) return id.slice(6);
  return id.replace(/^Microsoft\s+/, '');
}
