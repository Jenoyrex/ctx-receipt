// --mcp tests. Only the fake server in test/fixtures/mcp is ever started.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { listTools, TIMEOUT_MS } from "../src/mcp/launch.js";
import { count, launchable, measureServers } from "../src/mcp/measure.js";
import { renderReceipt } from "../src/render/receipt.js";
import { scan } from "../src/scan.js";
import type { Item } from "../src/types.js";

const LEAK = /LEAKCHECK|sk-FAKE/i;
const root = resolve("test/fixtures/mcp");
const server = join(root, "fake-server.mjs");
const fixture = ["test/fixtures/mcp/project", "--home", "test/fixtures/mcp/home"];
const cli = (...args: string[]) =>
  spawnSync(process.execPath, ["dist/cli.js", ...args], { encoding: "utf8", timeout: 60_000 });

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
async function gone(pid: number) {
  for (let i = 0; i < 40 && alive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  return !alive(pid);
}

describe("--mcp on the CLI", () => {
  // One run covers every fixture server, including one that hangs for the full 10 s timeout.
  const all = cli(...fixture, "--mcp");

  test("prints only name, transport, and config file before launch", () => {
    expect(all.status).toBe(0);
    const lines = all.stderr.trim().split("\n");
    expect(lines[0]).toMatch(/^Starting 8 MCP server\(s\)/);
    expect(lines).toContain("  claude-code  echo  stdio  .mcp.json");
    expect(lines).toContain("  codex  codex-echo  stdio  ~/.codex/config.toml");
    expect(all.stderr).not.toMatch(/node|fake-server|--echo|--hang|API_KEY/);
  });

  test("nothing from env, args, server stderr, or tool descriptions leaks", () => {
    expect(all.stdout + all.stderr).not.toMatch(LEAK);
    expect(all.stderr).not.toContain("fake-server starting"); // the server's own stderr
  });

  test("reports up front and full tokens, timeouts, and start failures", () => {
    expect(all.stdout).toMatch(/mcp echo \(stdio\) +\d+\n +all schemas, if loaded +\(\d+\)/);
    expect(all.stdout).toMatch(/mcp hang \(stdio, timed out\) +\?/);
    expect(all.stdout).toMatch(/mcp missing \(stdio, failed to start\) +\?/);
    expect(all.stdout).toMatch(/mcp remote \(http\) +\?/); // remote servers stay unmeasured
  });

  test("--mcp <name> starts only that server", () => {
    const one = cli(...fixture, "--mcp", "plain");
    expect(one.status).toBe(0);
    expect(one.stderr.trim().split("\n")).toEqual([
      "Starting 1 MCP server(s) from your config to measure their tools:",
      "  claude-code  plain  stdio  .mcp.json",
    ]);
    expect(one.stdout).toMatch(/mcp plain \(stdio\) +\d+\n/);
    expect(one.stdout).toMatch(/mcp echo \(stdio\) +\?/);
  });

  test("--mcp <unknown> is a usage error", () => {
    expect(cli(...fixture, "--mcp", "nope").status).toBe(2);
  });

  test("without --mcp nothing is started", () => {
    const r = cli(...fixture);
    expect(r.stderr).toBe("");
    expect(r.stdout).toMatch(/mcp plain \(stdio\) +\?/);
  });
}, 60_000);

describe("launch: timeout and shutdown", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-mcp-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const home = join(tmp, "home");
  mkdirSync(join(home, ".claude"), { recursive: true });
  const project = join(tmp, "project");
  mkdirSync(project);
  const pid = (name: string) => join(tmp, `${name}.pid`);
  writeFileSync(
    join(project, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        ok: { command: process.execPath, args: [server, "--pidfile", pid("ok")] },
        hang: { command: process.execPath, args: [server, "--hang", "--pidfile", pid("hang")] },
      },
    }),
  );
  const ctx = { project, home, includeUser: true };
  const item = (name: string) => {
    const found = scan(ctx, ["claude-code"]).find((i) => i.name === name);
    if (!found) throw new Error(`no ${name}`);
    return found;
  };

  test("the default timeout is 10 seconds", () => {
    expect(TIMEOUT_MS).toBe(10_000);
  });

  test("a server that answers is shut down after listing", async () => {
    const result = await listTools(item("ok"), ctx);
    expect(result.ok).toBe(true);
    expect(await gone(Number(readFileSync(pid("ok"), "utf8")))).toBe(true);
  });

  test("a server that hangs and ignores SIGTERM times out and is killed", async () => {
    const started = Date.now();
    const result = await listTools(item("hang"), ctx, 500);
    expect(result).toEqual({ ok: false, reason: "timed out" });
    expect(Date.now() - started).toBeLessThan(8_000);
    expect(existsSync(pid("hang"))).toBe(true);
    expect(await gone(Number(readFileSync(pid("hang"), "utf8")))).toBe(true);
  }, 15_000);
});

describe("measure", () => {
  const fixtureCtx = {
    project: join(root, "project"),
    home: join(root, "home"),
    includeUser: true,
  };

  test("records get numbers only; tool text never reaches them", async () => {
    const items = scan(fixtureCtx);
    const targets = launchable(items).filter((i) => i.name.endsWith("echo"));
    expect(targets.map((i) => i.agent).sort()).toEqual([
      "claude-code",
      "codex",
      "cursor",
      "gemini",
    ]);
    await measureServers(targets, fixtureCtx);
    for (const t of targets) {
      expect(t.tokens).toBeGreaterThan(0);
      expect(t.fullTokens).toBeGreaterThanOrEqual(t.tokens ?? 0);
    }
    expect(JSON.stringify(items)).not.toMatch(LEAK);
  });

  const listed = {
    instructions: "Use search first.",
    serverAlwaysLoad: false,
    tools: [
      {
        name: "a",
        description: "x ".repeat(500),
        inputSchema: { type: "object" },
        alwaysLoad: false,
      },
      {
        name: "b",
        description: "y ".repeat(500),
        inputSchema: { type: "object" },
        alwaysLoad: false,
      },
    ],
  };

  test("Claude Code defers schemas by default: up front is names + instructions", () => {
    const c = count("claude-code", "srv", listed, {});
    expect(c.upFront).toBeLessThan(c.full / 10);
  });

  test("Claude Code loads schemas up front when tool search is off, auto, or alwaysLoad", () => {
    for (const env of [{ ENABLE_TOOL_SEARCH: "false" }, { ENABLE_TOOL_SEARCH: "auto:5" }]) {
      const c = count("claude-code", "srv", listed, env);
      expect(c.upFront).toBe(c.full);
    }
    const server = count("claude-code", "srv", { ...listed, serverAlwaysLoad: true }, {});
    expect(server.upFront).toBe(server.full);
    const oneTool = count(
      "claude-code",
      "srv",
      { ...listed, tools: [{ ...listed.tools[0], alwaysLoad: true }, listed.tools[1]] },
      {},
    );
    expect(oneTool.upFront).toBeGreaterThan(oneTool.full / 3);
    expect(oneTool.upFront).toBeLessThan(oneTool.full);
  });

  test("other agents load every schema up front", () => {
    for (const agent of ["codex", "cursor", "gemini"]) {
      const c = count(agent, "srv", listed, {});
      expect(c.upFront).toBe(c.full);
    }
  });

  test("only the up-front number counts toward the subtotal", () => {
    const item: Item = {
      agent: "claude-code",
      kind: "mcp-server",
      name: "x",
      path: "/x",
      scope: "project",
      loading: "always",
      tokens: 5,
      fullTokens: 50,
      detail: "stdio",
    };
    const out = renderReceipt([item], { color: false });
    expect(out).toMatch(/SUBTOTAL +5\n/);
    expect(out).toMatch(/all schemas, if loaded +\(50\)/);
  });
});
