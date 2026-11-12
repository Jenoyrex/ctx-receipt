// Claude Code instruction files.
// Verified 2026-11-12 against https://code.claude.com/docs/en/memory
//
// Loaded at launch ("always"):
//   ~/.claude/CLAUDE.md, ~/.claude/rules/**/*.md
//   CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md in the project dir and every dir above it
//   .claude/rules/**/*.md in the project
//   AGENTS.md, .claude/AGENTS.md (project dir and above) only when none of the CLAUDE.md files
//   above exist there (the default "Project instructions" setting)
//   @path imports in any of these, up to 4 hops, skipping code spans and fenced blocks
// Loaded on demand: rules with `paths:` frontmatter.
// Not counted yet: managed policy CLAUDE.md, auto memory (MEMORY.md), subdirectory CLAUDE.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import matter from "gray-matter";
import { estimateTokens } from "../tokens.js";
import type { Adapter, Item, Loading, ScanContext, Scope } from "../types.js";

const MAX_IMPORT_HOPS = 4;
const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm;

export const claudeCode: Adapter = {
  id: "claude-code",
  label: "Claude Code",
  verified: true,
  scan(ctx) {
    const items: Item[] = [];
    const seen = new Set<string>();

    const load = (path: string, scope: Scope, loading: Loading, body: string, hops: number) => {
      seen.add(path);
      const text = stripHtmlComments(body);
      items.push({
        agent: "claude-code",
        kind: "rules",
        name: (hops > 0 ? "@" : "") + displayPath(path, ctx),
        path,
        scope,
        loading,
        tokens: estimateTokens(text),
      });
      if (hops >= MAX_IMPORT_HOPS) return;
      for (const target of findImports(text, dirname(path), ctx.home)) {
        if (!seen.has(target)) load(target, scope, loading, readFileSync(target, "utf8"), hops + 1);
      }
    };
    const loadFile = (path: string, scope: Scope) => {
      if (!seen.has(path)) load(path, scope, "always", readFileSync(path, "utf8"), 0);
    };
    const loadRules = (dir: string, scope: Scope) => {
      for (const path of listMarkdown(dir)) {
        if (seen.has(path)) continue;
        const { body, scoped } = parseRule(readFileSync(path, "utf8"));
        load(path, scope, scoped ? "on-demand" : "always", body, 0);
      }
    };

    if (ctx.includeUser) {
      const userFile = join(ctx.home, ".claude", "CLAUDE.md");
      if (isFile(userFile)) loadFile(userFile, "user");
      loadRules(join(ctx.home, ".claude", "rules"), "user");
    }

    const dirs = ancestors(ctx.project);
    const pick = (names: string[]) =>
      dirs.flatMap((d) => names.map((n) => join(d, n))).filter(isFile);
    const claudeFiles = pick(["CLAUDE.md", join(".claude", "CLAUDE.md"), "CLAUDE.local.md"]);
    const files =
      claudeFiles.length > 0 ? claudeFiles : pick(["AGENTS.md", join(".claude", "AGENTS.md")]);
    for (const f of files) loadFile(f, "project");
    loadRules(join(ctx.project, ".claude", "rules"), "project");

    return items;
  },
};

/** Root first, project last: the order Claude Code concatenates them in. */
function ancestors(dir: string): string[] {
  const out = [dir];
  while (dirname(out[0]) !== out[0]) out.unshift(dirname(out[0]));
  return out;
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

/** Block-level HTML comments are stripped before loading; ones inside code blocks are kept. */
export function stripHtmlComments(text: string): string {
  return mapOutsideFences(text, (s) => s.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n?/gm, ""));
}

/** Absolute paths of existing files imported with @path. */
export function findImports(text: string, baseDir: string, home: string): string[] {
  const prose = mapOutsideFences(text, (s) => s.replace(/`[^`\n]*`/g, ""), true);
  const out: string[] = [];
  for (const m of prose.matchAll(/(?:^|\s)@((?:\\ |[^\s])+)/g)) {
    const raw = m[1].replace(/\\ /g, " ");
    if (raw.startsWith('"') || raw.startsWith("'")) continue;
    const path = raw.startsWith("~/") ? join(home, raw.slice(2)) : resolve(baseDir, raw);
    if (isFile(path)) out.push(path);
  }
  return out;
}

function mapOutsideFences(text: string, fn: (s: string) => string, dropFences = false): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    out += fn(text.slice(last, m.index)) + (dropFences ? "" : m[0]);
    last = m.index + m[0].length;
  }
  return out + fn(text.slice(last));
}

function listMarkdown(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.endsWith(".md"))
    .map((e) => join(dir, e))
    .filter(isFile)
    .sort();
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Project-relative, ~/ for home, otherwise relative to the project (../CLAUDE.md). */
export function displayPath(path: string, ctx: ScanContext): string {
  const inside = (base: string) => {
    const rel = relative(base, path);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel.split(sep).join("/") : null;
  };
  const inProject = inside(ctx.project);
  if (inProject) return inProject;
  const inHome = inside(ctx.home);
  if (inHome) return `~/${inHome}`;
  return relative(ctx.project, path).split(sep).join("/");
}
