import { displayPath } from "../fs.js";
import { GRADE_CUTOFFS, summarize } from "../grade.js";
import { CONTEXT_WINDOW, TOKENIZER } from "../tokens.js";
import type { Item, ScanContext } from "../types.js";

/** Machine-readable report. File paths are project-relative or start with ~/. */
export function renderJson(items: Item[], ctx: ScanContext, version: string): string {
  const summary = summarize(items);
  const report = {
    tool: "ctx-receipt",
    version,
    estimate: true,
    note: "All token counts are estimates; each agent's own tokenizer differs.",
    tokenizer: TOKENIZER,
    contextWindow: CONTEXT_WINDOW,
    grade: summary.grade,
    gradeCutoffs: Object.fromEntries(GRADE_CUTOFFS),
    heaviestAgent: summary.worst?.id ?? null,
    totalAlwaysLoaded: summary.totalAlwaysLoaded,
    agents: summary.agents,
    items: items.map((i) => ({
      agent: i.agent,
      kind: i.kind,
      name: i.name,
      file: displayPath(i.path, ctx),
      scope: i.scope,
      loading: i.loading,
      tokens: i.tokens,
      ...(i.fullTokens !== undefined ? { fullTokens: i.fullTokens } : {}),
      ...(i.detail ? { detail: i.detail } : {}),
    })),
  };
  return `${JSON.stringify(report, null, 2)}\n`;
}
