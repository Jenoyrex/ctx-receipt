import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { codex } from "../../src/adapters/codex.js";
import { estimateTokens } from "../../src/tokens.js";

const root = resolve("test/fixtures/codex");
const ctx = { project: join(root, "project"), home: join(root, "home"), includeUser: true };

describe("codex adapter", () => {
  const items = codex.scan(ctx);
  const of = (kind: string) => items.filter((i) => i.kind === kind);

  test("rules: empty global override falls through; fallback filename is used", () => {
    expect(of("rules").map((i) => `${i.name} ${i.scope}`)).toEqual([
      "~/.codex/AGENTS.md user",
      "TEAM.md project",
    ]);
  });

  test("mcp: project layer disables a user server; enabled = false is skipped", () => {
    expect(of("mcp-server").map((i) => `${i.name} ${i.detail} ${i.scope} ${i.loading}`)).toEqual([
      "docs http user unmeasured",
      "project-db stdio project unmeasured",
    ]);
  });

  test("skills turned off in [[skills.config]] are skipped", () => {
    expect(of("skill").some((i) => i.name === "off")).toBe(false);
    expect(of("skill").some((i) => i.name === "lint")).toBe(true);
  });

  test("--no-user skips ~/.codex entirely", () => {
    const own = codex.scan({ ...ctx, includeUser: false });
    expect(own.some((i) => i.scope === "user")).toBe(false);
    // Without the user config there is no fallback name, so TEAM.md is not read.
    expect(own.some((i) => i.kind === "rules")).toBe(false);
  });
});

describe("codex AGENTS.md walk and byte budget", () => {
  const tmp = mkdtempSync(join(tmpdir(), "ctx-receipt-codex-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(tmp, path)), { recursive: true });
    writeFileSync(join(tmp, path), text);
  };
  write("repo/.git/HEAD", "ref: refs/heads/main\n");
  write("repo/AGENTS.md", "a ".repeat(15_000)); // 30,000 bytes
  write("repo/svc/AGENTS.md", "ignored because an override exists");
  write("repo/svc/AGENTS.override.md", "b ".repeat(2_000)); // 4,000 bytes, crosses 32 KiB
  write("AGENTS.md", "above the repo root, never read");

  test("walks from the repo root down, one file per dir, cutting at 32 KiB", () => {
    const items = codex.scan({
      project: join(tmp, "repo", "svc"),
      home: join(tmp, "nohome"),
      includeUser: true,
    });
    expect(items.map((i) => i.name)).toEqual(["../AGENTS.md", "AGENTS.override.md"]);
    const cut = items[1];
    expect(cut.detail).toBe("cut at project_doc_max_bytes");
    expect(cut.tokens).toBe(estimateTokens("b ".repeat(2_000).slice(0, 32 * 1024 - 30_000)));
  });
});
