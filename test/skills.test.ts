import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { claudeCode } from "../src/adapters/claude-code.js";
import { codex } from "../src/adapters/codex.js";
import { capSkillListing } from "../src/skills.js";
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

describe("skill listing cap", () => {
  const skill = (name: string, tokens: number): Item => ({
    agent: "x",
    kind: "skill",
    name,
    path: `/s/${name}`,
    scope: "user",
    loading: "always",
    tokens,
  });

  test("under the budget nothing changes", () => {
    const items = [skill("a", 100), skill("b", 100)];
    capSkillListing(items, 500);
    expect(items.map((i) => i.tokens)).toEqual([100, 100]);
    expect(items.some((i) => i.detail)).toBe(false);
  });

  test("over the budget the listing shrinks to the budget, bodies untouched", () => {
    const body: Item = { ...skill("a", 9000), loading: "on-demand" };
    const items = [skill("a", 3000), skill("b", 1000), body];
    capSkillListing(items, 2000);
    const listed = items.filter((i) => i.loading === "always");
    const sum = listed.reduce((n, i) => n + (i.tokens ?? 0), 0);
    expect(Math.abs(sum - 2000)).toBeLessThanOrEqual(1);
    expect(listed.every((i) => i.detail === "listing cap")).toBe(true);
    expect(body.tokens).toBe(9000);
  });

  test("names are always kept: the listing never drops below the names", () => {
    const items = [skill("alpha", 50), skill("beta", 50)];
    capSkillListing(items, 1);
    for (const i of items) expect(i.tokens).toBe(estimateTokens(`- ${i.name}`));
  });

  test("Claude Code reads skillListingBudgetFraction from ~/.claude/settings.json", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-cap-"));
    try {
      const home = join(tmp, "home");
      for (let n = 0; n < 40; n++) {
        const dir = join(home, ".claude", "skills", `s${n}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "SKILL.md"), `---\ndescription: ${"word ".repeat(100)}\n---\nx\n`);
      }
      const ctx = { project: join(tmp, "p"), home, includeUser: true };
      mkdirSync(ctx.project);
      const listing = () =>
        claudeCode
          .scan(ctx)
          .filter((i) => i.kind === "skill" && i.loading === "always")
          .reduce((n, i) => n + (i.tokens ?? 0), 0);
      expect(Math.abs(listing() - 2000)).toBeLessThanOrEqual(2); // 1% of 200k
      writeFileSync(join(home, ".claude", "settings.json"), '{"skillListingBudgetFraction":0.015}');
      expect(Math.abs(listing() - 3000)).toBeLessThanOrEqual(2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
