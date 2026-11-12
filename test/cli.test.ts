import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// Runs the built CLI, so `npm run build` must come first.
test("--version prints the package.json version", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const out = execFileSync(process.execPath, ["dist/cli.js", "--version"], { encoding: "utf8" });
  expect(out.trim()).toBe(pkg.version);
});
