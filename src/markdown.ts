// Markdown helpers shared by agents that use @path imports in instruction files.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { isFile } from "./fs.js";

const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[^\n]*$|(?![\s\S]))/gm;

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

export function mapOutsideFences(
  text: string,
  fn: (s: string) => string,
  dropFences = false,
): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    out += fn(text.slice(last, m.index)) + (dropFences ? "" : m[0]);
    last = m.index + m[0].length;
  }
  return out + fn(text.slice(last));
}

/** Files under `dir` (recursive) ending in `ext`, sorted. */
export function listMarkdown(dir: string, ext = ".md"): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { recursive: true, encoding: "utf8" });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.endsWith(ext))
    .map((e) => join(dir, e))
    .filter(isFile)
    .sort();
}
