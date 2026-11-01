import { NgComponentOutlet } from '@angular/common';
import { Component, computed, effect, inject, Injector } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PRODUCT_BYLINE, PRODUCT_NAME } from '@gtt/api';
import { BRIDGE_AVAILABLE } from './core/gtt';
import type { ModuleAction } from './core/module-ui';
import { StreamerMode } from './core/streamer';
import { I18n, type TextKey } from './i18n/i18n';
import { MODULE_UIS } from './modules';
import { Guide } from './pages/guide/guide';
import { Tour } from './pages/tour/tour';
import { Welcome } from './pages/welcome/welcome';
import { SettingsStore } from './stores/settings.store';
import { UpdatesStore } from './stores/updates.store';
import { Icon, type IconName } from './ui/icon';
import { LinkBar } from './ui/link-bar';
import { NewsDialog } from './ui/news-dialog';
import { RevealDialog } from './ui/secret';
import { Slider } from './ui/slider';
import { Toggle } from './ui/toggle';
import { UpdateDialog } from './ui/update-dialog';

interface NavItem {
  path: string;
  label: TextKey;
  icon: IconName;
}

@Component({
  selector: 'gtt-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgComponentOutlet, Icon, Guide, LinkBar, NewsDialog, RevealDialog, Slider, Toggle, Tour, UpdateDialog, Welcome],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly bridge = BRIDGE_AVAILABLE;
  protected readonly product = PRODUCT_NAME;
  protected readonly byline = PRODUCT_BYLINE;
  protected readonly settings = inject(SettingsStore);
  protected readonly streamer = inject(StreamerMode);
  protected readonly updates = inject(UpdatesStore);
  protected readonly t = inject(I18n).t;
  /** Alpha or Beta next to the name, from the version (1.0.0-beta); a full release shows none. */
  protected readonly stage = computed<TextKey | undefined>(() => {
    const pre = /-(alpha|beta)/i.exec(this.settings.info()?.version ?? '')?.[1]?.toLowerCase();
    return pre === 'alpha' ? 'app.alpha' : pre === 'beta' ? 'app.beta' : undefined;
  });
  protected readonly percent = (value: number) => this.t('settings.percent', { n: value });
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  /** The modules that are on: their pages in the navigation, their widget, dialogs and services. */
  protected readonly modules = computed(() => MODULE_UIS.filter((module) => this.settings.moduleEnabled(module.id)));
  /** Their buttons below their pages (made once: they read stores). */
  protected readonly actions = new Map<string, ModuleAction[]>(MODULE_UIS.map((module) => [module.id, module.actions?.() ?? []]));

  /** The shell's pages, for every module. */
  protected readonly nav: NavItem[] = [
    { path: '/voices', label: 'nav.voices', icon: 'mic' },
    { path: '/texts', label: 'nav.texts', icon: 'speech' },
    { path: '/recordings', label: 'nav.recordings', icon: 'wave' },
    { path: '/listen', label: 'nav.listen', icon: 'headphones' },
    { path: '/settings', label: 'nav.settings', icon: 'sliders' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  constructor() {
    inject(Title).setTitle(`${PRODUCT_NAME} ${PRODUCT_BYLINE}`);
    // A module's services start with it (the vibration's player: patterns play on every page). They stay once started;
    // they only act while their module is on.
    effect(() => {
      for (const module of this.modules()) for (const service of module.services ?? []) this.injector.get(service);
    });
    // Switched off while one of its pages is open: to the start page.
    effect(() => {
      const url = this.url();
      if (!this.settings.loaded()) return;
      const open = MODULE_UIS.find((module) => url === `/${module.id}` || url.startsWith(`/${module.id}/`));
      if (open && !this.settings.moduleEnabled(open.id)) void this.router.navigateByUrl('/');
    });
  }

  /** App and coach language, from the title bar (also under Settings and in the start guide). */
  protected setLanguage(language: string): void {
    if (language !== this.settings.language()) void this.settings.update({ language });
  }
}
