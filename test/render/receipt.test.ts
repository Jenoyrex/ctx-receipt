import { expect, test } from "vitest";
import { renderReceipt } from "../../src/render/receipt.js";
import type { Item } from "../../src/types.js";

const item = (name: string, tokens: number, loading: Item["loading"] = "always"): Item => ({
  agent: "claude-code",
  kind: "rules",
  name,
  path: `/x/${name}`,
  scope: "project",
  loading,
  tokens,
});

test("receipt shows line items, subtotal, on-demand, total, and the estimate footer", () => {
  const out = renderReceipt(
    [item("CLAUDE.md", 1200), item("rules/a.md", 300), item("rules/api.md", 50, "on-demand")],
    { color: false },
  );
  expect(out).toContain("CLAUDE CODE");
  expect(out).toMatch(/CLAUDE\.md +1,200\n/);
  expect(out).toMatch(/SUBTOTAL +1,500\n/);
  expect(out).toContain("0.8% of a 200k window");
  expect(out).toMatch(/ON DEMAND[\s\S]*rules\/api\.md +50\n/);
  expect(out).toMatch(/TOTAL ALWAYS LOADED +1,500\n/);
  expect(out).toContain("ESTIMATES");
  for (const line of out.trimEnd().split("\n")) expect(line.length).toBeLessThanOrEqual(52);
});

test("long names are cut so lines stay within the receipt width", () => {
  const out = renderReceipt([item(`${"a/".repeat(40)}CLAUDE.md`, 5)], { color: false });
  expect(out).toMatch(/….*CLAUDE\.md +5\n/);
  for (const line of out.trimEnd().split("\n")) expect(line.length).toBeLessThanOrEqual(52);
});
