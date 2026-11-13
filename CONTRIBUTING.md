# Contributing

Thanks for helping. Two kinds of contributions matter most:

- **Wrong numbers or missed files.** Agents change how they load context often. If ctx-receipt
  counts something your agent does not load, or misses something it does, open a bug with the
  agent's version and a link to the docs that describe the behaviour.
- **New agents.** See [docs/adding-an-agent.md](docs/adding-an-agent.md). Open a "New agent"
  issue first so we can agree on what the agent loads.

## Setup

```sh
git clone https://github.com/Jenoyrex/ctx-receipt.git
cd ctx-receipt
npm install
npm run build
npm test
```

Node.js 20 or later. CI runs on Node 20 and 22.

## Checks

Run all of these before opening a pull request; CI runs the same:

```sh
npm run lint        # Biome: lint and formatting (npm run format fixes formatting)
npm run typecheck
npm run build       # tests run the built CLI, so build before testing
npm test
```

## Rules for changes

- **Never print, log, or write secrets.** MCP configs hold API keys. Read configs only through
  `src/redact.ts`, and only `src/mcp/launch.ts` may read a server's command, arguments, or
  environment. Add any new config format to `test/fixtures/secrets/` with the fake key in every
  field. Never weaken a leak test to make it pass.
- **Read-only.** ctx-receipt never changes the user's files. It writes only the files named with
  `--md` and `--svg`.
- **Only fixture MCP servers in tests.** Tests must never start servers from a real config; use
  `test/fixtures/mcp/fake-server.mjs`.
- **Estimates stay labelled.** Every output that shows a token count says it is an estimate.
- **Cite the docs.** When you change what an adapter counts, update the header comment with the
  docs you checked and the date. If the docs do not settle a behaviour, take the reading that
  counts more and mark it unverified.
- **Few dependencies.** Ask in an issue before adding one.

## Lock file on Windows

`npm install <package>` on Windows, with an existing `node_modules`, can drop optional packages
that only Linux needs, which breaks `npm ci` in CI. After adding or updating a dependency,
regenerate the lock file from a clean install:

```sh
rm -rf node_modules package-lock.json
npm install
```

## Releases

Maintainers release by pushing a version tag (`vX.Y.Z`); `.github/workflows/release.yml`
checks and publishes to npm. Update `CHANGELOG.md` and the version in `package.json` first.
