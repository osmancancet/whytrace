// `npm run eval [-- --runs 3 --cases case-001,case-002 --ablations]`
// Live evaluation against the local Zetaris USL and Nightshift (no fakes):
// verdict accuracy, false contain / false benign, confidence, rounds, SQL and
// model calls, time-to-verdict; optional ablations A1 (no Critic), A2 (no DQ),
// A3 (no memory); memory cold vs warm on case-003. Writes evidence/eval.md and
// evidence/eval_raw/<run_id>.json. Failures are reported, never hidden.
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { Nightshift, RunTrace, Zetaris } from "../packages/adapters/src/index.ts";
import { CaseMemory, investigate, listDemoCases, type Report } from "../packages/agents/src/index.ts";

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
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    const h = v.indexOf(" #");
    if (h >= 0) v = v.slice(0, h).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] ?? def : def; };
type Variant = { id: string; label: string; ablate?: { critic?: boolean; dq?: boolean; memory?: boolean } };
type Row = { variant: string; case_id: string; expected: string; run: number; verdict: string; ok: boolean; confidence: number; rounds: number; sql: number; model: number; seconds: number; rejected: number; run_id: string; error?: string };

async function one(caseId: string, v: Variant, memory: CaseMemory | null): Promise<Report> {
  const trace = new RunTrace();
  const zetaris = new Zetaris({ trace, agent: "investigator" });
  const nightshift = new Nightshift({ trace });
  return investigate({ caseId, trace, zetaris, nightshift, memory, ablate: v.ablate });
}

async function main() {
  loadDotenv();
  const runs = Number(arg("runs", "3"));
  const cases = arg("cases", listDemoCases().map((c) => c.id).join(",")).split(",");
  const variants: Variant[] = [{ id: "A0", label: "full system" }];
  if (process.argv.includes("--ablations")) variants.push({ id: "A1", label: "no Critic re-query", ablate: { critic: false } }, { id: "A2", label: "no DQ signal", ablate: { dq: false } });
  const rawDir = resolvePath("evidence", "eval_raw");
  mkdirSync(rawDir, { recursive: true });
  const rows: Row[] = [];

  for (const v of variants) for (let run = 1; run <= runs; run++) for (const caseId of cases) {
    const expected = listDemoCases().find((c) => c.id === caseId)?.expected ?? "?";
    const started = Date.now();
    try {
      // Each run gets a fresh, isolated memory so runs are independent.
      const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-eval-hmem-")) });
      const r = await one(caseId, v, memory);
      writeFileSync(join(rawDir, `${v.id}-${caseId}-${run}-${r.run_id}.json`), JSON.stringify(r, null, 2));
      rows.push({ variant: v.id, case_id: caseId, expected, run, verdict: r.verdict, ok: r.verdict === expected, confidence: r.confidence, rounds: r.rounds, sql: r.budget?.sql_calls ?? 0, model: r.budget?.model_calls ?? 0, seconds: r.execution_time_seconds, rejected: r.rejected_claims.length, run_id: r.run_id });
      console.log(`${v.id} run ${run} ${caseId}: ${r.verdict} (expected ${expected}) ${r.execution_time_seconds.toFixed(1)} s`);
    } catch (err) {
      rows.push({ variant: v.id, case_id: caseId, expected, run, verdict: "error", ok: false, confidence: 0, rounds: 0, sql: 0, model: 0, seconds: (Date.now() - started) / 1000, rejected: 0, run_id: "-", error: (err as Error).message.slice(0, 160) });
      console.log(`${v.id} run ${run} ${caseId}: ERROR ${(err as Error).message}`);
    }
  }

  // Memory cold vs warm on case-003 (A3).
  const memRows: string[] = [];
  if (cases.includes("case-003")) {
    for (const mode of ["cold", "warm"] as const) {
      const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-eval-mem-")) });
      if (mode === "warm") await one("case-002", variants[0]!, memory);
      const r = await one("case-003", variants[0]!, memory);
      memRows.push(`| ${mode} | ${r.verdict} | ${r.memory_used.length} | ${r.rounds} | ${r.budget?.sql_calls} | ${r.budget?.model_calls} | ${r.execution_time_seconds.toFixed(1)} |`);
    }
  }

  const md: string[] = [`# WhyTrace evaluation — ${new Date().toISOString()}`, "", "Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.", ""];
  for (const v of variants) {
    const rs = rows.filter((r) => r.variant === v.id);
    const acc = rs.filter((r) => r.ok).length;
    const fc = rs.filter((r) => r.verdict === "contain" && r.expected !== "contain").length;
    const fb = rs.filter((r) => r.verdict === "benign" && r.expected !== "benign").length;
    const secs = rs.map((r) => r.seconds).sort((a, b) => a - b);
    md.push(`## ${v.id} — ${v.label}`, "", `Accuracy ${acc}/${rs.length} · false contain ${fc} · false benign ${fb} · median time-to-verdict ${secs.length ? secs[Math.floor(secs.length / 2)]!.toFixed(1) : "-"} s`, "", "| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | run_id |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rs) md.push(`| ${r.case_id} | ${r.expected} | ${r.run} | ${r.verdict}${r.error ? ` (${r.error})` : ""} | ${r.ok ? "✅" : "❌"} | ${r.confidence} | ${r.rounds} | ${r.sql} | ${r.model} | ${r.seconds.toFixed(1)} | ${r.rejected} | ${r.run_id} |`);
    md.push("");
  }
  if (memRows.length) md.push("## A3 — memory cold vs warm (case-003)", "", "| memory | verdict | lessons recalled | rounds | SQL | model | s |", "|---|---|---|---|---|---|---|", ...memRows, "");
  writeFileSync(resolvePath("evidence", "eval.md"), md.join("\n"));
  console.log("\nwrote evidence/eval.md");
}

main().catch((err) => { console.error(err); process.exit(1); });
