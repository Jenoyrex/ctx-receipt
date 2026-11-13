// Claude Code.
// Verified 2026-11-12 against https://code.claude.com/docs/en/memory
// and https://code.claude.com/docs/en/skills
//
// Rules, loaded at launch ("always"):
//   ~/.claude/CLAUDE.md, ~/.claude/rules/**/*.md
//   CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md in the project dir and every dir above it
//   .claude/rules/**/*.md in the project
//   AGENTS.md, .claude/AGENTS.md (project dir and above) only when none of the CLAUDE.md files
//   above exist there (the default "Project instructions" setting)
//   @path imports in any of these, up to 4 hops, skipping code spans and fenced blocks
//   Rules with `paths:` frontmatter load on demand instead.
//
// Skills: the listing (name + description + when_to_use, capped at 1,536 chars) is always
// loaded unless `disable-model-invocation` is set; the body loads on demand. Locations:
//   ~/.claude/skills/<name>/SKILL.md, ~/.claude/skills/synced/<account>/<name>/SKILL.md
//   .claude/skills/<name>/SKILL.md from the project dir up to the git repository root
//   .claude/commands/**/*.md and ~/.claude/commands/**/*.md (older format, same frontmatter)
//
// MCP servers (verified against https://code.claude.com/docs/en/mcp), listed "unmeasured":
//   local scope:   ~/.claude.json  projects["<project path>"].mcpServers
//   project scope: .mcp.json in the project root
//   user scope:    ~/.claude.json  mcpServers
//   The same name in several scopes connects once (local > project > user). Servers in the
//   project entry's disabledMcpServers and reserved built-in names are skipped.
//
// Not counted yet: managed policy files, auto memory (MEMORY.md), subdirectory CLAUDE.md and
// skills, plugin skills, bundled skills, and the listing's overall budget (1% of the window),
// which can drop descriptions when there are many skills. MCP from plugins, claude.ai
// connectors, managed-mcp.json, and .mcp.json approvals (disabledMcpjsonServers etc.).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import matter from "gray-matter";
import { ancestors, displayPath, isFile, realPath, repoDirs, subdirs } from "../fs.js";
import { findImports, listMarkdown, stripHtmlComments } from "../markdown.js";
import { isObject, type McpServer, readJsonConfig, safeServers, serverItem } from "../redact.js";
import {
  capSkillListing,
  findSkills,
  readSkill,
  type Skill,
  skillItems,
  str,
  truthy,
} from "../skills.js";
import { CONTEXT_WINDOW, estimateTokens } from "../tokens.js";
import type { Adapter, Item, Loading, Scope } from "../types.js";

const AGENT = "claude-code";
const MAX_IMPORT_HOPS = 4;
const MAX_LISTING_CHARS = 1536;

export const claudeCode: Adapter = {
  id: AGENT,
  label: "Claude Code",
  verified: true,
  homeDir: ".claude",
  scan(ctx) {
    const items: Item[] = [];
    const seen = new Set<string>();
    const once = (path: string) => {
      const key = realPath(path);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };

    const load = (path: string, scope: Scope, loading: Loading, body: string, hops: number) => {
      const text = stripHtmlComments(body);
      items.push({
        agent: AGENT,
        kind: "rules",
        name: (hops > 0 ? "@" : "") + displayPath(path, ctx),
        path,
        scope,
        loading,
        tokens: estimateTokens(text),
      });
      if (hops >= MAX_IMPORT_HOPS) return;
      for (const target of findImports(text, dirname(path), ctx.home)) {
        if (once(target)) load(target, scope, loading, readFileSync(target, "utf8"), hops + 1);
      }
    };
    const loadFile = (path: string, scope: Scope) => {
      if (once(path)) load(path, scope, "always", readFileSync(path, "utf8"), 0);
    };
    const loadRules = (dir: string, scope: Scope) => {
      for (const path of listMarkdown(dir)) {
        if (!once(path)) continue;
        const { body, scoped } = parseRule(readFileSync(path, "utf8"));
        load(path, scope, scoped ? "on-demand" : "always", body, 0);
      }
    };
    const addSkill = (skill: Skill, scope: Scope) => {
      if (once(skill.path)) items.push(...skillItems(AGENT, skill, listing(skill), scope));
    };
    const loadSkills = (root: string, scope: Scope) => {
      for (const path of findSkills(root)) {
        const folder = path.split(sep).at(-2) ?? "";
        if (folder.startsWith(".") || /^(synced|anthropic-skills)/i.test(folder)) continue;
        addSkill(readSkill(path), scope);
      }
    };
    const loadCommands = (dir: string, scope: Scope) => {
      for (const path of listMarkdown(dir)) {
        // Commands take their name from the file path; the `name` field is not supported.
        const name = path
          .slice(dir.length + 1, -3)
          .split(sep)
          .join(":");
        addSkill({ ...readSkill(path), name }, scope);
      }
    };

    if (ctx.includeUser) {
      const dot = join(ctx.home, ".claude");
      if (isFile(join(dot, "CLAUDE.md"))) loadFile(join(dot, "CLAUDE.md"), "user");
      loadRules(join(dot, "rules"), "user");
      loadSkills(join(dot, "skills"), "user");
      for (const account of subdirs(join(dot, "skills", "synced"))) {
        for (const path of findSkills(join(dot, "skills", "synced", account))) {
          addSkill(readSkill(path), "user");
        }
      }
      loadCommands(join(dot, "commands"), "user");
    }

    // ~/.claude/CLAUDE.md is the user file even when home is above the project, so it never
    // counts as a project file (and does not switch off the AGENTS.md fallback).
    const userFiles = new Set(
      [ctx.home, homedir()].map((h) => realPath(join(h, ".claude", "CLAUDE.md"))),
    );
    const dirs = ancestors(ctx.project);
    const pick = (names: string[]) =>
      dirs
        .flatMap((d) => names.map((n) => join(d, n)))
        .filter((p) => isFile(p) && !userFiles.has(realPath(p)));
    const claudeFiles = pick(["CLAUDE.md", join(".claude", "CLAUDE.md"), "CLAUDE.local.md"]);
    const files =
      claudeFiles.length > 0 ? claudeFiles : pick(["AGENTS.md", join(".claude", "AGENTS.md")]);
    for (const f of files) loadFile(f, "project");
    loadRules(join(ctx.project, ".claude", "rules"), "project");
    for (const d of repoDirs(ctx.project)) loadSkills(join(d, ".claude", "skills"), "project");
    loadCommands(join(ctx.project, ".claude", "commands"), "project");

    // The skill listing is capped at skillListingBudgetFraction of the window (default 1%).
    const settings = ctx.includeUser
      ? readJsonConfig(join(ctx.home, ".claude", "settings.json"))
      : null;
    const fraction = isObject(settings) ? settings.skillListingBudgetFraction : undefined;
    const share = typeof fraction === "number" && fraction > 0 && fraction <= 1 ? fraction : 0.01;
    capSkillListing(items, CONTEXT_WINDOW * share);

    // MCP servers, in precedence order so the first definition of a name wins.
    const servers = new Map<string, Item>();
    const addServers = (list: McpServer[], path: string, scope: Scope) => {
      for (const s of list) {
        if (servers.has(s.name) || RESERVED_MCP_NAMES.has(s.name)) continue;
        servers.set(s.name, serverItem(AGENT, s, path, scope));
      }
    };
    const userConfigPath = join(ctx.home, ".claude.json");
    const userConfig = ctx.includeUser ? readJsonConfig(userConfigPath) : null;
    const entry = isObject(userConfig) ? projectEntry(userConfig.projects, ctx.project) : {};
    addServers(safeServers(entry.mcpServers), userConfigPath, "user");
    const mcpJsonPath = join(ctx.project, ".mcp.json");
    const mcpJson = readJsonConfig(mcpJsonPath);
    addServers(safeServers(isObject(mcpJson) ? mcpJson.mcpServers : null), mcpJsonPath, "project");
    if (isObject(userConfig))
      addServers(safeServers(userConfig.mcpServers), userConfigPath, "user");
    const disabled = Array.isArray(entry.disabledMcpServers) ? entry.disabledMcpServers : [];
    for (const item of servers.values()) if (!disabled.includes(item.name)) items.push(item);

    return items;
  },
};

const RESERVED_MCP_NAMES = new Set([
  "workspace",
  "claude-in-chrome",
  "computer-use",
  "Claude Preview",
  "Claude Browser",
]);

/** The ~/.claude.json entry for this project. Keys are paths; on Windows they use "/". */
export function projectEntry(projects: unknown, project: string): Record<string, unknown> {
  if (!isObject(projects)) return {};
  const norm = (p: string) => {
    const r = resolve(p).replace(/\\/g, "/");
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const key = Object.keys(projects).find((k) => norm(k) === norm(project));
  const entry = key ? projects[key] : null;
  return isObject(entry) ? entry : {};
}

/** The line Claude Code puts in its skill listing, or null when the model never sees it. */
function listing(skill: Skill): string | null {
  if (truthy(skill.data["disable-model-invocation"])) return null;
  const text = [skill.description, str(skill.data.when_to_use)].filter(Boolean).join(" ");
  return `- ${skill.name}: ${text.slice(0, MAX_LISTING_CHARS)}`;
}

function parseRule(raw: string): { body: string; scoped: boolean } {
  try {
    const { data, content } = matter(raw);
    const paths = data.paths;
    const scoped = Array.isArray(paths)
      ? paths.length > 0
      : typeof paths === "string" && paths.trim() !== "";
    return { body: content, scoped };
  } catch {
    // Claude Code ignores frontmatter it cannot parse and loads the rule as if it had no `paths`.
    return { body: raw, scoped: false };
  }
}
