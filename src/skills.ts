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

/**
 * Agents cap the whole skill listing at a share of the context window. Over the cap, they keep
 * every skill's name and drop or shorten descriptions. We cannot know which descriptions go, so
 * we scale each skill's description share down until the listing fits, never below its name.
 */
export function capSkillListing(items: Item[], budgetTokens: number): void {
  const listed = items.filter((i) => i.kind === "skill" && i.loading === "always");
  const total = listed.reduce((n, i) => n + (i.tokens ?? 0), 0);
  if (total <= budgetTokens) return;
  const floors = listed.map((i) => Math.min(i.tokens ?? 0, estimateTokens(`- ${i.name}`)));
  const floorTotal = floors.reduce((a, b) => a + b, 0);
  const target = Math.max(floorTotal, budgetTokens);
  const share = total > floorTotal ? (target - floorTotal) / (total - floorTotal) : 0;
  listed.forEach((item, k) => {
    item.tokens = Math.round(floors[k] + ((item.tokens ?? 0) - floors[k]) * share);
    item.detail = "listing cap";
  });
}

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** YAML booleans as agents read them: true/yes/on/1 in any case. */
export function truthy(v: unknown): boolean {
  return ["true", "yes", "on", "1"].includes(String(v).toLowerCase());
}
