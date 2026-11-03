import { computed, inject, Injectable, resource } from '@angular/core';
import type { LinkId } from '@gtt/api';
import type { IconName } from '../ui/icon';
import { GTT } from './gtt';

/** Donations (pure donations, no perks) and Maldö's channels, in the order they are shown. */
export const SUPPORT_LINKS: readonly LinkId[] = ['paypal', 'patreon'];
export const CHANNEL_LINKS: readonly LinkId[] = ['discord', 'twitch', 'youtube', 'facebook', 'x', 'instagram'];
/** The project on GitHub: the source code, bug reports and the releases. */
export const PROJECT_LINKS: readonly LinkId[] = ['source', 'issues', 'releases'];

/** Names as the services write them (the same in every language). */
export const LINK_NAMES: Record<LinkId, string> = {
  patreon: 'Patreon',
  paypal: 'PayPal',
  discord: 'Discord',
  twitch: 'Twitch',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
  instagram: 'Instagram',
  issues: 'Issues',
  releases: 'Releases',
  source: 'GitHub',
};

export const LINK_ICONS: Record<LinkId, IconName> = {
  patreon: 'heart',
  paypal: 'heart',
  discord: 'discord',
  twitch: 'twitch',
  youtube: 'youtube',
  facebook: 'facebook',
  x: 'xBrand',
  instagram: 'instagram',
  issues: 'external',
  releases: 'external',
  source: 'external',
};

/**
 * The web pages the app may open (main process: a fixed list, https only, in the browser, only on a click; the app
 * loads nothing from them).
 */
@Injectable({ providedIn: 'root' })
export class Links {
  private readonly gtt = inject(GTT);
  private readonly available = resource({ loader: () => this.gtt.links() });
  readonly support = computed(() => this.present(SUPPORT_LINKS));
  readonly channels = computed(() => this.present(CHANNEL_LINKS));
  readonly project = computed(() => this.present(PROJECT_LINKS));

  open(id: LinkId): void {
    void this.gtt.openLink(id);
  }

  private present(ids: readonly LinkId[]): LinkId[] {
    const links = this.available.value() ?? {};
    return ids.filter((id) => !!links[id]);
  }
}
