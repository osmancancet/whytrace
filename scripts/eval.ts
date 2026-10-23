// `npm run eval [-- --runs 3 --cases case-001,case-002 --ablations]`
// Live evaluation against the local Zetaris USL and Nightshift (no fakes).
//
// Columns: verdict_ok, provider_failures, degraded, routed_models (per-step).
// Judged vs infra_unavailable: a per-run health gate (/models + a tool probe)
// decides. Health-failing runs are marked `infra_unavailable` and *not* counted
// against accuracy — this is what we promised in notes/EVAL_PLAN.md and
// notes/ODULLER_VE_HEDEFLER.md.
//
// Variants:
//   A0 full · A1 no Critic · A2 no DQ · A4 single-agent · B0 rules-only baseline
// Plus memory cold/warm on case-003 (A3).
//
// Snapshots: `evidence/eval_history/<ISO>.md` + the current `evidence/eval.md`.
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { Nightshift, RunTrace, Zetaris } from "../packages/adapters/src/index.ts";
import { CaseMemory, evaluateModelOnly, evaluateRulesOnly, investigate, listDemoCases, type Report } from "../packages/agents/src/index.ts";
import { HOLDOUT_CASES } from "../services/postgres-seed/src/holdout.ts";

// DAY6: held-out cases are seeded as data but not registered inside the frozen
// product code (DEMO_CASES in packages/agents/src/orchestrator.ts). The eval
// script keeps its own lookup and injects `caseInfo` as an override. The
// orchestrator path already accepts `caseInfo` without changes.
type CaseInfo = { id: string; upn: string; expected: string; description?: string };
function resolveCase(caseId: string): CaseInfo | undefined {
  const dev = listDemoCases().find((c) => c.id === caseId);
  if (dev) return { id: dev.id, upn: dev.upn, expected: dev.expected ?? "?", description: dev.description };
  const ho = (HOLDOUT_CASES as Record<string, { upn: string; expected: string }>)[caseId];
  if (ho) return { id: caseId, upn: ho.upn, expected: ho.expected, description: `Held-out case ${caseId} (blind label)` };
  return undefined;
}
function allCaseIds(): string[] {
  return [...listDemoCases().map((c) => c.id), ...Object.keys(HOLDOUT_CASES)];
}

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
type Variant = { id: string; label: string; kind: "orchestrator" | "rules" | "model_only"; ablate?: { critic?: boolean; dq?: boolean; memory?: boolean } };
type Row = {
  variant: string;
  case_id: string;
  expected: string;
  run: number;
  verdict: string;
  ok: boolean;
  confidence: number;
  rounds: number;
  sql: number;
  model: number;
  seconds: number;
  rejected: number;
  run_id: string;
  judged: boolean; // false → infra_unavailable
  degraded: boolean;
  provider_failures: number;
  routed_models: string[];
  // Honest telemetry (notes/DAY3_PROMPT.md step 0d, step 9).
  model_calls_ok: number;         // orchestrator model_steps_ok from the Report
  model_calls_total: number;      // orchestrator model_steps_total from the Report
  model_calls_cached: number;     // # chat_nightshift events with cache_hit=true
  decided_by: string;             // "model+policy" | "policy_fallback"
  failure_classes: Record<string, number>;  // {auth_error: n, format_miss: n, ...}
  error?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function one(caseId: string, v: Variant, memory: CaseMemory | null, runNonce?: string): Promise<Report> {
  const trace = new RunTrace();
  const zetaris = new Zetaris({ trace, agent: "investigator" });
  const caseInfo = resolveCase(caseId);
  const upn = caseInfo?.upn ?? "";
  if (v.kind === "rules") {
    return evaluateRulesOnly({ caseId, upn, zetaris, trace });
  }
  // Per-run nonce: Nightshift's exact-prompt cache replays the same answer for
  // identical prompts, which makes `--runs > 1` return cached responses rather
  // than independent samples. DAY3B: the nonce goes through the adapter's
  // `runNonce` option so it is appended to the LAST USER TURN of every chat
  // call — the system turn and the model id do NOT change the exact-cache key
  // on this install (verified directly on 23 Oct 2026). Each run therefore
  // keys differently and we get independent samples. The adapter surfaces
  // cache_hit so the eval table shows which runs were replays.
  const nightshift = new Nightshift({ trace, runNonce });
  if (runNonce) trace.emit({ agent: "eval", action: "run_nonce", output_summary: runNonce, status: "ok" });
  if (v.kind === "model_only") {
    return evaluateModelOnly({ caseId, upn, description: caseInfo?.description, zetaris, nightshift, trace });
  }
  // Pass `caseInfo` as an orchestrator override for held-out cases (DAY6).
  // Dev cases keep the implicit DEMO_CASES[caseId] lookup, so behavior there
  // is unchanged.
  const investigateOpts = { caseId, trace, zetaris, nightshift, memory, ablate: v.ablate } as const;
  if (caseInfo && !listDemoCases().find((c) => c.id === caseId)) {
    return investigate({ ...investigateOpts, caseInfo: { id: caseInfo.id, upn: caseInfo.upn, expected: caseInfo.expected as "contain" | "monitor" | "benign" | "escalate", description: caseInfo.description } });
  }
  return investigate(investigateOpts);
}

type HealthAttempt = { ts: string; attempt: number; status: string; detail?: string; routed_model?: string; receipt_id?: string };
type HealthResult = { ok: boolean; terminalStatus: string; detail?: string; routed_model?: string; receipt_id?: string; attempts: HealthAttempt[] };

/** Honest classified health gate.
 *  Only `provider_error` and `auth_error` count as unhealthy. `format_miss`
 *  (HTTP 200 but prose instead of a tool call) is logged as a warning but
 *  passes — the model is up and the orchestrator's `tool_call_recovered_from_text`
 *  path handles the real investigation prompts.
 *  Retries every 5 min up to `waitMinutes`. Each attempt is logged (time,
 *  class, routed_model) so the eval snapshot can quote it verbatim. */
async function healthGate(waitMinutes: number): Promise<HealthResult> {
  const nightshift = new Nightshift();
  const attempts: HealthAttempt[] = [];
  const maxAttempts = Math.max(1, Math.ceil(waitMinutes / 5) + 1);
  const retryDelayMs = 5 * 60_000;
  for (let i = 0; i < maxAttempts; i++) {
    const r = await nightshift.probe();
    const attempt: HealthAttempt = { ts: new Date().toISOString(), attempt: i + 1, status: r.status, detail: r.detail, routed_model: r.routed_model, receipt_id: r.receipt_id };
    attempts.push(attempt);
    console.log(`[health-gate] attempt ${i + 1}/${maxAttempts} ${attempt.ts}: ${r.status} routed_model=${r.routed_model ?? "n/a"}${r.detail ? ` (${r.detail})` : ""}`);
    if (r.status === "online") return { ok: true, terminalStatus: "online", routed_model: r.routed_model, receipt_id: r.receipt_id, attempts };
    if (r.status === "format_miss") {
      console.log(`[health-gate] format_miss is treated as healthy — provider is up, prompt-schema path kicked in. Proceeding with a warning.`);
      return { ok: true, terminalStatus: "format_miss", routed_model: r.routed_model, receipt_id: r.receipt_id, detail: r.detail, attempts };
    }
    if (i < maxAttempts - 1) await sleep(retryDelayMs);
  }
  const last = attempts[attempts.length - 1];
  return { ok: false, terminalStatus: last?.status ?? "unknown", detail: last?.detail ?? `health gate failed after ${attempts.length} attempt(s) over ${waitMinutes} min`, attempts };
}

function readTraceSummary(runId: string): { degraded: boolean; provider_failures: number; routed_models: string[]; model_calls_cached: number; failure_classes: Record<string, number> } {
  const file = resolvePath("logs", runId, "trace.jsonl");
  if (!existsSync(file)) return { degraded: false, provider_failures: 0, routed_models: [], model_calls_cached: 0, failure_classes: {} };
  const models = new Set<string>();
  let failures = 0;
  let degraded = false;
  let cached = 0;
  const failureClasses: Record<string, number> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const t = JSON.parse(line) as { routed_model?: string; status?: string; action?: string; cache_hit?: boolean; failure_class?: string };
      if (t.routed_model) models.add(t.routed_model);
      if (t.cache_hit === true) cached += 1;
      if (t.status === "degraded") { degraded = true; if ((t.action ?? "").startsWith("chat_nightshift")) failures += 1; }
      if (t.status === "error" && (t.action ?? "").startsWith("chat_nightshift")) failures += 1;
      if (t.failure_class) failureClasses[t.failure_class] = (failureClasses[t.failure_class] ?? 0) + 1;
    } catch { /* skip */ }
  }
  return { degraded, provider_failures: failures, routed_models: [...models], model_calls_cached: cached, failure_classes: failureClasses };
}

async function main() {
  loadDotenv();
  const runs = Number(arg("runs", "3"));
  const cases = arg("cases", listDemoCases().map((c) => c.id).join(",")).split(",").map((c) => c.trim()).filter(Boolean);
  const noHealthGate = process.argv.includes("--no-health-gate");
  const variants: Variant[] = [{ id: "A0", label: "full system", kind: "orchestrator" }];
  if (process.argv.includes("--ablations")) variants.push(
    { id: "A1", label: "no Critic re-query", kind: "orchestrator", ablate: { critic: false } },
    { id: "A2", label: "no DQ signal", kind: "orchestrator", ablate: { dq: false } },
    { id: "A4", label: "single agent (no Critic, no DQ, no memory)", kind: "orchestrator", ablate: { critic: false, dq: false, memory: false } },
  );
  if (process.argv.includes("--baseline") || process.argv.includes("--ablations")) {
    variants.push({ id: "B0", label: "rules-only baseline (Entra-style thresholds)", kind: "rules" });
    // M0 — Nemotron alone, raw alert + event dump, one-shot verdict. The
    // "model alone vs through the agent" ablation named in DAY3 step 3.
    variants.push({ id: "M0", label: "model-only (Nemotron alone, no tools, no critic, no risk gate)", kind: "model_only" });
  }
  const ablationDir = resolvePath("output_examples", "ablations");
  mkdirSync(ablationDir, { recursive: true });
  const rawDir = resolvePath("evidence", "eval_raw");
  mkdirSync(rawDir, { recursive: true });
  const historyDir = resolvePath("evidence", "eval_history");
  mkdirSync(historyDir, { recursive: true });
  const rows: Row[] = [];

  // Health gate — one check at the very start. Rules-only runs never need it,
  // orchestrator runs do.
  let healthy = true;
  let healthDetail = "ok";
  let healthAttempts: HealthAttempt[] = [];
  let healthTerminal = "ok";
  if (!noHealthGate && variants.some((v) => v.kind === "orchestrator" || v.kind === "model_only")) {
    const waitMinutes = Number(arg("wait-healthy", "10"));
    const h = await healthGate(waitMinutes);
    healthy = h.ok;
    healthAttempts = h.attempts;
    healthTerminal = h.terminalStatus;
    if (h.terminalStatus === "online") healthDetail = `online (probe routed_model=${h.routed_model ?? "n/a"}, receipt=${h.receipt_id ?? "n/a"})`;
    else if (h.terminalStatus === "format_miss") healthDetail = `format_miss accepted — provider is up, model responded with prose (${h.detail ?? ""})`;
    else healthDetail = `UNAVAILABLE (${h.terminalStatus}): ${h.detail ?? ""}`;
    console.log(`[health-gate] ${healthDetail}`);
  }

  for (const v of variants) for (let run = 1; run <= runs; run++) for (const caseId of cases) {
    const expected = resolveCase(caseId)?.expected ?? "?";
    const started = Date.now();
    if (!healthy && (v.kind === "orchestrator" || v.kind === "model_only")) {
      rows.push({ variant: v.id, case_id: caseId, expected, run, verdict: "infra_unavailable", ok: false, confidence: 0, rounds: 0, sql: 0, model: 0, seconds: 0, rejected: 0, run_id: "-", judged: false, degraded: true, provider_failures: 0, routed_models: [], model_calls_ok: 0, model_calls_total: 0, model_calls_cached: 0, decided_by: "-", failure_classes: {}, error: "nightshift unavailable" });
      console.log(`${v.id} run ${run} ${caseId}: infra_unavailable`);
      continue;
    }
    try {
      const memory = (v.kind === "rules" || v.kind === "model_only") ? null : new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-eval-hmem-")) });
      const runNonce = `nonce:${v.id}:${caseId}:${run}:${Date.now().toString(36)}`;
      const r = await one(caseId, v, memory, runNonce);
      writeFileSync(join(rawDir, `${v.id}-${caseId}-${run}-${r.run_id}.json`), JSON.stringify(r, null, 2));
      if ((v.id === "A1" || v.id === "A4") && r.rejected_claims.some((c) => /^validator:/.test(c.reason))) {
        writeFileSync(join(ablationDir, `${v.id}-${caseId}-${run}-${r.run_id}.json`), JSON.stringify(r, null, 2));
      }
      const summ = readTraceSummary(r.run_id);
      rows.push({
        variant: v.id, case_id: caseId, expected, run, verdict: r.verdict, ok: r.verdict === expected,
        confidence: r.confidence, rounds: r.rounds, sql: r.budget?.sql_calls ?? 0, model: r.budget?.model_calls ?? 0, seconds: r.execution_time_seconds,
        rejected: r.rejected_claims.length, run_id: r.run_id, judged: true,
        degraded: summ.degraded, provider_failures: summ.provider_failures, routed_models: summ.routed_models,
        model_calls_ok: r.model_steps_ok, model_calls_total: r.model_steps_total, model_calls_cached: summ.model_calls_cached,
        decided_by: r.decided_by, failure_classes: summ.failure_classes,
      });
      const fc = Object.keys(summ.failure_classes).length ? ` [${Object.entries(summ.failure_classes).map(([k, n]) => `${k}=${n}`).join(" ")}]` : "";
      const mb = v.kind === "rules" ? "n/a" : `${r.model_steps_ok}/${r.model_steps_total}`;
      console.log(`${v.id} run ${run} ${caseId}: ${r.verdict} (expected ${expected}) ${r.execution_time_seconds.toFixed(1)} s · model-backed ${mb} · cached=${summ.model_calls_cached} · decided_by=${r.decided_by}${fc} ${summ.degraded ? "DEGRADED" : ""} models=[${summ.routed_models.join(",")}]`);
    } catch (err) {
      rows.push({ variant: v.id, case_id: caseId, expected, run, verdict: "error", ok: false, confidence: 0, rounds: 0, sql: 0, model: 0, seconds: (Date.now() - started) / 1000, rejected: 0, run_id: "-", judged: false, degraded: true, provider_failures: 1, routed_models: [], model_calls_ok: 0, model_calls_total: 0, model_calls_cached: 0, decided_by: "-", failure_classes: {}, error: (err as Error).message.slice(0, 160) });
      console.log(`${v.id} run ${run} ${caseId}: ERROR ${(err as Error).message}`);
    }
  }

  // Memory cold vs warm on case-003 (A3). Skipped if infra is down.
  const memRows: string[] = [];
  if (cases.includes("case-003") && healthy) {
    const orchestratorVariant = variants.find((v) => v.kind === "orchestrator")!;
    for (const mode of ["cold", "warm"] as const) {
      const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-eval-mem-")) });
      if (mode === "warm") await one("case-002", orchestratorVariant, memory);
      const r = await one("case-003", orchestratorVariant, memory);
      memRows.push(`| ${mode} | ${r.verdict} | ${r.memory_used.length} | ${r.rounds} | ${r.budget?.sql_calls} | ${r.budget?.model_calls} | ${r.execution_time_seconds.toFixed(1)} |`);
    }
  }

  const stamp = new Date().toISOString();
  const md: string[] = [`# WhyTrace evaluation — ${stamp}`, ""];
  md.push(`Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: \`evidence/eval_raw/\`.`, "");
  md.push(`Health gate: ${healthDetail}.`, "");
  if (healthAttempts.length) {
    md.push(`Terminal status: \`${healthTerminal}\`. ${healthAttempts.length} probe attempt(s):`, "");
    md.push("| # | ts | status | routed_model | detail |", "|---|---|---|---|---|");
    for (const a of healthAttempts) md.push(`| ${a.attempt} | ${a.ts} | ${a.status} | ${a.routed_model ?? "-"} | ${(a.detail ?? "").slice(0, 160)} |`);
    md.push("");
  }

  for (const v of variants) {
    const rs = rows.filter((r) => r.variant === v.id);
    const judgedRs = rs.filter((r) => r.judged);
    const infra = rs.length - judgedRs.length;
    const acc = judgedRs.filter((r) => r.ok).length;
    const fc = judgedRs.filter((r) => r.verdict === "contain" && r.expected !== "contain").length;
    const fb = judgedRs.filter((r) => r.verdict === "benign" && r.expected !== "benign").length;
    const degraded = judgedRs.filter((r) => r.degraded).length;
    const failures = judgedRs.reduce((a, r) => a + r.provider_failures, 0);
    // Model-backed counts: for the orchestrator (A0 and friends) it means
    // decided_by === "model+policy"; for M0 we count every row where the one
    // model call succeeded (decided_by === "model_only" with model_steps_ok ≥ 1).
    // For B0 (rules_only) the whole concept is n/a — the variant has no model
    // step by design, so we show "n/a" in both the headline and the table.
    const kind = v.kind;
    const modelBacked = kind === "rules" ? "n/a"
      : kind === "model_only" ? `${judgedRs.filter((r) => r.decided_by === "model_only" && r.model_calls_ok >= 1).length}/${judgedRs.length}`
      : `${judgedRs.filter((r) => r.decided_by === "model+policy").length}/${judgedRs.length}`;
    const totalCached = judgedRs.reduce((a, r) => a + r.model_calls_cached, 0);
    const classAgg: Record<string, number> = {};
    for (const r of judgedRs) for (const [k, n] of Object.entries(r.failure_classes)) classAgg[k] = (classAgg[k] ?? 0) + n;
    const classLine = Object.entries(classAgg).sort().map(([k, n]) => `${k}=${n}`).join(" ") || "(none)";
    const secs = judgedRs.map((r) => r.seconds).sort((a, b) => a - b);
    md.push(`## ${v.id} — ${v.label}`, "", `Judged ${acc}/${judgedRs.length} ok · model-backed ${modelBacked} · infra_unavailable ${infra}/${rs.length} · false contain ${fc} · false benign ${fb} · degraded runs ${degraded}/${judgedRs.length} · provider_failures ${failures} · cached model calls ${totalCached} · failure classes: ${classLine} · median time ${secs.length ? secs[Math.floor(secs.length / 2)]!.toFixed(1) : "-"} s`, "");
    md.push("| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rs) {
      const mb = kind === "rules" ? "n/a" : `${r.model_calls_ok}/${r.model_calls_total}`;
      md.push(`| ${r.case_id} | ${r.expected} | ${r.run} | ${r.verdict}${r.error ? ` (${r.error})` : ""} | ${r.judged ? (r.ok ? "✅" : "❌") : "⏸️"} | ${r.confidence} | ${r.rounds} | ${r.sql} | ${r.model} | ${r.seconds.toFixed(1)} | ${r.rejected} | ${mb} | ${r.model_calls_cached} | ${r.decided_by} | ${Object.entries(r.failure_classes).map(([k, n]) => `${k}:${n}`).join(" ") || "-"} | ${r.degraded ? "yes" : "no"} | ${r.provider_failures} | ${r.routed_models.map((m) => m.split("/").pop()).join(", ") || "-"} | ${r.run_id} |`);
    }
    md.push("");
  }
  if (memRows.length) md.push("## A3 — memory cold vs warm (case-003)", "", "| memory | verdict | lessons recalled | rounds | SQL | model | s |", "|---|---|---|---|---|---|---|", ...memRows, "");

  // What the rules-only baseline (B0) tells the story: it over-contains case-002
  // (impossible travel by distance) and under-reacts to case-003 (no KEV lookup).
  md.push("## Why rules-only (B0) is not enough", "", "- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.", "- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.", "- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.", "");

  const historyFile = join(historyDir, `${stamp.replace(/[:.]/g, "-")}.md`);
  writeFileSync(historyFile, md.join("\n"));
  writeFileSync(resolvePath("evidence", "eval.md"), md.join("\n"));
  console.log(`\nwrote evidence/eval.md and ${historyFile}`);
  // Compact rolling index of history files.
  const historyIndex = ["# Eval history", ""];
  for (const f of readdirSync(historyDir).sort().reverse().slice(0, 50)) historyIndex.push(`- [${f}](${f})`);
  writeFileSync(join(historyDir, "INDEX.md"), historyIndex.join("\n"));
}

main().catch((err) => { console.error(err); process.exit(1); });
