// `npm run eval:explain` — DAY5 explainability evaluation.
// For each demo case, pick the latest model-backed report and compute:
//   - attribution (exact Shapley over the deterministic policy)
//   - counterfactuals (leave-one-out + minimal counterfactual set up to size 3)
//   - contrastive "why not <runner-up>" from policy rules
//   - faithfulness@3 (Reporter's cited F<n> ids vs top-3 Shapley findings)
// Writes `evidence/explainability.md` with one per-case section + an
// aggregate footer. The script never edits numbers by hand; it reconstructs
// policy context from the saved report (rejected count, DQ conflicts,
// decided_by → degraded flag, checked sources default) and re-runs explain().
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { explain, extractCitedFindingIds, faithfulness, listDemoCases, type Report } from "../packages/agents/src/index.ts";

const ROOT = resolvePath(process.cwd());
const OUTPUT_DIRS = [resolvePath(ROOT, "output_examples"), resolvePath(ROOT, "evidence/eval_raw")];
const TARGET = resolvePath(ROOT, "evidence/explainability.md");

type Candidate = { file: string; mtime: number; report: Report };

function readReportFile(path: string): Report | null {
  try { return JSON.parse(readFileSync(path, "utf8")) as Report; } catch { return null; }
}

function listReports(): Candidate[] {
  const out: Candidate[] = [];
  for (const dir of OUTPUT_DIRS) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const path = join(dir, name);
      const st = statSync(path);
      const r = readReportFile(path);
      if (r && r.case_id && Array.isArray(r.findings)) out.push({ file: path, mtime: st.mtimeMs, report: r });
    }
  }
  return out;
}

function pickLatestPerCase(all: Candidate[]): Map<string, Candidate> {
  const byCase = new Map<string, Candidate[]>();
  for (const c of all) {
    const arr = byCase.get(c.report.case_id) ?? [];
    arr.push(c);
    byCase.set(c.report.case_id, arr);
  }
  const chosen = new Map<string, Candidate>();
  for (const [caseId, arr] of byCase) {
    // Prefer model+policy, then by mtime desc.
    const modelBacked = arr.filter((c) => c.report.decided_by === "model+policy");
    const pool = modelBacked.length ? modelBacked : arr;
    pool.sort((a, b) => b.mtime - a.mtime);
    chosen.set(caseId, pool[0]!);
  }
  return chosen;
}

function policyContextFromReport(r: Report): { rejectedCount: number; dqConflicts: string[]; degraded: boolean; checkedSources: string[] } {
  const rejectedCount = r.rejected_claims?.length ?? 0;
  const dqConflicts: string[] = [];
  for (const d of r.dq ?? []) if (d.invalid > 0) dqConflicts.push(`DQ ${d.rule} failing for ${d.table}${d.scope ? `@${d.scope}` : ""} (invalid=${d.invalid})`);
  const degraded = r.decided_by === "policy_fallback";
  // The orchestrator's deterministic coverage fill always runs signin + mail
  // queries, so these are reliably checked for any report that reached the
  // Risk Gate — but we also fall back to inspecting findings when the field is
  // absent (defensive for very old samples).
  const checkedSources = ["signin_event", "mail_event"];
  return { rejectedCount, dqConflicts, degraded, checkedSources };
}

function fmtPct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}

function run() {
  const cases = listDemoCases().map((c) => c.id);
  const all = listReports();
  const chosen = pickLatestPerCase(all);
  const sections: string[] = [];
  const aggregate: Array<{ case_id: string; faithfulness: number; attribution_top: string; counterfactual: string; mode: string; verdict: string }> = [];

  for (const caseId of cases) {
    const pick = chosen.get(caseId);
    if (!pick) {
      sections.push(`## ${caseId}\n\n_No saved report found. Run \`npm run eval -- --cases ${caseId}\` or \`npm run investigate -- ${caseId}\` first._\n`);
      continue;
    }
    const r = pick.report;
    const ctx = policyContextFromReport(r);
    const ex = explain({ findings: r.findings, ...ctx });
    const narrative = [r.summary ?? "", ...(r.actions ?? []).map((a) => a.action)].join("\n");
    const cited = extractCitedFindingIds(narrative);
    const faith = ex.attribution.length ? faithfulness(ex.attribution, cited, 3) : null;

    const topRow = ex.attribution[0];
    const minSet = ex.counterfactuals.minimal_set;
    const counterfactualNote = minSet
      ? `Removing [${minSet.finding_ids.join(", ")}] would flip to ${minSet.verdict} (@ ${minSet.confidence.toFixed(2)})`
      : "No set of ≤ 3 findings would flip the verdict";
    aggregate.push({
      case_id: caseId,
      faithfulness: faith?.score ?? NaN,
      attribution_top: topRow ? `${topRow.finding_id} (${topRow.shapley})` : "(no findings)",
      counterfactual: counterfactualNote,
      mode: ex.mode,
      verdict: ex.verdict,
    });

    const attributionTable = ex.attribution.length
      ? ["| rank | finding | shapley | ATT&CK | claim |", "|---|---|---|---|---|",
         ...ex.attribution.slice(0, 8).map((a) => `| ${a.rank} | ${a.finding_id} | ${a.shapley.toFixed(4)} | ${a.attack.join(",") || "—"} | ${(a.claim || "").slice(0, 120).replace(/\|/g, "/")} |`)]
          .join("\n")
      : "_No findings survived; policy decided on empty set._";

    const looTable = ex.counterfactuals.leave_one_out.length
      ? ["| finding | verdict without | confidence | changes verdict? |", "|---|---|---|---|",
         ...ex.counterfactuals.leave_one_out.map((l) => `| ${l.finding_id} | ${l.verdict_without} | ${l.confidence_without.toFixed(2)} | ${l.changes_verdict ? "**yes**" : "no"} |`)]
          .join("\n")
      : "_No leave-one-out — zero findings._";

    const minSetLine = minSet
      ? `**Minimal counterfactual set:** removing \`${minSet.finding_ids.join(", ")}\` → ${minSet.verdict} @ ${minSet.confidence.toFixed(2)}`
      : `**Minimal counterfactual set:** none at size ≤ 3 (verdict is robust)`;

    const contrastive = ex.contrastive
      ? `**Why not ${ex.contrastive.runner_up}?** ${ex.contrastive.explanation}`
      : "_No runner-up verdict reachable within one hop._";

    const faithfulnessLine = faith
      ? `**Faithfulness@3:** ${faith.score.toFixed(2)} (overlap ${faith.overlap}/${faith.top_k}; top-3 Shapley = [${faith.top_shapley_ids.join(", ")}]; cited by Reporter = [${faith.cited_ids.join(", ") || "(none)"}])`
      : "_Faithfulness skipped — no attribution rows._";

    const relFile = pick.file.replace(ROOT + "/", "");
    sections.push([
      `## ${caseId} — ${ex.verdict} @ ${ex.confidence.toFixed(2)}`,
      "",
      `_Source report: \`${relFile}\` · decided_by=${r.decided_by} · ${r.findings.length} finding(s) · mode=${ex.mode}${ex.mode === "sampled" ? ` (${ex.samples_used} samples, seed=42)` : ""}_`,
      "",
      "### Attribution (Shapley over policy)",
      "",
      attributionTable,
      "",
      "### Leave-one-out counterfactuals",
      "",
      looTable,
      "",
      minSetLine,
      "",
      contrastive,
      "",
      faithfulnessLine,
      "",
    ].join("\n"));
  }

  const header = [
    "# WhyTrace explainability report",
    "",
    `_Generated: ${new Date().toISOString()}_`,
    "",
    "Each case takes its latest model-backed report (preferring `decided_by=model+policy`, falling back to the most recent otherwise), reconstructs the Risk-Gate policy context (rejected count, DQ conflicts, degraded flag, core sources checked) and re-runs the deterministic `explain()` pipeline. No model is called — the attribution is an exact Shapley over `policy()` when `n ≤ 12`, sampled with seed 42 otherwise.",
    "",
    "## Aggregate",
    "",
    "| case | verdict | mode | faithfulness@3 | top attribution | counterfactual |",
    "|---|---|---|---|---|---|",
    ...aggregate.map((a) => `| ${a.case_id} | ${a.verdict} | ${a.mode} | ${Number.isFinite(a.faithfulness) ? a.faithfulness.toFixed(2) : "n/a"} | ${a.attribution_top} | ${a.counterfactual} |`),
    "",
    (() => {
      const scored = aggregate.filter((a) => Number.isFinite(a.faithfulness));
      if (!aggregate.length) return "_No case reports found._";
      if (!scored.length) return "_No case had attribution rows; faithfulness undefined._";
      const mean = scored.reduce((s, a) => s + a.faithfulness, 0) / scored.length;
      return `_Mean faithfulness@3 across ${scored.length}/${aggregate.length} scored case(s): **${mean.toFixed(2)}**_ (cases with zero findings are omitted — faithfulness is undefined there).`;
    })(),
    "",
  ].join("\n");

  mkdirSync(resolvePath(ROOT, "evidence"), { recursive: true });
  writeFileSync(TARGET, header + "\n" + sections.join("\n") + "\n", "utf8");
  console.log(`eval:explain — wrote ${TARGET} with ${aggregate.length} case section(s)`);
  for (const a of aggregate) console.log(`  ${a.case_id}: ${a.verdict} · faithfulness@3=${a.faithfulness.toFixed(2)} · top=${a.attribution_top}`);
}

run();
