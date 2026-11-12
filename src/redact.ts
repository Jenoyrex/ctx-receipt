// Secret-safe reading of MCP config files.
//
// MCP configs hold API keys in `env`, `headers`, `args`, URLs, and sometimes in `command`
// itself. Nothing from a config leaves this module except what `McpServer` allows: the
// server's name (a key the user chose) and its transport. Parse errors are replaced with a
// message that names the file only, because JSON and TOML parse errors quote the input text.
import { readFileSync } from "node:fs";
import { parse as parseToml } from "smol-toml";
import type { Item, Scope } from "./types.js";

export interface McpServer {
  name: string;
  transport: "stdio" | "http" | "sse" | "ws" | "unknown";
}

export class ConfigError extends Error {}

/** Parsed JSON, or null when the file does not exist. Throws ConfigError without file content. */
export function readJsonConfig(path: string): unknown {
  return readConfig(path, "JSON", JSON.parse);
}

/** JSON that may contain // and /* *\/ comments (Gemini settings, Cursor mcp.json). */
export function readJsoncConfig(path: string): unknown {
  return readConfig(path, "JSON", (text) => JSON.parse(stripJsonComments(text)));
}

/** Removes comments outside strings. Trailing commas are still invalid, as in the agents. */
export function stripJsonComments(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (ch === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 1;
      out += " ";
    } else {
      out += ch;
    }
  }
  return out;
}

/** Parsed TOML, or null when the file does not exist. Throws ConfigError without file content. */
export function readTomlConfig(path: string): unknown {
  return readConfig(path, "TOML", parseToml);
}

function readConfig(path: string, format: string, parse: (text: string) => unknown): unknown {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ConfigError(`could not read ${path}`);
  }
  try {
    return parse(text);
  } catch {
    throw new ConfigError(`could not parse ${path} (invalid ${format})`);
  }
}

/**
 * Safe summaries of an MCP server map: { [name]: { command | url | type, ... } }.
 * `skip` lets an adapter drop entries by a boolean flag such as Codex's `enabled = false`.
 */
export function safeServers(
  map: unknown,
  skip: (entry: Record<string, unknown>) => boolean = () => false,
): McpServer[] {
  if (!isObject(map)) return [];
  return Object.entries(map)
    .filter(([, e]) => !(isObject(e) && skip(e)))
    .map(([name, entry]) => ({ name, transport: transportOf(isObject(entry) ? entry : {}) }));
}

function transportOf(e: Record<string, unknown>): McpServer["transport"] {
  const t = typeof e.type === "string" ? e.type.toLowerCase() : "";
  if (t === "stdio" || t === "sse" || t === "ws") return t;
  if (t === "http" || t === "streamable-http" || t === "streamable_http") return "http";
  if (t === "" && typeof e.command === "string") return "stdio";
  if (t === "" && typeof e.url === "string") return "http";
  return "unknown";
}

/** The receipt line for a server: tokens unknown until measured with --mcp. */
export function serverItem(agent: string, s: McpServer, path: string, scope: Scope): Item {
  return {
    agent,
    kind: "mcp-server",
    name: s.name,
    path,
    scope,
    loading: "unmeasured",
    tokens: null,
    detail: s.transport,
  };
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
