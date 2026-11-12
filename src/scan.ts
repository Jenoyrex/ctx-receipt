import { adapters } from "./adapters/index.js";
import type { Item, ScanContext } from "./types.js";

export function scan(ctx: ScanContext, agentIds?: string[]): Item[] {
  return adapters.filter((a) => !agentIds || agentIds.includes(a.id)).flatMap((a) => a.scan(ctx));
}
