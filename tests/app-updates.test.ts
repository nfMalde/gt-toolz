// Updates from GitHub releases (packages/runtime/src/app-updates.ts, apps/desktop/src/updates.ts): which release is
// newer and fits this system, pre-releases only for those who run one, and the download, checked against the release's
// SHA256SUMS.txt, from GitHub only. Also the news every version ships, and how the windows show Markdown.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { markdownToHtml } from '../apps/ui/src/app/core/markdown';
import {
  compareVersions,
  downloadUpdate,
  fetchReleases,
  installerName,
  newestRelease,
  parseChecksums,
  RELEASE_PUBLIC_KEY,
  releaseNotes,
  type GitHubRelease,
} from '../packages/runtime/src/app-updates';
import { DEFAULT_RUNNER_SETTINGS, normalizeSettings } from '../packages/runtime/src/settings';

const REPO = 'nfMalde/gt-toolz';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-updates-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const download = (tag: string, name: string) => `https://github.com/${REPO}/releases/download/${tag}/${name}`;
function release(version: string, options: { prerelease?: boolean; draft?: boolean; files?: string[] } = {}): GitHubRelease {
  const tag = `v${version}`;
  const files = options.files ?? [installerName(version, 'win32', 'x64')!, installerName(version, 'linux', 'x64')!, installerName(version, 'darwin', 'arm64')!, 'SHA256SUMS.txt', 'SHA256SUMS.txt.sig'];
  return {
    tag_name: tag,
    name: `GT Toolz ${version}`,
    body: `Notes of ${version}`,
    html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
    draft: !!options.draft,
    prerelease: options.prerelease ?? version.includes('-'),
    published_at: '2026-11-01T12:00:00Z',
    assets: files.map((name) => ({ name, browser_download_url: download(tag, name), size: 1000 })),
  };
}

test('versions in semver order, pre-releases before their release, case does not matter', () => {
  const order = ['0.0.9-alpha', '1.0.0-alpha', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.1.0', '2.0.0'];
  for (let i = 1; i < order.length; i++) assert.ok(compareVersions(order[i - 1]!, order[i]!) < 0, `${order[i - 1]} < ${order[i]}`);
  assert.equal(compareVersions('1.0.0-Beta', '1.0.0-beta'), 0);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.ok(compareVersions('1.0.0', 'nonsense') > 0);
});

test('the newest fitting release: never a less tested channel, no drafts, only with an installer, checksums and signature', () => {
  const win = installerName('1.0.3', 'win32', 'x64')!;
  const releases = [
    release('1.2.0-alpha'),
    release('1.1.0-beta'),
    release('1.0.1'),
    release('1.2.0', { draft: true }),
    release('1.0.2', { files: ['SHA256SUMS.txt', 'SHA256SUMS.txt.sig'] }),
    release('1.0.3', { files: [win, 'SHA256SUMS.txt'] }),
    release('1.0.0'),
  ];
  assert.equal(newestRelease(releases, '1.0.0-beta', 'win32', 'x64')?.version, '1.1.0-beta', 'a beta user gets betas and full releases, never an alpha');
  assert.equal(newestRelease(releases, '1.0.0-alpha', 'win32', 'x64')?.version, '1.2.0-alpha', 'an alpha user gets everything');
  assert.equal(newestRelease(releases, '1.0.0', 'win32', 'x64')?.version, '1.0.1', 'a full release only full releases; 1.0.2 has no installer, 1.0.3 no signature');
  assert.equal(newestRelease(releases, '1.2.0-alpha', 'win32', 'x64'), undefined, 'up to date');
  const found = newestRelease(releases, '1.0.0', 'darwin', 'arm64')!;
  assert.deepEqual([found.asset.name, found.sums.name, found.signature.name], ['GT-Toolz-1.0.1-mac-arm64.dmg', 'SHA256SUMS.txt', 'SHA256SUMS.txt.sig']);
  assert.equal(newestRelease(releases, '1.0.0', 'darwin', 'x64'), undefined, 'no Intel disk image in these releases');
  assert.equal(installerName('1.0.0', 'linux', 'x64'), 'gt-toolz_1.0.0_amd64.deb');
  assert.equal(installerName('1.0.0', 'win32', 'x64'), 'GT-Toolz-Setup-1.0.0-x64.exe');
});

test("the update window shows a release's changes, not the download notes below them", () => {
  assert.equal(releaseNotes('### Fixed\n- a\n\n<!-- downloads -->\n---\n\n### Downloads\n- x'), '### Fixed\n- a');
  assert.equal(releaseNotes(null), '');
});

test('checksums in sha256sum format', () => {
  const sums = parseChecksums(`${'a'.repeat(64)}  GT-Toolz-Setup-1.0.0-x64.exe\r\n${'B'.repeat(64)} *gt-toolz_1.0.0_amd64.deb\nnot a line\n`);
  assert.deepEqual([...sums], [['GT-Toolz-Setup-1.0.0-x64.exe', 'a'.repeat(64)], ['gt-toolz_1.0.0_amd64.deb', 'b'.repeat(64)]]);
});

/** A fake GitHub: files by URL, redirects by URL; every request is noted. */
function fakeGitHub(files: Record<string, string | Buffer>, redirects: Record<string, string> = {}) {
  const asked: string[] = [];
  const fetchFake = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (redirects[url]) return new Response(null, { status: 302, headers: { location: redirects[url]! } });
    const body = files[url];
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(typeof body === 'string' ? body : new Uint8Array(body));
  }) as typeof fetch;
  return { fetch: fetchFake, asked };
}

// The project's signing key for the tests (the real one is a secret of the release workflow).
const keys = crypto.generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const sign = (text: string, key = keys.privateKey) => crypto.sign(null, Buffer.from(text), key).toString('base64');

test('the download needs a checksum list signed by the project, and the installer must match it', async () => {
  const installer = Buffer.from('the installer of 1.0.1');
  const name = installerName('1.0.1', 'win32', 'x64')!;
  const found = newestRelease([release('1.0.1')], '1.0.0', 'win32', 'x64')!;
  found.asset.size = installer.length;
  const sha = crypto.createHash('sha256').update(installer).digest('hex');
  const sums = `${sha}  ${name}\n`;
  const cdn = 'https://release-assets.githubusercontent.com/file';
  const signed = (list: string, signature = sign(list)): Record<string, string | Buffer> => ({
    [download('v1.0.1', 'SHA256SUMS.txt')]: list,
    [download('v1.0.1', 'SHA256SUMS.txt.sig')]: signature,
  });
  const source = (fetchFake: typeof fetch) => ({ repo: REPO, version: '1.0.0', fetch: fetchFake, publicKey });
  const github = fakeGitHub({ ...signed(sums), [cdn]: installer }, { [download('v1.0.1', name)]: cdn });
  const file = await downloadUpdate(source(github.fetch), found, dir);
  assert.equal(path.basename(file), name);
  assert.deepEqual(fs.readFileSync(file), installer);
  fs.rmSync(file);

  // Not signed by the project: another key, a signature of another list, none, or a test-signed list for the shipped key.
  const stranger = crypto.generateKeyPairSync('ed25519').privateKey;
  const cases: [string, Record<string, string | Buffer>, string | undefined][] = [
    ['another key', signed(sums, sign(sums, stranger)), publicKey],
    ['another list', signed(sums, sign(`${'1'.repeat(64)}  ${name}\n`)), publicKey],
    ['no signature', signed(sums, ''), publicKey],
    ['the shipped key', signed(sums), undefined],
  ];
  for (const [what, files, key] of cases) {
    const fake = fakeGitHub({ ...files, [download('v1.0.1', name)]: installer });
    await assert.rejects(downloadUpdate({ repo: REPO, version: '1.0.0', fetch: fake.fetch, publicKey: key }, found, dir), /signature is not the project's/, what);
    assert.ok(!fake.asked.includes(download('v1.0.1', name)), `${what}: the installer is not even downloaded`);
  }

  // A file that does not match the signed list: deleted, nothing left over.
  const wrongList = `${'0'.repeat(64)}  ${name}\n`;
  const wrong = fakeGitHub({ ...signed(wrongList), [download('v1.0.1', name)]: installer });
  await assert.rejects(downloadUpdate(source(wrong.fetch), found, dir), /SHA-256 mismatch/);
  assert.deepEqual(fs.readdirSync(dir), []);

  // More than GitHub said: stopped.
  const big = fakeGitHub({ ...signed(sums), [download('v1.0.1', name)]: Buffer.concat([installer, installer]) });
  await assert.rejects(downloadUpdate(source(big.fetch), found, dir), /more than the expected/);
});

test('release files come from this repository on GitHub and its two file servers only', async () => {
  const name = installerName('1.0.1', 'win32', 'x64')!;
  const found = newestRelease([release('1.0.1')], '1.0.0', 'win32', 'x64')!;
  const sums = download('v1.0.1', 'SHA256SUMS.txt');
  const source = (fetchFake: typeof fetch) => ({ repo: REPO, version: '1.0.0', fetch: fetchFake, publicKey });
  // Redirected away from GitHub, or to a file server for anyone's files: refused before anything is fetched there.
  for (const target of ['https://evil.example/file', 'https://raw.githubusercontent.com/someone/x/main/SHA256SUMS.txt', 'http://objects.githubusercontent.com/file']) {
    const away = fakeGitHub({}, { [sums]: target });
    await assert.rejects(downloadUpdate(source(away.fetch), found, dir), /refused: not GitHub/, target);
    assert.ok(!away.asked.includes(target), target);
  }
  // Another repository, also behind dot segments, a query, or another file than the asset's.
  for (const url of [
    `https://github.com/someone/else/releases/download/v1.0.1/${name}`,
    `https://github.com/${REPO}/releases/download/%2e%2e/%2e%2e/%2e%2e/%2e%2e/evil/repo/releases/download/v1.0.1/SHA256SUMS.txt`,
    `https://github.com/${REPO}/releases/download/v1.0.1/SHA256SUMS.txt?x=1`,
    `https://github.com/${REPO}/releases/download/v1.0.1/other.txt`,
  ]) {
    const odd = { ...found, sums: { ...found.sums, browser_download_url: url } };
    await assert.rejects(downloadUpdate(source(fakeGitHub({}).fetch), odd, dir), /not a release file/, url);
  }
});

test('the shipped public key is an Ed25519 key, the one the release workflow signs for', () => {
  // scripts/release/sign.mjs reads it from the source and refuses any other key.
  assert.match(RELEASE_PUBLIC_KEY, /^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=]+\n-----END PUBLIC KEY-----\n$/);
  assert.equal(crypto.createPublicKey(RELEASE_PUBLIC_KEY).asymmetricKeyType, 'ed25519');
});

test('the release list comes from the GitHub API of the repository, an odd repository name is refused', async () => {
  const api = `https://api.github.com/repos/${REPO}/releases?per_page=30`;
  const github = fakeGitHub({ [api]: JSON.stringify([release('1.0.1'), { nonsense: true }]) });
  const releases = await fetchReleases({ repo: REPO, version: '1.0.0', fetch: github.fetch });
  assert.deepEqual(releases.map((r) => r.tag_name), ['v1.0.1']);
  await assert.rejects(fetchReleases({ repo: 'a/b/../../c', version: '1.0.0', fetch: github.fetch }), /Not a GitHub repository/);
});

test('nothing is looked up before the user agreed; the news of every version is shipped', () => {
  assert.deepEqual([DEFAULT_RUNNER_SETTINGS.updateCheck, DEFAULT_RUNNER_SETTINGS.updateAsked, DEFAULT_RUNNER_SETTINGS.newsSeen], [true, false, '']);
  const s = normalizeSettings({ updateCheck: 'yes', updateAsked: true, newsSeen: 7 });
  assert.deepEqual([s.updateCheck, s.updateAsked, s.newsSeen], [true, true, '']);
  const version = (JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { version: string }).version;
  for (const language of ['en', 'de']) assert.ok(fs.existsSync(path.join(import.meta.dirname, '..', 'apps', 'ui', 'public', 'news', `${version}.${language}.md`)), `news for ${version} (${language})`);
});

test('the windows show a safe part of Markdown: no HTML of its own, links as text', () => {
  const html = markdownToHtml('## New\n\nSome **bold** and *italic* and `code <b>`.\n\n- one\n- [two](https://example.com)\n\n<script>alert(1)</script>');
  assert.match(html, /<h4>New<\/h4>/);
  assert.match(html, /<strong>bold<\/strong> and <em>italic<\/em> and <code>code &lt;b&gt;<\/code>/);
  assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
  assert.doesNotMatch(html, /<script|href|example\.com/);
  assert.match(html, /&lt;script&gt;/);
});
