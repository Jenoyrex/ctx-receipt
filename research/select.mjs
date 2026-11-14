// Picks the repositories for the findings dataset, mechanically.
//
// Pool: the 1,000 most-starred public GitHub repositories that are not archived and were pushed
// in the last 60 days (GitHub search returns at most 1,000 results).
// Filter: the default branch has at least one agent context file (PATHS below), checked through
// the GitHub GraphQL API, without cloning anything. Forks are skipped.
// Sample: the 50 most-starred that pass.
//
// Usage: node research/select.mjs            (needs the GitHub CLI, signed in)
// Writes research/selection-<date>.json.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const SAMPLE = 50;
const PATHS = [
  "AGENTS.md",
  "CLAUDE.md",
  ".claude/CLAUDE.md",
  "CLAUDE.local.md",
  "GEMINI.md",
  ".cursorrules",
  ".cursor/rules",
  ".claude/rules",
  ".claude/skills",
  ".claude/agents",
  ".agents/skills",
  ".gemini/skills",
];

// GitHub answers big GraphQL requests with 502 now and then: retry a few times, then give up.
const gh = (args) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return execFileSync("gh", args, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      if (attempt >= 4) throw err;
      execFileSync(process.execPath, ["-e", `setTimeout(() => {}, ${attempt * 3000})`]);
    }
  }
};
const today = new Date();
const date = today.toISOString().slice(0, 10);
const since = new Date(today.getTime() - 60 * 24 * 3600 * 1000).toISOString().slice(0, 10);
const query = `stars:>1000 archived:false pushed:>=${since}`;

// 1. The pool, most-starred first.
const pool = [];
for (let page = 1; page <= 10; page++) {
  const res = JSON.parse(
    gh([
      "api",
      "-X",
      "GET",
      "search/repositories",
      "-f",
      `q=${query}`,
      "-f",
      "sort=stars",
      "-f",
      "order=desc",
      "-f",
      "per_page=100",
      "-f",
      `page=${page}`,
    ]),
  );
  for (const r of res.items) {
    pool.push({ repo: r.full_name, stars: r.stargazers_count, fork: r.fork });
  }
  if (res.items.length < 100) break;
}

// 2. Which agent files each repository's default branch has.
const found = new Map();
for (let i = 0; i < pool.length; i += 10) {
  const batch = pool.slice(i, i + 10);
  const fields = batch
    .map((r, k) => {
      const [owner, name] = r.repo.split("/");
      const paths = PATHS.map((p, j) => `p${j}: object(expression: "HEAD:${p}") { __typename }`);
      return `r${k}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${paths.join(" ")} }`;
    })
    .join("\n");
  const data = JSON.parse(gh(["api", "graphql", "-f", `query={ ${fields} }`])).data;
  batch.forEach((r, k) => {
    const node = data[`r${k}`];
    const files = node ? PATHS.filter((_, j) => node[`p${j}`]) : [];
    found.set(r.repo, files);
  });
}

// 3. The sample.
const eligible = pool
  .filter((r) => !r.fork && (found.get(r.repo) ?? []).length > 0)
  .map((r) => ({ ...r, agentFiles: found.get(r.repo) }));
const selected = eligible.slice(0, SAMPLE);

const out = {
  date,
  method: {
    pool: `GitHub search "${query}", sorted by stars, first 1,000 results`,
    filter: `default branch has at least one of: ${PATHS.join(", ")}; forks excluded`,
    sample: `the ${SAMPLE} most-starred repositories that pass the filter`,
  },
  poolSize: pool.length,
  eligibleCount: eligible.length,
  selected,
};
const file = `research/selection-${date}.json`;
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(
  `pool ${pool.length}, with agent files ${eligible.length}, selected ${selected.length} -> ${file}`,
);
