import { countTokens } from "gpt-tokenizer/encoding/o200k_base";

/** Shown wherever we print numbers. Agents use their own tokenizers, so counts are estimates. */
export const TOKENIZER = "o200k_base via gpt-tokenizer";

export function estimateTokens(text: string): number {
  return countTokens(text);
}
