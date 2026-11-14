// Writes research/FINDINGS.md from a scan file. Every number in FINDINGS.md comes from here,
// computed from the committed scan data; test/research.test.ts checks the file is up to date.
//
// Usage: node research/summarize.mjs research/scan-<date>.json
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Quantile by linear interpolation between closest ranks (the common "type 7" definition). */
export function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}

const fmt = (n) => n.toLocaleString("en-US");
const pct = (part, whole) => `${Math.round((100 * part) / whole)}%`;

export function summarize(scan) {
  const ok = scan.results.filter((r) => r.status === "ok");
  const failed = scan.results.filter((r) => r.status !== "ok");
  // What one agent session pays: the heaviest agent's always-loaded tokens in each repository.
  const heaviest = ok.map((r) => {
    const top = r.agents.reduce((a, b) => (b.alwaysLoaded > a.alwaysLoaded ? b : a), {
      id: "none",
      alwaysLoaded: 0,
    });
    return { repo: r.repo, agent: top.id, tokens: top.alwaysLoaded };
  });
  const values = heaviest.map((h) => h.tokens).sort((a, b) => a - b);
  const stats = (list) => ({
    n: list.length,
    min: list[0] ?? 0,
    p25: quantile(list, 0.25),
    median: quantile(list, 0.5),
    p75: quantile(list, 0.75),
    max: list.at(-1) ?? 0,
  });
  const perAgent = {};
  for (const id of ["claude-code", "codex", "cursor", "gemini"]) {
    const list = ok
      .map((r) => r.agents.find((a) => a.id === id)?.alwaysLoaded)
      .filter((v) => v !== undefined && v > 0)
      .sort((a, b) => a - b);
    perAgent[id] = stats(list);
  }
  const grades = {};
  for (const r of ok) grades[r.grade] = (grades[r.grade] ?? 0) + 1;
  const withSkills = ok.filter((r) => r.agents.some((a) => a.skills.count > 0)).length;
  const capped = ok.filter((r) => r.items.some((i) => i.detail === "listing cap")).length;
  const withAgentsMd = ok.filter((r) => r.agentFiles.includes("AGENTS.md")).length;
  const withClaudeMd = ok.filter((r) => r.agentFiles.includes("CLAUDE.md")).length;
  // Where the always-loaded tokens of the heaviest agent come from: rules files or skill listings.
  let fromRules = 0;
  let fromSkills = 0;
  for (const r of ok) {
    const top = heaviest.find((h) => h.repo === r.repo);
    for (const i of r.items) {
      if (i.agent !== top.agent || i.loading !== "always") continue;
      if (i.kind === "rules") fromRules += i.tokens;
      if (i.kind === "skill") fromSkills += i.tokens;
    }
  }
  // Largest single always-loaded file per repository (counted once, for the heaviest agent).
  const largestFile = ok
    .map((r) => {
      const top = heaviest.find((h) => h.repo === r.repo);
      const files = r.items.filter(
        (i) => i.agent === top.agent && i.loading === "always" && i.kind === "rules",
      );
      return files.reduce((a, b) => (b.tokens > a.tokens ? b : a), { tokens: 0 }).tokens;
    })
    .sort((a, b) => a - b);
  const top5 = [...heaviest].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
  const onDemand = ok
    .map((r) => r.agents.reduce((n, a) => Math.max(n, a.onDemand), 0))
    .sort((a, b) => a - b);

  // The top quarter (heaviest agent at or above the 75th percentile) against the rest.
  const cut = quantile(values, 0.75);
  const profile = (repos) => {
    let rules = 0;
    let skills = 0;
    const shares = [];
    const fileCounts = [];
    for (const r of repos) {
      const top = heaviest.find((h) => h.repo === r.repo);
      const mine = r.items.filter((i) => i.agent === top.agent && i.loading === "always");
      const ruleFiles = mine.filter((i) => i.kind === "rules");
      rules += ruleFiles.reduce((n, i) => n + i.tokens, 0);
      skills += mine.filter((i) => i.kind === "skill").reduce((n, i) => n + i.tokens, 0);
      const largest = ruleFiles.reduce((m, i) => Math.max(m, i.tokens), 0);
      if (top.tokens > 0) shares.push(Math.round((100 * largest) / top.tokens));
      fileCounts.push(ruleFiles.length);
    }
    return {
      n: repos.length,
      rulesShare: rules + skills ? Math.round((100 * rules) / (rules + skills)) : 0,
      withSkills: repos.filter((r) => r.agents.some((a) => a.skills.count > 0)).length,
      withClaudeMd: repos.filter((r) => r.agentFiles.includes("CLAUDE.md")).length,
      largestShare: quantile(
        shares.sort((a, b) => a - b),
        0.5,
      ),
      ruleFiles: quantile(
        fileCounts.sort((a, b) => a - b),
        0.5,
      ),
    };
  };
  const isTop = (r) => heaviest.find((h) => h.repo === r.repo).tokens >= cut;
  const topQuarter = profile(ok.filter(isTop));
  const rest = profile(ok.filter((r) => !isTop(r)));
  const symlinksResolved = ok.reduce((n, r) => n + (r.symlinksResolved ?? 0), 0);
  const reposWithSymlinks = ok.filter((r) => (r.symlinksResolved ?? 0) > 0).length;
  const symlinksOutside = ok.reduce((n, r) => n + (r.symlinksOutsideRepo ?? 0), 0);
  return {
    cut,
    topQuarter,
    rest,
    symlinksResolved,
    reposWithSymlinks,
    symlinksOutside,
    ok,
    failed,
    heaviest: stats(values),
    perAgent,
    grades,
    withSkills,
    capped,
    withAgentsMd,
    withClaudeMd,
    fromRules,
    fromSkills,
    largestFile: stats(largestFile),
    top5,
    onDemand: stats(onDemand),
  };
}

export function render(scan) {
  const s = summarize(scan);
  const n = s.ok.length;
  const h = s.heaviest;
  const agentRows = Object.entries(s.perAgent)
    .filter(([, v]) => v.n > 0)
    .map(
      ([id, v]) =>
        `| ${id} | ${v.n} | ${fmt(v.p25)} | ${fmt(v.median)} | ${fmt(v.p75)} | ${fmt(v.max)} |`,
    )
    .join("\n");
  const gradeRow = ["A", "B", "C", "D", "F"].map((g) => `${g}: ${s.grades[g] ?? 0}`).join(", ");
  const total = s.fromRules + s.fromSkills;
  const failedList = s.failed.length
    ? s.failed.map((r) => `- \`${r.repo}\`: ${r.status}`).join("\n")
    : "- none";
  return `# Findings: what popular repositories pre-load into AI coding agents

Generated by \`research/summarize.mjs\` from \`research/scan-${scan.date}.json\`. Every number
below is computed from that file; \`test/research.test.ts\` fails if this page and the data
disagree. All token counts are **estimates** (o200k_base via gpt-tokenizer, ctx-receipt
${scan.ctxReceiptVersion}); Claude's own tokenizer counted about 1.6 times as many on the same
text in our comparison with Claude Code's \`/context\`.

## Method

- **Pool:** ${scan.selection.pool} (${fmt(scan.poolSize)} repositories).
- **Filter:** ${scan.selection.filter}. ${fmt(scan.eligibleCount)} of the ${fmt(scan.poolSize)}
  (${pct(scan.eligibleCount, scan.poolSize)}) passed.
- **Sample:** ${scan.selection.sample}, on ${scan.date}.
- **Measurement:** \`${scan.command}\` on a shallow, sparse clone of each default branch (top-level
  files, the agent folders, and files named by \`@\` imports). Project files only: no home-folder
  configuration, no MCP servers started.
- **Measured:** ${n} of ${scan.results.length} repositories. Not measured:

${failedList}

## Headline

For each repository we take the agent that pre-loads the most, since that is what one session
pays before the first prompt.

| n | min | 25th percentile | median | 75th percentile | max |
| ---: | ---: | ---: | ---: | ---: | ---: |
| ${h.n} | ${fmt(h.min)} | ${fmt(h.p25)} | ${fmt(h.median)} | ${fmt(h.p75)} | ${fmt(h.max)} |

The median repository asks its heaviest agent to pre-load **${fmt(h.median)} tokens**; half of
the repositories fall between ${fmt(h.p25)} and ${fmt(h.p75)}.

Grades (ctx-receipt's own cut-offs, A under 5k): ${gradeRow}.

## By agent

Repositories where that agent pre-loads anything, from project files alone:

| Agent | n | 25th percentile | median | 75th percentile | max |
| --- | ---: | ---: | ---: | ---: | ---: |
${agentRows}

\`AGENTS.md\` is read by Codex CLI and Cursor, and by Claude Code when a project has no
\`CLAUDE.md\`, so one file often shows up for three agents.

## Where the tokens come from

- **Rules files and skills.** Of the always-loaded tokens of each repository's heaviest agent,
  ${pct(s.fromRules, total)} come from rules files (AGENTS.md, CLAUDE.md, and their imports) and
  ${pct(s.fromSkills, total)} from skill listings.
- **The largest single file.** The largest always-loaded file per repository has a median of
  ${fmt(s.largestFile.median)} tokens and a maximum of ${fmt(s.largestFile.max)}.
- **Skills.** ${s.withSkills} of ${n} repositories ship skills; in ${s.capped} of them the skill
  listing reaches an agent's listing cap at the default 200k window, so the agent trims
  descriptions.
- **Formats.** ${s.withAgentsMd} of ${n} have \`AGENTS.md\` at the root; ${s.withClaudeMd} have
  \`CLAUDE.md\`.
- **On demand.** Content that loads only when used (skill bodies, path-scoped rules), for each
  repository's largest agent: median ${fmt(s.onDemand.median)}, 75th percentile
  ${fmt(s.onDemand.p75)}, max ${fmt(s.onDemand.max)} tokens.

## The top quarter against the rest

The top quarter is the ${s.topQuarter.n} repositories whose heaviest agent pre-loads
${fmt(s.cut)} tokens or more (the 75th percentile).

| | Top quarter | The rest |
| --- | ---: | ---: |
| Repositories | ${s.topQuarter.n} | ${s.rest.n} |
| Share of always-loaded tokens from rules files | ${s.topQuarter.rulesShare}% | ${s.rest.rulesShare}% |
| Ship skills | ${s.topQuarter.withSkills} of ${s.topQuarter.n} | ${s.rest.withSkills} of ${s.rest.n} |
| Have \`CLAUDE.md\` | ${s.topQuarter.withClaudeMd} of ${s.topQuarter.n} | ${s.rest.withClaudeMd} of ${s.rest.n} |
| Always-loaded rules files (median) | ${s.topQuarter.ruleFiles} | ${s.rest.ruleFiles} |
| Largest file's share of the total (median) | ${s.topQuarter.largestShare}% | ${s.rest.largestShare}% |

The five largest, as neutral examples of the upper end:
${s.top5.map((t) => `\`${t.repo}\` (${t.agent}, ${fmt(t.tokens)})`).join(", ")}.

## Limits

- Estimates, not each agent's own count. Claude's tokenizer gave about 1.6 times our number on
  the same text.
- Project files only. Each developer's own home configuration, plugins, and MCP servers add to
  these numbers and are not included.
- Agents' own system prompts and built-in tools are not included.
- A shallow, sparse clone of the default branch at one moment; files in subfolders that load on
  demand are not counted.
- Symlinks are checked out as plain files for safety. ${s.symlinksResolved} symlinked files in
  ${s.reposWithSymlinks} repositories point inside their repository and were replaced by their
  target's content, as an agent would read them; ${s.symlinksOutside} point outside and were left
  as they are.
- The sample is popular repositories, not a random sample of all projects.

## Reproduce

\`\`\`bash
npm install && npm run build
node research/select.mjs                      # needs the GitHub CLI; picks the sample
node research/scan.mjs research/selection-${scan.date}.json
node research/summarize.mjs research/scan-${scan.date}.json
\`\`\`

Selection and scan results change as repositories change; the committed files record this run.
`;
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (runDirectly && process.argv[2]) {
  const scan = JSON.parse(readFileSync(process.argv[2], "utf8"));
  writeFileSync("research/FINDINGS.md", render(scan));
  const s = summarize(scan);
  console.log(
    `n=${s.heaviest.n} median=${s.heaviest.median} p25=${s.heaviest.p25} p75=${s.heaviest.p75} max=${s.heaviest.max}`,
  );
}
