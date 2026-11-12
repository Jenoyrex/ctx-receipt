import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Runs the built CLI, so `npm run build` must come first.
const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });

test("--version prints the package.json version", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const r = cli("--version");
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe(pkg.version);
});

test("scans a project and prints a receipt", () => {
  const r = cli("test/fixtures/claude-code/project", "--home", "test/fixtures/claude-code/home");
  expect(r.status).toBe(0);
  expect(r.stdout).toContain("CLAUDE CODE");
  expect(r.stdout).toContain("~/.claude/CLAUDE.md");
  expect(r.stdout).toContain("TOTAL ALWAYS LOADED");
});

test("usage errors exit 2", () => {
  expect(cli("--bogus").status).toBe(2);
  expect(cli("does/not/exist").status).toBe(2);
  expect(cli("--agent", "nope").status).toBe(2);
});
