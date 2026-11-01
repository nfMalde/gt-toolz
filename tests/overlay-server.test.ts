// The OBS overlay's web server (modules/overlays/main/server.ts, docs/dev/security.md): this PC only, its own
// name only, no other web page, bounded, and it never stops the app. End to end over real sockets.

import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import type { OverlayFrame, OverlayLayout } from '../modules/overlays/src/api';
import { OverlayServer, type FrameSource } from '../modules/overlays/main/server';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-overlay-'));
const clientFile = path.join(dir, 'overlay-client.js');
fs.writeFileSync(clientFile, '/* overlay client */');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

/** The frames: a listener while a server listens. */
const listeners = new Set<(frame: OverlayFrame) => void>();
const frames: FrameSource = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = (frame: unknown) => listeners.forEach((listener) => listener(frame as OverlayFrame));
const newServer = () => new OverlayServer(frames, clientFile, () => ({ layout: { elements: [] } as unknown as OverlayLayout, language: 'de', autoHide: false }));

async function freePort(): Promise<number> {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as net.AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function request(port: number, pathname: string, options: { method?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: options.method ?? 'GET', headers: options.headers, agent: false }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Raw bytes to the server, the first line of the answer back. */
function raw(port: number, text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(text));
    let answer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      answer += chunk;
      if (answer.includes('\r\n')) {
        socket.destroy();
        resolve(answer.split('\r\n')[0]!);
      }
    });
    socket.on('error', reject);
  });
}

/** An open event stream; `text` grows with everything received. */
function stream(port: number): Promise<{ status: number; text: () => string; close: () => void; ended: Promise<void> }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/events', agent: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (text += chunk));
      const ended = new Promise<void>((done) => res.on('close', () => done()));
      res.resume();
      resolve({ status: res.statusCode ?? 0, text: () => text, close: () => req.destroy(), ended });
    });
    req.on('error', reject);
  });
}

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const refused = (port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), resolve(false)));
    socket.on('error', () => resolve(true));
  });

test('serves its pages under its own name only, with a strict policy', async () => {
  const server = newServer();
  const port = await freePort();
  assert.equal((await server.apply(true, port)).running, true);
  try {
    const page = await request(port, '/overlay');
    assert.equal(page.status, 200);
    assert.match(String(page.headers['content-security-policy']), /default-src 'none'.*frame-ancestors 'none'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.doesNotMatch(page.body, /<script(?![^>]*\ssrc=)|style=/i, 'no inline code');
    assert.equal((await request(port, '/overlay.js')).body, '/* overlay client */');
    // A DNS trick (another name for 127.0.0.1), another web page, a cross-site request, anything but GET.
    assert.equal((await request(port, '/overlay', { headers: { Host: `evil.example:${port}` } })).status, 403);
    assert.equal((await request(port, '/events', { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await request(port, '/events', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await request(port, '/overlay', { method: 'POST' })).status, 405);
    // Paths are names, never files.
    for (const bad of ['/../package.json', '/%2e%2e/%2e%2e/package.json', '/overlay.js/..%2f..%2fpackage.json', '/C:/Windows/win.ini']) assert.equal((await request(port, bad)).status, 404, bad);
  } finally {
    await server.stop();
  }
});

test('a malformed request gets 400 and the server keeps running', async () => {
  const server = newServer();
  const port = await freePort();
  await server.apply(true, port);
  try {
    assert.equal(await raw(port, `GET http://[ HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`), 'HTTP/1.1 400 Bad Request');
    assert.equal((await request(port, '/overlay')).status, 200);
  } finally {
    await server.stop();
  }
});

test('streams the layout and the frames, and refuses more than 16 streams', async () => {
  const server = newServer();
  const port = await freePort();
  await server.apply(true, port);
  const streams: Awaited<ReturnType<typeof stream>>[] = [];
  try {
    const first = await stream(port);
    streams.push(first);
    await until(() => first.text().includes('event: layout'));
    emit({ speed: 123 });
    await until(() => first.text().includes('"speed":123'));
    for (let i = 1; i < 16; i++) streams.push(await stream(port));
    assert.ok(streams.every((s) => s.status === 200));
    const extra = await stream(port);
    assert.equal(extra.status, 503);
    extra.close();
  } finally {
    await server.stop();
  }
  // Stopping ends every stream.
  await Promise.all(streams.map((s) => s.ended));
});

// The user, 2026-10-31: after installing 0.0.7 the overlay still stayed after the flag. OBS kept the page of 0.0.6
// open and only its stream connected again, so the old script went on drawing. The layout names what the page is
// built from; the page loads itself again when that changes (modules/overlays/page/client.ts).
test("the layout names the page's build, another one once the script changed", async () => {
  const build = async () => {
    const server = newServer();
    const port = await freePort();
    await server.apply(true, port);
    try {
      const events = await stream(port);
      await until(() => events.text().includes('event: layout'));
      events.close();
      return /"build":"([0-9a-f]+)"/.exec(events.text())?.[1];
    } finally {
      await server.stop();
    }
  };
  const before = await build();
  assert.match(String(before), /^[0-9a-f]{16}$/);
  assert.equal(await build(), before, 'the same script, the same build');
  fs.writeFileSync(clientFile, '/* overlay client, updated */');
  try {
    assert.notEqual(await build(), before, 'an update');
  } finally {
    fs.writeFileSync(clientFile, '/* overlay client */');
  }
});

test('stopping does not wait for a request that never finishes', async () => {
  const server = newServer();
  const port = await freePort();
  await server.apply(true, port);
  const socket = net.connect(port, '127.0.0.1');
  await once(socket, 'connect');
  socket.write(`GET /overlay HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n`);
  socket.on('error', () => undefined);
  const started = Date.now();
  await server.stop();
  assert.ok(Date.now() - started < 1000, `stop took ${Date.now() - started} ms`);
  assert.ok(await refused(port));
});

test('quick port changes leave exactly one server, on the last port', async () => {
  const server = newServer();
  const [a, b, c] = [await freePort(), await freePort(), await freePort()];
  await server.apply(true, a);
  const open = await stream(a);
  const moves = [server.apply(true, b), server.apply(true, c)];
  const [, last] = await Promise.all(moves);
  try {
    assert.deepEqual(last, { enabled: true, running: true, port: c });
    assert.ok(await refused(a), 'old port closed');
    assert.ok(await refused(b), 'in-between port closed');
    assert.equal((await request(c, '/overlay')).status, 200);
    await open.ended; // the stream on the old port was dropped
    // Switched off right after a move: nothing stays listening.
    const port = await freePort();
    void server.apply(true, port);
    assert.equal((await server.apply(false, port)).running, false);
    assert.ok(await refused(port));
    assert.equal(listeners.size, 0, 'no frames to a stopped server');
  } finally {
    await server.stop();
  }
});
