// Session logs stay anonymous and keep their level (docs/dev/security.md "Session logs").

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { anonymize, isDetailLine, openSessionLog, type LogPrivacy } from '../packages/runtime/src/session-log';

const data = path.join(os.tmpdir(), 'gtt-test-data', 'GT Toolz');
const privacy: LogPrivacy = {
  names: [
    { value: 'Maldö', as: '<driver>' },
    { value: 'Speedy_99', as: '<player>' },
    { value: 'Wohnzimmer-PS5', as: '<console>' },
  ],
  paths: [
    { value: path.join(data, 'references'), as: '<references>' },
    { value: os.homedir(), as: '<home>' },
  ],
};

test('anonymize replaces names, addresses and paths', () => {
  const cases: [string, string][] = [
    ['PS5 found at 192.168.178.41 (Wohnzimmer-PS5)', 'PS5 found at <lan-ip> (<console>)'],
    ['Telemetry from 10.0.0.7:33740, heartbeat to 172.20.1.2', 'Telemetry from <lan-ip>:33740, heartbeat to <lan-ip>'],
    ['FOREIGN   telemetry from 85.214.3.9 ignored', 'FOREIGN   telemetry from <ip> ignored'],
    ['Overlay on http://127.0.0.1:4790/overlay', 'Overlay on http://127.0.0.1:4790/overlay'],
    ['Version 43.7.7 and 1.2.3.4.5 and 300.1.1.1', 'Version 43.7.7 and 1.2.3.4.5 and 300.1.1.1'],
    [`Reference saved: ${path.join(data, 'references', 'spa.json')}`, `Reference saved: <references>${path.sep}spa.json`],
    ['Error at C:\\Users\\SomeoneElse\\Desktop\\a.txt', 'Error at C:\\Users\\<user>\\Desktop\\a.txt'],
    ['Error at c:/users/Bob/x and /home/alice/y and /Users/carl/z', 'Error at c:/users/<user>/x and /home/<user>/y and /Users/<user>/z'],
    ['Mail me: max.mustermann+gt@example.co.uk', 'Mail me: <email>'],
    ['Driver maldö, reference from Speedy_99; Maldöner stays', 'Driver <driver>, reference from <player>; Maldöner stays'],
    // Release check 2026-10-28: the end of a sentence, a user folder with a space, JSON-escaped paths, MAC addresses.
    ['PS5 found at 192.168.178.41.', 'PS5 found at <lan-ip>.'],
    ['Error at C:\\Users\\Jane Doe\\AppData\\x', 'Error at C:\\Users\\<user>\\AppData\\x'],
    ['{"file":"D:\\\\Users\\\\Jane Doe\\\\x.wav"}', '{"file":"D:\\\\Users\\\\<user>\\\\x.wav"}'],
    ['in C:\\Users\\Jane and C:\\Users\\Bob\\x', 'in C:\\Users\\<user> and C:\\Users\\<user>\\x'],
    ['Adapter 3c:7c:3f:12:ab:9e and 3C-7C-3F-12-AB-9E, at 12:30:45', 'Adapter <mac> and <mac>, at 12:30:45'],
  ];
  for (const [input, expected] of cases) assert.equal(anonymize(input, privacy), expected, input);
});

test('a longer name goes first, so no part of it stays', () => {
  const names: LogPrivacy = {
    names: [
      { value: 'Max', as: '<driver>' },
      { value: 'Max Muster', as: '<player>' },
      { value: 'Max Muster PS5', as: '<console>' },
    ],
    paths: [],
  };
  assert.equal(anonymize('Found Max Muster PS5, reference by Max Muster, driven by Max', names), 'Found <console>, reference by <player>, driven by <driver>');
});

test('detail lines are the calls, crew messages and countdowns', () => {
  const lines: [string, boolean][] = [
    ['CUE       T1 brake 3, 2, 1', true],
    ['SAY       "Brake now"', true],
    ['  3', true],
    ['FEEDBACK  2 new: T5 late on throttle', false],
    ['FEEDBACK  2 resolved: T5', false],
    ['FEEDBACK  T5 was 0.6 s slower', true],
    ['CREW      "Box this lap"', true],
    ['CREW      race start, voice Katja', false],
    ['LAP       3 1:42.311', false],
    ['ERROR     Piper exited 1', false],
  ];
  for (const [line, detail] of lines) assert.equal(isDetailLine(line), detail, line);
});

test('the log file is anonymous and follows the detailed setting', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtt-test-log-'));
  let detailed = false;
  const log = openSessionLog(dir, 'coach', { echo: false, privacy: () => privacy, detailed: () => detailed });
  log.log('PS5 found at 192.168.178.41 (Wohnzimmer-PS5)');
  log.log('CUE       T1 brake');
  detailed = true;
  log.log('CUE       T2 brake, Maldö');
  await log.close();
  const text = fs.readFileSync(`${log.baseName}.log`, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  assert.match(text, /PS5 found at <lan-ip> \(<console>\)/);
  assert.doesNotMatch(text, /T1 brake/);
  assert.match(text, /T2 brake, <driver>/);
  assert.doesNotMatch(text, /192\.168|Maldö|Wohnzimmer/);
});
