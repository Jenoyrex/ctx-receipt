import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { gemini } from "../../src/adapters/gemini.js";
import { stripJsonComments } from "../../src/redact.js";

const root = resolve("test/fixtures/gemini");
const ctx = { project: join(root, "project"), home: join(root, "home"), includeUser: true };

describe("gemini adapter", () => {
  // Parent dirs of this checkout are also searched; keep fixture items only.
  const items = gemini.scan(ctx).filter((i) => i.path.startsWith(root));
  const of = (kind: string) => items.filter((i) => i.kind === kind);

  test("context.fileName list, global files, and @imports", () => {
    expect(of("rules").map((i) => `${i.name} ${i.scope}`)).toEqual([
      "~/.gemini/AGENTS.md user",
      "~/.gemini/GEMINI.md user",
      "AGENTS.md project",
      "GEMINI.md project",
      "@docs/style.md project",
    ]);
  });

  test("skills: precedence by name, disabled skills skipped", () => {
    const always = of("skill").filter((i) => i.loading === "always");
    expect(always.map((i) => `${i.name} ${i.scope}`)).toEqual(["proj project", "shared user"]);
    const shared = always.find((i) => i.name === "shared");
    expect(shared?.path.replaceAll("\\", "/")).toContain("/.agents/skills/"); // alias wins
  });

  test("mcp: transports, project override, mcp.excluded", () => {
    expect(of("mcp-server").map((i) => `${i.name} ${i.detail} ${i.scope}`)).toEqual([
      "search http user",
      "events sse user",
      "db sse project",
    ]);
  });

  test("--no-user reads only the project", () => {
    const own = gemini.scan({ ...ctx, includeUser: false }).filter((i) => i.path.startsWith(root));
    expect(own.some((i) => i.scope === "user")).toBe(false);
    // Without user settings the file name is the default, so AGENTS.md is not read.
    expect(own.filter((i) => i.kind === "rules").map((i) => i.name)).toEqual([
      "GEMINI.md",
      "@docs/style.md",
    ]);
  });
});

describe("gemini parent walk", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-gemini-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(tmp, path)), { recursive: true });
    writeFileSync(join(tmp, path), text);
  };
  write("repo/.git/HEAD", "x");
  write("repo/GEMINI.md", "root");
  write("repo/pkg/GEMINI.md", "pkg");
  write("GEMINI.md", "above the .git boundary");

  test("stops at the first directory with a .git marker", () => {
    const items = gemini.scan({
      project: join(tmp, "repo", "pkg"),
      home: join(tmp, "nohome"),
      includeUser: false,
    });
    expect(items.map((i) => i.name)).toEqual(["../GEMINI.md", "GEMINI.md"]);
  });
});

test("stripJsonComments keeps comment-like text inside strings", () => {
  const text = '{ "a": "http://x // y", /* c */ "b": "\\" /* not */" // tail\n}';
  expect(JSON.parse(stripJsonComments(text))).toEqual({ a: "http://x // y", b: '" /* not */' });
});
