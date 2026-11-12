// Codex CLI.
// Verified 2026-11-12 against developers.openai.com/codex: guides/agents-md, skills, mcp,
// config-basic, config-advanced, config-reference.
//
// Config: ~/.codex/config.toml (user), then .codex/config.toml from the project root down to
// the working directory (closest wins). Codex loads project layers only in trusted projects;
// we cannot see trust, so we read them.
//
// Rules ("always"):
//   ~/.codex/AGENTS.override.md, else ~/.codex/AGENTS.md (first non-empty one)
//   From the project root down to the working directory, at most one file per directory:
//   AGENTS.override.md, then AGENTS.md, then `project_doc_fallback_filenames`. Empty files are
//   skipped. Project files share a `project_doc_max_bytes` budget (32 KiB by default); the
//   file that crosses it is cut. The docs describe this cap both per file and combined; we
//   follow the combined description in guides/agents-md.
//
// Skills: name + description + path "always", body on demand. Locations:
//   .agents/skills/<name>/SKILL.md from the project dir up to the git repository root
//   ~/.agents/skills/<name>/SKILL.md
//   Skills turned off with [[skills.config]] in ~/.codex/config.toml are skipped.
//
// MCP: [mcp_servers.<name>] tables in the config layers above, listed "unmeasured".
//   `enabled = false` removes a server.
//
// Not counted yet: CODEX_HOME (we always use ~/.codex), /etc/codex/skills, skills bundled with
// Codex, profiles, plugin MCP servers, and the skill listing's overall budget (2% of the
// window), which can shorten descriptions when there are many skills.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { displayPath, isFile, realPath, repoDirs } from "../fs.js";
import { isObject, readTomlConfig, safeServers, serverItem } from "../redact.js";
import { findSkills, readSkill, type Skill, skillItems, str } from "../skills.js";
import { estimateTokens } from "../tokens.js";
import type { Adapter, Item, Scope } from "../types.js";

const AGENT = "codex";
const DEFAULT_MAX_BYTES = 32 * 1024;

interface Layer {
  path: string;
  scope: Scope;
  config: Record<string, unknown>;
}

export const codex: Adapter = {
  id: AGENT,
  label: "Codex CLI",
  verified: true,
  scan(ctx) {
    const items: Item[] = [];
    const codexHome = join(ctx.home, ".codex");
    const dirs = repoDirs(ctx.project);

    // Config layers, lowest precedence first.
    const layers: Layer[] = [];
    const addLayer = (path: string, scope: Scope) => {
      const config = readTomlConfig(path);
      if (isObject(config)) layers.push({ path, scope, config });
    };
    if (ctx.includeUser) addLayer(join(codexHome, "config.toml"), "user");
    for (const d of dirs) addLayer(join(d, ".codex", "config.toml"), "project");
    const setting = (key: string) =>
      layers
        .map((l) => l.config[key])
        .filter((v) => v !== undefined)
        .at(-1);

    // Rules.
    const rule = (path: string, scope: Scope, text: string, cut: boolean): Item => ({
      agent: AGENT,
      kind: "rules",
      name: displayPath(path, ctx),
      path,
      scope,
      loading: "always",
      tokens: estimateTokens(text),
      ...(cut ? { detail: "cut at project_doc_max_bytes" } : {}),
    });
    const firstNonEmpty = (paths: string[]) =>
      paths.find((p) => isFile(p) && readFileSync(p, "utf8").trim() !== "");

    if (ctx.includeUser) {
      const global = firstNonEmpty([
        join(codexHome, "AGENTS.override.md"),
        join(codexHome, "AGENTS.md"),
      ]);
      if (global) items.push(rule(global, "user", readFileSync(global, "utf8"), false));
    }
    const maxBytes = numberOr(setting("project_doc_max_bytes"), DEFAULT_MAX_BYTES);
    const fallbacks = stringList(setting("project_doc_fallback_filenames"));
    let budget = maxBytes;
    for (const d of dirs) {
      if (budget <= 0) break;
      const names = ["AGENTS.override.md", "AGENTS.md", ...fallbacks];
      const file = firstNonEmpty(names.map((n) => join(d, n)));
      if (!file) continue;
      const bytes = readFileSync(file);
      const used = bytes.subarray(0, budget);
      budget -= used.length;
      items.push(rule(file, "project", used.toString("utf8"), used.length < bytes.length));
    }

    // Skills.
    const disabled = disabledSkills(layers.find((l) => l.scope === "user")?.config);
    const seen = new Set<string>();
    const loadSkills = (root: string, scope: Scope) => {
      for (const path of findSkills(root)) {
        if (seen.has(realPath(path))) continue;
        seen.add(realPath(path));
        const skill = readSkill(path);
        if (disabled(skill)) continue;
        items.push(...skillItems(AGENT, skill, listing(skill), scope));
      }
    };
    if (ctx.includeUser) loadSkills(join(ctx.home, ".agents", "skills"), "user");
    for (const d of dirs) loadSkills(join(d, ".agents", "skills"), "project");

    // MCP servers: later layers override earlier ones by name.
    const servers = new Map<string, Item>();
    for (const layer of layers) {
      const map = layer.config.mcp_servers;
      if (!isObject(map)) continue;
      for (const [name, entry] of Object.entries(map)) {
        if (isObject(entry) && entry.enabled === false) {
          servers.delete(name);
          continue;
        }
        for (const s of safeServers({ [name]: entry })) {
          servers.set(name, serverItem(AGENT, s, layer.path, layer.scope));
        }
      }
    }
    items.push(...servers.values());

    return items;
  },
};

function listing(skill: Skill): string {
  return `- ${skill.name}: ${skill.description} (file: ${skill.path})`;
}

/** [[skills.config]] entries: one selector (`path` or `name`) and `enabled`; last match wins. */
function disabledSkills(config: Record<string, unknown> | undefined): (s: Skill) => boolean {
  const skills = config?.skills;
  const entries = isObject(skills) && Array.isArray(skills.config) ? skills.config : [];
  return (skill) => {
    let enabled = true;
    for (const e of entries) {
      if (!isObject(e) || typeof e.enabled !== "boolean") continue;
      const byPath = str(e.path) !== "" && realPath(resolve(str(e.path))) === realPath(skill.path);
      if (byPath || (str(e.name) !== "" && str(e.name) === skill.name)) enabled = e.enabled;
    }
    return !enabled;
  };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
