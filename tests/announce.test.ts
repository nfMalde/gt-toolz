// The release's announcement on Discord (scripts/release/announce.mjs): the English news, @everyone mentioned, up to
// three tries against a real local server, and nothing here can fail a release (the user, 2026-11-03).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
// @ts-expect-error a plain Node script without types
import { buildMessage, discordText, fit, main, send } from '../scripts/release/announce.mjs';

const noWait = async () => undefined;
const TOKEN = 'secret-token';

/** A webhook that answers with these statuses in turn; returns its address, the bodies it got and how to close it. */
async function webhook(statuses: number[]) {
  const bodies: string[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      bodies.push(body);
      res.writeHead(statuses[bodies.length - 1] ?? 500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/api/webhooks/1/${TOKEN}`, bodies, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** What a function printed. */
async function printed(run: () => Promise<unknown>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => void lines.push(args.join(' '));
  try {
    await run();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

test('the message has the news, links the release and mentions everyone, and only that', () => {
  const message = buildMessage('1.2.3-beta.2', 'owner/repo', () => '## Fixes\n\n- **The crew** talks.');
  // Only the content pings, and only what allowed_mentions lets through: no user or role a text might name.
  assert.equal(message.content, '@everyone');
  assert.deepEqual(message.allowed_mentions, { parse: ['everyone'] });
  assert.equal(message.embeds.length, 1);
  const [embed] = message.embeds;
  assert.equal(embed.title, 'GT Toolz 1.2.3-beta.2 is out');
  assert.equal(embed.url, 'https://github.com/owner/repo/releases/tag/v1.2.3-beta.2');
  assert.match(embed.description, /^\*\*Fixes\*\*\n\n- \*\*The crew\*\* talks\./);
  assert.match(embed.description, /\[Download\]\(https:\/\/github\.com\/owner\/repo\/releases\/tag\/v1\.2\.3-beta\.2\)/);
});

test('it takes the English news of a version, not the German', () => {
  const { description } = buildMessage('1.0.0-beta', 'owner/repo').embeds[0];
  assert.match(description, /\*\*Beta release\*\*/);
  assert.doesNotMatch(description, /Beta-Release/);
});

test('long news are cut at a line end, and stay within what Discord takes', () => {
  assert.equal(fit('short'), 'short');
  assert.equal(fit('line one\nline two', 12), 'line one\n…');
  const long = Array.from({ length: 400 }, (_, i) => `- line number ${i} of the news`).join('\n');
  const { description } = buildMessage('1.0.0', 'owner/repo', () => long).embeds[0];
  assert.ok(description.length <= 4096, `${description.length} characters`);
  assert.match(discordText(long), /\n…$/);
});

test('it stops at the first success', async () => {
  const hook = await webhook([204]);
  assert.equal(await send(hook.url, { content: 'x' }, noWait), true);
  assert.equal(hook.bodies.length, 1);
  await hook.close();
});

test('a failed call is tried again, up to three times', async () => {
  const hook = await webhook([500, 429, 204]);
  const output = await printed(async () => assert.equal(await send(hook.url, { content: 'x' }, noWait), true));
  assert.equal(hook.bodies.length, 3);
  assert.match(output, /Try 1 of 3: HTTP 500/);
  await hook.close();
});

test('after three failures it gives up, and the release does not fail', async () => {
  const hook = await webhook([500, 500, 500, 204]);
  const output = await printed(() => main(['--version=1.0.0-beta'], { DISCORD_WEBHOOK_URL: hook.url }, noWait));
  assert.equal(hook.bodies.length, 3);
  assert.match(output, /::warning::The Discord announcement of v1\.0\.0-beta failed after 3 tries/);
  assert.ok(!output.includes(TOKEN), 'the webhook address stays secret');
  await hook.close();
});

test('an unreachable webhook is tried three times too, without printing its address', async () => {
  const hook = await webhook([]);
  await hook.close();
  let pauses = 0;
  const output = await printed(() => main(['--version=1.0.0-beta'], { DISCORD_WEBHOOK_URL: hook.url }, async () => void pauses++));
  assert.equal(pauses, 2);
  assert.match(output, /::warning::/);
  assert.ok(!output.includes(TOKEN));
});

test('no secret, no version, no news: a notice or a warning, nothing throws', async () => {
  assert.match(await printed(() => main(['--version=1.0.0-beta'], {}, noWait)), /::notice::No Discord announcement/);
  assert.match(await printed(() => main([], { DISCORD_WEBHOOK_URL: 'http://127.0.0.1:1' }, noWait)), /::warning::No Discord announcement: --version is missing/);
});

test('a failed announcement cannot fail the release run', () => {
  const workflow = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  const job = /\n {2}announce:\n([\s\S]*?)(?=\n {2}\S|$)/.exec(workflow)?.[1] ?? '';
  assert.match(job, /needs: \[plan, publish\]/);
  assert.match(job, /continue-on-error: true/);
  assert.match(job, /DISCORD_WEBHOOK_URL: \$\{\{ secrets\.DISCORD_WEBHOOK_URL \}\}/);
  assert.doesNotMatch(job, /npm (ci|install|run)/);
});
