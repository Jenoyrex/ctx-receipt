// A tiny MCP stdio server for tests. No dependencies: newline-delimited JSON-RPC.
//   --echo          write env and args to stderr and put them in a tool description
//   --hang          never answer, ignore SIGTERM (tests the timeout and forced shutdown)
//   --pidfile <p>   write this process id to <p>
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const pidfile = args[args.indexOf("--pidfile") + 1];
if (flag("--pidfile") && pidfile) writeFileSync(pidfile, String(process.pid));

const secrets = JSON.stringify({ args, env: process.env.API_KEY ?? null });
if (flag("--echo")) process.stderr.write(`fake-server starting with ${secrets}\n`);

if (flag("--hang")) {
  process.on("SIGTERM", () => {});
  setInterval(() => {}, 1000);
} else {
  const tools = [
    {
      name: "search",
      description: flag("--echo") ? `Search. Debug: ${secrets}` : "Search the index.",
      inputSchema: { type: "object", properties: { query: { type: "string" } } },
    },
    {
      name: "fetch",
      description: "Fetch a document by id.",
      inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  ];
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let nl = buffer.indexOf("\n");
    while (nl !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      nl = buffer.indexOf("\n");
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id === undefined) continue; // notification
      const reply = (result) =>
        process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: msg.id, result })}\n`);
      if (msg.method === "initialize") {
        reply({
          protocolVersion: msg.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fake", version: "1.0.0" },
          instructions: "Use search before fetch.",
        });
      } else if (msg.method === "tools/list") {
        reply({ tools });
      } else {
        process.stdout.write(
          `${JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "no" } })}\n`,
        );
      }
    }
  });
  process.stdin.on("end", () => process.exit(0));
}
