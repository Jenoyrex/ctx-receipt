// Starts one stdio MCP server from the user's config and returns its tool list.
//
// This is the only module that reads `command`, `args`, and `env`. It uses them to spawn the
// process and nothing else: they are never returned, logged, or put in an error message. The
// server's stderr is discarded. Every server is shut down when listing ends or times out
// (stdin closed, then SIGTERM, then SIGKILL; see the MCP SDK's StdioClientTransport.close).
import { basename, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { projectEntry } from "../adapters/claude-code.js";
import { isObject, readJsonConfig, readJsoncConfig, readTomlConfig } from "../redact.js";
import type { Item, ScanContext } from "../types.js";

export const TIMEOUT_MS = 10_000;

export interface ListedTool {
  name: string;
  description: string;
  inputSchema: unknown;
  /** Claude Code: `_meta["anthropic/alwaysLoad"]` asks for this tool to load up front. */
  alwaysLoad: boolean;
}

export interface Listed {
  tools: ListedTool[];
  instructions: string;
  /**
   * The server's tools load up front instead of being deferred: Claude Code `"alwaysLoad": true`,
   * or Codex `omit_tools_from` containing "deferred".
   */
  serverAlwaysLoad: boolean;
}

export type LaunchResult =
  | { ok: true; listed: Listed }
  | { ok: false; reason: "timed out" | "failed to start" | "not in config" };

export async function listTools(
  item: Item,
  ctx: ScanContext,
  timeoutMs = TIMEOUT_MS,
): Promise<LaunchResult> {
  const entry = rawEntry(item, ctx);
  if (!entry || typeof entry.command !== "string") return { ok: false, reason: "not in config" };
  const expand = item.agent === "codex" ? (s: string) => s : expandVars;
  const transport = new StdioClientTransport({
    command: expand(entry.command),
    args: strings(entry.args).map(expand),
    env: envOf(item.agent, entry, expand),
    cwd: typeof entry.cwd === "string" ? resolve(ctx.project, expand(entry.cwd)) : ctx.project,
    stderr: "ignore",
  });
  const client = new Client({ name: "ctx-receipt", version: "0.0.0" });
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<"timeout">((done) => {
    timer = setTimeout(() => done("timeout"), timeoutMs);
  });
  const work = (async () => {
    await client.connect(transport);
    const tools: ListedTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      for (const t of page.tools) {
        tools.push({
          name: t.name,
          description: t.description ?? "",
          inputSchema: t.inputSchema,
          alwaysLoad: t._meta?.["anthropic/alwaysLoad"] === true,
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
    return { tools, instructions: client.getInstructions() ?? "" };
  })();
  work.catch(() => {}); // it may reject after a timeout, once the process is gone
  try {
    const result = await Promise.race([work, timeout]);
    if (result === "timeout") return { ok: false, reason: "timed out" };
    return {
      ok: true,
      listed: {
        tools: result.tools.filter(toolFilter(item.agent, entry)),
        instructions: result.instructions,
        serverAlwaysLoad:
          (item.agent === "claude-code" && entry.alwaysLoad === true) ||
          (item.agent === "codex" && strings(entry.omit_tools_from).includes("deferred")),
      },
    };
  } catch {
    // Spawn errors name the command, so the reason stays generic.
    return { ok: false, reason: "failed to start" };
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
    await transport.close().catch(() => {});
  }
}

/** The config entry behind a scan record, read again from the file the record names. */
function rawEntry(item: Item, ctx: ScanContext): Record<string, unknown> | null {
  const pick = (map: unknown) =>
    isObject(map) && isObject(map[item.name]) ? (map[item.name] as Record<string, unknown>) : null;
  switch (item.agent) {
    case "claude-code": {
      const config = readJsonConfig(item.path);
      if (!isObject(config)) return null;
      if (basename(item.path) === ".claude.json") {
        // Local scope (this project's entry) beats user scope in the same file.
        return (
          pick(projectEntry(config.projects, ctx.project).mcpServers) ?? pick(config.mcpServers)
        );
      }
      return pick(config.mcpServers);
    }
    case "codex": {
      const config = readTomlConfig(item.path);
      return isObject(config) ? pick(config.mcp_servers) : null;
    }
    case "cursor":
    case "gemini": {
      const config = readJsoncConfig(item.path);
      return isObject(config) ? pick(config.mcpServers) : null;
    }
    default:
      return null;
  }
}

function envOf(
  agent: string,
  entry: Record<string, unknown>,
  expand: (s: string) => string,
): Record<string, string> {
  const env: Record<string, string> = {};
  if (isObject(entry.env)) {
    for (const [k, v] of Object.entries(entry.env)) if (typeof v === "string") env[k] = expand(v);
  }
  // Codex forwards the variables named in `env_vars` from its own environment.
  if (agent === "codex" && Array.isArray(entry.env_vars)) {
    for (const v of entry.env_vars) {
      const name = typeof v === "string" ? v : isObject(v) ? v.name : undefined;
      if (typeof name === "string" && process.env[name] !== undefined)
        env[name] = process.env[name];
    }
  }
  return env;
}

/** Tool allow and deny lists from the config entry (Codex and Gemini CLI). */
function toolFilter(agent: string, entry: Record<string, unknown>): (t: ListedTool) => boolean {
  const [allowKey, denyKey] =
    agent === "codex"
      ? ["enabled_tools", "disabled_tools"]
      : agent === "gemini"
        ? ["includeTools", "excludeTools"]
        : ["", ""];
  const allow = Array.isArray(entry[allowKey]) ? new Set(strings(entry[allowKey])) : null;
  const deny = new Set(strings(entry[denyKey]));
  return (t) => (!allow || allow.has(t.name)) && !deny.has(t.name);
}

/** `${VAR}`, `${VAR:-default}` (Claude Code, Gemini CLI) and `${env:VAR}` (Cursor). */
export function expandVars(s: string): string {
  return s
    .replace(/\$\{env:([A-Za-z_]\w*)\}/g, (_, name) => process.env[name] ?? "")
    .replace(/\$\{([A-Za-z_]\w*)(?::-([^}]*))?\}/g, (m, name, fallback) => {
      const value = process.env[name];
      if (value !== undefined && value !== "") return value;
      return fallback ?? m;
    });
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
