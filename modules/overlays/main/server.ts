// OBS overlay (browser source; docs/dev/architecture.md, feedback from the user's friend, 2026-10-22): a small web server on this PC
// only (127.0.0.1, the user's choice), off by default. It serves one overlay page, put together in the app's editor
// (stream feedback 2026-10-23: one link instead of many), and streams the layout and the telemetry to it as
// server-sent events; nothing is loaded from anywhere else and the page runs no inline code.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { OverlayFrame, OverlayLayout, OverlayStatus } from '../src/api';
import { PAGE_CSS } from '../page/style';

/** More streams than an OBS scene needs are refused (a page left open in a browser loop must not pile up). */
const MAX_CLIENTS = 16;
/** A comment now and then keeps idle streams open through OBS's browser. */
const KEEP_ALIVE_MS = 15_000;

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

/** A client with more than this still unsent skips frames until it has caught up (about four frames). */
const MAX_BACKLOG_BYTES = 2048;
/** A client behind for this long has stopped reading (a frozen source): it is dropped and frees its slot. */
const STALLED_MS = 10_000;

/** The overlay's frames: subscribes, and the returned function stops them. */
export type FrameSource = (listener: (frame: OverlayFrame) => void) => () => void;

/** What the overlay shows now: the editor's layout, the labels in the app's language. */
export interface OverlayLook {
  layout: OverlayLayout;
  language: string;
  /** Hide outside races, time trials and qualifying. */
  autoHide: boolean;
}

export class OverlayServer {
  private server: http.Server | undefined;
  private readonly clients = new Set<http.ServerResponse>();
  private enabled = false;
  private port = 0;
  private error: string | undefined;
  private last: string | undefined;
  /** The layout event sent last: a change in the editor goes out once, not on every settings change. */
  private lastLayout: string | undefined;
  private keepAlive: NodeJS.Timeout | undefined;
  /** Clients that could not take the last frame, since when (a stalled one is dropped at a keep-alive). */
  private readonly behindSince = new Map<http.ServerResponse, number>();
  /** Starting and stopping one after the other (release check 2026-10-28: two quick port changes left a server behind). */
  private queue: Promise<unknown> = Promise.resolve();
  /** Frames come only while the server listens. */
  private stopFrames: (() => void) | undefined;
  /** What the page is built from, as a short hash (build()). */
  private builtFrom: string | undefined;

  /** frames: about 30 a second; clientFile: the bundled browser script (overlay-client.js); look: the layout and language now. */
  constructor(
    private readonly frames: FrameSource,
    private readonly clientFile: string,
    private readonly look: () => OverlayLook,
  ) {}

  /** Starts, stops or moves the server to the settings' port; the result says whether it listens. */
  apply(enabled: boolean, port: number): Promise<OverlayStatus> {
    return this.inTurn(async () => {
      if (enabled === this.enabled && port === this.port && (!enabled || this.server)) return this.status();
      await this.close();
      this.enabled = enabled;
      this.port = port;
      this.error = undefined;
      if (enabled) await this.start();
      return this.status();
    });
  }

  status(): OverlayStatus {
    return { enabled: this.enabled, running: !!this.server, port: this.port, ...(this.error ? { error: this.error } : {}) };
  }

  /** The editor changed the layout, or the app its language: open overlays redraw at once. */
  refresh(): void {
    const event = this.layoutEvent();
    if (event === this.lastLayout) return;
    this.lastLayout = event;
    this.write(event);
  }

  stop(): Promise<void> {
    return this.inTurn(() => this.close());
  }

  private inTurn<T>(step: () => Promise<T>): Promise<T> {
    const result = this.queue.then(step);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async close(): Promise<void> {
    this.stopFrames?.();
    this.stopFrames = undefined;
    clearInterval(this.keepAlive);
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.behindSince.clear();
    const server = this.server;
    this.server = undefined;
    if (!server) return;
    // close() waits for every open connection, also a request that never finishes its header (it would keep the
    // settings from saving and the app from quitting): those are cut.
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
  }

  private start(): Promise<void> {
    return new Promise((resolve) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      const failed = (err: NodeJS.ErrnoException) => {
        this.error = err.code ?? err.message;
        resolve();
      };
      server.once('error', failed);
      server.listen(this.port, '127.0.0.1', () => {
        server.off('error', failed);
        // A later error (too many open connections) must not end the app.
        server.on('error', (err) => console.error(`Overlay server: ${err.message}`));
        this.server = server;
        this.stopFrames = this.frames((frame) => this.broadcast(frame));
        this.keepAlive = setInterval(() => this.tick(), KEEP_ALIVE_MS);
        resolve();
      });
    });
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Only under its own name on this PC: a web page somewhere else cannot reach it through a DNS trick.
    const host = req.headers.host ?? '';
    if (host !== `127.0.0.1:${this.port}` && host !== `localhost:${this.port}`) return this.send(res, 403, 'text/plain', 'Forbidden');
    // Only OBS (a navigation: Sec-Fetch-Site "none") and the overlay page itself ("same-origin"): another web page in
    // the browser may not use the stream, not even blindly to take up its slots (security audit 2026-10-24).
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${this.port}` && origin !== `http://localhost:${this.port}`) return this.send(res, 403, 'text/plain', 'Forbidden');
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'none' && site !== 'same-origin') return this.send(res, 403, 'text/plain', 'Forbidden');
    if (req.method !== 'GET') return this.send(res, 405, 'text/plain', 'Method not allowed');
    let path: string;
    try {
      path = new URL(req.url ?? '/', `http://${host}`).pathname;
    } catch {
      // A target like "http://[" (no browser sends it): an exception here would stop the whole app with an error box.
      return this.send(res, 400, 'text/plain', 'Bad request');
    }
    if (path === '/events') return this.stream(req, res);
    if (path === '/overlay.css') return this.send(res, 200, 'text/css; charset=utf-8', PAGE_CSS);
    if (path === '/overlay.js') {
      fs.readFile(this.clientFile, (err, data) => (err ? this.send(res, 500, 'text/plain', 'Overlay script missing') : this.send(res, 200, 'text/javascript; charset=utf-8', data)));
      return;
    }
    if (path === '/') return this.send(res, 200, 'text/html; charset=utf-8', indexPage(this.port));
    if (path === '/overlay') return this.send(res, 200, 'text/html; charset=utf-8', overlayPage(this.look().language));
    this.send(res, 404, 'text/plain', 'Not found');
  }

  /** Server-sent events: the layout and the latest frame at once, then every frame (and every new layout). */
  private stream(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (this.clients.size >= MAX_CLIENTS) return this.send(res, 503, 'text/plain', 'Too many overlays');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive' });
    // Every frame goes out at once, not gathered into larger packets.
    res.socket?.setNoDelay(true);
    res.write('retry: 2000\n\n');
    this.lastLayout = this.layoutEvent();
    res.write(this.lastLayout);
    if (this.last) res.write(this.last);
    this.clients.add(res);
    req.on('close', () => {
      this.clients.delete(res);
      this.behindSince.delete(res);
    });
  }

  private layoutEvent(): string {
    const { layout, language, autoHide } = this.look();
    return `event: layout\ndata: ${JSON.stringify({ layout, language, autoHide, build: this.build() })}\n\n`;
  }

  /**
   * The page's script and style as they are now. OBS keeps a browser source open across app updates and only the
   * stream connects again, so the old script would go on drawing; the page loads itself again when this changes
   * (the user, 2026-10-31: after 0.0.7 the overlay still stayed after the flag, the 0.0.6 script was running).
   */
  private build(): string {
    if (this.builtFrom === undefined) {
      let script: Buffer | string = '';
      try {
        script = fs.readFileSync(this.clientFile);
      } catch {
        // Missing: /overlay.js answers with an error, the page shows nothing either way.
      }
      this.builtFrom = createHash('sha256').update(script).update(PAGE_CSS).digest('hex').slice(0, 16);
    }
    return this.builtFrom;
  }

  /**
   * A frame to every overlay. One that has not taken the frames before yet (OBS drawing slowly) gets none: it would
   * work through old frames and fall behind (stream feedback 2026-10-25: the gear showed 1 to 2 s late).
   */
  private broadcast(frame: OverlayFrame): void {
    this.last = `data: ${JSON.stringify(frame)}\n\n`;
    for (const client of this.clients) {
      if (client.writableLength < MAX_BACKLOG_BYTES) {
        this.behindSince.delete(client);
        client.write(this.last);
      } else if (!this.behindSince.has(client)) this.behindSince.set(client, Date.now());
    }
  }

  /**
   * The keep-alive. A client still behind after STALLED_MS reads nothing any more: without this it would keep its slot
   * for good, and enough of them would lock OBS out (release check 2026-10-28). OBS reconnects on its own.
   */
  private tick(): void {
    const now = Date.now();
    for (const client of this.clients) {
      if (client.writableLength < MAX_BACKLOG_BYTES) this.behindSince.delete(client);
      else if (!this.behindSince.has(client)) this.behindSince.set(client, now);
      else if (now - this.behindSince.get(client)! >= STALLED_MS) {
        client.destroy();
        this.clients.delete(client);
        this.behindSince.delete(client);
      }
    }
    this.write(': keep-alive\n\n');
  }

  private write(chunk: string): void {
    for (const client of this.clients) client.write(chunk);
  }

  private send(res: http.ServerResponse, status: number, type: string, body: string | Buffer): void {
    res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
    res.end(body);
  }
}

/** The overlay page: an empty stage; the script draws the elements the layout names. */
function overlayPage(language: string): string {
  return `<!doctype html>
<html lang="${language.startsWith('de') ? 'de' : 'en'}">
<head>
  <meta charset="utf-8">
  <title>GT Toolz overlay</title>
  <link rel="stylesheet" href="/overlay.css">
  <script src="/overlay.js" defer></script>
</head>
<body><div id="stage"></div><div id="notice" hidden></div></body>
</html>`;
}

/** A pointer to the overlay, for a look in the browser. */
function indexPage(port: number): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>GT Toolz overlay</title><link rel="stylesheet" href="/overlay.css"></head>
<body class="index"><h1>GT Toolz overlay</h1><p><a href="/overlay">http://127.0.0.1:${port}/overlay</a></p></body>
</html>`;
}
