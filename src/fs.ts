// Small read-only filesystem helpers shared by adapters.
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { ScanContext } from "./types.js";

export function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Resolves symlinks so the same file reached two ways is counted once. */
export function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** Names of subdirectories (symlinks followed), sorted. */
export function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((n) => isDir(join(dir, n)))
      .sort();
  } catch {
    return [];
  }
}

/** Every directory from the filesystem root down to `dir`, root first. */
export function ancestors(dir: string): string[] {
  const out = [dir];
  while (dirname(out[0]) !== out[0]) out.unshift(dirname(out[0]));
  return out;
}

/** From the git repository root down to `dir`; just `dir` outside a repository. */
export function repoDirs(dir: string): string[] {
  const all = ancestors(dir);
  for (let i = all.length - 1; i >= 0; i--) {
    if (existsSync(join(all[i], ".git"))) return all.slice(i);
  }
  return [dir];
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
