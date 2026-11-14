# Progress log

The full record of how ctx-receipt was built: what was done, the decisions behind it, what was
checked, and what is left. Last updated 2026-11-13.

## Where things stand

- **Published:** [`ctx-receipt` on npm](https://www.npmjs.com/package/ctx-receipt), latest **0.1.2**. Versions 0.1.0, 0.1.1, and 0.1.2 are live and byte-identical to their local builds (shasums `bf3a881…`, `8b78d63…`, `547ca3e…`).
- **Repository:** [github.com/Jenoyrex/ctx-receipt](https://github.com/Jenoyrex/ctx-receipt),
  public, tags `v0.1.0`, `v0.1.1`, and `v0.1.2`.
- **Checks:** lint, typecheck, and build pass; **92 tests in 13 files** pass. CI passes on Node 20
  and 22, including a step that packs the tarball, installs it in an empty folder, and runs it.
- **Blocked:** nothing.

| Milestone | What                                                               | Status |
| --------- | ------------------------------------------------------------------ | ------ |
| Step 0    | Check the npm name, init git                                       | Done   |
| M1        | Skeleton: build, lint, test, CI, `--version`                       | Done   |
| M2        | Core scan, Claude Code rules, plain receipt                        | Done   |
| M3        | Skills (Claude Code, Codex)                                        | Done   |
| M4        | MCP servers listed statically, secret-safe reading, leak tests     | Done   |
| M5        | Codex, Cursor, Gemini CLI adapters; `docs/adding-an-agent.md`      | Done   |
| M6        | `--mcp` live measurement                                           | Done   |
| M7        | `--json`, `--md`, `--svg`, `--budget`, grade, skill listing caps   | Done   |
| M8        | README, CONTRIBUTING, issue templates, CHANGELOG, release workflow | Done   |
| M9        | Release dry run with `npm pack`                                    | Done   |
| 0.1.0     | First release on npm                                               | Done   |
| 0.1.1     | Fixes from comparing with Claude Code's `/context`                 | Done   |
| 0.1.2     | README polish published to npm                                     | Done   |

## Now: launch-ready (L1 to L5)

**L1, findings dataset: done.** Of the 1,000 most-starred active public repos, 487 ship an agent
context file; the 50 most-starred of those were measured (`research/select.mjs`,
`research/scan.mjs`), all 50 successfully. Heaviest agent per repo: **median 1,838 tokens**,
quartiles 755 and 4,001, max 12,446 (estimates). `research/FINDINGS.md` is generated from
`research/scan-2026-11-14.json` by `research/summarize.mjs`, and `test/research.test.ts` fails if
they disagree. Decisions:

- Headline metric: the heaviest agent per repository, not the receipt's cross-agent total, which
  counts a shared `AGENTS.md` once per agent that reads it.
- Clones are shallow and sparse, inside the git-ignored `.scan-tmp/` (a safety check refused
  removing a folder at a drive root), with `core.symlinks=false`, no LFS, no submodules, no
  repository code run, never `--mcp`, and an empty `--home`; each clone is deleted after its scan.
- Symlinks: the first run counted symlinked agent files as their 1-to-5-token link text (for
  example `torvalds/linux`, `huggingface/transformers`). The scan now replaces a symlink whose
  target is inside the repository with the target's content, as an agent would read it (11
  resolved, 0 pointing outside), and the full scan was rerun.
- Generated research files are excluded from Biome, so FINDINGS.md stays byte-identical to the
  generator's output.

**L2, GitHub Action: done.** `action.yml` (composite): inputs `path`, `budget`, `agent`, `window`,
`no-user`, `comment`, `version`, `github-token`; outputs `total`, `grade`, `over-budget`; writes
the receipt to the job summary, optionally comments on the pull request (updating its own
comment), and fails over budget. `.github/workflows/action.yml` runs it against `examples/demo`
with the CLI built from the commit: the under-budget job passes, and the over-budget job's action
step fails as designed ("over budget: 204 tokens always loaded (estimate) > 10"), which the job
asserts. Biome caught a YAML error (an unquoted description containing a colon) before the first
push. The README documents it with `@main`, because no tag contains `action.yml` yet.

**L3, live badge: done.** `.github/workflows/badge.yml` measures this repository on each push to
`main` and commits a shields.io endpoint file to the `badges` branch (as `github-actions[bot]`,
on a non-default branch, so it does not count as a contributor); the job is `continue-on-error`.
It renders as "pre-loaded context: 0 tokens · A": this repository ships no agent files, and
adding one only for the badge would change the `examples/demo` receipt, since agents read parent
folders. The README shows the badge and a copy-paste snippet.

**L4, debt and consistency: done.** Every shell command in the README was run as written (with
`path/to/project` replaced by the demo); all exit 0. CHANGELOG has an "Unreleased" section for the
action, the badge, and the dataset. The README's "How it compares" section (added by another
session) named four tools; npm and GitHub showed that `mcp-optimizer` is a Lighthouse tool,
`drskill` does not exist, and `token-lens` is a 0-star repository, so only the verifiable
comparison with `/context` remains. The README links to the findings without copying numbers.

Deprecating the stray placeholder version needs your npm credentials and security key, so it was
not run. The command:

```bash
npm deprecate ctx-receipt@0.0.0-stage "Temporary placeholder from npm staged publishing. Use the latest version."
```

Known issue found during L4: shadcn starts in about 8 s, close to ctx-receipt's fixed 10 s `--mcp`
timeout, so it sometimes times out under load. A `--mcp-timeout <seconds>` option would help.

**L5, launch preparation (next).**

## Timeline

| Date       | Commit                          | What                                                                   |
| ---------- | ------------------------------- | ---------------------------------------------------------------------- |
| 2026-11-12 | `4f11f05`                       | M1 skeleton                                                            |
| 2026-11-12 | `37bb957`                       | M2 core scan and Claude Code rules                                     |
| 2026-11-12 | `ce19997`                       | M3 skills                                                              |
| 2026-11-12 | `a3adc89`                       | M4 static MCP listing and leak tests                                   |
| 2026-11-12 | `5caa593`, `c4dac85`, `e80e722` | M5 Codex, Cursor, Gemini CLI adapters                                  |
| 2026-11-12 | `c8ed737`                       | Agents that are not installed skip home files                          |
| 2026-11-12 | `ee2cf4e`                       | Lock file fix for Linux CI                                             |
| 2026-11-13 | `c7917ac`                       | M6 `--mcp`                                                             |
| 2026-11-13 | `c589307`, `3109f68`            | M7 listing caps and outputs                                            |
| 2026-11-13 | `8285f67`                       | M8 docs and release workflow                                           |
| 2026-11-13 | `3714899`                       | M9 release dry run; CI runs the packed tarball                         |
| 2026-11-13 | `eb11461`                       | README polish; repository made public; 0.1.0 published                 |
| 2026-11-13 | `a176c71`                       | Release workflow skips versions already on npm; tag `v0.1.0`           |
| 2026-11-13 | `0a1cd75`                       | Comparison with `/context` on a real project                           |
| 2026-11-13 | `a4b242d`                       | 0.1.1: custom agents, auto memory, `--window`, Claude-tokenizer figure |
| 2026-11-13 | `c9544b9`                       | PROGRESS.md rewritten; README: install, outputs, privacy and safety    |
| 2026-11-13 | `4c02d24`                       | 0.1.2 published with the new README; tag `v0.1.2`                      |

## What ctx-receipt does

`npx ctx-receipt` scans a project and the home folder, finds what each coding agent pre-loads
into its context window, estimates the tokens offline (`o200k_base` via gpt-tokenizer), and
prints a receipt with per-agent subtotals, an on-demand section, a total, and a letter grade. It
can also write JSON, Markdown, and an SVG card, fail CI over a budget, and, with `--mcp`, start
stdio MCP servers to measure their tools.

| Agent       | Rules                                                    | Skills | Agents | MCP servers |
| ----------- | -------------------------------------------------------- | ------ | ------ | ----------- |
| Claude Code | CLAUDE.md family, rules, AGENTS.md fallback, auto memory | Yes    | Yes    | Yes         |
| Codex CLI   | AGENTS.md chain with byte budget                         | Yes    | n/a    | Yes         |
| Cursor      | `.mdc` rules by apply mode, AGENTS.md, `.cursorrules`    | n/a    | n/a    | Yes         |
| Gemini CLI  | GEMINI.md (or configured names) with imports             | Yes    | n/a    | Yes         |

## Step 0: name and repository

- `npm view ctx-receipt` returned 404, so the name was free. The near-identical names npm would
  reject (`ctxreceipt`, `ctx_receipt`, `ctx.receipt`) were free too.
- `git init -b main`.

## M1: skeleton

- TypeScript, ESM, Node 20+, built with tsup into `dist/`, tested with vitest, linted and
  formatted with Biome, CLI flags with commander.
- `--version` reads `package.json`, so the version lives in one place.
- CI (`.github/workflows/ci.yml`): lint, typecheck, build, test on Node 20 and 22.
- **commander pinned to 14**: version 15 requires Node 22.12+.
- **`@types/node` pinned to 20**, so the code cannot use APIs newer than the oldest supported Node.
- **`.gitattributes` forces LF**: with `core.autocrlf` on Windows, files were checked out with CRLF,
  which Biome rejects.

## M2: core and Claude Code rules

- `types.ts`: one record per thing an agent loads:
  `{ agent, kind, name, path, scope, loading, tokens, detail?, fullTokens? }`.
- `tokens.ts`: `estimateTokens()` wraps gpt-tokenizer. Every output says the numbers are
  estimates and names the tokenizer.
- `scan.ts` runs the adapters; `render/receipt.ts` prints the receipt.
- Exit codes: 0 ok, 1 over budget, 2 usage error, 3 scan error.
- Claude Code rules, checked against the official memory docs (several differ from the original
  plan): `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` in the project and every parent
  folder; `~/.claude/CLAUDE.md`; `.claude/rules/` and `~/.claude/rules/` (rules with `paths:` load
  on demand); `AGENTS.md` when no CLAUDE.md exists; `@path` imports up to 4 hops, skipped inside
  code; block-level HTML comments removed before counting.
- Color only when stdout is a terminal (picocolors alone turns it on in Windows pipes and CI).

## M3: skills

- Shared `SKILL.md` reader (`src/skills.ts`). Each skill gives a listing line (always loaded) and
  its body (on demand).
- Claude Code: `name: description` plus `when_to_use`, cut at 1,536 characters; a missing
  description falls back to the body's first line; `disable-model-invocation: true` hides the
  listing. Locations: `.claude/skills` up to the git root, `~/.claude/skills`, skills synced from
  claude.ai (`~/.claude/skills/synced/<account>/`), and `.claude/commands/`.
- Codex: name, description, and file path. Locations: `.agents/skills` up to the git root, and
  `~/.agents/skills`.
- The on-demand section is grouped by agent, because the same skill can exist for two agents.

## M4: MCP servers, statically

- `src/redact.ts` is the only code that reads configs that can hold MCP servers. It keeps each
  server's name and transport and nothing else.
- A config that fails to parse gives `could not parse <path>` and exit 3; raw JSON and TOML errors
  quote the file, which can include a key.
- Claude Code servers: local scope (`~/.claude.json`, per project), `.mcp.json`, and user scope;
  local beats project beats user; `disabledMcpServers` and reserved names are skipped.
- Leak tests (`test/redact.test.ts`) plant one fake key in every field of every config format and
  check stdout, stderr, written files, and scan records. Planting a real leak made them fail.
- An early version showed the server's program name. It was removed: a config whose `command` is
  itself a key would have printed the key.

## M5: Codex, Cursor, Gemini CLI

Each adapter was checked against the agent's docs and committed separately.

- **Codex:** `~/.codex/AGENTS.override.md` or `AGENTS.md`; from the git root down, one file per
  folder (`AGENTS.override.md`, `AGENTS.md`, `project_doc_fallback_filenames`); a shared 32 KiB
  `project_doc_max_bytes` budget (the docs describe it both per file and combined; we follow the
  combined description). MCP from `[mcp_servers.*]` in user and project `config.toml`, closest
  wins, `enabled = false` honored. Skills turned off with `[[skills.config]]` are skipped.
- **Cursor:** only `.mdc` in `.cursor/rules`; `alwaysApply: true` always; description-only rules
  pre-load name and description; glob-only and manual rules on demand. `AGENTS.md` in the
  project root. `.cursorrules` counted but marked "legacy, unverified". MCP from
  `.cursor/mcp.json` and `~/.cursor/mcp.json`. Frontmatter is read line by line, because Cursor
  allows `globs: *.ts`, which is not valid YAML.
- **Gemini CLI:** `context.fileName` (one name or a list), `~/.gemini/<name>`, project and parents
  up to the first `.git`; imports up to 5 levels; skills from `.agents/skills` and
  `.gemini/skills` with name precedence and `skills.disabled`; MCP `httpUrl` is HTTP, `url` is
  SSE, `command` is stdio, with `mcp.excluded` and `mcp.allowed`. `settings.json` allows comments,
  so a small comment stripper was written instead of adding a dependency.
- Shared helpers: `src/fs.ts`, `src/markdown.ts`. `docs/adding-an-agent.md` written.
- **Agents that are not installed:** if `~/.claude`, `~/.codex`, `~/.cursor`, or `~/.gemini` is
  missing, that agent's home files are skipped and its project files still count; `--agent`
  overrides this. Shared folders such as `~/.agents/skills` had made absent agents appear.
- **Bug fixed:** when home is a parent of the project, `~/.claude/CLAUDE.md` was treated as a
  project file, which switched off the AGENTS.md fallback and loaded even with `--no-user`.

## M6: `--mcp`

- `@modelcontextprotocol/sdk` added (it brings server-side packages too; only the client is used)
  and loaded only with `--mcp`, because it roughly tripled start-up time.
- `src/mcp/launch.ts` is the only code that reads `command`, `args`, and `env`, and only to spawn.
  Server stderr is discarded. Each server has 10 s, then is shut down (stdin closed, SIGTERM,
  SIGKILL). `src/mcp/measure.ts` turns tool lists into numbers; tool text never reaches records.
- Before launching, `--mcp` prints agent, server name, transport, and config file, never the
  command. Failures say only "failed to start" or "timed out", because spawn errors name the
  command. `--mcp <name>` starts one server.
- Servers get the SDK's safe default environment plus their config `env`, with `${VAR}`,
  `${VAR:-default}`, and `${env:VAR}` expanded (Codex forwards `env_vars` instead).
- Two numbers per server: **up front** (counts toward the total) and **all schemas, if loaded**.
  Claude Code defers schemas by default (names and instructions up front); `ENABLE_TOOL_SEARCH`
  `false`/`auto`, server `alwaysLoad`, and tool `_meta["anthropic/alwaysLoad"]` load them up
  front. Codex, Cursor, Gemini CLI: up front = all schemas. Codex and Gemini tool allow and deny
  lists are applied.
- Tests use only `test/fixtures/mcp/fake-server.mjs` (echoes env and args into stderr and a tool
  description; can hang and ignore SIGTERM). A hanging server times out and is killed.

## M7: outputs, grade, caps

- `src/grade.ts`: `summarize()` feeds every output. The grade uses the heaviest agent's
  always-loaded tokens; the cut-offs (A <5k, B <15k, C <30k, D <60k) are our own opinion.
- `--json` replaces the receipt on stdout; `--md <file>` and `--svg <file>` write files in
  addition. These are the only files the tool writes, and only where the user points them.
- JSON and Markdown name files project-relative or with `~/`, never as absolute paths.
- The SVG card shows per-agent totals and counts only, with no file or server names, and draws
  its own opaque background, so it reads the same on light and dark pages (checked in a browser).
- `--budget <tokens>` checks the total always loaded across the agents shown; exit 1 when over.
- Skill listing caps: Claude Code `skillListingBudgetFraction` of the window (default 1%), Codex
  2% or `skills.max_context_tokens` (at most 10,000). Over the cap, names are kept and each
  description share is scaled down; lines are marked "listing cap".

## M8: documentation and release setup

- README, `docs/how-we-count.md`, CONTRIBUTING, issue templates (bug, new agent), CHANGELOG.
- `examples/demo` (a small project and fake home) is the README example. A test checks that the
  README's example receipt is exactly what the CLI prints, and that every flag is documented.
- `examples/demo` is excluded from Biome: Biome formats Markdown, which would change token counts.
- Release workflow: on a `v*` tag, lint, typecheck, build, test, check the tag matches
  package.json, and publish with provenance (skipped when the version is already on npm).

## M9: release dry run

- `npm pack`: 6 files (LICENSE, README, package.json, `dist/`). Installed into an empty folder,
  the tarball printed the same receipt as the repo build; every output and exit code worked; the
  secrets fixture leaked nothing; no fake-server process was left running.
- `npx <bare Windows path to .tgz>` silently runs nothing (an npx quirk); `npx file:<path>` works.
- CI now packs, installs, and runs the tarball on Linux with Node 20 and 22.

## Releasing 0.1.0

- Commit author email rewritten on all commits to the GitHub private address (files unchanged),
  force-pushed while the repository was still private; then the repository was made public.
- npm required two-factor authentication on the account. The command-line route
  (`npm profile enable-2fa`) was refused; it was turned on in the website (security key,
  "auth-and-writes").
- npm staged the first upload (a `0.0.0-stage` placeholder) until 0.1.0 was released from
  "Staged Packages". Live 0.1.0 matched the local build; `npx ctx-receipt` worked from an empty
  folder.
- PowerShell 5.1 does not accept `&&`; commands for the user's terminal must be one per line.

## Comparing with Claude Code's `/context`

Run on a real project with `claude -p "/context"` (Claude Code 2.1.322, 1M-token model). Git Bash
rewrites `/context` into a Windows path unless `MSYS_NO_PATHCONV=1` is set.

| Category              | `/context` | ctx-receipt 0.1.0 | Ratio |
| --------------------- | ---------: | ----------------: | ----: |
| User CLAUDE.md        |        190 |               121 |  1.57 |
| Project CLAUDE.md     |      1,800 |             1,135 |  1.59 |
| 24 skills, one by one |      2,030 |             1,258 |  1.61 |

Findings: Claude's tokenizer counts about 1.6 times `o200k_base`; the 200k window assumption
under-capped skills on a 1M model; custom agents and auto memory were not counted; plugin and
built-in skills, and Claude Code's own system prompt and tools (about 14k), are not read by
design. Full details in `docs/how-we-count.md`.

## 0.1.1

- **Custom agents** counted: `.claude/agents/` up to the git root and `~/.claude/agents/`, the
  `- name: description (Tools: ...)` line only (the body loads only in the agent's own context).
  Files Claude Code skips are skipped. Agent files can define MCP servers inline with keys; only
  `name`, `description`, and `tools` are read.
- **Auto memory** counted: first 200 lines or 25 KB of
  `~/.claude/projects/<repo root with non-alphanumerics as "-">/memory/MEMORY.md`, unless
  `autoMemoryEnabled` is false or `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is set.
- **`--window <tokens>`**: sets percentages and listing caps; the default stays 200k, so existing
  output only gains new lines.
- **Claude-tokenizer figure**: `~N in Claude's tokenizer (x1.6, rough)` under Claude Code's
  subtotal; totals, budgets, and grades stay raw. JSON adds `contextWindow`,
  `claudeTokenizerFactor`, `claudeTokenizerEstimate`, and a `subagents` count.
- After the fix, on the same project: agents 246 (about 394 at 1.6) against 358 in `/context`;
  auto memory 37 (about 59) against 60.

## `--mcp` on the real config

Run on 2026-11-13 in a real project with the real home config (`--mcp --window 1000000`). It
started only the one stdio server, after printing its name, transport, and config file.

- `shadcn` (stdio, via `npx`): timed out at 10 s on both runs. Claude Code itself also timed out
  on it at startup (30 s), so the server slows every session and provides no tools.
- `motion` (HTTP): remote, so not measured, by design.
- Shutdown was clean: no process from the runs was left running, even through Windows' `npx`
  and `cmd.exe` chain (the shadcn processes still running belonged to the Claude Code app).
  On Windows a timed-out run takes about 20 to 40 s in all, because stopping the chain is slower.
- Claude Code pre-loads 4,658 tokens there (estimate), about 7,453 in Claude's tokenizer.
- **shadcn fixed (2026-11-14).** Cause: `npx shadcn@latest mcp` checks the npm registry on every
  start and goes through `cmd.exe`; answering `initialize` took 13.7 s. Of what remains, about
  5 s is loading shadcn's own code and about 3 s a network call it makes at startup. Fix:
  installed `shadcn@4.23.0` globally and re-added the server with `claude mcp` as
  `node <global>/shadcn/dist/index.js mcp`; it answers in about 8 s and Claude Code reports it
  connected. ctx-receipt now measures it: 95 tokens up front, 1,003 if all schemas loaded
  (Claude Code total 4,753, about 7,605 in Claude's tokenizer). The previous config is backed
  up at `~/.claude.json.bak-before-shadcn-fix`. To update shadcn later:
  `npm install --global shadcn@latest`.

## Launch preparation

- Repository: homepage set to the npm page, Discussions enabled, 13 topics.
- Social preview: `.github/social-preview.png` (1280x640) from `.github/social-preview.html`,
  rendered with Edge. Uploading it is a manual step (no GitHub API).
- GitHub Releases for `v0.1.0`, `v0.1.1`, `v0.1.2`, with notes from the CHANGELOG.
- Six starter issues from real gaps:
  [#1](https://github.com/Jenoyrex/ctx-receipt/issues/1) GitHub Copilot,
  [#2](https://github.com/Jenoyrex/ctx-receipt/issues/2) Windsurf,
  [#3](https://github.com/Jenoyrex/ctx-receipt/issues/3) Cline / Roo Code,
  [#4](https://github.com/Jenoyrex/ctx-receipt/issues/4) Codex `CODEX_HOME` (good first issue),
  [#5](https://github.com/Jenoyrex/ctx-receipt/issues/5) Claude Code plugin skills,
  [#6](https://github.com/Jenoyrex/ctx-receipt/issues/6) verify Codex and Cursor MCP deferral.
- Launch kit with drafts for Show HN, Reddit, X, LinkedIn, and Dev.to, all using real numbers,
  plus the rules of four awesome lists: `launch/LAUNCH-KIT.md`, kept out of git.

## Problems hit and how they were solved

- **Lock file broke CI twice.** On Windows, `npm install <package>` with an existing
  `node_modules` drops optional packages only Linux needs (`@emnapi/core`, `@emnapi/runtime`).
  Fix: delete `node_modules` and `package-lock.json`, run `npm install`, check `@emnapi/core` is in
  the lock file. Written into CONTRIBUTING.
- **Flaky CLI test.** Three CLI spawns in one 5 s budget failed under load once MCP tests ran in
  parallel. Split into one spawn per test and set `testTimeout` to 15 s; no assertion changed.
- **A hidden lint failure.** Filtered output once hid a Biome error on a new Markdown file. All
  checks are now judged by exit codes.
- **Slow start-up.** The MCP SDK tripled start-up time; it is now imported only with `--mcp`.

## Unverified

- Cursor `.cursorrules`: no longer in the docs; counted as always loaded.
- Codex MCP deferral: the docs mention a "deferred" (tool search) surface and per-server
  `omit_tools_from` but not the default. We assume all schemas load up front.
- Cursor MCP deferral: not documented. We assume all schemas load up front.
- Gemini CLI MCP: no deferral documented; tools are registered as function declarations.
- The 1.6 Claude-tokenizer factor comes from one project and one model.

## Not counted

Each adapter's header comment lists these too.

- Every agent's own system prompt and built-in tools.
- Claude Code: managed policy files, CLAUDE.md and skills in subfolders (on demand), plugin and
  built-in skills and agents, plugin and claude.ai MCP servers, `managed-mcp.json`, `.mcp.json`
  approval settings.
- Codex: `CODEX_HOME`, `/etc/codex/skills`, bundled skills, profiles, project trust.
- Cursor: User Rules and Team Rules (stored in the app), servers toggled off in the app.
- Gemini CLI: system settings files, extensions, built-in skills, `context.includeDirectories`.

## Known issues

- A low-severity esbuild advisory (dev server only, dev dependency) cannot be fixed until tsup
  allows esbuild 0.28.
- npm caches package metadata locally; right after a release, `npx ctx-receipt` on the publishing
  machine may need `--prefer-online`.

## How to try it

```bash
npx ctx-receipt                                   # from npm
npm install && npm run build && npm test          # from a clone
node dist/cli.js examples/demo/project --home examples/demo/home
node dist/cli.js test/fixtures/secrets/project --home test/fixtures/secrets/home
```

## Releasing a new version

1. Update the code, the CHANGELOG, and the version in `package.json`.
2. If a dependency changed, regenerate the lock file from a clean install (see above).
3. Run `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`; push and wait for CI.
4. `npm publish --access public`, approved with the security key; release it from "Staged
   Packages" on npmjs.com if npm stages it.
5. Tag and push: `git tag -a vX.Y.Z -m "ctx-receipt X.Y.Z"` then `git push origin vX.Y.Z`.

## Left for you

- Upload the social preview: Settings > General > Social preview > Edit > upload
  `.github/social-preview.png` (GitHub has no API for it).
- Launch: post the drafts in `launch/LAUNCH-KIT.md` (local, git-ignored) in the order it gives,
  then submit to the awesome lists it names once there is traction (awesome-claude-code needs
  at least 100 stars).
- Compare with `/context` on another project (or another model) to firm up the 1.6 factor.
- Check Codex's and Cursor's MCP deferral in the apps themselves (marked unverified).
- For automated releases: add an `NPM_TOKEN` secret (a granular token allowed to publish) so the
  tag workflow can publish. Until then, publish by hand.
