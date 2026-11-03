// The release's announcement on Discord: the version's news in both languages, sent to the webhook in the secret
// DISCORD_WEBHOOK_URL. Runs in the release workflow's announce job, once the release is public. Plain Node, no packages.
//
//   DISCORD_WEBHOOK_URL=<url> node scripts/release/announce.mjs --version=1.0.0-beta.2   sends it, up to three tries
//   node scripts/release/announce.mjs --version=1.0.0-beta.2 --print                     prints the message, sends nothing
//
// The release is out by then, so a failed announcement fails nothing: it ends with a warning and exit code 0. The
// message pings nobody (allowed_mentions), whatever the news say. The webhook's address is never printed.

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NEWS_DIR = path.join(ROOT, 'apps', 'ui', 'public', 'news');
const TRIES = 3;
const TRY_TIMEOUT_MS = 20_000;
const PAUSE_S = 10;
const MAX_PAUSE_S = 60;
/** Discord takes 6000 characters over all embeds of a message: two languages, with their titles and links. */
const MAX_NEWS = 2600;
/** The app's accent colour. */
const COLOR = 0xff8a3d;

const TEXTS = {
  de: {
    title: (version) => `GT Toolz ${version} ist da`,
    links: (release, install) => `**[Herunterladen](${release})** · [So installierst du es](${install})`,
    update: 'Schon installiert? Mit eingeschalteter Update-Prüfung bietet dir die App das Update beim Start an.',
  },
  en: {
    title: (version) => `GT Toolz ${version} is out`,
    links: (release, install) => `**[Download](${release})** · [How to install](${install})`,
    update: 'Already installed? With the update check on, the app offers you the update when it starts.',
  },
};

/** The news of a version; before the release plan has renamed them, the next release's. */
function readNews(version, language) {
  const file = [version, 'next'].map((name) => path.join(NEWS_DIR, `${name}.${language}.md`)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`no news for ${version} (${language})`);
  return fs.readFileSync(file, 'utf8');
}

/** Cut at a line end, so that no link or bold text breaks. */
export function fit(text, max = MAX_NEWS) {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max - 1);
  return `${text.slice(0, cut > 0 ? cut : max - 1).trimEnd()}\n…`;
}

/** The news for Discord: headings as bold lines, which look the same on every Discord client. */
export function discordText(news) {
  return fit(news.replace(/\r\n/g, '\n').replace(/^#{1,6}\s+(.+)$/gm, '**$1**').trim());
}

/** The webhook message: one embed per language, German first. */
export function buildMessage(version, repo, news = readNews) {
  const release = `https://github.com/${repo}/releases/tag/v${version}`;
  const install = `https://github.com/${repo}#installing`;
  return {
    username: 'GT Toolz',
    avatar_url: `https://raw.githubusercontent.com/${repo}/main/apps/ui/public/maldoe-256.png`,
    allowed_mentions: { parse: [] },
    embeds: Object.entries(TEXTS).map(([language, text]) => ({
      title: text.title(version),
      url: release,
      color: COLOR,
      description: `${discordText(news(version, language))}\n\n${text.links(release, install)}\n${text.update}`,
    })),
  };
}

/** Posts the message, up to three tries. True when Discord took it. */
export async function send(webhook, message, wait = sleep) {
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    let problem;
    let pause = PAUSE_S;
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'GT-Toolz-release' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(TRY_TIMEOUT_MS),
      });
      if (response.ok) return true;
      problem = `HTTP ${response.status}`;
      // Discord says how long to wait when it limits the rate.
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter !== null) pause = Math.min(Number(retryAfter) || 0, MAX_PAUSE_S);
    } catch (error) {
      problem = error instanceof Error ? error.name : 'error';
    }
    console.log(`Try ${attempt} of ${TRIES}: ${problem}`);
    if (attempt < TRIES) await wait(pause * 1000);
  }
  return false;
}

function report(line, env) {
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${line.replace(/^::\w+::/, '')}\n`);
}

/** Never throws: nothing here may fail the release. */
export async function main(args, env = process.env, wait = sleep) {
  try {
    const version = args.find((arg) => arg.startsWith('--version='))?.slice('--version='.length);
    if (!version) throw new Error('--version is missing');
    const message = buildMessage(version, env.GITHUB_REPOSITORY || 'nfMalde/gt-toolz');
    if (args.includes('--print')) {
      console.log(JSON.stringify(message, null, 2));
      return;
    }
    if (!env.DISCORD_WEBHOOK_URL) {
      report('::notice::No Discord announcement: the secret DISCORD_WEBHOOK_URL is not set.', env);
      return;
    }
    if (await send(env.DISCORD_WEBHOOK_URL, message, wait)) report(`Announced v${version} on Discord.`, env);
    else report(`::warning::The Discord announcement of v${version} failed after ${TRIES} tries. The release is fine; post it by hand.`, env);
  } catch (error) {
    report(`::warning::No Discord announcement: ${error instanceof Error ? error.message : String(error)}. The release is fine; post it by hand.`, env);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main(process.argv.slice(2));
