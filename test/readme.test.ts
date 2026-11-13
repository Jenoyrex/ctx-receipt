// The README's example receipt must be exactly what the CLI prints for examples/demo.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("README example matches a real run of examples/demo", () => {
  const readme = readFileSync("README.md", "utf8");
  const shown = readme.match(/```\n(====[\s\S]*?)```/)?.[1];
  const real = spawnSync(
    process.execPath,
    ["dist/cli.js", "examples/demo/project", "--home", "examples/demo/home"],
    { encoding: "utf8" },
  );
  expect(real.status).toBe(0);
  expect(shown).toBe(real.stdout);
});

test("README options table lists every CLI flag", () => {
  const readme = readFileSync("README.md", "utf8");
  const help = spawnSync(process.execPath, ["dist/cli.js", "--help"], { encoding: "utf8" }).stdout;
  const flags = [...help.matchAll(/^\s+(--[a-z-]+)/gm)]
    .map((m) => m[1])
    .filter((f) => f !== "--help" && f !== "--version");
  expect(flags.length).toBeGreaterThan(5);
  for (const flag of flags) expect(readme).toContain(`\`${flag}`);
});
