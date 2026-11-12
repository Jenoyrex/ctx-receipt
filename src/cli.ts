import { createRequire } from "node:module";
import { Command } from "commander";

// dist/cli.js -> ../package.json, both in the repo and in the published tarball.
const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const program = new Command()
  .name("ctx-receipt")
  .description("Estimate the tokens your AI coding agents pre-load into context.")
  .version(version);

program.parse();
