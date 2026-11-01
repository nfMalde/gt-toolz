// The window only ever shows the app's own UI. No remote content, no new windows, no permissions but
// the microphone (audio only, for the user's own voice recordings, asked on their click) and the choice of
// the audio output (vibration through a bass shaker or a haptic vest, accessibility), and every request that would leave the app is cancelled: the app talks to the PlayStation in the
// LAN (main process, UDP) and to nothing else. Voice package downloads run in the main process and
// only after the user confirmed them.

import fs from 'node:fs';
import path from 'node:path';
import { app, protocol, session, type IpcMainInvokeEvent, type WebContents } from 'electron';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://gtt`;

/**
 * The built app without an installer: Electron from npm starts the app folder, with the UI next to it (the Mac test
 * package, docs/dev/building.md). It behaves like an installed app: no dev server, no DevTools, the data
 * in the user's data folder.
 */
export const PORTABLE = !app.isPackaged && fs.existsSync(path.join(__dirname, '..', 'ui', 'index.html'));

/**
 * Dev only: the Angular dev server (ng serve). Never in an installed or portable build (security audit 2026-10-24):
 * it would load that address instead of the app, with the whole bridge.
 */
export const DEV_URL = app.isPackaged || PORTABLE ? undefined : process.env.GTT_DEV_URL;

const SCRIPT_SRC = DEV_URL ? `'self' ${DEV_URL}` : `'self'`;
const CONNECT_SRC = DEV_URL ? `'self' ${DEV_URL} ${DEV_URL.replace(/^http/, 'ws')}` : `'self'`;

/** Angular adds component styles at runtime, hence 'unsafe-inline' for styles (never for scripts). */
export const CONTENT_SECURITY_POLICY = [
  `default-src 'none'`,
  `script-src ${SCRIPT_SRC}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data:`,
  `font-src 'self'`,
  `connect-src ${CONNECT_SRC}`,
  `base-uri 'self'`,
  `form-action 'none'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
].join('; ');

/** Must run before the app is ready. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
}

export function isAppUrl(url: string): boolean {
  if (url.startsWith(`${APP_ORIGIN}/`) || url === APP_ORIGIN) return true;
  return !!DEV_URL && (url === DEV_URL || url.startsWith(`${DEV_URL}/`));
}

/** IPC calls are only accepted from the app's own page. */
export function fromApp(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  return isAppUrl(url);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  // The news of each version (apps/ui/public/news).
  '.md': 'text/markdown; charset=utf-8',
};

/** Serves the built UI from uiDir under app://gtt/ (unknown paths get index.html, for the router). */
export function serveUi(uiDir: string): void {
  const root = path.resolve(uiDir);
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'gtt') return new Response('Not found', { status: 404 });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    let file = path.resolve(root, `.${pathname}`);
    // Never anything outside the UI folder.
    if (file !== root && !file.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    // Only plain files: a device name like COM1 (Windows 10 maps it in any folder) would block on a read.
    if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) file = path.join(root, 'index.html');
    const headers = {
      'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
    };
    return new Response(await fs.promises.readFile(file), { headers });
  });
}

/**
 * Devices the app may open directly (WebHID): Sony DualSense and DualSense Edge, for their vibration
 * (accessibility; the browser cannot make them vibrate on its own). No other device.
 */
const DUALSENSE = [
  { vendorId: 0x054c, productId: 0x0ce6 },
  { vendorId: 0x054c, productId: 0x0df2 },
];

function isDualSense(device: { vendorId?: number; productId?: number }): boolean {
  return DUALSENSE.some((d) => d.vendorId === device.vendorId && d.productId === device.productId);
}

/** The app's own page (app://gtt, in dev the Angular dev server) as a permission origin; Chromium passes it with or without a final slash. */
function isAppOrigin(origin: string): boolean {
  const bare = origin.replace(/\/$/, '');
  return bare === APP_ORIGIN || (!!DEV_URL && bare === new URL(DEV_URL).origin);
}

/**
 * Chromium resolves no host name at all (security audit 2026-10-24): the window shows only app://gtt, so a lookup
 * could only come from Chromium itself (prefetching and the like). localhost stays for the dev server. Voice
 * downloads (Node in the main process), the PS5 (UDP) and the overlay server do not use Chromium's resolver. Must run
 * before the app is ready.
 */
export function blockHostLookups(): void {
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND, EXCLUDE localhost');
}

export function hardenSession(): void {
  const ses = session.defaultSession;
  // Only the microphone, only audio (never the camera or the screen), only for the app's own page: the
  // recording page asks for it when the user starts a recording. Everything else is denied.
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    const media = details as { mediaTypes?: string[]; requestingUrl?: string };
    const audioOnly = !!media.mediaTypes?.length && media.mediaTypes.every((type) => type === 'audio');
    const fromApp = isAppUrl(media.requestingUrl ?? contents.getURL());
    callback(fromApp && ((permission === 'media' && audioOnly) || (permission as string) === 'speaker-selection'));
  });
  // speaker-selection: the vibration can go to another audio output than the voices (accessibility).
  ses.setPermissionCheckHandler(
    (_contents, permission, origin, details) =>
      isAppOrigin(origin) &&
      ((permission === 'media' && (details as { mediaType?: string }).mediaType === 'audio') || (permission as string) === 'speaker-selection' || permission === 'hid'),
  );
  ses.setDevicePermissionHandler((details) => details.deviceType === 'hid' && isAppOrigin(details.origin) && isDualSense(details.device as { vendorId?: number; productId?: number }));
  // The browser's device chooser: only a DualSense, only for the app's own page; anything else is refused.
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const device = isAppUrl(details.frame?.url ?? '') ? details.deviceList.find(isDualSense) : undefined;
    callback(device?.deviceId ?? null);
  });
  ses.setSpellCheckerEnabled(false);

  // Nothing leaves the app: only the app's own files, DevTools and (in dev) the Angular dev server.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const { url } = details;
    const allowed = isAppUrl(url) || url.startsWith('devtools://') || url.startsWith('data:') || url.startsWith('blob:') || (!!DEV_URL && url.startsWith(DEV_URL.replace(/^http/, 'ws')));
    if (!allowed) console.warn(`[security] blocked request: ${url}`);
    callback({ cancel: !allowed });
  });

  // The dev server sends no CSP of its own.
  if (DEV_URL) {
    ses.webRequest.onHeadersReceived((details, callback) => {
      const headers = { ...details.responseHeaders };
      if (details.url.startsWith(DEV_URL!)) headers['Content-Security-Policy'] = [CONTENT_SECURITY_POLICY];
      callback({ responseHeaders: headers });
    });
  }
}

export function guardWebContents(): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
