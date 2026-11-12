import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { cursor, parseMdc } from "../../src/adapters/cursor.js";
import { estimateTokens } from "../../src/tokens.js";

const root = resolve("test/fixtures/cursor");
const ctx = { project: join(root, "project"), home: join(root, "home"), includeUser: true };

describe("cursor adapter", () => {
  const items = cursor.scan(ctx);
  const rules = items.filter((i) => i.kind === "rules");
  const line = (i: (typeof items)[number]) =>
    `${i.name} ${i.loading}${i.detail ? ` (${i.detail})` : ""}`;

  test("rule types load as documented; plain .md in .cursor/rules is ignored", () => {
    expect(rules.map(line)).toEqual([
      ".cursor/rules/always.mdc always",
      ".cursor/rules/frontend/components.mdc on-demand",
      ".cursor/rules/manual.mdc on-demand",
      ".cursor/rules/rpc.mdc always (description)",
      ".cursor/rules/rpc.mdc on-demand",
      "AGENTS.md always",
      ".cursorrules always (legacy, unverified)",
    ]);
  });

  test("agent-selected rules pre-load only name + description", () => {
    const desc = rules.find((i) => i.detail === "description");
    expect(desc?.tokens).toBe(estimateTokens("- rpc: RPC service conventions for the backend"));
  });

  test("mcp servers from project and user mcp.json", () => {
    expect(
      items.filter((i) => i.kind === "mcp-server").map((i) => `${i.name} ${i.detail} ${i.scope}`),
    ).toEqual(["browser stdio project", "linear http user"]);
    expect(cursor.scan({ ...ctx, includeUser: false }).some((i) => i.scope === "user")).toBe(false);
  });

  test("frontmatter with unquoted globs (invalid YAML) still parses", () => {
    const { fields, body } = parseMdc("---\nglobs: *.ts, src/**\nalwaysApply: 'true'\n---\nBody\n");
    expect(fields).toEqual({ globs: "*.ts, src/**", alwaysApply: "true" });
    expect(body).toBe("Body\n");
  });
});
