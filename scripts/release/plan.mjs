// The release plan for the release workflow (.github/workflows/release.yml): which version, what changes for it, and
// its release notes. Plain Node, no packages.
//
//   node scripts/release/plan.mjs --channel=beta [--version=1.0.0-beta] [--bump=none|pre|patch|minor|major] [--apply]
//
// The version: --version as given, else the root package.json's, bumped (patch/minor/major: the next 1.0.1, 1.1.0,
// 2.0.0; pre: the next pre-release of the same version, 1.0.0-beta → 1.0.0-beta.2) and fitted to the channel (alpha
// and beta add "-alpha"/"-beta"; full drops a pre-release part: 1.0.0-beta → 1.0.0). With --apply the working tree is
// changed for it: every package.json and the lockfile get the version, CHANGELOG.md's "Unreleased" section becomes the
// version's (when it has none yet), and the news apps/ui/public/news/next.<language>.md become the version's.
// Writes release/notes.md (the version's changelog section) and, in GitHub Actions, the step outputs version,
// prerelease and changed.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, parseArgs, readJson, runIfMain } from './lib.mjs';

const CHANNELS = ['alpha', 'beta', 'full'];
const BUMPS = ['none', 'pre', 'patch', 'minor', 'major'];
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const NEWS_DIR = path.join(ROOT, 'apps', 'ui', 'public', 'news');
const NEWS_LANGUAGES = ['en', 'de'];
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

/** Every workspace of the root package.json (their folders; "packages/*" is every folder in it with a package.json). */
function workspaces() {
  return (readJson(path.join(ROOT, 'package.json')).workspaces ?? []).flatMap((pattern) => {
    if (!pattern.endsWith('/*')) return [pattern];
    const parent = pattern.slice(0, -2);
    return fs
      .readdirSync(path.join(ROOT, parent), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, parent, entry.name, 'package.json')))
      .map((entry) => `${parent}/${entry.name}`);
  });
}

/** The version for this release (no files changed). */
export function planVersion({ current, version, bump = 'none', channel }) {
  if (!CHANNELS.includes(channel)) fail(`channel must be one of ${CHANNELS.join(', ')}, not "${channel}"`);
  if (!BUMPS.includes(bump)) fail(`bump must be one of ${BUMPS.join(', ')}, not "${bump}"`);
  let next;
  if (version) {
    next = version.replace(/^v/, '');
  } else {
    const m = SEMVER.exec(current);
    if (!m) fail(`the root package.json has no semver version: ${current}`);
    let [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const pre = m[4];
    if (bump === 'major') [major, minor, patch] = [major + 1, 0, 0];
    if (bump === 'minor') [minor, patch] = [minor + 1, 0];
    if (bump === 'patch') patch += 1;
    const core = `${major}.${minor}.${patch}`;
    if (channel === 'full') next = core;
    else if (bump === 'pre') {
      // 1.0.0-beta → 1.0.0-beta.2 → 1.0.0-beta.3; from another channel or none: its first.
      const same = pre && pre.split('.')[0].toLowerCase() === channel;
      const n = same ? Number(pre.split('.')[1] ?? 1) + 1 : 1;
      next = n > 1 ? `${core}-${channel}.${n}` : `${core}-${channel}`;
    } else next = bump === 'none' && pre && pre.split('.')[0].toLowerCase() === channel ? `${core}-${pre}` : `${core}-${channel}`;
  }
  const m = SEMVER.exec(next);
  if (!m) fail(`not a semver version: ${next}`);
  const pre = m[4];
  if (channel === 'full' && pre) fail(`a full release has no pre-release part: ${next}`);
  if (channel !== 'full' && !(pre && pre.split('.')[0].toLowerCase() === channel)) fail(`a ${channel} release must be <version>-${channel}[.n]: ${next}`);
  return { version: next, prerelease: channel !== 'full' };
}

/** CHANGELOG.md's section of a version, without its heading; undefined when there is none. */
export function changelogSection(text, version) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`).test(line));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, i) => i > start && /^## \[/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .filter((line) => !/^\[[^\]]+\]: /.test(line))
    .join('\n')
    .trim();
}

/** The "Unreleased" section becomes the version's, with today's date; a fresh empty "Unreleased" stays on top. */
export function releaseChangelog(text, version, date) {
  if (changelogSection(text, version) !== undefined) return text;
  const unreleased = changelogSection(text, 'Unreleased');
  if (!unreleased) fail(`CHANGELOG.md has no section for ${version} and nothing under "Unreleased"`);
  return text.replace(/^## \[Unreleased\][^\n]*\n/m, `## [Unreleased]\n\n## [${version}] - ${date}\n`);
}

/**
 * Below the changes on the release page: which file is for which system, and how to check them. The app's update
 * window shows only what is above the marker (packages/runtime/src/app-updates.ts, RELEASE_NOTES_END).
 */
function downloads(version, prerelease) {
  const repo = process.env.GITHUB_REPOSITORY || 'nfMalde/gt-toolz';
  return [
    '<!-- downloads -->',
    '---',
    '',
    '### Downloads',
    '',
    `- **Windows 10/11 (x64):** \`GT-Toolz-Setup-${version}-x64.exe\``,
    `- **macOS 13 or later:** \`GT-Toolz-${version}-mac-arm64.dmg\` (Apple silicon) or \`GT-Toolz-${version}-mac-x64.dmg\` (Intel)`,
    `- **Linux (Ubuntu 22.04+, Debian 12+, x64):** \`gt-toolz_${version}_amd64.deb\``,
    '',
    `The installers are not signed: Windows SmartScreen and macOS Gatekeeper ask once ([how to install](https://github.com/${repo}#installing)). Check a file against \`SHA256SUMS.txt\`, or its build provenance with \`gh attestation verify <file> --repo ${repo}\`.`,
    ...(prerelease ? ['', '**Pre-release:** Windows is fully tested; macOS and Linux only partly, errors or crashes can happen there. Feedback is welcome in the issues.'] : []),
    '',
  ].join('\n');
}

/** Sets the version in every package.json and in the lockfile. */
function setVersion(version) {
  const write = (file, json) => fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  const rootFile = path.join(ROOT, 'package.json');
  const root = readJson(rootFile);
  write(rootFile, { ...root, version });
  for (const dir of workspaces()) {
    const file = path.join(ROOT, dir, 'package.json');
    write(file, { ...readJson(file), version });
  }
  const lockFile = path.join(ROOT, 'package-lock.json');
  const lock = readJson(lockFile);
  lock.version = version;
  for (const key of ['', ...workspaces()]) if (lock.packages?.[key]) lock.packages[key].version = version;
  write(lockFile, lock);
}

export default function plan(args) {
  const current = readJson(path.join(ROOT, 'package.json')).version;
  const { version, prerelease } = planVersion({ current, version: typeof args.version === 'string' ? args.version : '', bump: args.bump || 'none', channel: args.channel || 'beta' });
  const changes = [];
  const date = new Date().toISOString().slice(0, 10);

  if (args.apply) {
    if (version !== current) {
      setVersion(version);
      changes.push(`version ${current} → ${version}`);
    }
    const text = fs.readFileSync(CHANGELOG, 'utf8');
    const released = releaseChangelog(text, version, date);
    if (released !== text) {
      fs.writeFileSync(CHANGELOG, released);
      changes.push(`CHANGELOG.md: "Unreleased" is ${version} now`);
    }
    for (const language of NEWS_LANGUAGES) {
      const target = path.join(NEWS_DIR, `${version}.${language}.md`);
      const next = path.join(NEWS_DIR, `next.${language}.md`);
      if (!fs.existsSync(target) && fs.existsSync(next)) {
        fs.renameSync(next, target);
        changes.push(`news/next.${language}.md is news/${version}.${language}.md now`);
      }
    }
  }

  // What the release needs, also without --apply (the preview says what is missing).
  const notes = changelogSection(fs.readFileSync(CHANGELOG, 'utf8'), version);
  if (!notes) fail(`CHANGELOG.md has no section "## [${version}]" (or put the changes under "## [Unreleased]")`);
  for (const language of NEWS_LANGUAGES) {
    if (!fs.existsSync(path.join(NEWS_DIR, `${version}.${language}.md`)))
      fail(`no news for ${version}: add apps/ui/public/news/${version}.${language}.md (or next.${language}.md)`);
  }
  fs.mkdirSync(path.join(ROOT, 'release'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'release', 'notes.md'), `${notes}\n\n${downloads(version, prerelease)}`);

  console.log(`version ${version}${prerelease ? ' (pre-release)' : ''}`);
  for (const change of changes) console.log(`  ${change}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nprerelease=${prerelease}\nchanged=${changes.length > 0}\n`);
  }
  return { version, prerelease, changes };
}

await runIfMain(import.meta.url, plan);
