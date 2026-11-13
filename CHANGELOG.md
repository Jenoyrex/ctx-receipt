# Changelog

All notable changes are listed here. Versions follow [Semantic Versioning](https://semver.org).

## 0.1.0 (unreleased)

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
