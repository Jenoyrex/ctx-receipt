// --mcp: start stdio MCP servers, list their tools, and count two numbers per server.
//
//   up front: what the agent puts in context by default
//   full:     every tool schema (name, description, input schema) plus server instructions
//
// Only "up front" counts toward the always-loaded total and the grade. Tool text never leaves
// this module; scan records get numbers only.
//
// Deferral by agent:
//   Claude Code (docs, checked 2026-11-12): tool search is on by default. Up front = server
//     instructions (cut at 4,096 characters) + each tool's name. Tools load in full when
//     ENABLE_TOOL_SEARCH is "false" or "auto"/"auto:N" (we take the conservative reading of
//     auto: all up front), when the server entry sets "alwaysLoad": true, or when a tool sets
//     _meta["anthropic/alwaysLoad"].
//   Codex (source, openai/codex at 7924f95, 2026-11-14): MCP tools are deferred when the model
//     supports tool search, which every model in its bundled catalog does
//     (codex-rs/core/src/tools/spec_plan.rs, codex-rs/models-manager/models.json). Up front, the
//     tool_search tool lists each server by name and description; we count the server name plus
//     its instructions (the exact description source is not settled, so this is the reading that
//     counts more). `omit_tools_from` containing "deferred" loads that server's tools in full.
//   Cursor (Cursor engineering blog "Dynamic context discovery", 2026-01-06): tool descriptions
//     are synced to files, and "the agent now only receives a small bit of static context,
//     including names of the tools". Up front = each tool's name; the exact format is not
//     published.
//   Gemini CLI: every tool is registered as a function declaration; no deferral documented.
import { displayPath } from "../fs.js";
import { estimateTokens } from "../tokens.js";
import type { Item, ScanContext } from "../types.js";
import { type Listed, type ListedTool, listTools, TIMEOUT_MS } from "./launch.js";

const CLAUDE_UPFRONT_CHARS = 4096;

export interface Counts {
  upFront: number;
  full: number;
}

/** The stdio servers --mcp would start: all of them, or the ones named `only`. */
export function launchable(items: Item[], only?: string): Item[] {
  return items.filter(
    (i) => i.kind === "mcp-server" && i.detail === "stdio" && (!only || i.name === only),
  );
}

/** One line per server: name, transport, and config file. Never the command. */
export function describeLaunch(targets: Item[], ctx: ScanContext): string {
  const lines = targets.map(
    (i) => `  ${i.agent}  ${i.name}  ${i.detail}  ${displayPath(i.path, ctx)}`,
  );
  return `Starting ${targets.length} MCP server(s) from your config to measure their tools:\n${lines.join("\n")}\n`;
}

/** Starts each target in parallel and writes the counts into its record. */
export async function measureServers(
  targets: Item[],
  ctx: ScanContext,
  timeoutMs = TIMEOUT_MS,
): Promise<void> {
  await Promise.all(
    targets.map(async (item) => {
      const result = await listTools(item, ctx, timeoutMs);
      if (!result.ok) {
        item.detail = `${item.detail}, ${result.reason}`;
        return;
      }
      const { upFront, full } = count(item.agent, item.name, result.listed);
      item.loading = "always";
      item.tokens = upFront;
      item.fullTokens = full;
    }),
  );
}

export function count(
  agent: string,
  server: string,
  listed: Listed,
  env: NodeJS.ProcessEnv = process.env,
): Counts {
  const schema = (t: ListedTool, maxDescription = Number.POSITIVE_INFINITY) =>
    JSON.stringify({
      name: t.name,
      description: t.description.slice(0, maxDescription),
      input_schema: t.inputSchema,
    });
  const full = estimateTokens(
    [listed.instructions, ...listed.tools.map((t) => schema(t))].filter(Boolean).join("\n"),
  );
  if (agent === "codex") {
    if (listed.serverAlwaysLoad) return { upFront: full, full };
    const line = `- ${server}${listed.instructions ? `: ${listed.instructions}` : ""}`;
    return { upFront: estimateTokens(line), full };
  }
  if (agent === "cursor") {
    return { upFront: estimateTokens(listed.tools.map((t) => `- ${t.name}`).join("\n")), full };
  }
  if (agent !== "claude-code") return { upFront: full, full };

  const search = (env.ENABLE_TOOL_SEARCH ?? "").toLowerCase();
  const deferring = (search === "" || search === "true") && !listed.serverAlwaysLoad;
  const parts = [listed.instructions.slice(0, CLAUDE_UPFRONT_CHARS)];
  for (const t of listed.tools) {
    parts.push(
      deferring && !t.alwaysLoad ? `mcp__${server}__${t.name}` : schema(t, CLAUDE_UPFRONT_CHARS),
    );
  }
  return { upFront: estimateTokens(parts.filter(Boolean).join("\n")), full };
}
