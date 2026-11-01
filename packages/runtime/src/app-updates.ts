// Updates of the app from its GitHub releases (only official installed builds look, after the user agreed; the main
// process wires it up in apps/desktop/src/updates.ts). Which release is newer, which file fits this system, and the
// download, checked against the release's SHA256SUMS.txt, whose signature must be the project's (RELEASE_PUBLIC_KEY):
// whoever could change a release on GitHub still cannot hand the app an installer. Nothing here starts an installer.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** A release as GitHub's REST API lists it (the fields used). */
export interface GitHubRelease {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: GitHubAsset[];
}

export interface GitHubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

/** A newer release with the installer for this system, its checksum list and that list's signature. */
export interface FoundUpdate {
  version: string;
  release: GitHubRelease;
  asset: GitHubAsset;
  sums: GitHubAsset;
  signature: GitHubAsset;
}

/** The checksum list every release carries next to its installers (scripts/release/lib.mjs). */
export const CHECKSUMS_FILE = 'SHA256SUMS.txt';
/** Its Ed25519 signature, base64 (scripts/release/sign.mjs, in the release workflow's approved publish job). */
export const SIGNATURE_FILE = 'SHA256SUMS.txt.sig';
/**
 * The project's public key: only lists signed with its private key (a secret of the release workflow's "release"
 * environment) are accepted. A new key needs a release signed with the old one that ships the new one.
 */
export const RELEASE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAzsvxQiKtHrV5p3wTaZ9do/KoTouzXCDi3Kv/lfihLxM=
-----END PUBLIC KEY-----
`;
/** On the release page the download notes follow this marker (scripts/release/plan.mjs); the app shows what is above. */
export const RELEASE_NOTES_END = '<!-- downloads -->';

/** A release's notes for the update window: its changes, without the download notes below them. */
export function releaseNotes(body: string | null | undefined): string {
  return (body ?? '').split(RELEASE_NOTES_END)[0]!.trim();
}

/** owner/name, as on GitHub. */
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** The parts of a version (semver: 1.2.3, 1.0.0-beta, 1.0.0-beta.2), or undefined for anything else. */
export function parseVersion(version: string): { core: [number, number, number]; pre: string[] } | undefined {
  const match = VERSION.exec(version.trim().replace(/^v/, ''));
  if (!match) return undefined;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ? match[4].split('.') : [] };
}

/** Below 0: a is older than b; 0: the same; above 0: a is newer. Semver order (1.0.0-alpha < 1.0.0-beta < 1.0.0). */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return x ? 1 : y ? -1 : 0;
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i]! - y.core[i]!;
  // A release is newer than its pre-releases.
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    // Case does not matter: "1.0.0-Beta" is the same as "1.0.0-beta".
    const order = p.toLowerCase().localeCompare(q.toLowerCase(), 'en');
    if (order) return order;
  }
  return 0;
}

export function isPrerelease(version: string): boolean {
  return !!parseVersion(version)?.pre.length;
}

/** alpha 0, beta 1 (rc and the like too), a full release 2: an update never goes to a less tested channel. */
function channelRank(version: string): number {
  const pre = parseVersion(version)?.pre[0]?.toLowerCase();
  return pre === undefined ? 2 : pre === 'alpha' ? 0 : 1;
}

/** The installer's name for this system (scripts/release/builder.mjs: artifactName). */
export function installerName(version: string, platform: NodeJS.Platform, arch: string): string | undefined {
  if (platform === 'win32') return `GT-Toolz-Setup-${version}-x64.exe`;
  if (platform === 'linux') return arch === 'x64' ? `gt-toolz_${version}_amd64.deb` : undefined;
  if (platform === 'darwin') return `GT-Toolz-${version}-mac-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
  return undefined;
}

/**
 * The newest release that is newer than the running version and has an installer for this system, its checksum list
 * and the signature. Never a less tested channel: a full release gets full releases, a beta betas and full releases,
 * an alpha everything.
 */
export function newestRelease(releases: readonly GitHubRelease[], current: string, platform: NodeJS.Platform, arch: string): FoundUpdate | undefined {
  const rank = channelRank(current);
  let found: FoundUpdate | undefined;
  for (const release of releases) {
    if (release.draft) continue;
    const version = release.tag_name.replace(/^v/, '');
    if (!parseVersion(version) || compareVersions(version, current) <= 0) continue;
    if (channelRank(version) < rank || (release.prerelease && rank === 2)) continue;
    if (found && compareVersions(version, found.version) <= 0) continue;
    const name = installerName(version, platform, arch);
    const asset = release.assets.find((a) => a.name === name);
    const sums = release.assets.find((a) => a.name === CHECKSUMS_FILE);
    const signature = release.assets.find((a) => a.name === SIGNATURE_FILE);
    if (asset && sums && signature) found = { version, release, asset, sums, signature };
  }
  return found;
}

/** "<sha256>  <file>" per line (sha256sum's format), as a map from file name to checksum. */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64}) [ *](.+)$/i.exec(line.trim());
    if (match) sums.set(match[2]!.trim(), match[1]!.toLowerCase());
  }
  return sums;
}

/** What the update calls need: the repository (owner/name), the running version, and fetch (tests hand in their own). */
export interface UpdateSource {
  repo: string;
  version: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** The key the checksum list must be signed with (tests hand in their own). */
  publicKey?: string;
}

/** The API's answer and the checksum list are small; more is never the right answer. */
const MAX_LIST_BYTES = 4 * 1024 * 1024;
const MAX_SUMS_BYTES = 64 * 1024;
const MAX_SIGNATURE_BYTES = 1024;
/** The release list, the checksum list and the signature come at once or not at all. */
const SMALL_TIMEOUT_MS = 30_000;
/** An installer is about 110 MB; GitHub's own limit for a release file is 2 GB. */
const MAX_INSTALLER_BYTES = 1024 * 1024 * 1024;
const MAX_REDIRECTS = 5;
/** A download that receives nothing for this long has stalled. */
const IDLE_TIMEOUT_MS = 60_000;

/**
 * Only GitHub: its API, the release pages and the two file servers release downloads are redirected to (not raw. or
 * gist., which serve anyone's files); https only.
 */
export function allowedUpdateUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  return (
    parsed.protocol === 'https:' &&
    ['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'].includes(host)
  );
}

/** The caller's signal and a time limit together. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function checkedRepo(repo: string): string {
  if (!REPO.test(repo)) throw new Error(`Not a GitHub repository: ${repo}`);
  return repo;
}

async function fetchFollowing(source: UpdateSource, url: string, signal: AbortSignal | undefined): Promise<Response> {
  const get = source.fetch ?? fetch;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!allowedUpdateUrl(current)) throw new Error(`Update from ${new URL(current).host} refused: not GitHub`);
    const response = await get(current, {
      signal,
      redirect: 'manual',
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `GT-Toolz/${source.version}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) return response;
    await response.body?.cancel();
    current = new URL(location, current).toString();
  }
  throw new Error(`${url}: too many redirects`);
}

/** A small body, at most maxBytes. */
async function readBytes(response: Response, maxBytes: number, what: string): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error(`${what}: HTTP ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > maxBytes) throw new Error(`${what}: more than ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** The repository's releases, newest first (GitHub's order). */
export async function fetchReleases(source: UpdateSource): Promise<GitHubRelease[]> {
  const url = `https://api.github.com/repos/${checkedRepo(source.repo)}/releases?per_page=30`;
  const signal = withTimeout(source.signal, SMALL_TIMEOUT_MS);
  const list = JSON.parse((await readBytes(await fetchFollowing(source, url, signal), MAX_LIST_BYTES, 'releases')).toString('utf8')) as unknown;
  if (!Array.isArray(list)) throw new Error('releases: not a list');
  return list.filter(
    (r): r is GitHubRelease => !!r && typeof r === 'object' && typeof (r as GitHubRelease).tag_name === 'string' && Array.isArray((r as GitHubRelease).assets),
  );
}

/**
 * Release files come from this repository's release downloads only: https://github.com/<owner>/<name>/releases/
 * download/<tag>/<file>, checked on the parsed address (its dot segments resolved), the file being the asset's.
 */
function releaseFile(source: UpdateSource, asset: GitHubAsset): string {
  const [owner, name] = checkedRepo(source.repo).toLowerCase().split('/');
  let url: URL;
  try {
    url = new URL(asset.browser_download_url);
  } catch {
    throw new Error(`${asset.name}: not a release file of ${source.repo}`);
  }
  const parts = url.pathname.split('/');
  const ok =
    url.origin === 'https://github.com' &&
    !url.search &&
    parts.length === 7 &&
    parts[1]!.toLowerCase() === owner &&
    parts[2]!.toLowerCase() === name &&
    parts[3] === 'releases' &&
    parts[4] === 'download' &&
    decodeURIComponent(parts[6]!) === asset.name;
  if (!ok) throw new Error(`${asset.name}: not a release file of ${source.repo}`);
  return url.toString();
}

/** The checksum list as signed: its bytes and the signature over them, with the project's key. */
async function signedChecksums(source: UpdateSource, update: FoundUpdate): Promise<Map<string, string>> {
  const signal = withTimeout(source.signal, SMALL_TIMEOUT_MS);
  const sums = await readBytes(await fetchFollowing(source, releaseFile(source, update.sums), signal), MAX_SUMS_BYTES, CHECKSUMS_FILE);
  const signature = (await readBytes(await fetchFollowing(source, releaseFile(source, update.signature), signal), MAX_SIGNATURE_BYTES, SIGNATURE_FILE)).toString('utf8').trim();
  let valid = false;
  try {
    valid = crypto.verify(null, sums, source.publicKey ?? RELEASE_PUBLIC_KEY, Buffer.from(signature, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) throw new Error(`${CHECKSUMS_FILE}: the signature is not the project's, update refused`);
  return parseChecksums(sums.toString('utf8'));
}

export interface DownloadOptions {
  onProgress?: (received: number, total: number) => void;
}

/**
 * Downloads the installer into dir and checks it against the release's SHA256SUMS.txt; returns its path. A file that
 * is already there and right is not downloaded again; a wrong one is deleted.
 */
export async function downloadUpdate(source: UpdateSource, update: FoundUpdate, dir: string, options: DownloadOptions = {}): Promise<string> {
  // The signed list names the installer with its version: an old signed list does not fit a newer tag.
  const sums = await signedChecksums(source, update);
  const expected = sums.get(update.asset.name);
  if (!expected) throw new Error(`${update.asset.name}: not in ${CHECKSUMS_FILE}`);
  const total = update.asset.size;
  if (!(total > 0 && total <= MAX_INSTALLER_BYTES)) throw new Error(`${update.asset.name}: unexpected size ${total}`);

  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, path.basename(update.asset.name));
  if (fs.existsSync(target) && (await sha256(target)) === expected) {
    options.onProgress?.(total, total);
    return target;
  }
  const partial = `${target}.part`;
  const idle = new AbortController();
  const timer = setTimeout(() => idle.abort(new Error(`${update.asset.name}: no data for ${IDLE_TIMEOUT_MS / 1000} s`)), IDLE_TIMEOUT_MS);
  const signal = source.signal ? AbortSignal.any([source.signal, idle.signal]) : idle.signal;
  const hash = crypto.createHash('sha256');
  let received = 0;
  let out: fs.WriteStream | undefined;
  try {
    const response = await fetchFollowing(source, releaseFile(source, update.asset), signal);
    if (!response.ok || !response.body) throw new Error(`${update.asset.name}: HTTP ${response.status}`);
    out = fs.createWriteStream(partial);
    await pipeline(
      response.body as unknown as AsyncIterable<Uint8Array>,
      async function* (chunks: AsyncIterable<Uint8Array>) {
        for await (const chunk of chunks) {
          received += chunk.length;
          // GitHub says how big the file is: more is never the right one.
          if (received > total) throw new Error(`${update.asset.name}: more than the expected ${total} bytes, stopped`);
          hash.update(chunk);
          timer.refresh();
          options.onProgress?.(received, total);
          yield chunk;
        }
      },
      out,
      { signal },
    );
  } catch (err) {
    // Removed once the stream has let go of it (Windows keeps an open file).
    const stream = out;
    if (stream && !stream.closed) await new Promise<void>((resolve) => (stream.once('close', () => resolve()), stream.destroy()));
    fs.rmSync(partial, { force: true });
    throw idle.signal.aborted ? idle.signal.reason : err;
  } finally {
    clearTimeout(timer);
  }
  const actual = hash.digest('hex');
  if (actual !== expected) {
    fs.rmSync(partial, { force: true });
    throw new Error(`${update.asset.name}: SHA-256 mismatch (expected ${expected}, got ${actual}), file deleted`);
  }
  fs.rmSync(target, { force: true });
  fs.renameSync(partial, target);
  return target;
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
