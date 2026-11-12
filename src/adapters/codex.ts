// Codex CLI.
// Skills verified 2026-11-12 against https://developers.openai.com/codex/skills
// Rules (AGENTS.md) and MCP (config.toml) come in a later milestone.
//
// Skills: Codex pre-loads each skill's name, description, and file path; the body loads when
// the skill is used. Locations:
//   .agents/skills/<name>/SKILL.md from the project dir up to the git repository root
//   ~/.agents/skills/<name>/SKILL.md
//
// Not counted yet: /etc/codex/skills (admin), skills bundled with Codex, skills disabled with
// [[skills.config]] in ~/.codex/config.toml (still counted), and the listing's overall budget
// (2% of the window), which can shorten descriptions when there are many skills.
import { join } from "node:path";
import { realPath, repoDirs } from "../fs.js";
import { findSkills, readSkill, type Skill, skillItems } from "../skills.js";
import type { Adapter, Item, Scope } from "../types.js";

const AGENT = "codex";

export const codex: Adapter = {
  id: AGENT,
  label: "Codex CLI",
  verified: true,
  scan(ctx) {
    const items: Item[] = [];
    const seen = new Set<string>();
    const loadSkills = (root: string, scope: Scope) => {
      for (const path of findSkills(root)) {
        if (seen.has(realPath(path))) continue;
        seen.add(realPath(path));
        const skill = readSkill(path);
        items.push(...skillItems(AGENT, skill, listing(skill), scope));
      }
    };

    if (ctx.includeUser) loadSkills(join(ctx.home, ".agents", "skills"), "user");
    for (const d of repoDirs(ctx.project)) loadSkills(join(d, ".agents", "skills"), "project");
    return items;
  },
};

function listing(skill: Skill): string {
  return `- ${skill.name}: ${skill.description} (file: ${skill.path})`;
}
