// Gemini CLI.
// Verified 2026-11-12 against the gemini-cli repository docs: docs/cli/gemini-md.md,
// docs/cli/skills.md, docs/reference/configuration.md, docs/reference/memport.md.
//
// Settings: ~/.gemini/settings.json, then .gemini/settings.json in the project (project wins).
// Both allow comments.
//
// Rules ("always"), using `context.fileName` (default GEMINI.md; may be a list):
//   ~/.gemini/<name>
//   <name> in the project dir and each parent, stopping at the first dir that holds a
//   `context.memoryBoundaryMarkers` entry (default .git) or at the home directory
//   @path imports, up to 5 levels, skipping code spans and fenced blocks
// Skills: name + description "always", body on demand. Precedence, highest first:
//   .agents/skills, .gemini/skills (project), ~/.agents/skills, ~/.gemini/skills.
//   `skills.enabled: false` and `skills.disabled` are honored.
// MCP: `mcpServers` in the settings files, listed "unmeasured". `httpUrl` is streamable HTTP,
//   `url` is SSE, `command` is stdio. `mcp.excluded` and `mcp.allowed` are honored.
//
// Not counted yet: system settings files, extensions (their context files, skills, and MCP
// servers), built-in skills, `context.includeDirectories`, and context files in subdirectories.
// The docs disagree on subdirectories: the configuration reference says they are scanned at
// start, the GEMINI.md guide says they load just in time. We follow the guide.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ancestors, displayPath, isFile, realPath } from "../fs.js";
import { findImports } from "../markdown.js";
import { isObject, readJsoncConfig, safeServers, serverItem } from "../redact.js";
import { findSkills, readSkill, skillItems } from "../skills.js";
import { estimateTokens } from "../tokens.js";
import type { Adapter, Item, Scope } from "../types.js";

const AGENT = "gemini";
const MAX_IMPORT_DEPTH = 5;

export const gemini: Adapter = {
  id: AGENT,
  label: "Gemini CLI",
  verified: true,
  scan(ctx) {
    const items: Item[] = [];
    const geminiHome = join(ctx.home, ".gemini");
    const userPath = join(geminiHome, "settings.json");
    const projectPath = join(ctx.project, ".gemini", "settings.json");
    const user = ctx.includeUser ? readJsoncConfig(userPath) : null;
    const project = readJsoncConfig(projectPath);
    const section = (s: unknown, key: string) => (isObject(s) && isObject(s[key]) ? s[key] : {});
    const setting = (key: string, field: string) =>
      section(project, key)[field] ?? section(user, key)[field];
    const both = (key: string, field: string) => [
      ...strings(section(user, key)[field]),
      ...strings(section(project, key)[field]),
    ];

    // Rules.
    const fileNames = strings(setting("context", "fileName"));
    const names = fileNames.length > 0 ? fileNames : ["GEMINI.md"];
    const markersSetting = setting("context", "memoryBoundaryMarkers");
    const markers = Array.isArray(markersSetting) ? strings(markersSetting) : [".git"];
    const seen = new Set<string>();
    const load = (path: string, scope: Scope, depth: number) => {
      if (seen.has(realPath(path))) return;
      seen.add(realPath(path));
      const text = readFileSync(path, "utf8");
      items.push({
        agent: AGENT,
        kind: "rules",
        name: (depth > 0 ? "@" : "") + displayPath(path, ctx),
        path,
        scope,
        loading: "always",
        tokens: estimateTokens(text),
      });
      if (depth >= MAX_IMPORT_DEPTH) return;
      for (const target of findImports(text, dirname(path), ctx.home)) {
        load(target, scope, depth + 1);
      }
    };
    if (ctx.includeUser) {
      for (const n of names) if (isFile(join(geminiHome, n))) load(join(geminiHome, n), "user", 0);
    }
    for (const d of contextDirs(ctx.project, ctx.home, markers)) {
      for (const n of names) if (isFile(join(d, n))) load(join(d, n), "project", 0);
    }

    // Skills: highest precedence first, so the first skill with a name wins.
    if (setting("skills", "enabled") !== false) {
      const disabled = new Set(both("skills", "disabled"));
      const tiers: [string, Scope][] = [
        [join(ctx.project, ".agents", "skills"), "project"],
        [join(ctx.project, ".gemini", "skills"), "project"],
      ];
      if (ctx.includeUser) {
        tiers.push([join(ctx.home, ".agents", "skills"), "user"]);
        tiers.push([join(geminiHome, "skills"), "user"]);
      }
      const taken = new Set<string>();
      for (const [root, scope] of tiers) {
        for (const path of findSkills(root)) {
          const skill = readSkill(path);
          if (taken.has(skill.name) || disabled.has(skill.name)) continue;
          taken.add(skill.name);
          items.push(...skillItems(AGENT, skill, `- ${skill.name}: ${skill.description}`, scope));
        }
      }
    }

    // MCP servers: project settings override user settings by name.
    const servers = new Map<string, Item>();
    for (const [config, path, scope] of [
      [user, userPath, "user"],
      [project, projectPath, "project"],
    ] as const) {
      const map = isObject(config) ? config.mcpServers : null;
      if (!isObject(map)) continue;
      // Only the transport key's presence is passed on, never its value.
      const kinds = Object.fromEntries(
        Object.entries(map).map(([name, e]) => [name, { type: transport(e) }]),
      );
      for (const s of safeServers(kinds)) servers.set(s.name, serverItem(AGENT, s, path, scope));
    }
    const excluded = new Set(both("mcp", "excluded"));
    const allowedSetting = setting("mcp", "allowed");
    const allowed = Array.isArray(allowedSetting) ? new Set(strings(allowedSetting)) : null;
    for (const [name, item] of servers) {
      if (!excluded.has(name) && (!allowed || allowed.has(name))) items.push(item);
    }

    return items;
  },
};

/** The project dir and its parents, up to the first boundary marker or the home dir. */
function contextDirs(project: string, home: string, markers: string[]): string[] {
  const out: string[] = [];
  for (const d of ancestors(project).reverse()) {
    if (d === home && d !== project) break;
    out.push(d);
    if (markers.length === 0 || markers.some((m) => existsSync(join(d, m)))) break;
  }
  return out.reverse();
}

function transport(e: unknown): string {
  if (!isObject(e)) return "";
  if (typeof e.httpUrl === "string") return "http";
  if (typeof e.url === "string") return "sse";
  if (typeof e.command === "string") return "stdio";
  return "";
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
