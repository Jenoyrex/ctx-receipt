# Progress log

What has been built so far, the decisions behind it, and what is left. Milestones follow the
original plan (Step 0, M1 to M9). Last updated 2026-11-12.

## Status

| Milestone | What                                                                    | Status      |
| --------- | ----------------------------------------------------------------------- | ----------- |
| Step 0    | Check the npm name, init git                                            | Done        |
| M1        | Skeleton: build, lint, test, CI, `--version`                            | Done        |
| M2        | Core scan, Claude Code rules, plain receipt                             | Done        |
| M3        | Skills (Claude Code, Codex)                                             | Done        |
| M4        | MCP servers listed statically, secret-safe reading, leak tests          | Done        |
| M5        | Codex, Cursor, Gemini CLI adapters; `docs/adding-an-agent.md`           | Done        |
| M6        | `--mcp` live measurement                                                | Not started |
| M7        | `--json`, `--md`, `--svg`, `--budget`, grade                            | Not started |
| M8        | Real README, CONTRIBUTING, issue templates, CHANGELOG, release workflow | Not started |
| M9        | Release dry run with `npm pack`                                         | Not started |

Current checks: lint, typecheck, and build pass; 45 tests in 9 files pass.

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

## Next

- **M6:** start stdio MCP servers only with `--mcp`, print the commands first, list tools, 10 s
  timeout per server, always shut them down. Count Claude Code's deferred tool schemas as on
  demand.
- **M7:** `--json`, `--md`, `--svg`, `--budget`, and the letter grade. Add each new format to the
  leak test's `FORMATS` list.
- **M8:** README, CONTRIBUTING, issue templates, CHANGELOG, release workflow.
- **M9:** `npm pack` dry run.
