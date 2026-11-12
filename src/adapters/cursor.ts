// Cursor.
// Verified 2026-11-12 against https://cursor.com/docs/rules and https://cursor.com/docs/mcp
//
// Rules: .cursor/rules/**/*.mdc (plain .md there is ignored). Frontmatter decides loading:
//   alwaysApply: true          -> body "always"
//   description, no alwaysApply -> "- name: description" "always" (agent decides), body on demand
//   globs only, or nothing     -> body on demand (file match or @-mention)
// AGENTS.md in the project root: "always". Nested AGENTS.md files apply in their subfolders.
// .cursorrules: not in the current docs. Counted "always" and marked unverified.
//
// MCP: .cursor/mcp.json and ~/.cursor/mcp.json ({ mcpServers }), listed "unmeasured".
//
// Not counted: User Rules and Team Rules (stored in Cursor's settings and dashboard, not in
// files), servers toggled off in the UI, nested AGENTS.md files, plugin rules.
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { displayPath, isFile } from "../fs.js";
import { isObject, readJsoncConfig, safeServers, serverItem } from "../redact.js";
import { truthy } from "../skills.js";
import { estimateTokens } from "../tokens.js";
import type { Adapter, Item, Loading, Scope } from "../types.js";

const AGENT = "cursor";

export const cursor: Adapter = {
  id: AGENT,
  label: "Cursor",
  verified: true,
  homeDir: ".cursor",
  scan(ctx) {
    const items: Item[] = [];
    const rule = (path: string, loading: Loading, text: string, detail?: string): Item => ({
      agent: AGENT,
      kind: "rules",
      name: displayPath(path, ctx),
      path,
      scope: "project",
      loading,
      tokens: estimateTokens(text),
      ...(detail ? { detail } : {}),
    });

    const rulesDir = join(ctx.project, ".cursor", "rules");
    for (const path of listMdc(rulesDir)) {
      const { fields, body } = parseMdc(readFileSync(path, "utf8"));
      const description = fields.description ?? "";
      if (truthy(fields.alwaysApply)) {
        items.push(rule(path, "always", body));
      } else if (description !== "" && !fields.globs) {
        const name = basename(path, ".mdc");
        items.push(rule(path, "always", `- ${name}: ${description}`, "description"));
        items.push(rule(path, "on-demand", body));
      } else {
        items.push(rule(path, "on-demand", body));
      }
    }
    for (const [file, detail] of [
      ["AGENTS.md", undefined],
      [".cursorrules", "legacy, unverified"],
    ] as const) {
      const path = join(ctx.project, file);
      if (isFile(path)) items.push(rule(path, "always", readFileSync(path, "utf8"), detail));
    }

    const addServers = (path: string, scope: Scope) => {
      const config = readJsoncConfig(path);
      const map = isObject(config) ? config.mcpServers : null;
      for (const s of safeServers(map)) items.push(serverItem(AGENT, s, path, scope));
    };
    addServers(join(ctx.project, ".cursor", "mcp.json"), "project");
    if (ctx.includeUser) addServers(join(ctx.home, ".cursor", "mcp.json"), "user");

    return items;
  },
};

/**
 * Cursor's frontmatter is not strict YAML (`globs: *.ts` is common and is a YAML error), so read
 * the three fields it uses line by line. Values keep surrounding quotes stripped.
 */
export function parseMdc(raw: string): { fields: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { fields: {}, body: raw };
  const fields: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(description|globs|alwaysApply)\s*:\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }
  return { fields, body: raw.slice(m[0].length) };
}

function listMdc(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((e) => e.endsWith(".mdc"))
      .map((e) => join(dir, e))
      .filter(isFile)
      .sort();
  } catch {
    return [];
  }
}
