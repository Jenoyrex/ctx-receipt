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

### MCP servers

Without `--mcp`, MCP servers are listed as unmeasured: counting them means starting them.

With `--mcp`, ctx-receipt starts each stdio server from your config, asks it for its tool list,
and stops it. Each server gets two numbers:

- **up front**: what the agent loads by default. This is what counts toward the total.
- **all schemas, if loaded**: every tool's name, description, and input schema, plus the
  server's instructions.

| Agent       | Up front by default                                                                                                                                                                                                                                                                                                                        | Source                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Claude Code | Server instructions (cut at 4,096 characters) and each tool's name. Schemas load on demand through tool search. Full schemas load up front when `ENABLE_TOOL_SEARCH` is `false` or `auto` (we take the conservative reading of `auto`), when the server sets `"alwaysLoad": true`, or for a tool that sets `_meta["anthropic/alwaysLoad"]` | Claude Code MCP docs   |
| Codex       | All schemas (**unverified**: the docs mention a deferred tool surface but not the default)                                                                                                                                                                                                                                                 | Codex config reference |
| Cursor      | All schemas (**unverified**: the docs do not describe deferral)                                                                                                                                                                                                                                                                            | Cursor MCP docs        |
| Gemini CLI  | All schemas: each tool is registered as a function declaration                                                                                                                                                                                                                                                                             | Gemini CLI MCP docs    |

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

## What we do not count

See the "Not counted" list in the README. Each adapter in `src/adapters/` also lists, in its
header comment, what was verified against the agent's docs and what is left out.
