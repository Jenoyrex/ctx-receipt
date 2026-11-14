// Scans the selected repositories with the built CLI and records the results.
//
// Safety: third-party repositories are untrusted input.
// - Clones are shallow, blob-less, and sparse: only top-level files, the agent folders
//   (.claude, .cursor, .agents, .gemini, .codex), and files named by @path imports.
// - core.symlinks=false turns symlinks into plain files, so nothing outside the clone is read;
//   Git LFS smudging is off and submodules are not fetched.
// - No code from a repository is run: no install, no scripts. The CLI runs with --no-user and an
//   empty --home, and NEVER with --mcp (that would run commands from the repository's config).
// - Each clone is deleted when its scan ends.
//
// Usage: node research/scan.mjs research/selection-<date>.json   (run `npm run build` first)
// Writes research/scan-<date>.json.
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

const selectionFile = process.argv[2];
if (!selectionFile) throw new Error("usage: node research/scan.mjs <selection json>");
const selection = JSON.parse(readFileSync(selectionFile, "utf8"));
const cli = resolve("dist/cli.js");
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
// Clones live outside the user's folders, in a directory whose parents hold no agent files,
// because some agents read instruction files from parent directories.
const work = resolve(process.env.CTX_SCAN_DIR ?? ".scan-tmp");
const emptyHome = join(work, "_empty-home");
mkdirSync(emptyHome, { recursive: true });

const AGENT_DIRS = [".claude", ".cursor", ".agents", ".gemini", ".codex"];
const env = { ...process.env, GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0" };
const git = (cwd, args) =>
  execFileSync("git", ["-c", "core.symlinks=false", "-c", "protocol.file.allow=never", ...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
    timeout: 180_000,
  });

/** @path imports in Markdown files under `dir`, as repository-relative paths. */
function importedPaths(root) {
  const out = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === ".git") continue;
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path);
      else if (name.endsWith(".md") || name.endsWith(".mdc")) {
        const text = readFileSync(path, "utf8")
          .replace(/```[\s\S]*?```/g, "")
          .replace(/`[^`\n]*`/g, "");
        for (const m of text.matchAll(/(?:^|\s)@((?:\\ |[^\s])+)/g)) {
          const raw = m[1].replace(/\\ /g, " ");
          if (raw.startsWith("~") || /^[a-z]+:/i.test(raw)) continue;
          const target = resolve(dirname(path), raw);
          const rel = relative(root, target);
          if (rel && !rel.startsWith("..") && !rel.includes(":")) out.add(rel.split(sep).join("/"));
        }
      }
    }
  };
  walk(root);
  return out;
}

const results = [];
for (const [n, entry] of selection.selected.entries()) {
  const dest = join(work, entry.repo.replace("/", "__"));
  rmSync(dest, { recursive: true, force: true });
  const started = Date.now();
  const record = { repo: entry.repo, stars: entry.stars, agentFiles: entry.agentFiles };
  try {
    const clone = () =>
      git(work, [
        "clone",
        "--depth=1",
        "--filter=blob:none",
        "--no-checkout",
        "--sparse",
        `https://github.com/${entry.repo}.git`,
        dest,
      ]);
    // One retry: GitHub sometimes drops a clone midway.
    try {
      clone();
    } catch {
      rmSync(dest, { recursive: true, force: true });
      clone();
    }
    const patterns = ["/*", "!/*/", ...AGENT_DIRS.map((d) => `/${d}/`)];
    git(dest, ["sparse-checkout", "set", "--no-cone", ...patterns]);
    git(dest, ["checkout"]);
    // Follow @path imports and in-repo symlinks: add the files they name, a few rounds deep.
    // With core.symlinks=false a symlink is checked out as a small file holding its target path;
    // agents would read the target, so a target inside the repository replaces the link's
    // content. Links that point outside the repository stay as they are and are counted.
    const symlinkTargets = () => {
      const out = new Map();
      for (const line of git(dest, ["ls-files", "-s"]).split("\n")) {
        const m = line.match(/^120000 \S+ \d+\t(.+)$/);
        if (!m || !existsSync(join(dest, m[1]))) continue;
        const target = resolve(
          dirname(join(dest, m[1])),
          readFileSync(join(dest, m[1]), "utf8").trim(),
        );
        const rel = relative(dest, target);
        out.set(
          m[1],
          rel && !rel.startsWith("..") && !rel.includes(":") ? rel.split(sep).join("/") : null,
        );
      }
      return out;
    };
    for (let round = 0; round < 5; round++) {
      const wanted = [...importedPaths(dest), ...[...symlinkTargets().values()].filter(Boolean)];
      const missing = wanted.filter((p) => !existsSync(join(dest, p)));
      if (missing.length === 0) break;
      patterns.push(...missing.map((p) => `/${p}`));
      git(dest, ["sparse-checkout", "set", "--no-cone", ...patterns]);
    }
    record.symlinksResolved = 0;
    record.symlinksOutsideRepo = 0;
    for (const [link, target] of symlinkTargets()) {
      if (target && existsSync(join(dest, target)) && statSync(join(dest, target)).isFile()) {
        writeFileSync(join(dest, link), readFileSync(join(dest, target)));
        record.symlinksResolved++;
      } else {
        record.symlinksOutsideRepo++;
      }
    }
    record.commit = git(dest, ["rev-parse", "HEAD"]).trim();
    const run = spawnSync(
      process.execPath,
      [cli, dest, "--no-user", "--home", emptyHome, "--json"],
      { encoding: "utf8", timeout: 120_000 },
    );
    if (run.status !== 0) {
      record.status = `cli exit ${run.status}`;
      record.error = (run.stderr || "").split("\n")[0].replace(dest, "<repo>").slice(0, 200);
    } else {
      const report = JSON.parse(run.stdout);
      // Only items inside the clone count (parents of the work dir hold no agent files, but check).
      const outside = report.items.filter(
        (i) => i.file.startsWith("../") || i.file.startsWith("~"),
      );
      record.status = "ok";
      record.ctxReceiptVersion = version;
      record.totalAlwaysLoaded = report.totalAlwaysLoaded;
      record.grade = report.grade;
      record.itemsOutsideRepo = outside.length;
      record.agents = report.agents.map((a) => ({
        id: a.id,
        alwaysLoaded: a.alwaysLoaded,
        onDemand: a.onDemand,
        rules: a.rules,
        skills: a.skills,
        subagents: a.subagents,
        mcpServers: a.mcp.count,
      }));
      record.items = report.items
        .filter((i) => i.loading !== "unmeasured")
        .map((i) => ({
          agent: i.agent,
          kind: i.kind,
          file: i.file,
          loading: i.loading,
          tokens: i.tokens,
          ...(i.detail ? { detail: i.detail } : {}),
        }));
      record.mcpServers = report.items.filter((i) => i.kind === "mcp-server").length;
    }
  } catch (err) {
    record.status = "clone failed";
    record.error = String(err.message).split("\n")[0].slice(0, 200);
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
  record.seconds = Math.round((Date.now() - started) / 1000);
  results.push(record);
  console.log(
    `${n + 1}/${selection.selected.length} ${entry.repo}: ${record.status}${record.status === "ok" ? `, ${record.totalAlwaysLoaded} tokens` : ""} (${record.seconds} s)`,
  );
}
rmSync(work, { recursive: true, force: true });

const date = selection.date;
const out = {
  date,
  ctxReceiptVersion: version,
  command: "ctx-receipt <repo> --no-user --home <empty dir> --json",
  selection: selection.method,
  poolSize: selection.poolSize,
  eligibleCount: selection.eligibleCount,
  results,
};
writeFileSync(`research/scan-${date}.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote research/scan-${date}.json`);
