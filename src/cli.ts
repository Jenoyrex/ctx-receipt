import { createRequire } from "node:module";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { adapters } from "./adapters/index.js";
import { isDir } from "./fs.js";
import { renderReceipt } from "./render/receipt.js";
import { scan } from "./scan.js";
import type { Item } from "./types.js";

// Exit codes: 0 ok, 1 over budget, 2 usage error, 3 scan error.
const USAGE = 2;
const SCAN_ERROR = 3;

// dist/cli.js -> ../package.json, both in the repo and in the published tarball.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

interface Options {
  user: boolean;
  home?: string;
  agent?: string[];
}

const program = new Command()
  .name("ctx-receipt")
  .description("Estimate the tokens your AI coding agents pre-load into context.")
  .version(version)
  .argument("[path]", "project to scan", ".")
  .option("--agent <name...>", `limit to some agents (${adapters.map((a) => a.id).join(", ")})`)
  .option("--no-user", "skip home-directory config")
  .option("--home <dir>", "override the home directory")
  .exitOverride((err) => process.exit(err.exitCode === 0 ? 0 : USAGE))
  .action((path: string, opts: Options) => {
    const project = resolve(path);
    if (!isDir(project)) fail(USAGE, `not a directory: ${path}`);
    const unknown = opts.agent?.filter((a) => !adapters.some((x) => x.id === a)) ?? [];
    if (unknown.length > 0) fail(USAGE, `unknown agent: ${unknown.join(", ")}`);

    let items: Item[];
    try {
      const home = resolve(opts.home ?? homedir());
      items = scan({ project, home, includeUser: opts.user }, opts.agent);
    } catch (err) {
      fail(SCAN_ERROR, `scan failed: ${(err as Error).message}`);
    }
    // picocolors alone enables color on Windows and in CI even when piped; also require a TTY.
    const color = pc.isColorSupported && process.stdout.isTTY === true;
    process.stdout.write(renderReceipt(items, { color }));
  });

function fail(code: number, msg: string): never {
  console.error(`ctx-receipt: ${msg}`);
  process.exit(code);
}

program.parse();
