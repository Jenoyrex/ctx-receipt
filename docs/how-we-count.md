# How we count

ctx-receipt answers one question: **what does each coding agent put into its context window
before you type anything, and what can it pull in later?** Every number it prints is an
**estimate**.

## Tokens are estimates

- We count tokens with [gpt-tokenizer](https://www.npmjs.com/package/gpt-tokenizer) using the
  `o200k_base` encoding, offline. It is one function, `estimateTokens()` in `src/tokens.ts`.
- No agent in this list uses `o200k_base` for every model it runs. Claude, Gemini, and the
  models behind Codex and Cursor each tokenize differently, so the same text gives different
  counts. Treat our numbers as a consistent yardstick for comparing files and setups, not as
  what your bill or your `/context` view will say.
- Agents also wrap what they load (headings, file paths, separators, tool-use framing). We count
  the content, not the wrapping, so real usage is usually a little higher.
- For Claude Code, the receipt also shows `~N in Claude's tokenizer`: the subtotal times 1.6, the
  ratio we measured against `/context` (below). It is a rough guide for display; totals,
  `--budget`, and the grade stay on the raw estimate.
- Percentages and skill listing caps use a 200k-token window unless you pass `--window`.

## Three kinds of loading

| Loading    | Meaning                                                         | Counts toward the total and grade |
| ---------- | --------------------------------------------------------------- | --------------------------------- |
| always     | In context from the first prompt                                | Yes                               |
| on demand  | Only when the agent decides it needs it, or you ask for it      | No                                |
| unmeasured | We know it loads, but cannot count it without running something | No (shown as `?`)                 |

### Rules files

Counted as the text the agent sends: we strip what it strips (YAML frontmatter, and for Claude
Code block-level HTML comments), follow `@path` imports the way it does, and cut what it cuts
(Codex's `project_doc_max_bytes` budget). Files that load only for matching paths (Claude Code
rules with `paths:`, Cursor rules with `globs`) are on demand.

### Skills

Agents that support `SKILL.md` pre-load a short listing per skill and read the body only when
the skill is used. We count the listing line as always loaded and the body as on demand.

- Claude Code: `name: description` plus `when_to_use`, cut at 1,536 characters. Skills with
  `disable-model-invocation: true` have no listing line.
- Codex: name, description, and the skill's file path.
- Gemini CLI: name and description.

Claude Code caps the whole listing at 1% of the context window (`skillListingBudgetFraction`)
and Codex at 2% (`skills.max_context_tokens`, at most 10,000 tokens). Over the cap they keep
every name and drop or shorten descriptions. We apply the same cap: names are kept, and each
line's description share is scaled down until the total fits. Lines affected are marked
`listing cap`. The total is right; which skill lost how much is approximate, because the agents
drop the descriptions of the skills you use least and we cannot know your usage.

### Custom agents (Claude Code)

Claude Code lists each custom agent (`.claude/agents/` up to the git root, `~/.claude/agents/`)
in the main context as its name, description, and tools, so it can delegate. That line is always
loaded. The agent's body is its own system prompt and loads only in the agent's separate
context, so it is not counted against yours.

### MCP servers

Without `--mcp`, MCP servers are listed as unmeasured: counting them means starting them.

With `--mcp`, ctx-receipt starts each stdio server from your config, asks it for its tool list,
and stops it. Each server gets two numbers:

- **up front**: what the agent loads by default. This is what counts toward the total.
- **all schemas, if loaded**: every tool's name, description, and input schema, plus the
  server's instructions.

| Agent       | Up front by default                                                                                                                                                                                                                                                                                                                                                          | Source                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | Server instructions (cut at 4,096 characters) and each tool's name. Schemas load on demand through tool search. Full schemas load up front when `ENABLE_TOOL_SEARCH` is `false` or `auto` (we take the conservative reading of `auto`), when the server sets `"alwaysLoad": true`, or for a tool that sets `_meta["anthropic/alwaysLoad"]`                                   | Claude Code MCP docs                                                                                                         |
| Codex       | Deferred by default: up front, the `tool_search` tool lists each server by name and description. We count the server name and its instructions (which text fills the description is not settled, so this is the reading that counts more). A server whose `omit_tools_from` contains `"deferred"` loads in full. Every model in Codex's bundled catalog supports tool search | openai/codex source at `7924f95` (2026-11-14): `codex-rs/core/src/tools/spec_plan.rs`, `codex-rs/models-manager/models.json` |
| Cursor      | Deferred: tool descriptions are synced to files, and the agent receives "a small bit of static context, including names of the tools". We count each tool's name; the exact format is not published                                                                                                                                                                          | Cursor engineering blog, "Dynamic context discovery" (2026-01-06)                                                            |
| Gemini CLI  | All schemas: each tool is registered as a function declaration                                                                                                                                                                                                                                                                                                               | Gemini CLI MCP docs                                                                                                          |

Remote (HTTP, SSE, WebSocket) servers stay unmeasured: measuring them needs network access and
often a sign-in.

## The grade

The grade looks at the **heaviest agent's** always-loaded tokens:

| Grade | Always loaded  |
| ----- | -------------- |
| A     | under 5,000    |
| B     | under 15,000   |
| C     | under 30,000   |
| D     | under 60,000   |
| F     | 60,000 or more |

These cut-offs are **our own opinion**, not a standard and not a benchmark. They are set in
`src/grade.ts`. A bigger context budget can be the right call for a big project; the grade is a
prompt to look, not a verdict.

## Agents that are not installed

If an agent's config folder (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`) does not exist,
we skip its home-directory files and still count its project files. Some folders are shared
(Codex and Gemini CLI both read `~/.agents/skills`), so without this an agent you do not use
would appear. `--agent <name>` reads home files for that agent anyway.

## Compared with Claude Code's `/context`

On 2026-11-13 we ran `claude -p "/context"` (Claude Code 2.1.322, a 1M-token model) and
`ctx-receipt --agent claude-code` on the same real project, without `--mcp`.

| Category                                                       | `/context` | ctx-receipt | Notes                                 |
| -------------------------------------------------------------- | ---------: | ----------: | ------------------------------------- |
| User `~/.claude/CLAUDE.md`                                     |        190 |         121 | ratio 1.57                            |
| Project `CLAUDE.md`                                            |      1,800 |       1,135 | ratio 1.59                            |
| Skill listing, 24 skills and commands with a `/context` number |      2,030 |       1,258 | ratio 1.61 (per skill 1.25 to 2.00)   |
| Skill listing, whole category                                  |     10,000 |       1,998 | see "window" and "what we miss" below |
| Auto memory `MEMORY.md`                                        |         60 | not counted |                                       |
| Custom agents (`.claude/agents`)                               |        617 | not counted |                                       |
| MCP server instructions and up-front tools                     |        886 |         `?` | not measured without `--mcp`          |
| System prompt and built-in tools                               |     14,300 | not counted | by design                             |

What this shows:

- **Tokenizer.** For the same text, Claude's tokenizer gave about **1.6 times** as many tokens as
  `o200k_base`, consistently across files and skills. Read our numbers as roughly 60% low for
  Claude models.
- **Window.** We assume a 200k window. This model had 1M, so Claude Code's skill listing cap
  (1%) was 10,000 tokens, not 2,000; our cap cut the listing far below what the model received.
- **What we miss.** The `/context` skills category also holds plugin skills and Claude Code's own
  built-in skills, which we do not read; it was exactly at its 10,000-token cap, so Claude Code
  had dropped descriptions (12 of 13 synced skills showed under 20 tokens, name only). We
  counted those synced skills with full descriptions.

Changes made in 0.1.1 after this comparison:

- **Custom agents** are now counted: each agent's `- name: description (Tools: ...)` line. On the
  same project that gave 246 tokens for the four project and user agents, about 394 at 1.6,
  against 358 in `/context`.
- **Auto memory** is now counted: the first 200 lines or 25 KB of the repository's `MEMORY.md`.
  37 tokens, about 59 at 1.6, against 60 in `/context`.
- **`--window <tokens>`** sets the window, so `--window 1000000` gives Claude Code a 10,000-token
  skill listing cap, as `/context` showed.
- The receipt shows the rough Claude-tokenizer figure under Claude Code's subtotal.

## What we do not count

See the "Not counted" list in the README. Each adapter in `src/adapters/` also lists, in its
header comment, what was verified against the agent's docs and what is left out.
