// Claude Code custom agents, auto memory, and --window.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { claudeCode, memoryStart, parseAgent } from "../../src/adapters/claude-code.js";
import { renderReceipt } from "../../src/render/receipt.js";
import { estimateTokens } from "../../src/tokens.js";
import type { Item } from "../../src/types.js";

const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-agents-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(tmp, path)), { recursive: true });
  writeFileSync(join(tmp, path), text);
};
const agentFile = (name: string, description: string, extra = "") =>
  `---\nname: ${name}\ndescription: ${description}\n${extra}---\nYou are ${name}. Long system prompt.\n`;

// A repository with nested agents, a user agent, files Claude Code skips, and auto memory.
write("repo/.git/HEAD", "x");
write(
  "repo/.claude/agents/reviewer.md",
  agentFile("reviewer", "Root reviewer.", "tools: Read, Grep\n"),
);
write(
  "repo/.claude/agents/review/deep.md",
  agentFile("deep", "Deep review.", "tools:\n  - Read\n  - Bash\n"),
);
write("repo/pkg/.claude/agents/reviewer.md", agentFile("reviewer", "Closest reviewer wins."));
write("repo/.claude/agents/README.md", "# Notes about our agents (no frontmatter, skipped)\n");
write("repo/.claude/agents/no-desc.md", "---\nname: no-desc\n---\nSkipped.\n");
write("repo/.claude/agents/bad-name.md", agentFile("plugin:thing", "Colons are reserved."));
write("home/.claude/agents/helper.md", agentFile("helper", "A user agent."));
write("home/.claude/agents/reviewer.md", agentFile("reviewer", "User copy, shadowed by project."));
const project = join(tmp, "repo", "pkg");
const home = join(tmp, "home");
const memoryKey = join(tmp, "repo").replace(/[^a-zA-Z0-9]/g, "-");
write(
  `home/.claude/projects/${memoryKey}/memory/MEMORY.md`,
  "- [Role](user_role.md) - prefers small diffs\n",
);
const ctx = { project, home, includeUser: true };

describe("custom agents", () => {
  const agents = claudeCode.scan(ctx).filter((i) => i.kind === "agent");

  test("project agents up to the git root, closest wins by name, then user agents", () => {
    expect(agents.map((i) => `${i.name} ${i.scope}`)).toEqual([
      "reviewer project",
      "deep project",
      "helper user",
    ]);
    expect(agents.every((i) => i.loading === "always")).toBe(true);
  });

  test("only the listing line counts, with the closest definition", () => {
    const reviewer = agents.find((i) => i.name === "reviewer");
    expect(reviewer?.tokens).toBe(estimateTokens("- reviewer: Closest reviewer wins. (Tools: *)"));
    const deep = agents.find((i) => i.name === "deep");
    expect(deep?.tokens).toBe(estimateTokens("- deep: Deep review. (Tools: Read, Bash)"));
  });

  test("files Claude Code skips are skipped", () => {
    expect(parseAgent("# no frontmatter")).toBeNull();
    expect(parseAgent("---\nname: x\n---\n")).toBeNull();
    expect(parseAgent(agentFile("a:b", "colon"))).toBeNull();
    expect(parseAgent(agentFile("-dash", "leading dash"))).toBeNull();
    expect(parseAgent("---\nname: [unclosed\n---\n")).toBeNull();
    expect(parseAgent(agentFile("ok", "fine"))).toEqual({
      name: "ok",
      description: "fine",
      tools: "*",
    });
  });

  test("--no-user skips ~/.claude/agents", () => {
    const own = claudeCode.scan({ ...ctx, includeUser: false }).filter((i) => i.kind === "agent");
    expect(own.map((i) => i.name)).toEqual(["reviewer", "deep"]);
  });
});

describe("auto memory", () => {
  test("MEMORY.md for the repository root is always loaded", () => {
    const memory = claudeCode.scan(ctx).find((i) => i.name === "auto memory (MEMORY.md)");
    expect(memory?.scope).toBe("user");
    expect(memory?.tokens).toBe(estimateTokens("- [Role](user_role.md) - prefers small diffs\n"));
  });

  test("autoMemoryEnabled: false in project settings turns it off", () => {
    write("repo/pkg/.claude/settings.json", '{"autoMemoryEnabled": false}');
    try {
      expect(claudeCode.scan(ctx).some((i) => i.name === "auto memory (MEMORY.md)")).toBe(false);
    } finally {
      rmSync(join(tmp, "repo/pkg/.claude/settings.json"));
    }
  });

  test("only the first 200 lines or 25 KB load", () => {
    const lines = Array.from({ length: 300 }, (_, n) => `line ${n}`).join("\n");
    expect(memoryStart(lines).split("\n")).toHaveLength(200);
    const long = `${"x".repeat(30 * 1024)}\n`;
    expect(Buffer.byteLength(memoryStart(long))).toBe(25 * 1024);
  });
});

describe("--window", () => {
  const item: Item = {
    agent: "claude-code",
    kind: "rules",
    name: "CLAUDE.md",
    path: "/x",
    scope: "project",
    loading: "always",
    tokens: 10_000,
  };

  test("percentages follow the window, and Claude Code gets a rough adjusted figure", () => {
    const def = renderReceipt([item], { color: false });
    expect(def).toContain("5.0% of a 200k window");
    expect(def).toContain("~16,000 in Claude's tokenizer (x1.6, rough)");
    expect(def).toMatch(/SUBTOTAL +10,000\n/); // the raw estimate is what counts
    expect(renderReceipt([item], { color: false, window: 1_000_000 })).toContain(
      "1.0% of a 1M window",
    );
  });

  test("the Claude Code skill listing cap scales with the window", () => {
    for (let n = 0; n < 40; n++) {
      write(
        `capped/home/.claude/skills/s${n}/SKILL.md`,
        `---\ndescription: ${"word ".repeat(100)}\n---\nx\n`,
      );
    }
    mkdirSync(join(tmp, "capped", "p"), { recursive: true });
    const listing = (window?: number) =>
      claudeCode
        .scan({
          project: join(tmp, "capped", "p"),
          home: join(tmp, "capped", "home"),
          includeUser: true,
          window,
        })
        .filter((i) => i.kind === "skill" && i.loading === "always")
        .reduce((n, i) => n + (i.tokens ?? 0), 0);
    expect(Math.abs(listing() - 2_000)).toBeLessThanOrEqual(2); // 1% of 200k
    expect(listing(1_000_000)).toBeGreaterThan(2_000); // 1% of 1M is 10k: nothing cut here
  });

  test("CLI: --window sets the window, bad values exit 2, JSON reports both", () => {
    const run = (...args: string[]) =>
      spawnSync(process.execPath, ["dist/cli.js", project, "--home", home, ...args], {
        encoding: "utf8",
      });
    expect(run("--window", "1000000").stdout).toContain("of a 1M window");
    expect(run("--window", "0").status).toBe(2);
    const json = JSON.parse(run("--json", "--window", "1000000").stdout);
    expect(json.contextWindow).toBe(1_000_000);
    expect(json.claudeTokenizerFactor).toBe(1.6);
    const claude = json.agents.find((a: { id: string }) => a.id === "claude-code");
    expect(claude.claudeTokenizerEstimate).toBe(Math.round(claude.alwaysLoaded * 1.6));
    expect(claude.subagents.count).toBe(3);
  });
});
