// `npm run investigate -- case-001 [--no-memory]`
// Loads env, runs the orchestrator against a demo case, writes the report to
// output_examples/<case>-<run_id>.json and prints a human-friendly summary.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Nightshift, RunTrace, Zetaris } from "@whytrace/adapters";
import { CaseMemory, investigate, listDemoCases } from "@whytrace/agents";

function loadDotenv() {
  const path = resolvePath(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (v.startsWith("#")) v = "";
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    const h = v.indexOf(" #");
    if (h >= 0) v = v.slice(0, h).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadDotenv();
  const caseId = process.argv[2] ?? "case-001";
  if (!listDemoCases().some((c) => c.id === caseId)) {
    console.error(`Unknown case: ${caseId}. Known: ${listDemoCases().map((c) => c.id).join(", ")}`);
    process.exit(2);
  }
  const trace = new RunTrace();
  const zetaris = new Zetaris({ trace, agent: "investigator" });
  const nightshift = new Nightshift({ trace });
  console.log(`run_id = ${trace.run_id}`);
  await nightshift.warmUp();
  const memory = process.argv.includes("--no-memory") ? null : new CaseMemory({ persistDir: resolvePath(process.cwd(), "logs", "hmem") });
  const report = await investigate({ caseId, trace, zetaris, nightshift, memory });
  const outDir = resolvePath(process.cwd(), "output_examples");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolvePath(outDir, `${caseId}-${trace.run_id}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log("");
  console.log(`verdict:    ${report.verdict}  confidence=${report.confidence.toFixed(2)}  took=${report.execution_time_seconds.toFixed(1)} s`);
  console.log(`summary:    ${report.summary}`);
  if (report.actions.length) {
    console.log("actions:");
    for (const a of report.actions) console.log(`  - ${a.action}${a.attack.length ? ` [${a.attack.join(",")}]` : ""}`);
  }
  if (report.findings.length) {
    console.log("findings:");
    for (const f of report.findings) console.log(`  - [${f.status}] ${f.claim}  sql_id=${f.sql_ids.join(",")}  confidence=${f.confidence}`);
  }
  if (report.rejected_claims.length) {
    console.log("rejected claims:");
    for (const r of report.rejected_claims) console.log(`  - ${r.claim}\n      ↳ ${r.reason}`);
  }
  if (report.risk) console.log(`risk gate:  policy=${report.risk.policy_decision} model=${report.risk.model_decision ?? "n/a"} → ${report.risk.decision}${report.risk.escalate_reasons.length ? `  (${report.risk.escalate_reasons.join("; ")})` : ""}`);
  if (report.critic_score) console.log(`critic:     accuracy=${report.critic_score.accuracy} appropriateness=${report.critic_score.appropriateness} actionability=${report.critic_score.actionability}`);
  if (report.dq.some((d) => d.invalid > 0)) console.log(`dq:         ${report.dq.filter((d) => d.invalid > 0).map((d) => `${d.rule}@${d.scope} invalid=${d.invalid}`).join("; ")}`);
  if (report.memory_used.length) console.log(`memory:     ${report.memory_used.length} lesson(s) recalled`);
  console.log(`budget:     ${report.rounds} round(s), ${report.budget?.sql_calls ?? "?"} SQL, ${report.budget?.model_calls ?? "?"} model calls`);
  console.log(`report → ${outPath}`);
  console.log(`trace  → ${trace.files().trace}`);
  console.log(`queries→ ${trace.files().queries}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
