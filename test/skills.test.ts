import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { claudeCode } from "../src/adapters/claude-code.js";
import { codex } from "../src/adapters/codex.js";
import { estimateTokens } from "../src/tokens.js";
import type { Item } from "../src/types.js";

const fixtures = resolve("test/fixtures");

/** "name loading" pairs, sorted, for skills only. */
const skills = (items: Item[]) =>
  items
    .filter((i) => i.kind === "skill")
    .map((i) => `${i.name} ${i.loading}`)
    .sort();

describe("claude-code skills", () => {
  const root = join(fixtures, "claude-code");
  const items = claudeCode.scan({
    project: join(root, "project"),
    home: join(root, "home"),
    includeUser: true,
  });

  test("listing is always loaded, body on demand, hidden skills have no listing", () => {
    expect(skills(items)).toEqual(
      [
        "code-review always",
        "code-review on-demand",
        "deploy on-demand", // disable-model-invocation: description not in context
        "pdf always", // synced from claude.ai
        "pdf on-demand",
        "git:commit always", // .claude/commands/git/commit.md
        "git:commit on-demand",
        "nofront always",
        "nofront on-demand",
        "badyaml always",
        "badyaml on-demand",
      ].sort(),
    );
  });

  test("listing counts name + description + when_to_use", () => {
    const review = items.find((i) => i.name === "code-review" && i.loading === "always");
    const expected =
      '- code-review: Review a diff for correctness bugs. When the user says "review this".';
    expect(review?.tokens).toBe(estimateTokens(expected));
    expect(review?.scope).toBe("user");
  });

  test("missing description falls back to the first non-empty body line", () => {
    const nofront = items.find((i) => i.name === "nofront" && i.loading === "always");
    expect(nofront?.tokens).toBe(estimateTokens("- nofront: Translate the selected text."));
  });
});

describe("skills from the project up to the git root", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(tmp, path)), { recursive: true });
    writeFileSync(join(tmp, path), text);
  };
  write("repo/.git/HEAD", "ref: refs/heads/main\n");
  write("repo/.claude/skills/root-skill/SKILL.md", "---\ndescription: At repo root.\n---\nx\n");
  write("repo/.agents/skills/root-skill/SKILL.md", "---\ndescription: At repo root.\n---\nx\n");
  write("repo/pkg/.claude/skills/pkg-skill/SKILL.md", "---\ndescription: In pkg.\n---\nx\n");
  write("repo/pkg/.agents/skills/pkg-skill/SKILL.md", "---\ndescription: In pkg.\n---\nx\n");
  write(".claude/skills/above-repo/SKILL.md", "---\ndescription: Above the repo.\n---\nx\n");
  write(".agents/skills/above-repo/SKILL.md", "---\ndescription: Above the repo.\n---\nx\n");
  const long = "y".repeat(5000);
  write("repo/pkg/.claude/skills/long/SKILL.md", `---\ndescription: ${long}\n---\nx\n`);

  const ctx = { project: join(tmp, "repo", "pkg"), home: join(tmp, "nohome"), includeUser: true };

  test("claude-code reads .claude/skills up to the repo root, not above", () => {
    const names = skills(claudeCode.scan(ctx)).filter((s) => s.endsWith("always"));
    expect(names).toEqual(["long always", "pkg-skill always", "root-skill always"]);
  });

  test("codex reads .agents/skills up to the repo root, not above", () => {
    const names = skills(codex.scan(ctx)).filter((s) => s.endsWith("always"));
    expect(names).toEqual(["pkg-skill always", "root-skill always"]);
  });

  test("claude-code caps the listing at 1,536 characters", () => {
    const item = claudeCode.scan(ctx).find((i) => i.name === "long" && i.loading === "always");
    expect(item?.tokens).toBe(estimateTokens(`- long: ${long.slice(0, 1536)}`));
  });
});

describe("codex skills", () => {
  const root = join(fixtures, "codex");
  test("finds user and project skills", () => {
    const items = codex.scan({
      project: join(root, "project"),
      home: join(root, "home"),
      includeUser: true,
    });
    expect(skills(items)).toEqual([
      "build always",
      "build on-demand",
      "lint always",
      "lint on-demand",
    ]);
    expect(items.find((i) => i.name === "lint")?.scope).toBe("user");
  });

  test("--no-user skips ~/.agents/skills", () => {
    const items = codex.scan({
      project: join(root, "project"),
      home: join(root, "home"),
      includeUser: false,
    });
    expect(skills(items)).toEqual(["build always", "build on-demand"]);
  });
});
