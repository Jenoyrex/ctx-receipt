import { countTokens } from "gpt-tokenizer/encoding/o200k_base";

/** Shown wherever we print numbers. Agents use their own tokenizers, so counts are estimates. */
export const TOKENIZER = "o200k_base via gpt-tokenizer";

export function estimateTokens(text: string): number {
  return countTokens(text);
}

/** Default window for percentages and listing caps; --window overrides it (1M models exist). */
export const CONTEXT_WINDOW = 200_000;

export function windowOf(ctx: { window?: number }): number {
  return ctx.window ?? CONTEXT_WINDOW;
}

/**
 * Claude's tokenizer counted about 1.6 times o200k_base on the same text when we compared with
 * Claude Code's /context on a real project (2026-11-13; per file 1.57 to 1.61, see
 * docs/how-we-count.md). A rough adjustment shown next to Claude Code's subtotal only; totals,
 * budgets, and grades stay on the raw estimate.
 */
export const CLAUDE_TOKENIZER_FACTOR = 1.6;
