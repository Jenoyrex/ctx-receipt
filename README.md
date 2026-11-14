# ctx-receipt

[![CI](https://github.com/Jenoyrex/ctx-receipt/actions/workflows/ci.yml/badge.svg)](https://github.com/Jenoyrex/ctx-receipt/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/ctx-receipt)](https://www.npmjs.com/package/ctx-receipt)
[![Node.js](https://img.shields.io/node/v/ctx-receipt)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![pre-loaded context](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Jenoyrex/ctx-receipt/badges/ctx-receipt.json)](#live-badge)

See what your AI coding agent loads into context before you type a word. A token receipt for
your rules files, skills, and MCP servers.

<p align="center"><img src="examples/receipt.svg" alt="A receipt card: Claude Code 167, Codex CLI 41, Cursor 40, total 248 tokens always loaded, grade A" width="440"></p>

Coding agents (Claude Code, Codex CLI, Cursor, Gemini CLI) pre-load instruction files, skill
descriptions, and MCP tool definitions before your first prompt. If you use several agents and
several MCP servers, nothing shows you what that costs in one place. `ctx-receipt` scans your
project and your home config, finds what each agent would load, and prints a receipt.

All token counts are **estimates**, made offline with the `o200k_base` tokenizer. Each agent's
own tokenizer gives different numbers. See [How we count](docs/how-we-count.md).

**Why it is useful**

- **One view across agents.** Claude Code, Codex CLI, Cursor, and Gemini CLI side by side.
- **Works before you start a session**, and in CI, so a growing `CLAUDE.md` or a new MCP server
  shows up in a pull request instead of in a slow, forgetful session.
- **Counts everything that pre-loads**: rules files and their imports, skill listings, custom
  agents, auto memory, and MCP tools, each split into what is always loaded and what loads only
  on demand.
- **Checked against reality.** We compared it with Claude Code's own `/context` on a real
  project; the receipt shows a rough Claude-tokenizer figure based on that comparison.
- **Shareable.** Write a receipt card with `--svg`, a report with `--md`, or JSON with `--json`.
- **Safe with secrets.** MCP configs hold API keys; ctx-receipt never prints them, and its tests
  prove it.

**What do popular projects pre-load?** We measured the 50 most-starred active repositories that
ship agent context files. The distribution, method, raw data, and scripts are in
[research/FINDINGS.md](research/FINDINGS.md).

## Contents

- [Quick start](#quick-start)
- [Install](#install)
- [Example](#example)
- [What it counts](#what-it-counts)
- [MCP servers and `--mcp`](#mcp-servers-and---mcp)
- [Outputs](#outputs)
- [Options](#options)
- [Use in CI](#use-in-ci)
- [Supported agents](#supported-agents)
- [How it compares](#how-it-compares)
- [Privacy and safety](#privacy-and-safety)
- [FAQ](#faq)
- [Limitations](#limitations)
- [Contributing](#contributing)

## Quick start

```sh
npx ctx-receipt
```

That scans the current folder and your home config. Common variations:

```sh
npx ctx-receipt path/to/project       # another folder
npx ctx-receipt --no-user             # project files only (what your teammates also get)
npx ctx-receipt --agent claude-code   # one agent
npx ctx-receipt --svg receipt.svg     # also write a shareable card
npx ctx-receipt --mcp                 # start stdio MCP servers and measure their tools
npx ctx-receipt --window 1000000      # your model has a 1M-token context window
```

Requires Node.js 20 or later. ctx-receipt itself makes no network calls, collects no telemetry,
needs no account, and never changes your files. (With `--mcp` it starts your MCP servers, and
those may use the network.)

## Install

`npx ctx-receipt` needs no install. To keep it around:

```sh
npm install --global ctx-receipt     # then run: ctx-receipt
npm install --save-dev ctx-receipt   # per project, for scripts and CI
```

## Example

This repository includes a small demo project and a fake home folder in `examples/demo`. From a
clone, after `npm install && npm run build`:

```sh
node dist/cli.js examples/demo/project --home examples/demo/home
```

```
====================================================
                    CTX-RECEIPT
          loaded before your first prompt
====================================================
CLAUDE CODE
  ~/.claude/CLAUDE.md                             17
  skill review                                    17
  CLAUDE.md                                       69
  @docs/architecture.md                           64
  mcp docs (http)                                  ?
                                          ----------
  SUBTOTAL                                       167
  ~267 in Claude's tokenizer (x1.6, rough)
  0.1% of a 200k window
  ? = not measured (--mcp measures stdio servers)

CODEX CLI
  ~/.codex/AGENTS.md                              10
  AGENTS.md                                       31
                                          ----------
  SUBTOTAL                                        41
  0.0% of a 200k window

CURSOR
  .cursor/rules/api.mdc (description)              9
  AGENTS.md                                       31
                                          ----------
  SUBTOTAL                                        40
  0.0% of a 200k window

----------------------------------------------------
ON DEMAND (only when used; not in total)
  Claude Code
    skill review                                  21
    skill release                                 48
  Cursor
    .cursor/rules/api.mdc                         24
----------------------------------------------------
TOTAL ALWAYS LOADED                              248
GRADE                                              A
  from the heaviest agent: Claude Code
====================================================
All token counts are ESTIMATES.
Tokenizer: o200k_base via gpt-tokenizer.
Each agent's own tokenizer will differ.
```

Reading it:

- `@docs/architecture.md` is pulled in by an `@` import in `CLAUDE.md`.
- `skill review` appears twice: its one-line listing is always loaded, its body only when used.
- `skill release` has no always-loaded line because it sets `disable-model-invocation: true`.
- The Cursor rule has a description and no `alwaysApply`, so Cursor pre-loads only the
  description and pulls the rule in when relevant.
- `mcp docs` is a remote server, so it is listed but not measured.
- `~267 in Claude's tokenizer` is a rough conversion: Claude's tokenizer counted about 1.6 times
  our estimate when we compared with Claude Code's `/context` (see [FAQ](#faq)).

## What it counts

|             | Always loaded                                                                      | On demand                           | Unmeasured                          |
| ----------- | ---------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| Rules files | CLAUDE.md, AGENTS.md, GEMINI.md and friends, their `@` imports, always-apply rules | Rules scoped to file paths or globs |                                     |
| Skills      | Each skill's listing line (name and description)                                   | The skill body                      |                                     |
| Agents      | Claude Code custom agents: name and description                                    |                                     |                                     |
| MCP servers | With `--mcp`: what the agent loads up front                                        | With `--mcp`: every tool schema     | Without `--mcp`, and remote servers |

Per agent, it reads:

- **Claude Code:** `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md` in the project and every
  parent folder, `~/.claude/CLAUDE.md`, `.claude/rules/` and `~/.claude/rules/`, `AGENTS.md` when
  there is no CLAUDE.md, `@` imports (4 hops), and auto memory (`MEMORY.md`, first 200 lines or
  25 KB). Skills in `.claude/skills/` (up to the git root), `~/.claude/skills/` including skills
  synced from claude.ai, and `.claude/commands/`. Custom agents in `.claude/agents/` (up to the
  git root) and `~/.claude/agents/`: their name and description. MCP servers from `.mcp.json` and
  `~/.claude.json` (user and per-project).
- **Codex CLI:** `~/.codex/AGENTS.override.md` or `AGENTS.md`; from the git root down,
  `AGENTS.override.md`, `AGENTS.md`, or your fallback file names, within the 32 KiB budget.
  Skills in `.agents/skills/` and `~/.agents/skills/`. MCP servers from `~/.codex/config.toml` and
  `.codex/config.toml`.
- **Cursor:** `.cursor/rules/**/*.mdc` by apply mode, `AGENTS.md`, `.cursorrules`. MCP servers
  from `.cursor/mcp.json` and `~/.cursor/mcp.json`.
- **Gemini CLI:** `GEMINI.md` (or your `context.fileName`) in `~/.gemini/` and from the project
  up to the git root, with `@` imports. Skills in `.gemini/skills/`, `.agents/skills/`, and the
  same under home. MCP servers from `~/.gemini/settings.json` and `.gemini/settings.json`.

If an agent's config folder (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`) does not exist,
its home files are skipped and its project files are still counted.

### Not counted

- Each agent's own system prompt and built-in tools.
- Claude Code: managed policy files, CLAUDE.md files and skills in subfolders (they load on
  demand), plugin and bundled skills and agents, plugin and claude.ai MCP servers.
- Codex: `CODEX_HOME`, admin and bundled skills, profiles, whether the project is trusted.
- Cursor: User Rules and Team Rules (stored in Cursor, not in files), servers turned off in the app.
- Gemini CLI: system settings, extensions, built-in skills, `context.includeDirectories`.

## MCP servers and `--mcp`

Measuring an MCP server means starting it, which runs a command from your config. So
ctx-receipt does that only when you pass `--mcp`:

- It starts stdio servers only. Remote servers stay unmeasured.
- Before starting anything, it prints each server's agent, name, transport, and config file. It
  never prints the command, its arguments, or its environment.
- The server's own error output is discarded.
- Each server has 10 seconds to list its tools, and is shut down afterwards (or when the time
  runs out).
- `--mcp <name>` starts only the server with that name.

Each measured server shows two numbers: what the agent loads **up front** (counted in the total),
and the cost of **all schemas, if loaded**. Claude Code defers MCP tool schemas by default
(tool search), so its up-front number is usually much smaller. See
[How we count](docs/how-we-count.md#mcp-servers).

MCP configs often hold API keys. ctx-receipt reads only the server name and transport from them
for the report; the launcher reads the command and environment only to start the server. Tests
check that a fake key planted in every field of every config format never reaches any output.

## Outputs

| Output   | How                                        | Shows                                                                                                                       |
| -------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Receipt  | default, on stdout                         | Every item, subtotals, on-demand section, total, grade                                                                      |
| JSON     | `--json`, on stdout instead of the receipt | Everything, for scripts and CI                                                                                              |
| Markdown | `--md report.md`, in addition              | A summary table and one table per agent                                                                                     |
| SVG card | `--svg receipt.svg`, in addition           | Per-agent totals and the grade, like the image above. No file or server names, so nothing private ends up in a shared image |

An excerpt of `--json` for the example above:

```json
{
  "tool": "ctx-receipt",
  "version": "0.1.2",
  "estimate": true,
  "tokenizer": "o200k_base via gpt-tokenizer",
  "contextWindow": 200000,
  "grade": "A",
  "heaviestAgent": "claude-code",
  "totalAlwaysLoaded": 248,
  "agents": [
    {
      "id": "claude-code",
      "label": "Claude Code",
      "alwaysLoaded": 167,
      "onDemand": 69,
      "claudeTokenizerEstimate": 267
    }
  ],
  "items": [
    {
      "agent": "claude-code",
      "kind": "rules",
      "name": "CLAUDE.md",
      "file": "CLAUDE.md",
      "scope": "project",
      "loading": "always",
      "tokens": 69
    }
  ]
}
```

The full report also has per-agent counts (rules, skills, agents, MCP servers), the grade
cut-offs, and every item. File names are relative to the project or start with `~/`; absolute
paths never appear.

## Options

| Option              | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `[path]`            | Project to scan. Default: the current folder                         |
| `--agent <name...>` | Only these agents: `claude-code`, `codex`, `cursor`, `gemini`        |
| `--no-user`         | Skip home-directory config                                           |
| `--home <dir>`      | Use another folder as home                                           |
| `--mcp [name]`      | Start stdio MCP servers (or only `name`) and measure their tools     |
| `--json`            | Print a JSON report to stdout instead of the receipt                 |
| `--md <file>`       | Also write a Markdown report                                         |
| `--svg <file>`      | Also write a shareable SVG card. It shows totals only, no file names |
| `--budget <tokens>` | Exit 1 if the total always loaded is over `tokens`                   |
| `--window <tokens>` | Context window for percentages and listing caps. Default: 200000     |

Exit codes: `0` ok, `1` over budget, `2` usage error, `3` scan error (for example, a config file
that is not valid JSON or TOML).

## Use in CI

Keep your project's pre-loaded context in check on every pull request with the GitHub Action:

```yaml
# .github/workflows/context-budget.yml
name: Context budget
on: [pull_request]
permissions:
  contents: read
  pull-requests: write # only needed for comment: "true"
jobs:
  ctx-receipt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Jenoyrex/ctx-receipt@main
        with:
          budget: "8000"
          comment: "true"
```

The receipt goes to the job summary (and, with `comment: "true"`, to a pull request comment that
is updated rather than repeated). The step fails when the total always loaded is over `budget`.

| Input     | Default  | Meaning                                                   |
| --------- | -------- | --------------------------------------------------------- |
| `path`    | `.`      | Folder to scan                                            |
| `budget`  | empty    | Fail over this many tokens (estimate); empty only reports |
| `agent`   | empty    | Only these agents, space-separated                        |
| `window`  | empty    | Context window for percentages and listing caps           |
| `no-user` | `true`   | Count repository files only                               |
| `comment` | `false`  | Post the receipt on the pull request                      |
| `version` | `latest` | ctx-receipt version from npm                              |

Outputs: `total`, `grade`, `over-budget`. Without the action, the same check is one line:
`npx ctx-receipt --no-user --budget 8000`.

### Live badge

This repository's badge:
[![pre-loaded context](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Jenoyrex/ctx-receipt/badges/ctx-receipt.json)](https://github.com/Jenoyrex/ctx-receipt/blob/main/.github/workflows/badge.yml)
(ctx-receipt's own repository ships no agent files, so it reads 0).

To add one to yours, copy [`.github/workflows/badge.yml`](.github/workflows/badge.yml), replace
the two build steps and `node dist/cli.js` with `npx ctx-receipt`, and add this to your README,
with your own owner and repository:

```markdown
[![pre-loaded context](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/OWNER/REPO/badges/ctx-receipt.json)](https://github.com/Jenoyrex/ctx-receipt)
```

The workflow writes a [shields.io endpoint](https://shields.io/badges/endpoint-badge) file to a
`badges` branch on each push to `main`; there is no server. It never fails your build.

## Supported agents

Each adapter was written from the agent's official documentation, checked on 2026-11-12 and
2026-11-13. Claude Code was also compared with its own `/context` on a real project.

| Agent       | Rules                                                          | Skills                  | Custom agents and memory | MCP config | MCP up-front cost                                         |
| ----------- | -------------------------------------------------------------- | ----------------------- | ------------------------ | ---------- | --------------------------------------------------------- |
| Claude Code | verified, compared with `/context`                             | verified                | verified                 | verified   | verified (deferred by default)                            |
| Codex CLI   | verified                                                       | verified                | n/a                      | verified   | deferred by default (verified in Codex's source)          |
| Cursor      | verified; `.cursorrules` **unverified** (no longer documented) | not supported by Cursor | n/a                      | verified   | deferred, tool names up front (Cursor's engineering blog) |
| Gemini CLI  | verified                                                       | verified                | n/a                      | verified   | all schemas; no deferral documented                       |

Where the docs disagree or say nothing, we take the reading that counts more, and say so in
the adapter's source and in [How we count](docs/how-we-count.md).

## How it compares

| Tool                     | What it shows                                                                                          | Where it runs               |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------- |
| **ctx-receipt**          | Rules files and their imports, skill listings, custom agents, memory, and MCP, for four agents at once | Before a session, and in CI |
| Claude Code's `/context` | Claude Code alone, including its system prompt and built-in tools, counted in Claude's own tokenizer   | Inside a session            |

Inside a Claude Code session, `/context` is the ground truth; ctx-receipt's Claude-tokenizer
figure is calibrated against it (see [How we count](docs/how-we-count.md#compared-with-claude-codes-context)).
ctx-receipt is for what `/context` cannot do: the total across every agent a repository carries,
before a session starts, and on every pull request. It does not rewrite or compress anything; it
only measures.

## Privacy and safety

- **Local only.** No network calls, no telemetry, no account. Nothing leaves your machine.
- **Read-only.** It never changes your files. It writes only the files you name with `--md` and
  `--svg`.
- **Secrets stay secret.** From MCP configs it keeps only server names and transports. Commands,
  arguments, environment variables, URLs, and headers are never printed or written, and config
  parse errors are reported without quoting the file. A test plants a fake key in every field of
  every config format and checks that it never reaches any output.
- **Starts nothing by default.** MCP servers are started only with `--mcp`, and the list of
  servers is printed before any of them starts.

## FAQ

**Why are my numbers lower than Claude Code's `/context`?**
We compared the two on a real project ([details](docs/how-we-count.md#compared-with-claude-codes-context)).
For the same files, Claude's tokenizer counted about **1.6 times** our estimate (1.57 to 1.61
per file), so the receipt shows a rough `~N in Claude's tokenizer` figure under Claude Code.
`/context` also includes Claude Code's system prompt and built-in tools (about 14k tokens there),
plus plugin and built-in skills that ctx-receipt does not read. And if your model has a 1M
window, pass `--window 1000000`: Claude Code's skill listing cap is 1% of the window.

**Does it send my files anywhere?**
No. ctx-receipt runs locally, makes no network calls, and has no telemetry. The only processes it
starts are your MCP servers, and only when you pass `--mcp`.

**Is `--mcp` safe?**
It runs the commands in your MCP config, the same ones your agent runs when it starts. It lists
which servers it will start before starting them, gives each one 10 seconds, and shuts every
one down afterwards. If you do not trust a server, do not run `--mcp` on it; use
`--mcp <name>` to start one server at a time.

**Will it print my API keys?**
No. From MCP configs it keeps only server names and transports. The command, arguments,
environment, URLs, and headers are never printed or written, and the test suite checks this for
every config format and every output.

**An agent I do not use shows up. Why?**
Some folders are shared: Codex and Gemini CLI both read `~/.agents/skills`, and three agents
read `AGENTS.md`. ctx-receipt skips home files for agents whose config folder (for example
`~/.gemini`) does not exist, but project files are counted for every agent. Use `--agent` to
narrow the report.

**What does the grade mean?**
It is based on the agent that pre-loads the most: A under 5k tokens, B under 15k, C under 30k,
D under 60k, F above. The cut-offs are our own opinion, a prompt to look rather than a verdict.

## Limitations

- Numbers are estimates from one tokenizer, not each agent's. They do not include the agent's
  own system prompt or the wrapping it adds around your files.
- The context window is 200k tokens unless you pass `--window`; it sets the percentages and the
  skill listing caps.
- The Claude-tokenizer figure uses one factor (1.6) from one comparison. It is a guide, not a
  measurement; totals, budgets, and grades use the raw estimate.
- Skill listing caps: when an agent trims descriptions to fit, we cannot know which ones it
  trims, so per-skill numbers under a cap are approximate (the total is right).
- Settings that live inside an app rather than in files (Cursor User Rules, toggles in `/mcp`)
  are invisible to us.
- Behaviour follows each agent's docs at the date above. Agents change fast; if something looks
  wrong, please [open an issue](https://github.com/Jenoyrex/ctx-receipt/issues).

## Contributing

Bug reports and new agents are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[Adding an agent](docs/adding-an-agent.md). What changed in each release is in the
[CHANGELOG](CHANGELOG.md).

## License

[MIT](LICENSE)
