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

test("README JSON excerpt matches a real --json run of examples/demo", () => {
  const readme = readFileSync("README.md", "utf8");
  const excerpt = JSON.parse(readme.match(/```json\n([\s\S]*?)```/)?.[1] ?? "null");
  const real = JSON.parse(
    spawnSync(
      process.execPath,
      ["dist/cli.js", "examples/demo/project", "--home", "examples/demo/home", "--json"],
      { encoding: "utf8" },
    ).stdout,
  );
  // Every value shown in the README must be in the real report (the excerpt leaves things out).
  const { agents, items, ...top } = excerpt;
  expect(real).toMatchObject(top);
  for (const a of agents) expect(real.agents).toContainEqual(expect.objectContaining(a));
  for (const i of items) expect(real.items).toContainEqual(expect.objectContaining(i));
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
