import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { adapters } from "./adapters/index.js";
import { isDir } from "./fs.js";
import { summarize } from "./grade.js";
import { renderJson } from "./render/json.js";
import { renderMarkdown } from "./render/markdown.js";
import { renderReceipt } from "./render/receipt.js";
import { renderSvg } from "./render/svg.js";
import { scan } from "./scan.js";
import type { Item, ScanContext } from "./types.js";

// Exit codes: 0 ok, 1 over budget, 2 usage error, 3 scan error.
const OVER_BUDGET = 1;
const USAGE = 2;
const SCAN_ERROR = 3;

// dist/cli.js -> ../package.json, both in the repo and in the published tarball.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

interface Options {
  user: boolean;
  home?: string;
  agent?: string[];
  mcp?: true | string;
  json?: boolean;
  md?: string;
  svg?: string;
  budget?: string;
  window?: string;
}

const program = new Command()
  .name("ctx-receipt")
  .description("Estimate the tokens your AI coding agents pre-load into context.")
  .version(version)
  .argument("[path]", "project to scan", ".")
  .option("--agent <name...>", `limit to some agents (${adapters.map((a) => a.id).join(", ")})`)
  .option("--no-user", "skip home-directory config")
  .option("--home <dir>", "override the home directory")
  .option(
    "--mcp [name]",
    "start stdio MCP servers from your config (or only <name>) and measure their tools",
  )
  .option("--json", "print a JSON report to stdout instead of the receipt")
  .option("--md <file>", "also write a Markdown report")
  .option("--svg <file>", "also write a shareable SVG receipt card")
  .option("--budget <tokens>", "exit 1 if the always-loaded total is over <tokens>")
  .option(
    "--window <tokens>",
    "context window size for percentages and listing caps (default: 200000)",
  )
  .exitOverride((err) => process.exit(err.exitCode === 0 ? 0 : USAGE))
  .action(async (path: string, opts: Options) => {
    const project = resolve(path);
    if (!isDir(project)) fail(USAGE, `not a directory: ${path}`);
    const unknown = opts.agent?.filter((a) => !adapters.some((x) => x.id === a)) ?? [];
    if (unknown.length > 0) fail(USAGE, `unknown agent: ${unknown.join(", ")}`);
    const budget = opts.budget === undefined ? undefined : Number(opts.budget);
    if (budget !== undefined && !(Number.isInteger(budget) && budget >= 0)) {
      fail(USAGE, `--budget needs a whole number of tokens, got "${opts.budget}"`);
    }

    const window = opts.window === undefined ? undefined : Number(opts.window);
    if (window !== undefined && !(Number.isInteger(window) && window > 0)) {
      fail(USAGE, `--window needs a whole number of tokens, got "${opts.window}"`);
    }

    const ctx: ScanContext = {
      project,
      window,
      home: resolve(opts.home ?? homedir()),
      includeUser: opts.user,
    };
    let items: Item[];
    try {
      items = scan(ctx, opts.agent);
    } catch (err) {
      fail(SCAN_ERROR, `scan failed: ${(err as Error).message}`);
    }

    if (opts.mcp) {
      // Loaded only here: the MCP SDK roughly triples startup time.
      const { describeLaunch, launchable, measureServers } = await import("./mcp/measure.js");
      const only = typeof opts.mcp === "string" ? opts.mcp : undefined;
      const targets = launchable(items, only);
      if (only && targets.length === 0) fail(USAGE, `no stdio MCP server named "${only}"`);
      if (targets.length === 0) {
        process.stderr.write("No stdio MCP servers to measure.\n");
      } else {
        process.stderr.write(describeLaunch(targets, ctx));
        await measureServers(targets, ctx);
      }
    }

    if (opts.json) {
      process.stdout.write(renderJson(items, ctx, version));
    } else {
      // picocolors alone enables color on Windows and in CI even when piped; also require a TTY.
      const color = pc.isColorSupported && process.stdout.isTTY === true;
      process.stdout.write(renderReceipt(items, { color, window }));
    }
    try {
      if (opts.md) writeFileSync(opts.md, renderMarkdown(items, ctx));
      if (opts.svg) writeFileSync(opts.svg, renderSvg(items));
    } catch (err) {
      fail(SCAN_ERROR, `could not write report: ${(err as NodeJS.ErrnoException).code ?? "error"}`);
    }

    const total = summarize(items).totalAlwaysLoaded;
    if (budget !== undefined && total > budget) {
      process.stderr.write(
        `ctx-receipt: over budget: ${total} tokens always loaded (estimate) > ${budget}\n`,
      );
      process.exitCode = OVER_BUDGET;
    }
  });

function fail(code: number, msg: string): never {
  console.error(`ctx-receipt: ${msg}`);
  process.exit(code);
}

await program.parseAsync();
