import { join } from "node:path";
import { adapters } from "./adapters/index.js";
import { isDir } from "./fs.js";
import type { Item, ScanContext } from "./types.js";

/**
 * Runs the adapters. An agent whose config folder is missing from home is treated as not
 * installed: its home files are skipped (some, like ~/.agents/skills, are shared with other
 * agents) but its project files still count. Agents named in `agentIds` always read home.
 */
export function scan(ctx: ScanContext, agentIds?: string[]): Item[] {
  return adapters
    .filter((a) => !agentIds || agentIds.includes(a.id))
    .flatMap((a) => {
      const installed = agentIds !== undefined || isDir(join(ctx.home, a.homeDir));
      return a.scan({ ...ctx, includeUser: ctx.includeUser && installed });
    });
}
