# Progress log

What has been built so far, the decisions behind it, and what is left. Milestones follow the
original plan (Step 0, M1 to M9). Last updated 2026-11-12.

## Status

| Milestone | What                                                                    | Status |
| --------- | ----------------------------------------------------------------------- | ------ |
| Step 0    | Check the npm name, init git                                            | Done   |
| M1        | Skeleton: build, lint, test, CI, `--version`                            | Done   |
| M2        | Core scan, Claude Code rules, plain receipt                             | Done   |
| M3        | Skills (Claude Code, Codex)                                             | Done   |
| M4        | MCP servers listed statically, secret-safe reading, leak tests          | Done   |
| M5        | Codex, Cursor, Gemini CLI adapters; `docs/adding-an-agent.md`           | Done   |
| M6        | `--mcp` live measurement                                                | Done   |
| M7        | `--json`, `--md`, `--svg`, `--budget`, grade                            | Done   |
| M8        | Real README, CONTRIBUTING, issue templates, CHANGELOG, release workflow | Done   |
| M9        | Release dry run with `npm pack`                                         | Done   |

Current checks: lint, typecheck, and build pass; 81 tests in 12 files pass. Earlier: 61 tests (three runs in a
row). CI green on Node 20 and 22 after the lock file fix (run 43269126292).

## Now

All milestones (Step 0 to M9) are done. What is left needs a person: see "Left for you" at the
end of this file.

## Decisions (M6 to M9)

- Lock file: regenerated from a clean `npm install` (no `node_modules`), which records optional
  packages for every platform. Only additions; no version changed. `npm install <pkg>` on
  Windows with an existing `node_modules` drops them again (it broke CI a second time after the
  MCP SDK was added), so after adding a dependency: delete `node_modules` and
  `package-lock.json`, run `npm install`, and check that `@emnapi/core` is in the lock file.
- Added `@modelcontextprotocol/sdk` 1.32.2 (approved). It brings server-side packages too
  (express, hono, zod); only the client is used.
- `--mcp` is loaded lazily: importing the MCP SDK roughly tripled CLI start time.
- Before launching, `--mcp` prints agent, server name, transport, and config file to stderr, never
  the command. Start failures report only "failed to start" or "timed out", because spawn errors
  name the command.
- Servers get the MCP SDK's default safe environment (PATH, HOME, and similar) plus the `env`
  from their config. `${VAR}`, `${VAR:-default}` and `${env:VAR}` are expanded (not for Codex,
  which forwards `env_vars` instead). Servers start in the project directory unless `cwd` is set.
- All selected servers start in parallel; each has its own 10 s timeout.
- Up front vs full: Claude Code defers schemas by default (names + server instructions up front).
  `ENABLE_TOOL_SEARCH=false`, `auto`, `auto:N`, `"alwaysLoad": true` on the server, and
  `_meta["anthropic/alwaysLoad"]` on a tool count as loaded up front; for `auto` that is the
  conservative reading. Codex, Cursor, and Gemini CLI: up front = full.
- Tool filters honored: Codex `enabled_tools`/`disabled_tools`, Gemini `includeTools`/`excludeTools`.
- vitest `testTimeout` raised to 15 s and the CLI usage-error test split into one spawn per case.
  The old test ran three CLI processes in one 5 s budget and failed under load once the MCP tests
  started servers in parallel. No assertion changed.
- Leak tests checked by planting leaks: a reason that included the server's args made the leak
  test fail, as it should. On Windows, cross-spawn runs commands through cmd.exe, so a missing
  command never produces a spawn error; on Linux it would, and its message names the command.

- Skill listing cap (M7): Claude Code caps the listing at `skillListingBudgetFraction` of the
  window (default 1%, read from `~/.claude/settings.json`), Codex at 2% or
  `skills.max_context_tokens` (at most 10,000). Gemini CLI documents no cap. Over the cap we keep
  every skill's name and scale the description share of each listing line down until the total
  fits, and mark those lines "listing cap". Agents drop the least-used descriptions instead; we
  cannot know usage, so per-skill numbers are approximate but the total matches the cap. Window
  size is assumed to be 200k for every agent.
- `--json` replaces the receipt on stdout. `--md <file>` and `--svg <file>` write files in
  addition to the receipt (or the JSON). These are the only files the tool writes, and only
  where the user points them.
- JSON and Markdown name files project-relative or with `~/`, never as absolute paths.
- The SVG card shows per-agent totals and counts (rules, skills, MCP servers) and no file or
  server names, so no home path can appear. It draws its own opaque paper background and
  border, so it reads the same on GitHub's light and dark themes (checked in a browser on
  `#ffffff` and `#0d1117`).
- `--budget <tokens>` checks the total always loaded across all agents shown (the receipt's
  TOTAL line), as the plan says. Exit 1 when over; the report still prints. Use `--agent` to
  budget one agent. A value that is not a whole number exits 2.
- The grade uses the heaviest agent's always-loaded tokens (cut-offs in `src/grade.ts`).
- Version set to 0.1.0 (the first release), with repository, homepage, bugs, and keywords in
  package.json. No author field: that is yours to add if you want it.
- The README example comes from `examples/demo` (a small project and a fake home). The example
  receipt in the README was compared with a real run character for character. Every other README
  command was run against the demo with `--home examples/demo/home`, and the exit codes (0, 1, 2,
  3) matched. `npx ctx-receipt` itself cannot run until the package is published; M9 runs the
  same CLI from the packed tarball instead.
- `examples/demo` is excluded from Biome: Biome formats Markdown, which would change the demo
  files' token counts and break the README example.
- `docs/how-we-count.md` written; it states the grade cut-offs are our own opinion.
- The release workflow publishes on a `v*` tag with npm provenance, after lint, typecheck, build,
  tests, and a check that the tag matches package.json. It needs an `NPM_TOKEN` repository
  secret. No tag was created.
- M9 release dry run (Windows, Node 25): `npm pack` gives 6 files, 18.7 kB (LICENSE, README,
  package.json, `dist/`). Installed into an empty folder, the tarball's CLI printed `0.1.0`, and
  its demo receipt was identical to the repo build. `--json`, `--md`, `--svg`, `--budget`, and
  `--mcp`/`--mcp plain` (fixture servers only; the hanging one timed out at 10 s and was killed,
  14 s in all) all worked. The secrets fixture leaked nothing in any format, every agent
  fixture ran, the exit codes were right, and no fake-server process was left running.
- Found in M9: `npx <bare Windows path to .tgz>` silently runs nothing and exits 0, while
  `npx file:<path>` and `npm exec --package=<path>` work. That is npx's handling of Windows
  paths, not the package; `npx ctx-receipt` from the registry resolves by name. Not changed.
- CI now also packs, installs the tarball in an empty folder, and runs it on Linux with Node 20
  and 22, because the local dry run could only use Node 25 on Windows.

## Unverified

- Cursor `.cursorrules`: not in the current docs; counted as always loaded.
- Codex MCP deferral: the docs name a "deferred" (tool search) surface and a per-server
  `omit_tools_from`, but not the default. We assume all schemas load up front.
- Cursor MCP deferral: not documented. We assume all schemas load up front.
- Gemini CLI MCP: no deferral documented; tools are registered as function declarations.

## Blocked

Nothing. No task needed three failed attempts.

## Step 0: name and repository

- `npm view ctx-receipt` returned 404, so the name is free. The near-identical names npm would
  reject (`ctxreceipt`, `ctx_receipt`, `ctx.receipt`) are free too.
- `git init -b main`.

## M1: skeleton

- TypeScript, ESM, Node 20+, built with tsup into `dist/cli.js`, tested with vitest, linted and
  formatted with Biome, CLI flags with commander.
- `--version` reads `package.json`, so the version lives in one place.
- CI (`.github/workflows/ci.yml`): lint, typecheck, build, test on Node 20 and 22.
- Decisions:
  - **commander pinned to 14.** Version 15 requires Node 22.12+, which would break the Node 20
    promise.
  - **`@types/node` pinned to 20**, so the code cannot use APIs newer than the oldest supported
    Node.
  - **`.gitattributes` forces LF line endings.** With `core.autocrlf` on Windows, files were
    checked out with CRLF, and Biome rejects those.
- Known: a low-severity esbuild advisory (dev server only, dev dependency) cannot be fixed until
  tsup allows esbuild 0.28.

## M2: core and Claude Code rules

- `types.ts`: one record per thing an agent loads:
  `{ agent, kind, name, path, scope, loading, tokens, detail? }`.
- `tokens.ts`: `estimateTokens()` wraps gpt-tokenizer with the `o200k_base` encoding. Every
  output says the numbers are estimates and names the tokenizer.
- `scan.ts` runs the adapters; `render/receipt.ts` prints the shop-receipt view.
- CLI: `[path]`, `--agent`, `--no-user`, `--home`. Exit codes: 2 for usage errors, 3 for scan
  errors.
- Claude Code rules, checked against the official memory docs. These differ from the original
  plan:
  - `CLAUDE.md`, `.claude/CLAUDE.md`, and `CLAUDE.local.md` in the project and every parent
    directory, plus `~/.claude/CLAUDE.md`.
  - `.claude/rules/**/*.md` and `~/.claude/rules/**/*.md`. Rules with `paths:` frontmatter load
    on demand.
  - `AGENTS.md` is read when no CLAUDE.md exists in the project or above it.
  - `@path` imports are followed up to 4 hops and skipped inside code spans and fenced blocks.
  - Block-level HTML comments are removed before counting, as Claude Code does.
- Color is used only when stdout is a terminal (picocolors alone turns it on in Windows pipes and
  CI).

## M3: skills

- Shared `SKILL.md` reader (`src/skills.ts`). Each skill gives two records: its listing line
  (always loaded) and its body (on demand).
- Claude Code (checked against the skills docs):
  - The listing is `name: description` plus `when_to_use`, capped at 1,536 characters. A missing
    description falls back to the body's first line.
  - `disable-model-invocation: true` means the description is never in context.
  - Locations: `.claude/skills` from the project up to the git root, `~/.claude/skills`, skills
    synced from claude.ai in `~/.claude/skills/synced/<account>/`, and legacy
    `.claude/commands/**/*.md`.
- Codex: name, description, and file path are listed. Locations: `.agents/skills` up to the git
  root, and `~/.agents/skills`.
- The receipt's on-demand section is grouped by agent, because the same skill can be installed
  for two agents.

## M4: MCP servers, statically

- `src/redact.ts` is the only code that reads configs that can hold MCP servers. It keeps each
  server's name and transport and nothing else: no `env`, `args`, `headers`, URLs, or `command`.
- A config that fails to parse produces `could not parse <path>` and exit code 3. Raw JSON and
  TOML parser errors quote the file, which can include a key.
- Claude Code servers: local scope (`~/.claude.json` under the project's path), `.mcp.json`, and
  user scope. Local beats project beats user; `disabledMcpServers` and reserved names are skipped.
- Leak tests (`test/redact.test.ts`): one fake key placed in every field a config allows, for
  every agent, including inside `command` itself and in malformed files. The tests check stdout,
  stderr, and scan records. A deliberately planted leak made them fail, so they have teeth.
- An early version showed the server's program name (for example `npx`). It was removed, because
  a config whose `command` is itself a key would have printed the key.
- Found while checking the docs: Claude Code defers MCP tool schemas by default ("tool search"),
  loading only tool names and server instructions up front. M6 must count that correctly.

## M5: Codex, Cursor, Gemini CLI

Each adapter was checked against the agent's current docs and committed separately.

- **Codex:** `~/.codex/AGENTS.override.md` or `AGENTS.md`. From the git root down, one file per
  directory (`AGENTS.override.md`, `AGENTS.md`, then `project_doc_fallback_filenames`). Project
  files share a 32 KiB budget (`project_doc_max_bytes`); the docs describe this cap both per file
  and combined, and we follow the combined description. MCP from `[mcp_servers.*]` in user and
  project `config.toml`, closest file wins, `enabled = false` honored. Skills turned off with
  `[[skills.config]]` are skipped.
- **Cursor:** only `.mdc` files in `.cursor/rules` count. `alwaysApply: true` is always loaded; a
  description-only rule pre-loads its name and description; glob-only and manual rules are on
  demand. `AGENTS.md` in the project root. `.cursorrules` is no longer documented, so it is
  counted but marked "legacy, unverified". MCP from `.cursor/mcp.json` and `~/.cursor/mcp.json`.
  Frontmatter is read line by line, because Cursor allows things like `globs: *.ts` that are not
  valid YAML.
- **Gemini CLI:** `context.fileName` (one name or a list), `~/.gemini/<name>`, and the project and
  parents up to the first `.git`. `@path` imports up to 5 levels. Skills from `.agents/skills` and
  `.gemini/skills` in the project and home, with name precedence and `skills.disabled`. MCP:
  `httpUrl` is HTTP, `url` is SSE, `command` is stdio; `mcp.excluded` and `mcp.allowed` honored.
  `settings.json` allows comments, so a small comment stripper was added instead of a new
  dependency.
- Shared Markdown helpers moved to `src/markdown.ts`.
- `docs/adding-an-agent.md` written from what each adapter taught.

## After M5: agents that are not installed

- If an agent's config folder (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`) is missing,
  its home files are skipped but its project files still count. `--agent <name>` overrides this.
  Reason: shared folders such as `~/.agents/skills` made agents appear that the user does not
  have.
- Bug fixed along the way: when home is a parent of the project, `~/.claude/CLAUDE.md` was treated
  as a project file. It switched off the AGENTS.md fallback and was loaded even with `--no-user`.

## Not counted yet

Each adapter's header comment lists these too.

- Claude Code: managed policy files, auto memory (`MEMORY.md`), subdirectory CLAUDE.md and skills,
  plugin and bundled skills, plugin and claude.ai MCP servers, `managed-mcp.json`, `.mcp.json`
  approval settings.
- Codex: `CODEX_HOME`, `/etc/codex/skills`, bundled skills, profiles, project trust.
- Cursor: User Rules and Team Rules (not stored in files), servers toggled off in the app.
- Gemini CLI: system settings files, extensions, built-in skills, `context.includeDirectories`.
- All agents: the overall skill listing budget (Claude Code 1% of the window, Codex 2%), which
  can drop descriptions when many skills are installed. Our "always" number can be higher than
  what the agent really sends in that case.

## How to try it

```bash
npm install
npm run build
npm test
node dist/cli.js                 # this folder plus your home config
node dist/cli.js path/to/repo --no-user
node dist/cli.js test/fixtures/secrets/project --home test/fixtures/secrets/home
```

## Left for you

- Compare the tool's numbers against Claude Code's `/context` in a real project. Expect ours to
  be lower: `/context` uses Claude's tokenizer and includes the system prompt, built-in tools,
  and wrapping text we do not count. The comparison tells us how far off the estimate is.
- Run `--mcp` against your own servers once, knowing it starts the commands in your config.
  Tests and checks here only ever started the fixture server.
- Check the Codex and Cursor MCP deferral behaviour in the apps themselves (marked unverified).
- Decide on the commit author email before making the repo public (it is your Gmail address).
- Make the repository public; the README image on npmjs.com loads from the repository.
- Add an `NPM_TOKEN` secret to the repository for the release workflow, then publish (commands
  in the final report).
- Optional: add an `author` field to package.json.
