import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { claudeCode, findImports, stripHtmlComments } from "../../src/adapters/claude-code.js";
import type { ScanContext } from "../../src/types.js";

const root = resolve("test/fixtures/claude-code");
const home = join(root, "home");

// Claude Code also reads CLAUDE.md files above the project. Keep only fixture items so a stray
// CLAUDE.md in a parent folder of this checkout does not break the test.
function run(ctx: ScanContext) {
  return claudeCode.scan(ctx).filter((i) => i.path.startsWith(root));
}

describe("claude-code adapter", () => {
  test("finds user and project files, imports, and rules", () => {
    const items = run({ project: join(root, "project"), home, includeUser: true });
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));

    expect(Object.keys(byName).sort()).toEqual(
      [
        "~/.claude/CLAUDE.md",
        "~/.claude/rules/prefs.md",
        "CLAUDE.md",
        "CLAUDE.local.md",
        "@docs/guide.md",
        "@docs/chain/a.md",
        "@docs/chain/b.md",
        "@docs/chain/c.md",
        ".claude/rules/style.md",
        ".claude/rules/backend/api.md",
      ].sort(),
    );
    expect(byName["~/.claude/CLAUDE.md"].scope).toBe("user");
    expect(byName["CLAUDE.md"].scope).toBe("project");
    expect(byName[".claude/rules/backend/api.md"].loading).toBe("on-demand");
    expect(byName[".claude/rules/style.md"].loading).toBe("always");
    for (const i of items) {
      expect(i.agent).toBe("claude-code");
      expect(i.kind).toBe("rules");
      expect(i.tokens).toBeGreaterThan(0);
    }
  });

  test("--no-user skips home config", () => {
    const items = run({ project: join(root, "project"), home, includeUser: false });
    expect(items.some((i) => i.scope === "user")).toBe(false);
    expect(items.some((i) => i.name === "CLAUDE.md")).toBe(true);
  });

  test("falls back to AGENTS.md when there is no CLAUDE.md", () => {
    const items = run({ project: join(root, "agents-only"), home, includeUser: false });
    expect(items.map((i) => i.name)).toEqual(["AGENTS.md"]);
  });

  test("HTML comments do not count toward tokens", () => {
    expect(stripHtmlComments("a\n<!-- gone -->\nb\n")).toBe("a\nb\n");
    expect(stripHtmlComments("```\n<!-- kept -->\n```\n")).toContain("kept");
  });

  test("imports skip code spans, fences, emails, and missing files", () => {
    const dir = join(root, "project");
    const text =
      "x @docs/guide.md `@docs/ignored.md` a@docs/ignored.md @nope.md\n```\n@docs/ignored.md\n```";
    expect(findImports(text, dir, home)).toEqual([join(dir, "docs/guide.md")]);
  });
});
