import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { gradeFor, summarize } from "../../src/grade.js";
import { renderReceipt } from "../../src/render/receipt.js";
import type { Item } from "../../src/types.js";

const fixtureHome = resolve("test/fixtures/claude-code/home");
const fixture = ["test/fixtures/claude-code/project", "--home", "test/fixtures/claude-code/home"];
const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });
const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-out-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const item = (agent: string, tokens: number, loading: Item["loading"] = "always"): Item => ({
  agent,
  kind: "rules",
  name: `${agent}.md`,
  path: `/x/${agent}.md`,
  scope: "project",
  loading,
  tokens,
});

describe("grade", () => {
  test("cut-offs: A <5k, B <15k, C <30k, D <60k, F above", () => {
    expect([0, 4_999, 5_000, 14_999, 15_000, 29_999, 30_000, 59_999, 60_000].map(gradeFor)).toEqual(
      ["A", "A", "B", "B", "C", "C", "D", "D", "F"],
    );
  });

  test("graded on the heaviest agent; on-demand does not count", () => {
    const s = summarize([
      item("claude-code", 4_000),
      item("codex", 16_000),
      item("codex", 90_000, "on-demand"),
    ]);
    expect(s.worst?.id).toBe("codex");
    expect(s.grade).toBe("C");
    expect(s.totalAlwaysLoaded).toBe(20_000);
  });

  test("the receipt shows the grade and the heaviest agent", () => {
    const out = renderReceipt([item("codex", 16_000)], { color: false });
    expect(out).toMatch(/GRADE +C\n/);
    expect(out).toContain("from the heaviest agent: Codex CLI");
  });
});

describe("--json", () => {
  const r = cli(...fixture, "--json");
  const report = JSON.parse(r.stdout);

  test("is valid JSON on stdout, labelled as an estimate", () => {
    expect(r.status).toBe(0);
    expect(report.tool).toBe("ctx-receipt");
    expect(report.estimate).toBe(true);
    expect(report.tokenizer).toContain("o200k_base");
    expect(report.grade).toBe("A");
    expect(report.totalAlwaysLoaded).toBeGreaterThan(0);
  });

  test("has agents and items with relative file names, no absolute paths", () => {
    expect(report.agents.map((a: { id: string }) => a.id)).toEqual(["claude-code"]);
    const files = report.items.map((i: { file: string }) => i.file);
    expect(files).toContain("CLAUDE.md");
    expect(files).toContain("~/.claude/CLAUDE.md");
    expect(r.stdout).not.toContain(fixtureHome.replaceAll("\\", "\\\\"));
    expect(r.stdout).not.toContain(resolve("test").replaceAll("\\", "\\\\"));
  });
});

describe("--md", () => {
  test("writes a report with the grade, a table per agent, and the estimate note", () => {
    const file = join(tmp, "report.md");
    const r = cli(...fixture, "--md", file);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("CTX-RECEIPT"); // the receipt still prints
    const md = readFileSync(file, "utf8");
    expect(md).toMatch(/^# Context receipt/);
    expect(md).toContain("**Grade A**");
    expect(md).toContain("## Claude Code");
    expect(md).toContain("| CLAUDE.md | rules | always |");
    expect(md).toContain("estimates");
  });
});

describe("--svg", () => {
  const file = join(tmp, "card.svg");
  const r = cli(...fixture, "--svg", file);
  const svg = readFileSync(file, "utf8");

  test("writes a standalone SVG with the total and grade", () => {
    expect(r.status).toBe(0);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(svg).toContain("TOTAL ALWAYS LOADED");
    expect(svg).toContain("estimates");
    expect(svg).toMatch(/aria-label="ctx-receipt: grade A, \d+ tokens always loaded \(estimate\)"/);
  });

  test("contains no file paths at all, so none from home", () => {
    expect(svg).not.toContain("~/");
    expect(svg).not.toContain(".md");
    expect(svg).not.toContain(fixtureHome);
    expect(svg).not.toContain(resolve("."));
  });

  test("draws its own opaque background so it reads on light and dark pages", () => {
    expect(svg).toMatch(/<rect[^>]+fill="#fffdf6"/);
  });
});

describe("--budget", () => {
  test("exit 0 at or under the budget, 1 over it, 2 for a bad value", () => {
    const total = JSON.parse(cli(...fixture, "--json").stdout).totalAlwaysLoaded;
    expect(cli(...fixture, "--budget", String(total)).status).toBe(0);
    const over = cli(...fixture, "--budget", String(total - 1));
    expect(over.status).toBe(1);
    expect(over.stderr).toContain("over budget");
    expect(over.stdout).toContain("CTX-RECEIPT"); // the report still prints
    expect(cli(...fixture, "--budget", "lots").status).toBe(2);
  });
});
