// research/FINDINGS.md must be exactly what research/summarize.mjs produces from the committed
// scan data, so every number in it traces back to that file.
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
// @ts-expect-error: plain JavaScript module without type declarations
import { quantile, render, summarize } from "../research/summarize.mjs";

const scans = readdirSync("research")
  .filter((f) => /^scan-\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort();
const latest = scans.at(-1);

test("a committed scan exists", () => {
  expect(latest).toBeDefined();
});

test("FINDINGS.md is generated from the latest scan, unedited", () => {
  const scan = JSON.parse(readFileSync(`research/${latest}`, "utf8"));
  expect(readFileSync("research/FINDINGS.md", "utf8")).toBe(render(scan));
});

test("the headline is recomputed from the raw per-repository numbers", () => {
  const scan = JSON.parse(readFileSync(`research/${latest}`, "utf8"));
  const ok = scan.results.filter((r: { status: string }) => r.status === "ok");
  const values = ok
    .map((r: { agents: { alwaysLoaded: number }[] }) =>
      Math.max(0, ...r.agents.map((a) => a.alwaysLoaded)),
    )
    .sort((a: number, b: number) => a - b);
  const s = summarize(scan);
  expect(s.heaviest.n).toBe(ok.length);
  expect(s.heaviest.median).toBe(quantile(values, 0.5));
  expect(s.heaviest.max).toBe(values.at(-1));
  expect(s.heaviest.n).toBeGreaterThanOrEqual(40);
});

test("quantile interpolates between ranks", () => {
  expect(quantile([1, 2, 3, 4], 0.5)).toBe(3); // 2.5 rounds to 3
  expect(quantile([10, 20, 30], 0.5)).toBe(20);
  expect(quantile([0, 100], 0.25)).toBe(25);
});
