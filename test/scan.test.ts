import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, test } from "vitest";
import { scan } from "../src/scan.js";

// A home with only the shared ~/.agents/skills folder: Codex and Gemini both read it, but
// neither is installed (no ~/.codex or ~/.gemini).
const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-scan-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
const home = join(tmp, "home");
const project = join(tmp, "project");
mkdirSync(join(home, ".agents", "skills", "shared"), { recursive: true });
writeFileSync(
  join(home, ".agents", "skills", "shared", "SKILL.md"),
  "---\ndescription: x\n---\ny\n",
);
mkdirSync(project);
writeFileSync(join(project, "AGENTS.md"), "# Project rules\n");
const ctx = { project, home, includeUser: true };

test("agents without a config folder in home skip home files but keep project files", () => {
  const items = scan(ctx);
  expect(items.some((i) => i.scope === "user")).toBe(false);
  expect(items.filter((i) => i.name === "AGENTS.md").map((i) => i.agent)).toEqual([
    "claude-code",
    "codex",
    "cursor",
  ]);
});

test("naming an agent with --agent reads its home files anyway", () => {
  const items = scan(ctx, ["gemini"]);
  expect(items.map((i) => `${i.agent} ${i.name} ${i.scope}`)).toContain("gemini shared user");
});

test("an installed agent reads home files", () => {
  mkdirSync(join(home, ".codex"));
  const items = scan(ctx);
  expect(items.filter((i) => i.scope === "user").map((i) => i.agent)).toEqual(["codex", "codex"]);
});
