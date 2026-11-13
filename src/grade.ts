import { adapters } from "./adapters/index.js";
import type { Item } from "./types.js";

/**
 * Letter grade for the always-loaded tokens of the worst agent (the one that pre-loads most).
 * These cut-offs are our own opinion, not a standard: A under 5k, B under 15k, C under 30k,
 * D under 60k, F above. See docs/how-we-count.md.
 */
export const GRADE_CUTOFFS: [grade: string, below: number][] = [
  ["A", 5_000],
  ["B", 15_000],
  ["C", 30_000],
  ["D", 60_000],
];

export function gradeFor(tokens: number): string {
  return GRADE_CUTOFFS.find(([, below]) => tokens < below)?.[0] ?? "F";
}

export interface AgentSummary {
  id: string;
  label: string;
  verified: boolean;
  alwaysLoaded: number;
  onDemand: number;
  unmeasured: number;
  rules: { count: number; tokens: number };
  skills: { count: number; tokens: number };
  subagents: { count: number; tokens: number };
  mcp: { count: number; tokens: number; unmeasured: number };
}

export interface Summary {
  agents: AgentSummary[];
  /** Sum of always-loaded tokens over all agents (what --budget checks). */
  totalAlwaysLoaded: number;
  worst: AgentSummary | null;
  grade: string;
}

export function summarize(items: Item[]): Summary {
  const ids = [...new Set(items.map((i) => i.agent))];
  const agents = ids.map((id): AgentSummary => {
    const mine = items.filter((i) => i.agent === id);
    const adapter = adapters.find((a) => a.id === id);
    const always = mine.filter((i) => i.loading === "always");
    const sum = (list: Item[]) => list.reduce((n, i) => n + (i.tokens ?? 0), 0);
    const ofKind = (kind: Item["kind"]) => always.filter((i) => i.kind === kind);
    const servers = mine.filter((i) => i.kind === "mcp-server");
    return {
      id,
      label: adapter?.label ?? id,
      verified: adapter?.verified ?? false,
      alwaysLoaded: sum(always),
      onDemand: sum(mine.filter((i) => i.loading === "on-demand")),
      unmeasured: mine.filter((i) => i.loading === "unmeasured").length,
      rules: { count: ofKind("rules").length, tokens: sum(ofKind("rules")) },
      skills: { count: ofKind("skill").length, tokens: sum(ofKind("skill")) },
      subagents: { count: ofKind("agent").length, tokens: sum(ofKind("agent")) },
      mcp: {
        count: servers.length,
        tokens: sum(ofKind("mcp-server")),
        unmeasured: servers.filter((i) => i.loading === "unmeasured").length,
      },
    };
  });
  const worst = agents.reduce<AgentSummary | null>(
    (w, a) => (!w || a.alwaysLoaded > w.alwaysLoaded ? a : w),
    null,
  );
  return {
    agents,
    totalAlwaysLoaded: agents.reduce((n, a) => n + a.alwaysLoaded, 0),
    worst,
    grade: gradeFor(worst?.alwaysLoaded ?? 0),
  };
}
