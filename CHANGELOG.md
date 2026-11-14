# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).

## Unreleased

- GitHub Action (`action.yml`): run ctx-receipt in a workflow, write the receipt to the job
  summary, optionally comment it on the pull request, and fail when the total is over a budget.
  Outputs `total`, `grade`, and `over-budget`.
- Live badge: a workflow measures the repository on every push to `main` and publishes a
  shields.io endpoint file to a `badges` branch. The README shows how to add one to any repo.
- Findings dataset: `research/` holds the scripts, the raw results, and `FINDINGS.md`, measuring
  what popular repositories pre-load.
- README: the "How it compares" section now lists only comparisons we could verify.

## 0.1.2 (2026-11-13)

Documentation only; no change to what the tool counts or prints.

- README: install options (global and per project), an "Outputs" section with a real `--json`
  excerpt, a "Privacy and safety" section, and the supported-agents table updated for custom
  agents and auto memory.

## 0.1.1 (2026-11-13)

Fixes from comparing ctx-receipt with Claude Code's `/context` on a real project.

- Count Claude Code custom agents (`.claude/agents/`, `~/.claude/agents/`): each agent's name,
  description, and tools line, which Claude Code keeps in context for delegation.
- Count Claude Code auto memory: the first 200 lines or 25 KB of the repository's `MEMORY.md`.
- New `--window <tokens>` option for the context window size. It sets the percentages and the
  skill listing caps (Claude Code 1%, Codex 2% of the window). The default stays 200,000.
- The receipt shows a rough Claude-tokenizer figure under Claude Code's subtotal (about 1.6 times
  the o200k_base estimate, measured against `/context`). Totals, budgets, and grades are
  unchanged.
- JSON reports `contextWindow`, `claudeTokenizerFactor`, and `claudeTokenizerEstimate` for Claude
  Code, and a `subagents` count per agent.

## 0.1.0 (2026-11-13)

First release.

- Receipt of what Claude Code, Codex CLI, Cursor, and Gemini CLI pre-load into context: rules
  files (with imports), skill listings, and MCP servers, from the project and the home folder.
- Always-loaded, on-demand, and unmeasured items shown separately; per-agent subtotals; a letter
  grade for the heaviest agent (our own cut-offs).
- Skill listing caps applied per agent (Claude Code 1%, Codex 2% of the window).
- `--mcp [name]`: start stdio MCP servers from your config, list their tools, and report what
  loads up front and what all schemas would cost. 10 second timeout per server; servers are
  always shut down; commands and their environment are never printed.
- `--json`, `--md <file>`, `--svg <file>` outputs and `--budget <tokens>` for CI.
- `--agent`, `--no-user`, `--home` options.
- All token counts are estimates (`o200k_base` via gpt-tokenizer).
