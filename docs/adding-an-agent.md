# Adding an agent

An agent adapter answers one question: **what does this agent put into the context window
before the user types anything, and what can it pull in later?** Everything else (rendering,
JSON, grades, budgets) works on the records adapters return.

## 1. Read the agent's docs first

Do this before writing code. Every adapter so far turned up something the original plan got
wrong or missed:

| Agent       | What the docs changed                                                                                                                                                       |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code | `.claude/rules/`, an `AGENTS.md` fallback, 4-hop import limit, HTML comments stripped, skills synced from claude.ai, MCP tool search (tool schemas are deferred by default) |
| Codex       | `AGENTS.override.md`, one file per directory, a shared 32 KiB byte budget, fallback file names, `[[skills.config]]` to turn skills off                                      |
| Cursor      | `.mdc` only (plain `.md` in `.cursor/rules` is ignored), four apply modes, `.cursorrules` no longer documented                                                              |
| Gemini CLI  | configurable file names, a `.git` boundary for the parent walk, skills (including the shared `~/.agents/skills`), `url` means SSE and `httpUrl` means HTTP                  |

Write what you verified, and the date, in a comment at the top of the adapter file. List what
you deliberately do not count yet. If you cannot verify something, say so in that comment, set
`detail: "unverified"` on the records it produces, and mark the agent unverified in the README.
When two pages of the official docs disagree, pick one, say which, and say why.

## 2. Write the adapter

Create `src/adapters/<agent>.ts` exporting an `Adapter`, and add it to `src/adapters/index.ts`.

```ts
export const myAgent: Adapter = {
  id: "my-agent", // used by --agent
  label: "My Agent", // shown on the receipt
  verified: true,
  scan(ctx) {
    // ctx: { project, home, includeUser }
    return []; // Item[]
  },
};
```

Each `Item` is one line on the receipt:

| Field     | Meaning                                                                                                                                                     |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`    | `rules`, `skill`, `mcp-server`, or `mcp-tool`                                                                                                               |
| `loading` | `always` (in context from the first prompt), `on-demand` (only when used), or `unmeasured` (we know it loads but cannot count it without running something) |
| `scope`   | `user` for anything under the home directory, `project` otherwise                                                                                           |
| `name`    | what the receipt prints; use `displayPath(path, ctx)` for files                                                                                             |
| `tokens`  | `estimateTokens(text)` of exactly the text the agent loads, or `null`                                                                                       |
| `detail`  | optional short note (`description`, `cut at byte cap`, a transport). Never a config value                                                                   |

Use the shared helpers instead of writing new ones:

- `src/fs.ts`: `isFile`, `subdirs`, `ancestors`, `repoDirs` (project up to the git root),
  `displayPath`, `realPath` (so a symlinked file counts once).
- `src/markdown.ts`: `findImports` (`@path` imports, skipping code), `stripHtmlComments`,
  `listMarkdown`.
- `src/skills.ts`: `findSkills`, `readSkill`, `skillItems` for agents that use `SKILL.md`.
  You supply the listing line, because each agent formats it differently.
- `src/redact.ts`: the **only** way to read a config file that can hold MCP servers.

### Counting rules of thumb

- Count the text the agent actually sends. Strip what it strips (frontmatter, HTML comments),
  cut what it cuts (byte budgets, per-description caps).
- Skills and agent-selected rules: the name and description line is `always`; the body is
  `on-demand`.
- Respect `ctx.includeUser`: with `--no-user`, read nothing under `ctx.home`.
- Walk directories the way the agent does: some stop at the git root, some at a marker file,
  some at home.

## 3. Secrets

MCP configs hold API keys in `env`, `headers`, `args`, URLs, and even `command`.

- Read configs only through `readJsonConfig`, `readJsoncConfig`, or `readTomlConfig`. They turn
  parse errors into `could not parse <path>`; raw JSON and TOML errors quote the file.
- Turn servers into records only through `safeServers` and `serverItem`. They keep the server
  name and transport and nothing else.
- If the agent marks servers off with a flag, filter on that boolean before `safeServers`. If
  the transport depends on which key is present (like Gemini's `httpUrl`), pass only
  `{ type }` to `safeServers`, never the entry.
- Add your agent's config files to `test/fixtures/secrets/` with the fake key
  `sk-FAKE-0000-LEAKCHECK` in every field the format allows, and add the expected server names
  to `test/redact.test.ts`. That test fails if any part of the key reaches any output.

## 4. Fixtures and tests

- `test/fixtures/<agent>/home` and `test/fixtures/<agent>/project`: small trees with one file
  per behaviour you implemented, including the ones that must be ignored.
- `test/adapters/<agent>.test.ts`: assert the exact list of `name loading scope` lines.
- Cases that need a `.git` directory (git will not commit one inside the repo): build them in a
  temp dir with `mkdtempSync`, as the Codex and Gemini tests do.
- Adapters that read parent directories can pick up files above this checkout. Filter records to
  the fixture path in those tests.

Run `npm run lint && npm run typecheck && npm run build && npm test`.

## 5. Docs

Add the agent to the supported agents table in the README, with what is and is not counted.
