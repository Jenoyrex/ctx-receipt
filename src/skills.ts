// SKILL.md parsing shared by agents that follow the Agent Skills format (agentskills.io).
// Agents pre-load a short listing per skill (name + description) and read the body on demand.
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import matter from "gray-matter";
import { isFile, subdirs } from "./fs.js";
import { estimateTokens } from "./tokens.js";
import type { Item, Scope } from "./types.js";

export interface Skill {
  path: string;
  name: string;
  /** `description`, or the body's first non-empty line when it is missing. */
  description: string;
  data: Record<string, unknown>;
  body: string;
}

/** `<root>/<skill>/SKILL.md` for each skill folder directly under `root`. */
export function findSkills(root: string): string[] {
  return subdirs(root)
    .map((d) => join(root, d, "SKILL.md"))
    .filter(isFile);
}

export function readSkill(path: string, fallbackName = basename(dirname(path))): Skill {
  const raw = readFileSync(path, "utf8");
  let data: Record<string, unknown> = {};
  let body = raw;
  // Frontmatter counts only when `---` is the first line; bad YAML means "no fields set".
  if (/^---\r?\n/.test(raw)) {
    try {
      const parsed = matter(raw);
      data = parsed.data;
      body = parsed.content;
    } catch {
      body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
    }
  }
  const name = str(data.name) || fallbackName;
  const firstLine = body.split("\n").find((l) => l.trim() !== "") ?? "";
  const description = str(data.description) || firstLine.trim();
  return { path, name, description, data, body };
}

/**
 * Two items per skill: the listing line the agent pre-loads ("always"), unless `listing` is
 * null because the agent hides it from the model, and the body read when the skill is used.
 */
export function skillItems(
  agent: string,
  skill: Skill,
  listing: string | null,
  scope: Scope,
): Item[] {
  const base = { agent, kind: "skill" as const, name: skill.name, path: skill.path, scope };
  const out: Item[] = [];
  if (listing !== null) out.push({ ...base, loading: "always", tokens: estimateTokens(listing) });
  out.push({ ...base, loading: "on-demand", tokens: estimateTokens(skill.body) });
  return out;
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** YAML booleans as agents read them: true/yes/on/1 in any case. */
export function truthy(v: unknown): boolean {
  return ["true", "yes", "on", "1"].includes(String(v).toLowerCase());
}
