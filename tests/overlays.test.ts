// The OBS overlays as a module (modules/overlays, docs/dev/modules.md): their settings, what they show of a frame, and
// the module on a host: the server listens while it is on, moves with its port, and takes nothing along when it stops.

import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import { test } from 'node:test';
import type { ModuleHost, SessionMode } from '../packages/core/src/index';
import { Flags, type TelemetryFrame } from '../packages/telemetry/src/index';
import { DEFAULT_OVERLAY_LAYOUT, type OverlayFrame, type OverlaysSettings, type OverlayStatus } from '../modules/overlays/src/api';
import { AfterFlag, overlayFrame } from '../modules/overlays/src/frame';
import { defaultSettings, normalizeSettings } from '../modules/overlays/src/settings';
import { overlaysModule } from '../modules/overlays/main/module';

test('defaults: port 4790, the light layout, hidden outside sessions', () => {
  assert.deepEqual(defaultSettings(), { overlayPort: 4790, overlayLayout: DEFAULT_OVERLAY_LAYOUT, overlayAutoHide: true });
});

test('wrong types and values fall back', () => {
  const base = defaultSettings();
  assert.deepEqual(normalizeSettings(undefined, base), base);
  assert.deepEqual(normalizeSettings({ overlayPort: 80, overlayAutoHide: 'no', overlayLayout: 'big' }, base), { ...base, overlayPort: 1024 });
  assert.equal(normalizeSettings({ overlayPort: '5000' }, base).overlayPort, 5000);
  assert.equal(normalizeSettings({ overlayPort: 70000 }, base).overlayPort, 65535);
});

test('the steering element keeps a known look, "bar" otherwise; other elements get none', () => {
  const layout = (widgets: unknown[]) =>
    normalizeSettings({ overlayLayout: { width: 1920, height: 1080, look: 'light', background: 0.5, widgets } }, defaultSettings()).overlayLayout.widgets;
  const widgets = layout([
    { id: 'steering', kind: 'steering', x: 10, y: 10, scale: 1, variant: 'wheel' },
    { id: 'steering2', kind: 'steering', x: 10, y: 10, scale: 1, variant: 'spinner' },
    { id: 'steering3', kind: 'steering', x: 10, y: 10, scale: 1 },
    { id: 'gear', kind: 'gear', x: 10, y: 10, scale: 1, variant: 'both' },
  ]);
  assert.deepEqual(widgets.map((w) => w.variant), ['wheel', 'bar', 'bar', undefined]);
  assert.equal('variant' in widgets[3]!, false);
});

test('a broken layout keeps what is valid: known elements inside the canvas, no duplicates', () => {
  const { overlayLayout } = normalizeSettings(
    {
      overlayLayout: {
        width: 1280,
        height: 720,
        look: 'neon',
        background: 3,
        widgets: [
          { id: 'gear', kind: 'gear', x: 5000, y: -10, scale: 9 },
          { id: 'gear', kind: 'speed', x: 0, y: 0, scale: 1 },
          { id: 'x', kind: 'radar', x: 0, y: 0, scale: 1 },
          { id: 'Bad Id', kind: 'lap', x: 0, y: 0, scale: 1 },
        ],
      },
    },
    defaultSettings(),
  );
  assert.equal(overlayLayout.width, 1280);
  assert.equal(overlayLayout.look, DEFAULT_OVERLAY_LAYOUT.look);
  assert.equal(overlayLayout.background, 1);
  assert.deepEqual(overlayLayout.widgets, [{ id: 'gear', kind: 'gear', x: 1260, y: 0, scale: 4 }]);
});

function frame(change: Partial<TelemetryFrame> = {}): TelemetryFrame {
  return {
    time: 1000,
    flags: Flags.CarOnTrack,
    speed: 50,
    gear: 4,
    throttle: 0.8,
    brake: 0,
    tyreTemps: [70, 71, 72, 73],
    lapCount: 2,
    lapsInRace: 0,
    currentLapMs: 40_000,
    lastLapMs: 92_000,
    bestLapMs: -1,
    racePosition: 1,
    carsInRace: 3,
    ...change,
  } as TelemetryFrame;
}

test('what the overlay shows of a frame: a position only in races, the last lap against the target', () => {
  const practice = overlayFrame(frame(), 'practice', { lap: 1, timeMs: 92_000, deltaMs: 350 });
  assert.equal(practice.speedKmh, 180);
  assert.equal(practice.mode, 'practice');
  assert.equal(practice.position, undefined, 'the ghosts of a time trial are no race');
  assert.equal(practice.bestLapMs, undefined);
  assert.equal(practice.lastLapDeltaMs, 350);
  assert.equal(practice.onTrack, true);
  const race = overlayFrame(frame({ lapsInRace: 5, racePosition: 3, carsInRace: 12 }), 'race', undefined);
  assert.equal(race.position, 3);
  assert.equal(race.cars, 12);
  assert.equal(race.laps, 5);
  assert.equal(race.raceOver, false);
  assert.equal(overlayFrame(frame({ lapsInRace: 5, lapCount: 6 }), 'race', undefined, true).raceOver, true);
});

// The user, 2026-11-01: "ab Zielflagge keine Overlays mehr". The Manufacturers Cup of 2026-10-31 (first over the line):
// GT7's lap after the flag for 76 s, the results while the players leave, then the menu. On the way out the overlay
// came back for 3 s, as long as the session's mode held on to the race.
test('after the flag nothing until the session is left: not on the way out of the results either', () => {
  const after = new AfterFlag();
  const race = { lapsInRace: 15, carsInRace: 14, racePosition: 1 };
  assert.equal(after.update(frame({ ...race, lapCount: 15 }), 'race'), false, 'the last lap');
  assert.equal(after.update(frame({ ...race, lapCount: 16 }), 'race'), true, 'the flag');
  assert.equal(after.update(frame({ ...race, lapCount: 16, speed: 22 }), 'race'), true, "GT7's lap");
  assert.equal(after.update(frame({ ...race, lapCount: 16, lapsInRace: 0 }), 'race'), true, 'its end: lap 16 of 0');
  assert.equal(after.update(frame({ ...race, lapCount: 0, lapsInRace: 0, speed: 0, flags: Flags.CarOnTrack | Flags.Loading }), 'race'), true, 'loading the results');
  assert.equal(after.update(frame({ ...race, lapCount: 0, lapsInRace: 0, carsInRace: 2, speed: 0 }), 'practice'), true, 'the results, two players left');
  const menu = frame({ flags: 0, lapCount: -1, lapsInRace: -1, carsInRace: -1, racePosition: -1, speed: 0 });
  assert.equal(after.update(menu, 'practice'), true, 'the way out: the mode still holds on to the session');
  assert.equal(after.update(menu, 'menu'), false, 'a menu');
  assert.equal(after.update(frame({ ...race, lapCount: 0, lapsInRace: 0, speed: 0 }), 'race'), false, "the next event's session");

  // A restart (lap 0 of 15), and driving again after a loading screen only.
  after.update(frame({ ...race, lapCount: 16 }), 'race');
  assert.equal(after.update(frame({ ...race, lapCount: 0 }), 'race'), false, 'a restart');
  after.update(frame({ ...race, lapCount: 16 }), 'race');
  after.update(frame({ flags: Flags.Loading, lapCount: -1, lapsInRace: -1, speed: 0 }), 'race');
  assert.equal(after.update(frame({ lapCount: 0, lapsInRace: 0, carsInRace: 1, speed: 0 }), 'race'), true, 'standing in the pits');
  assert.equal(after.update(frame({ lapCount: 0, lapsInRace: 0, carsInRace: 1, speed: 20 }), 'race'), false, 'driving off');
});

async function freePort(): Promise<number> {
  const probe = net.createServer().listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address() as net.AddressInfo;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** The status code, 0 when nothing listens. */
const get = (port: number, pathname: string) =>
  new Promise<number>((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, agent: false }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', () => resolve(0));
  });

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

/** The module on a host of its own: what it registers, sends, copies and opens is kept for the checks. */
function fakeHost(settings: OverlaysSettings) {
  const frameListeners = new Set<(frame: TelemetryFrame) => void>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: [string, unknown][] = [];
  const copied: string[] = [];
  const opened: string[] = [];
  let current = settings;
  let mode: SessionMode = 'practice';
  const host: ModuleHost<OverlaysSettings> = {
    id: 'overlays',
    dev: false,
    log: () => undefined,
    settings: () => current,
    updateSettings: async (change) => (current = { ...current, ...change }),
    app: () => ({ language: 'de' }),
    telemetry: {
      onFrame: (listener) => {
        frameListeners.add(listener);
        return () => frameListeners.delete(listener);
      },
      mode: () => mode,
      lastLap: () => undefined,
    },
    haptics: { feel: () => undefined },
    desktop: {
      copyText: (text) => void copied.push(text),
      openLocalPage: async (url) => void opened.push(url),
    },
    bridge: {
      handle: (name, handler) => void handlers.set(name, handler),
      send: (event, value) => void sent.push([event, value]),
    },
  };
  return { host, frameListeners, handlers, sent, copied, opened, set: (next: OverlaysSettings) => (current = next), setMode: (next: SessionMode) => (mode = next) };
}

test('on a host: listens while on, moves with its port, sends the preview, and stops cleanly', async () => {
  const port = await freePort();
  const fake = fakeHost({ ...defaultSettings(), overlayPort: port });
  const instance = overlaysModule('missing-client.js').start(fake.host);
  const statuses = () => fake.sent.filter(([event]) => event === 'status').map(([, value]) => value as OverlayStatus);
  try {
    await until(() => statuses().length > 0);
    assert.deepEqual(statuses()[0], { enabled: true, running: true, port });
    assert.equal(await get(port, '/overlay'), 200);

    // Copy and open: the server's own address.
    assert.equal(await fake.handlers.get('copyLink')!(), true);
    await fake.handlers.get('openLink')!();
    assert.deepEqual(fake.copied, [`http://127.0.0.1:${port}/overlay`]);
    assert.deepEqual(fake.opened, [`http://127.0.0.1:${port}/overlay`]);

    // A frame: the editor's preview gets it.
    for (const listener of fake.frameListeners) listener(frame({ time: 5000 }));
    const preview = fake.sent.find(([event]) => event === 'preview')?.[1] as OverlayFrame | undefined;
    assert.equal(preview?.gear, 4);
    // The chequered flag (lap 6 of 5): over, also through the results and the way out; the session's menu ends it.
    const lastPreview = () => fake.sent.filter(([event]) => event === 'preview').at(-1)?.[1] as OverlayFrame;
    const send = (change: Partial<TelemetryFrame>) => {
      for (const listener of fake.frameListeners) listener(frame(change));
    };
    fake.setMode('race');
    send({ time: 6000, lapsInRace: 5, lapCount: 6, carsInRace: 8 });
    assert.equal(lastPreview().raceOver, true, 'after the flag');
    send({ time: 7000, lapsInRace: 0, lapCount: 0, carsInRace: 8, speed: 0 });
    assert.equal(lastPreview().raceOver, true, 'the results');
    send({ time: 8000, flags: 0, lapsInRace: -1, lapCount: -1, carsInRace: -1 });
    assert.equal(lastPreview().raceOver, true, 'off the track, the mode still a race');
    fake.setMode('menu');
    send({ time: 9000, flags: 0, lapsInRace: -1, lapCount: -1, carsInRace: -1 });
    assert.equal(lastPreview().raceOver, false, 'a menu');
    assert.equal(lastPreview().mode, 'menu');

    // Another port: the server moves.
    const other = await freePort();
    const before = fake.host.settings();
    const next = { ...before, overlayPort: other };
    fake.set(next);
    instance.settingsChanged?.(next, before);
    await until(() => statuses().some((status) => status.port === other && status.running));
    assert.equal(await get(other, '/overlay'), 200);
    assert.equal(await get(port, '/overlay'), 0, 'the old port is closed');
  } finally {
    await instance.stop();
  }
  assert.equal(await get(fake.host.settings().overlayPort, '/overlay'), 0, 'nothing listens after stop');
});
