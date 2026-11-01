# Contributing to GT Toolz

Thanks for wanting to help! GT Toolz is a hobby project, so replies can take a few days. Fixes, tests, translations,
docs and new modules are all welcome.

## Before you start

- **Bugs:** open a [bug report](https://github.com/nfMalde/gt-toolz/issues/new?template=bug_report.yml) with the
  detailed log (see the README, "Reporting a bug"). If you want to fix it yourself, say so in the issue.
- **Bigger changes and new modules:** open an [issue](https://github.com/nfMalde/gt-toolz/issues/new/choose) first and
  describe the idea, so we can agree on the approach before you put time into it.
- **Security issues:** never in a public issue; see [SECURITY.md](SECURITY.md).

## Setting up

Node.js 22.23.2 (the version the CI uses), npm and git:

```sh
git clone https://github.com/<you>/gt-toolz.git
cd gt-toolz
npm ci
node node_modules/electron/install.js   # Electron's binary, once: install scripts are off (.npmrc)
npm run dev
```

No PS5 at hand? Recordings and the fake PS5 let you test without one: see [Testing](docs/dev/testing.md).
How the code fits together: [Architecture](docs/dev/architecture.md) and the [code map](docs/dev/code-map.md).

## Making a change

1. Create a branch from `main`: `fix/<what>` or `feat/<what>`.
2. Write the code in the style of the code around it: the same naming, the same density of comments. Comments say
   why, not what. Code, comments and docs are in English.
3. **UI texts** go into the English and the German file (the compiler checks that both have every key). **Spoken
   texts** go into the language packs `packages/coach/language-packs/en.json` and `de.json`; see
   [Coach and texts](docs/dev/coach-and-texts.md).
4. **Tests:** new or changed behaviour gets a test in `tests/` (node:test). Bugs get a test that fails without the fix.
5. **Check everything:**
   ```sh
   npm run typecheck
   npm test
   npm run build:app
   ```
6. Add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything users notice.
7. Update `docs/user` or `docs/dev` where users or developers need to know.

## Pull requests

- One topic per pull request, to `main`. Describe what changes and why, and how you tested it (with a PS5, a
  recording, which system). "Fixes #123" closes the issue when it is merged.
- The **PR build** runs the type check, the tests and the app build on Windows, Linux and macOS. It must be green.
- **The CLA:** on your first pull request the CLA bot asks you to sign the [Contributor License Agreement](CLA.md) by
  writing a comment. Once is enough for all later pull requests.
- A maintainer reviews it. Small changes may be asked for; that is normal and no judgement.

## Dependencies

GT Toolz keeps its dependencies few, because every one of them ships to every user:

- Ask in an issue before adding one. Often a few lines of our own code are the better choice.
- Versions are exact (`save-exact`), install scripts stay off (`ignore-scripts`), and a version is used only when it is
  at least **14 days** old.
- Run `npm audit` and `npm audit signatures`. Every dependency that ships with the app goes on the in-app licenses page
  (`apps/desktop/src/licenses.ts`) and into [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
- No copied code without checking its license; icons are drawn by ourselves.

More in [Security](docs/dev/security.md).

## Writing a module

See [Writing a module](docs/dev/modules.md): a tutorial that builds a complete small module, from the main-process part
to the UI page, the texts and a test.

## Code of conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
