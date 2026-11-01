// Signs a release's checksum list with the project's Ed25519 key, so that the app takes its updates only from releases
// the project made (packages/runtime/src/app-updates.ts checks it against RELEASE_PUBLIC_KEY). Runs in the release
// workflow's publish job, after the approval; the key is a secret of the "release" environment. Plain Node.
//
//   RELEASE_SIGNING_KEY="$(cat key.pem)" node scripts/release/sign.mjs <SHA256SUMS.txt>   → <SHA256SUMS.txt>.sig
//
// The key must belong to the public key the app ships with; anything else stops here.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const file = process.argv[2];
const pem = process.env.RELEASE_SIGNING_KEY;
if (!file || !pem) {
  console.error('Usage: RELEASE_SIGNING_KEY=<private key, PEM> node scripts/release/sign.mjs <SHA256SUMS.txt>');
  process.exit(2);
}

const source = fs.readFileSync(path.join(ROOT, 'packages', 'runtime', 'src', 'app-updates.ts'), 'utf8');
const shipped = /RELEASE_PUBLIC_KEY = `([^`]+)`/.exec(source)?.[1];
if (!shipped) throw new Error('RELEASE_PUBLIC_KEY not found in packages/runtime/src/app-updates.ts');

const privateKey = crypto.createPrivateKey(pem);
const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim();
if (derived !== shipped.trim()) {
  console.error('The signing key does not belong to the public key the app ships with (RELEASE_PUBLIC_KEY): nothing signed.');
  process.exit(1);
}

const data = fs.readFileSync(file);
const signature = crypto.sign(null, data, privateKey);
if (!crypto.verify(null, data, crypto.createPublicKey(shipped), signature)) throw new Error('signature check failed');
fs.writeFileSync(`${file}.sig`, `${signature.toString('base64')}\n`);
console.log(`signed ${path.basename(file)} → ${path.basename(file)}.sig`);
