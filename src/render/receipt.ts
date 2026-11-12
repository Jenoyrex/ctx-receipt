import { createColors } from "picocolors";
import { adapters } from "../adapters/index.js";
import { TOKENIZER } from "../tokens.js";
import type { Item } from "../types.js";

const WIDTH = 52;
const WINDOW = 200_000;

export function renderReceipt(items: Item[], opts: { color: boolean }): string {
  const c = createColors(opts.color);
  const lines: string[] = [];
  const rule = (ch: string) => lines.push(c.dim(ch.repeat(WIDTH)));
  const center = (s: string) => " ".repeat(Math.floor((WIDTH - s.length) / 2)) + s;

  rule("=");
  lines.push(c.bold(center("CTX-RECEIPT")));
  lines.push(center("loaded before your first prompt"));
  rule("=");

  const always = items.filter((i) => i.loading === "always");
  const agentIds = [...new Set(items.map((i) => i.agent))];
  if (agentIds.length === 0) lines.push("Nothing found.", "");

  for (const id of agentIds) {
    const mine = always.filter((i) => i.agent === id);
    const subtotal = sum(mine);
    lines.push(c.bold(labelOf(id).toUpperCase()));
    const unmeasured = items.filter((i) => i.agent === id && i.loading === "unmeasured");
    for (const i of mine) lines.push(row(`  ${label(i)}`, fmt(i.tokens)));
    for (const i of unmeasured) lines.push(row(`  ${label(i)}`, "?"));
    if (mine.length + unmeasured.length === 0) lines.push(c.dim("  (nothing always loaded)"));
    lines.push(row("", "-".repeat(10)));
    lines.push(c.bold(row("  SUBTOTAL", fmt(subtotal))));
    lines.push(c.dim(`  ${((subtotal / WINDOW) * 100).toFixed(1)}% of a 200k window`));
    if (unmeasured.length > 0) lines.push(c.dim("  ? = not measured, not in subtotal"));
    lines.push("");
  }

  const onDemand = items.filter((i) => i.loading === "on-demand");
  if (onDemand.length > 0) {
    rule("-");
    lines.push(c.bold("ON DEMAND") + c.dim(" (only when used; not in total)"));
    for (const id of agentIds) {
      const mine = onDemand.filter((i) => i.agent === id);
      if (mine.length === 0) continue;
      lines.push(`  ${labelOf(id)}`);
      for (const i of mine) lines.push(row(`    ${label(i)}`, fmt(i.tokens)));
    }
  }

  rule("-");
  lines.push(c.bold(row("TOTAL ALWAYS LOADED", fmt(sum(always)))));
  rule("=");
  lines.push(c.dim("All token counts are ESTIMATES."));
  lines.push(c.dim(`Tokenizer: ${TOKENIZER}.`));
  lines.push(c.dim("Each agent's own tokenizer will differ."));
  return `${lines.join("\n")}\n`;
}

function labelOf(id: string): string {
  return adapters.find((a) => a.id === id)?.label ?? id;
}

function sum(items: Item[]): number {
  return items.reduce((n, i) => n + (i.tokens ?? 0), 0);
}

function fmt(n: number | null): string {
  return n === null ? "?" : n.toLocaleString("en-US");
}

/** Left text and right-aligned number on one line; long names are cut from the left. */
function row(left: string, right: string): string {
  const room = WIDTH - right.length - 1;
  const l = left.length > room ? `  …${left.slice(left.length - room + 3)}` : left;
  return l + " ".repeat(WIDTH - l.length - right.length) + right;
}

function label(i: Item): string {
  if (i.kind === "skill") return `skill ${i.name}`;
  if (i.kind === "mcp-server") return `mcp ${i.name}${i.detail ? ` (${i.detail})` : ""}`;
  return i.name;
}
