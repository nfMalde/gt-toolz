import { Component, computed, input } from '@angular/core';

/** Circle as a path, so every icon is a list of paths. */
const c = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

/** Own simple line icons (24×24, stroke), no icon library. */
const ICONS = {
  modules: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  cockpit: ['M5.6 18.4A9 9 0 1 1 18.4 18.4', 'M12 13.5l3.6-4.6', c(12, 13.5, 1.2), 'M7.5 15.5h.01', 'M16.5 15.5h.01'],
  flag: ['M5 21V4', 'M5 4h12.5l-2.5 4 2.5 4H5'],
  mic: ['M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z', 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  sliders: ['M3 8h4', 'M11 8h10', 'M7 6h4v4H7z', 'M3 16h9', 'M16 16h5', 'M12 14h4v4h-4z'],
  guide: ['M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6z', 'M9 4v14', 'M15 6v14'],
  info: [c(12, 12, 9), 'M12 11v5', 'M12 7.8h.01'],
  play: ['M8 5.5v13l10.5-6.5z'],
  stop: ['M7 7h10v10H7z'],
  trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6 7l1 13h10l1-13', 'M10 11v5', 'M14 11v5'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  download: ['M12 4v11', 'M7.5 10.5 12 15l4.5-4.5', 'M5 19.5h14'],
  copy: ['M9 9h10.5v10.5H9z', 'M15 9V4.5H4.5V15H9'],
  cast: ['M3 8.5v-2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-5.5', 'M3 12.5a7 7 0 0 1 7 7', 'M3 16a3.5 3.5 0 0 1 3.5 3.5', 'M3 19.5h.01'],
  volume: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M15.5 9.5a3.5 3.5 0 0 1 0 5', 'M18.5 7a7 7 0 0 1 0 10'],
  volumeOff: ['M4 9.5v5h3.5L12 18V6L7.5 9.5z', 'M16 9.5l5 5', 'M21 9.5l-5 5'],
  folder: ['M3.5 7.5A2 2 0 0 1 5.5 5.5h3.6l2 2h7.4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z'],
  refresh: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3', 'M19.5 4.5v4.2h-4.2'],
  wifi: ['M2.5 9a14 14 0 0 1 19 0', 'M5.5 12.5a9.5 9.5 0 0 1 13 0', 'M8.7 16a5 5 0 0 1 6.6 0', 'M12 19.5h.01'],
  gamepad: [
    'M7.5 6.5h9a4.5 4.5 0 0 1 4.4 3.6l.9 4.6a2.6 2.6 0 0 1-4.6 2.1L15.5 15h-7l-1.7 1.8a2.6 2.6 0 0 1-4.6-2.1l.9-4.6a4.5 4.5 0 0 1 4.4-3.6z',
    'M8.5 9.5v3',
    'M7 11h3',
    'M15.5 10h.01',
    'M17.5 12h.01',
  ],
  headphones: ['M4.5 15.5V12a7.5 7.5 0 0 1 15 0v3.5', 'M4.5 14h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1z', 'M19.5 14h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1z'],
  sparkle: ['M12 3.5l1.9 4.8 4.8 1.9-4.8 1.9L12 16.9l-1.9-4.8-4.8-1.9 4.8-1.9z', 'M18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z'],
  alert: ['M12 4 21.5 20h-19z', 'M12 10v4.5', 'M12 17.2h.01'],
  chevronRight: ['M9.5 6l6 6-6 6'],
  chevronLeft: ['M14.5 6l-6 6 6 6'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  steering: [c(12, 12, 9), c(12, 12, 2.2), 'M3.4 10.5h6.4', 'M14.2 10.5h6.4', 'M12 14.2V21'],
  heart: ['M12 20s-7.5-4.6-9-9.6A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 9 3.4c-1.5 5-9 9.6-9 9.6z'],
  shield: ['M12 3.5l7.5 3V12c0 4.3-3.2 7.9-7.5 8.5-4.3-.6-7.5-4.2-7.5-8.5V6.5z', 'M8.8 12.2l2.2 2.2 4.2-4.4'],
  users: [c(9, 8.5, 3.2), 'M3 20a6 6 0 0 1 12 0', c(17, 9.5, 2.4), 'M15.8 14.3A5 5 0 0 1 21 19'],
  code: ['M8.5 7.5 4 12l4.5 4.5', 'M15.5 7.5 20 12l-4.5 4.5', 'M13.6 5.5l-3.2 13'],
  external: ['M14 4h6v6', 'M20 4l-8.5 8.5', 'M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10'],
  timer: [c(12, 13.5, 7.5), 'M12 10v3.5l2.3 2.3', 'M9.5 3h5'],
  bell: ['M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z', 'M10.2 20.5h3.6'],
  clock: [c(12, 12, 9), 'M12 7.5V12l3 2'],
  route: [c(6, 18, 2.3), c(18, 6, 2.3), 'M8.3 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.7'],
  globe: [c(12, 12, 9), 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  wave: ['M4 10v4', 'M8 7v10', 'M12 4v16', 'M16 8v8', 'M20 11v2'],
  speech: ['M4 5h16v11H10l-4.5 3.5V16H4z', 'M8 9h8', 'M8 12h5'],
  vibrate: ['M8.5 4h7v16h-7z', 'M11 17h2', 'M5 8.5v7', 'M19 8.5v7', 'M2 10.5v3', 'M22 10.5v3'],
  pc: ['M4 5.5h16v10H4z', 'M9 19.5h6', 'M12 15.5v4'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', c(12, 12, 3)],
  eyeOff: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', c(12, 12, 3), 'M4 4l16 16'],
  // Maldö's channels (simple line marks, no logos taken over).
  discord: ['M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z', c(9, 10.5, 1), c(15, 10.5, 1)],
  twitch: ['M5 3.5h15v10.5l-4.5 4.5h-4L8.5 21.5v-3H5z', 'M11 8v4', 'M15.5 8v4'],
  youtube: ['M3 8a3.5 3.5 0 0 1 3.5-3.5h11A3.5 3.5 0 0 1 21 8v8a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 16z', 'M10 9v6l5-3z'],
  facebook: ['M15.5 3.5h-2.2A3.3 3.3 0 0 0 10 6.8V21', 'M7 11h8'],
  xBrand: ['M4.5 4h4l11 16h-4z', 'M19.5 4l-6.4 7.3', 'M10.9 12.7 4.5 20'],
  instagram: ['M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z', c(12, 12, 3.8), 'M17 7h.01'],
} as const;

export type IconName = keyof typeof ICONS;

@Component({
  selector: 'gtt-icon',
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" fill="none" stroke="currentColor"
         [attr.stroke-width]="weight()" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; flex: none; line-height: 0; }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly weight = input(1.8);
  protected readonly paths = computed<readonly string[]>(() => ICONS[this.name()]);
}
