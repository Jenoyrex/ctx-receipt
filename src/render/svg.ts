// Shareable receipt card. It draws its own opaque "paper" background and border, so it reads
// the same on light and dark pages. It shows per-agent totals and counts only: no file names,
// so no paths from the user's home directory can appear.
import { type AgentSummary, summarize } from "../grade.js";
import type { Item } from "../types.js";

const W = 440;
const PAD = 28;
const LINE = 22;
const INK = "#1f2328";
const MUTED = "#57606a";
const PAPER = "#fffdf6";
const EDGE = "#d8d2c4";
const GRADE_COLOR: Record<string, string> = {
  A: "#1a7f37",
  B: "#1a7f37",
  C: "#9a6700",
  D: "#cf222e",
  F: "#cf222e",
};

export function renderSvg(items: Item[]): string {
  const summary = summarize(items);
  const body: string[] = [];
  let y = 52;
  const text = (
    x: number,
    s: string,
    opts: { anchor?: string; weight?: number; fill?: string; size?: number } = {},
  ) =>
    body.push(
      `<text x="${x}" y="${y}" text-anchor="${opts.anchor ?? "start"}" font-size="${opts.size ?? 14}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? INK}">${esc(s)}</text>`,
    );
  const row = (left: string, right: string, opts: { weight?: number; fill?: string } = {}) => {
    text(PAD, left, opts);
    text(W - PAD, right, { ...opts, anchor: "end" });
    y += LINE;
  };
  const rule = () => {
    body.push(
      `<line x1="${PAD}" y1="${y - 8}" x2="${W - PAD}" y2="${y - 8}" stroke="${EDGE}" stroke-dasharray="4 4"/>`,
    );
    y += 10;
  };

  text(W / 2, "CTX-RECEIPT", { anchor: "middle", weight: 700, size: 20 });
  y += 22;
  text(W / 2, "context loaded before your first prompt", {
    anchor: "middle",
    fill: MUTED,
    size: 12,
  });
  y += 26;
  rule();

  if (summary.agents.length === 0) row("Nothing found", "0");
  for (const a of summary.agents) {
    row(a.label.toUpperCase(), fmt(a.alwaysLoaded), { weight: 700 });
    for (const [label, value] of lines(a)) row(`  ${label}`, value, { fill: MUTED });
    y += 4;
  }
  rule();
  row("TOTAL ALWAYS LOADED", fmt(summary.totalAlwaysLoaded), { weight: 700 });
  y += 8;

  const grade = summary.grade;
  const badgeY = y;
  body.push(
    `<rect x="${PAD}" y="${badgeY - 4}" width="${W - PAD * 2}" height="52" rx="8" fill="none" stroke="${EDGE}"/>`,
    `<text x="${PAD + 16}" y="${badgeY + 21}" font-size="14" fill="${INK}">GRADE</text>`,
    `<text x="${PAD + 16}" y="${badgeY + 37}" font-size="10" fill="${MUTED}">${esc(`heaviest agent: ${summary.worst?.label ?? "none"}`)}</text>`,
    `<text x="${W - PAD - 16}" y="${badgeY + 36}" text-anchor="end" font-size="34" font-weight="700" fill="${GRADE_COLOR[grade] ?? INK}">${grade}</text>`,
  );
  y = badgeY + 72;
  text(W / 2, "All token counts are estimates (o200k_base tokenizer).", {
    anchor: "middle",
    fill: MUTED,
    size: 11,
  });
  y += 16;
  text(W / 2, "Grade cut-offs are our own: A <5k, B <15k, C <30k, D <60k.", {
    anchor: "middle",
    fill: MUTED,
    size: 11,
  });
  const h = y + 24;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(`ctx-receipt: grade ${grade}, ${fmt(summary.totalAlwaysLoaded)} tokens always loaded (estimate)`)}">`,
    `<rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="12" fill="${PAPER}" stroke="${EDGE}" stroke-width="2"/>`,
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace">`,
    ...body,
    "</g>",
    "</svg>",
    "",
  ].join("\n");
}

function lines(a: AgentSummary): [string, string][] {
  const out: [string, string][] = [];
  if (a.rules.count > 0) out.push([`rules (${a.rules.count} files)`, fmt(a.rules.tokens)]);
  if (a.skills.count > 0) out.push([`skills (${a.skills.count})`, fmt(a.skills.tokens)]);
  if (a.mcp.count > 0) {
    const measured = a.mcp.count - a.mcp.unmeasured;
    const value = measured > 0 ? fmt(a.mcp.tokens) : "?";
    const note = a.mcp.unmeasured > 0 ? `, ${a.mcp.unmeasured} not measured` : "";
    out.push([`mcp (${a.mcp.count} servers${note})`, value]);
  }
  return out;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
