import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Many tests spawn the CLI or MCP fixture servers; a cold Node start alone can take a second
    // or more on a busy machine. Tests assert behaviour, not speed.
    testTimeout: 15_000,
  },
});
