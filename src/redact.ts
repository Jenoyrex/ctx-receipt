// Secret-safe reading of MCP config files.
//
// MCP configs hold API keys in `env`, `headers`, `args`, URLs, and sometimes in `command`
// itself. Nothing from a config leaves this module except what `McpServer` allows: the
// server's name (a key the user chose) and its transport. Parse errors are replaced with a
// message that names the file only, because Node's JSON errors quote the input text.
import { readFileSync } from "node:fs";

export interface McpServer {
  name: string;
  transport: "stdio" | "http" | "sse" | "ws" | "unknown";
}

export class ConfigError extends Error {}

/** Parsed JSON, or null when the file does not exist. Throws ConfigError without file content. */
export function readJsonConfig(path: string): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ConfigError(`could not read ${path}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ConfigError(`could not parse ${path} (invalid JSON)`);
  }
}

/** Safe summaries of an `mcpServers`-style map: { [name]: { command | url | type, ... } }. */
export function safeServers(map: unknown): McpServer[] {
  if (!isObject(map)) return [];
  return Object.entries(map).map(([name, entry]) => ({
    name,
    transport: transportOf(isObject(entry) ? entry : {}),
  }));
}

function transportOf(e: Record<string, unknown>): McpServer["transport"] {
  const t = typeof e.type === "string" ? e.type.toLowerCase() : "";
  if (t === "stdio" || t === "sse" || t === "ws") return t;
  if (t === "http" || t === "streamable-http" || t === "streamable_http") return "http";
  if (t === "" && typeof e.command === "string") return "stdio";
  if (t === "" && typeof e.url === "string") return "http";
  return "unknown";
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
