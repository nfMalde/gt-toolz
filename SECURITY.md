# Security

## Reporting a vulnerability

Please **do not** report security issues in public issues. Use GitHub's private reporting instead:
**[Report a vulnerability](https://github.com/nfMalde/gt-toolz/security/advisories/new)**.

Describe what you found, how to reproduce it, which version and system, and what an attacker could do with it. GT
Toolz is a hobby project, so it can take a few days to answer; you will get a reply, and the fix is credited to you
if you want.

## Supported versions

Only the newest release (and the newest pre-release) gets security fixes. The installed app tells you about a new
version when the update check is on (Settings → Updates).

## What GT Toolz is built to do

- The window shows only the app's own UI (`app://gtt`): no remote content, no new windows, a strict Content Security
  Policy, and calls into the main process only from that page.
- The app receives GT7's telemetry from the PS5 in the home network. The OBS overlay server listens on `127.0.0.1` only,
  and only while it is switched on.
- It goes online only for voice downloads the user starts (from an allow-list of hosts, each file checked against its
  SHA-256) and, in official installed builds after the user agreed, for the update check on this repository's GitHub
  releases (the installer checked against the release's `SHA256SUMS.txt`).
- Electron's fuses are set for the installers: no running as Node, no `NODE_OPTIONS` or `--inspect`, only the checked
  `app.asar`.
- Dependencies are few, pinned to exact versions, installed without install scripts and only when at least 14 days old.

The details are in [docs/dev/security.md](docs/dev/security.md).
