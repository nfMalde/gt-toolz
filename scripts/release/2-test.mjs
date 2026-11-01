// Step 2: tests. The type check of the whole project, the test suite (tests/*.test.ts, Node's own test runner) and
// the supply-chain checks: registry signatures must verify; known vulnerabilities are listed, a critical one stops
// the release (docs/dev/security.md).
// Usage: node scripts/release/2-test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fail, heading, info, run, runIfMain } from './lib.mjs';

export default async function test() {
  heading('Tests: type check');
  await run('npx', ['tsc', '--noEmit', '-p', '.']);

  heading('Tests: test suite');
  const files = fs
    .readdirSync(path.join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.test.ts'))
    .map((f) => `tests/${f}`);
  if (!files.length) fail('no tests in tests/');
  await run(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=spec', ...files]);

  heading('Tests: packages');
  await run('npm', ['audit', 'signatures']);
  const { stdout } = await run('npm', ['audit', '--json'], { capture: true, allowFail: true });
  const audit = JSON.parse(stdout);
  const counts = audit.metadata?.vulnerabilities ?? {};
  for (const [name, v] of Object.entries(audit.vulnerabilities ?? {})) info(`${v.severity.padEnd(8)} ${name} ${v.range}${v.isDirect ? ' (direct)' : ''}`);
  info(`npm audit: ${counts.total ?? 0} known (${['critical', 'high', 'moderate', 'low'].map((s) => `${counts[s] ?? 0} ${s}`).join(', ')}); plan and dates in docs/dev/security.md`);
  if (counts.critical) fail('a critical vulnerability: no release until it is fixed');
}

await runIfMain(import.meta.url, test);
