import fs from 'node:fs';
import path from 'node:path';
import { isLanAddress } from './app-api';

export interface SessionLog {
  /** Path without extension, e.g. captures/2026-10-18-19-01-29_C */
  baseName: string;
  /** Console (plain, unless echo is off) and log file (with timestamp). */
  log: (line: string) => void;
  logToFile: (line: string) => void;
  close: () => Promise<void>;
}

/**
 * What a log file must not contain, with the placeholder that replaces it (the user, 2026-10-24: logs go into GitHub
 * issues and stay anonymous): names (the driver, other players, the PlayStation's name) and folders (the data folder,
 * the user's home folder). IP addresses, e-mail addresses and user names in paths are replaced in any case.
 */
export interface LogPrivacy {
  names: { value: string; as: string }[];
  paths: { value: string; as: string }[];
}

export interface SessionLogOptions {
  echo?: boolean;
  /** Read for every line: names can change while the session runs (a new reference, the driver's name). */
  privacy?: () => LogPrivacy;
  /** The detailed log: every call, crew message and help step too (setting "Ausführliches Protokoll"). */
  detailed?: () => boolean;
}

/** A session log stops at this size (a detailed log of a long stream is about 1 MB). */
const MAX_LOG_BYTES = 64 * 1024 * 1024;

/** Local date and time as used in file names: 2026-10-18-19-01-29. */
export function fileStamp(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

/** Opens <dir>/<local timestamp>_<suffix>.log. The file gets anonymous lines only; the detailed lines only on request. */
export function openSessionLog(dir: string, suffix: string, options: SessionLogOptions = {}): SessionLog {
  // Local time, so file names match the timestamps in the log.
  const baseName = path.join(dir, `${fileStamp()}_${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  const stream = fs.createWriteStream(`${baseName}.log`);
  const echo = options.echo ?? true;
  // A full disk or a line after the end must not stop the app (release check 2026-10-28): the log just stops.
  let open = true;
  stream.on('error', (err) => {
    if (open) console.error(`Session log stopped: ${err.message}`);
    open = false;
  });

  let bytes = 0;

  const logToFile = (line: string) => {
    if (!open || (!options.detailed?.() && isDetailLine(line))) return;
    const t = new Date();
    const text = anonymize(line, options.privacy?.() ?? { names: [], paths: [] });
    const entry = `${t.toTimeString().slice(0, 8)}.${String(t.getMilliseconds()).padStart(3, '0')} ${text}\n`;
    bytes += Buffer.byteLength(entry);
    // Something that logs without end (a flood of packets) must not fill the disk.
    if (bytes > MAX_LOG_BYTES) {
      open = false;
      stream.write(`log ends here: more than ${MAX_LOG_BYTES / 1024 / 1024} MB\n`);
      return;
    }
    stream.write(entry);
  };
  return {
    baseName,
    logToFile,
    log: (line) => {
      if (echo) console.log(line);
      logToFile(line);
    },
    close: () => {
      open = false;
      return new Promise((resolve) => stream.end(resolve));
    },
  };
}

/** Lines of these kinds go into the detailed log only: what was said and planned, moment by moment. */
const DETAIL_TAGS = new Set(['CUE', 'ANNOUNCE', 'NOTE', 'HELP', 'REMARK', 'SECTOR', 'PLAN', 'PREWARM', 'SAY']);

/**
 * The standard log keeps what happened (connection, mode, reference, laps, every corner's result, new and fixed
 * feedback, errors); the detailed one adds every call, crew message, help step and sector, and the countdowns of a
 * retry. On stream (2026-10-23) calls made 1,400 of 2,600 lines.
 */
export function isDetailLine(line: string): boolean {
  if (/^\s*\d+\s*$/.test(line)) return true;
  const tag = /^([A-Z]+)\s/.exec(line)?.[1];
  if (!tag) return false;
  if (DETAIL_TAGS.has(tag)) return true;
  if (tag === 'FEEDBACK') return !/^FEEDBACK\s+\d+ (new|resolved)/.test(line);
  // The crew's spoken messages; its start in a race and its voice stay.
  if (tag === 'CREW') return line.includes('"');
  return false;
}

// Also at the end of a sentence ("… at 192.168.1.20."), never inside a version like 1.2.3.4.5.
const IPV4 = /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?!\.?\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const MAC = /(?<![\w:-])[0-9A-Fa-f]{2}(?:([:-])[0-9A-Fa-f]{2})(?:\1[0-9A-Fa-f]{2}){4}(?![\w:-])/g;
// The user folder up to the next slash, with its spaces ("C:\Users\Max Muster\…"); without a slash after it, up
// to the first space.
const WINDOWS_USER = /([A-Za-z]:[\\/]+Users[\\/]+)(?:[^\\/"':\r\n]+(?=[\\/])|[^\\/\s"']+)/gi;
const UNIX_USER = /(\/(?:home|Users)\/)(?:[^/"':\r\n]+(?=\/)|[^/\s"']+)/g;

/**
 * A log line without personal data: the given folders and names become their placeholders, then any IP address
 * ("<lan-ip>", "<ip>"; this PC's 127.x stays), e-mail address and user name in a path.
 */
export function anonymize(line: string, privacy: LogPrivacy): string {
  let out = line;
  for (const { value, as } of privacy.paths) {
    if (!value) continue;
    // Either slash, any case (Windows paths).
    const pattern = escapeRegExp(path.resolve(value)).replace(/\\\\|\//g, '[\\\\/]');
    out = out.replace(new RegExp(pattern, 'gi'), as);
  }
  out = out.replace(WINDOWS_USER, '$1<user>').replace(UNIX_USER, '$1<user>');
  out = out.replace(EMAIL, '<email>');
  out = out.replace(MAC, '<mac>');
  out = out.replace(IPV4, (ip) => (ip.startsWith('127.') || ip === '0.0.0.0' || ip === '255.255.255.255' ? ip : isLanAddress(ip) ? '<lan-ip>' : '<ip>'));
  // Longest first: "Max Muster" before "Max", or a PS5 called "Max Muster PS5" would keep the surname.
  const names = [...privacy.names].sort((a, b) => b.value.trim().length - a.value.trim().length);
  for (const { value, as } of names) {
    const name = value.trim();
    if (name.length < 2) continue;
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu'), as);
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
