// Secret-leak tests. Every fixture under test/fixtures/secrets hides the same fake key in each
// place an MCP config can carry one. No output may ever contain any part of it.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { readJsonConfig, safeServers } from "../src/redact.js";
import { scan } from "../src/scan.js";

const LEAK = /LEAKCHECK|sk-FAKE/i;
const fixtures = resolve("test/fixtures/secrets");
const project = join(fixtures, "project");
const home = join(fixtures, "home");

const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8" });

// Every output format goes here. Files a format writes are checked too.
const outDir = mkdtempSync(join(tmpdir(), "ctx-receipt-formats-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));
const FORMATS: { name: string; flags: string[]; status?: number; listsServers?: boolean }[] = [
  { name: "receipt", flags: [] },
  { name: "receipt --no-user", flags: ["--no-user"] },
  { name: "receipt --agent claude-code", flags: ["--agent", "claude-code"] },
  { name: "--json", flags: ["--json"] },
  { name: "--md", flags: ["--md", join(outDir, "report.md")] },
  // The SVG card shows totals only, never server or file names.
  { name: "--svg", flags: ["--svg", join(outDir, "card.svg")], listsServers: false },
  { name: "--budget (over)", flags: ["--budget", "0"], status: 1 },
];

describe("secrets never appear in output", () => {
  test.each(FORMATS)("$name: stdout, stderr, and written files", (format) => {
    const r = cli(project, "--home", home, ...format.flags);
    expect(r.status).toBe(format.status ?? 0);
    const written = format.flags
      .filter((f) => f.startsWith(outDir))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    const everything = r.stdout + r.stderr + written;
    expect(everything).not.toMatch(LEAK);
    // The servers are reported, just not their secrets.
    if (format.listsServers !== false) {
      expect(everything).toContain("github");
      expect(everything).toContain("remote");
    }
  });

  test("scan records", () => {
    const items = scan({ project, home, includeUser: true });
    expect(JSON.stringify(items)).not.toMatch(LEAK);
    const servers = (agent: string) =>
      items.filter((i) => i.kind === "mcp-server" && i.agent === agent).map((i) => i.name);
    expect(servers("claude-code")).toEqual([
      "github",
      "inline-env",
      "secret-path",
      "secret-command",
      "remote",
      "remote-sse",
      "env-ref",
      "user-db",
    ]);
    expect(servers("codex")).toEqual(["codex-github", "codex-remote", "codex-project"]);
    expect(servers("cursor")).toEqual(["cursor-remote", "cursor-user"]);
    expect(servers("gemini")).toEqual(["gemini-user", "gemini-http", "gemini-project"]);
  });

  test("safeServers keeps only name and transport", () => {
    const config = readJsonConfig(join(project, ".mcp.json")) as { mcpServers: unknown };
    const servers = safeServers(config.mcpServers);
    expect(JSON.stringify(servers)).not.toMatch(LEAK);
    for (const s of servers) expect(Object.keys(s).sort()).toEqual(["name", "transport"]);
  });
});

describe("~/.claude.json local scope and broken configs", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-secrets-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const tmpProject = join(tmp, "project");
  const tmpHome = join(tmp, "home");
  cpSync(project, tmpProject, { recursive: true });
  mkdirSync(join(tmpHome, ".claude"), { recursive: true });
  const userConfig = JSON.parse(readFileSync(join(home, ".claude.json"), "utf8"));
  // Claude Code keys projects by path; on Windows with forward slashes.
  userConfig.projects = {
    [tmpProject.replace(/\\/g, "/")]: {
      mcpServers: {
        "local-only": { command: "node", env: { KEY: "sk-FAKE-0000-LEAKCHECK" } },
        remote: { type: "sse", url: "https://local.example.com/?k=sk-FAKE-0000-LEAKCHECK" },
      },
      disabledMcpServers: ["remote-sse"],
    },
  };
  writeFileSync(join(tmpHome, ".claude.json"), JSON.stringify(userConfig));

  test("local scope wins, disabled servers are skipped, nothing leaks", () => {
    const items = scan({ project: tmpProject, home: tmpHome, includeUser: true }).filter(
      (i) => i.kind === "mcp-server",
    );
    expect(JSON.stringify(items)).not.toMatch(LEAK);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName["local-only"].detail).toBe("stdio");
    expect(byName.remote.detail).toBe("sse"); // local definition, not the project's http one
    expect(byName["remote-sse"]).toBeUndefined();
    expect(byName.github.scope).toBe("project"); // .mcp.json beats user scope
  });

  test("--no-user never reads ~/.claude.json", () => {
    const items = scan({ project: tmpProject, home: tmpHome, includeUser: false });
    expect(items.some((i) => i.name === "local-only" || i.name === "user-db")).toBe(false);
  });

  test("invalid JSON exits 3 with a message that does not quote the file", () => {
    const broken = join(tmp, "broken");
    mkdirSync(broken);
    writeFileSync(
      join(broken, ".mcp.json"),
      '{"mcpServers": {"x": {"env": {"KEY": "sk-FAKE-0000-LEAKCHECK"}}}, oops',
    );
    const r = cli(broken, "--no-user");
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("could not parse");
    expect(r.stdout + r.stderr).not.toMatch(LEAK);
  });

  test("invalid TOML exits 3 with a message that does not quote the file", () => {
    // smol-toml's own error message quotes the offending line.
    const broken = join(tmp, "broken-toml");
    mkdirSync(join(broken, ".codex"), { recursive: true });
    writeFileSync(join(broken, ".codex", "config.toml"), 'token = "sk-FAKE-0000-LEAKCHECK\nx =');
    const r = cli(broken, "--no-user");
    expect(r.status).toBe(3);
    expect(r.stderr).toContain("invalid TOML");
    expect(r.stdout + r.stderr).not.toMatch(LEAK);
  });
});
