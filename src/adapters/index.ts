import type { Adapter } from "../types.js";
import { claudeCode } from "./claude-code.js";
import { codex } from "./codex.js";
import { cursor } from "./cursor.js";

export const adapters: Adapter[] = [claudeCode, codex, cursor];
