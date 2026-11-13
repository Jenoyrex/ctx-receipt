import { displayPath } from "../fs.js";
import { summarize } from "../grade.js";
import { TOKENIZER, windowOf } from "../tokens.js";
import type { Item, ScanContext } from "../types.js";
import { windowLabel } from "./receipt.js";

export function renderMarkdown(items: Item[], ctx: ScanContext): string {
  const summary = summarize(items);
  const window = windowOf(ctx);
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "?" : fmt(v));
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const out: string[] = [
    "# Context receipt",
    "",
    `**Grade ${summary.grade}** (heaviest agent: ${summary.worst?.label ?? "none"}). ` +
      `Always loaded across all agents: **${fmt(summary.totalAlwaysLoaded)}** tokens (estimate).`,
    "",
    `| Agent | Always loaded | % of ${windowLabel(window)} | On demand | Unmeasured MCP servers |`,
    "| --- | ---: | ---: | ---: | ---: |",
    ...summary.agents.map(
      (a) =>
        `| ${a.label} | ${fmt(a.alwaysLoaded)} | ${((a.alwaysLoaded / window) * 100).toFixed(1)}% | ${fmt(a.onDemand)} | ${a.mcp.unmeasured} |`,
    ),
  ];
  for (const a of summary.agents) {
    out.push(
      "",
      `## ${a.label}`,
      "",
      "| Item | Kind | Loading | Tokens | Note |",
      "| --- | --- | --- | ---: | --- |",
    );
    for (const i of items.filter((x) => x.agent === a.id)) {
      const name = i.kind === "rules" ? i.name : `${i.name} (${displayPath(i.path, ctx)})`;
      const note = [i.detail, i.fullTokens !== undefined ? `all schemas: ${fmt(i.fullTokens)}` : ""]
        .filter(Boolean)
        .join("; ");
      out.push(`| ${cell(name)} | ${i.kind} | ${i.loading} | ${n(i.tokens)} | ${cell(note)} |`);
    }
  }
  out.push(
    "",
    `_All token counts are estimates (tokenizer: ${TOKENIZER}); each agent's own tokenizer differs. ` +
      "Grade cut-offs are our own opinion: A under 5k, B under 15k, C under 30k, D under 60k, F above._",
    "",
  );
  return out.join("\n");
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
