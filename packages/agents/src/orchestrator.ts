// Minimal Planner → Investigator → Reporter orchestrator. The Critic + Risk
// Gate land in a follow-up commit; this slice proves the loop and the trace.
import { Nightshift, RunTrace, Zetaris, type NightshiftMessage } from "@whytrace/adapters";
import { PLANNER_TOOL_SCHEMA, PlannerOutput, REPORTER_TOOL_SCHEMA, Report, type HypothesisT, type FindingT } from "./schema.ts";
import { listCatalogue, queryFor, type QueryName } from "./sql-catalogue.ts";

export type Case = { id: string; upn: string; expected?: string; description?: string };

const DEMO_CASES: Record<string, Case> = {
  "case-001": { id: "case-001", upn: "d.yilmaz@aegean.edu", expected: "contain", description: "Payroll phishing → mail compromise suspected" },
  "case-002": { id: "case-002", upn: "prof.kaya@aegean.edu", expected: "benign", description: "Faculty travelling abroad, device + VPN" },
  "case-003": { id: "case-003", upn: "s.demir@aegean.edu", expected: "escalate", description: "Lab-admin sign-in via a vulnerable appliance" },
};

export type OrchestratorOptions = {
  caseId: string;
  trace?: RunTrace;
  zetaris: Zetaris;
  nightshift: Nightshift;
  maxQueries?: number;
};

export async function investigate(opts: OrchestratorOptions): Promise<Report> {
  const started = Date.now();
  const trace = opts.trace ?? new RunTrace();
  const caseInfo = DEMO_CASES[opts.caseId];
  if (!caseInfo) throw new Error(`Unknown case: ${opts.caseId}`);
  const catalogueDesc = listCatalogue().map((c) => `${c.name}(${c.params.join(",")}): ${c.description}`).join("\n");

  trace.emit({ agent: "orchestrator", action: "start", input_summary: `${caseInfo.id} / ${caseInfo.upn}`, status: "ok" });

  // ---- Planner (deep lane, tool call)
  const plannerSystem = `You are a university SOC planner. Produce <= 5 hypotheses and <= 10 named-query steps.
Catalogue (name + params you may pass):
${catalogueDesc}
Only use these query names. Keep step params minimal (upn, device_id, appliance_id, department).
Return via submit_plan.`;
  const plannerUser = `Case ${caseInfo.id} — alert for ${caseInfo.upn} (${caseInfo.description ?? ""}).
Produce hypotheses, then steps to confirm or refute each. Reserve one step for DQ checks on VPN sessions when relevant.`;

  const planCall = await opts.nightshift.callTool({
    messages: [
      { role: "system", content: plannerSystem },
      { role: "user", content: plannerUser },
    ],
    toolName: "submit_plan",
    description: "Submit the investigation plan for this alert.",
    schema: PLANNER_TOOL_SCHEMA,
    lane: "deep",
    maxTokens: 2000,
    agent: "planner",
    parse: (args) => PlannerOutput.parse(args),
  });
  trace.emit({ agent: "planner", action: "plan", routed_model: planCall.model, receipt_id: planCall.receipt?.receipt_id, lane: "deep", input_summary: `${planCall.value.hypotheses.length} hypotheses, ${planCall.value.steps.length} steps`, status: "ok" });

  // ---- Investigator: run each step through Zetaris
  const findings: FindingT[] = [];
  const timeline: Array<{ ts: string; event: string; sql_id: string }> = [];
  const dq: Report["dq"] = [];
  const maxQueries = opts.maxQueries ?? 25;
  let queryCount = 0;
  for (const step of planCall.value.steps) {
    if (queryCount >= maxQueries) break;
    const qname = step.query_name as QueryName;
    let entry;
    try {
      entry = queryFor(qname, step.params);
    } catch {
      trace.emit({ agent: "investigator", action: "query_unknown", input_summary: `unknown query_name=${step.query_name}`, status: "degraded" });
      continue;
    }
    try {
      const result = await opts.zetaris.runSql(entry.sql, { limit: 200 });
      queryCount += 1;
      trace.emit({ agent: "investigator", action: "execute_step", sql_id: result.sql_id, rows: result.rows.length, input_summary: `${qname}(${JSON.stringify(step.params)})`, status: "ok" });
      // Simple finding derivation per query type
      const derived = deriveFindings(qname, step, result.rows, result.sql_id);
      findings.push(...derived);
      // Timeline hints
      for (const row of result.rows.slice(0, 5)) {
        if (row.ts && typeof row.ts === "string") {
          const label = qname === "signins_for" ? `${row.result ?? "signin"} ${row.app ?? ""} from ${row.asn_org ?? "?"} (${row.country ?? "?"})` : qname === "mail_chain" ? `mail/${row.kind ?? "?"} ${row.sender_domain ?? row.detail ?? ""}` : qname;
          timeline.push({ ts: String(row.ts), event: label.slice(0, 120), sql_id: result.sql_id });
        }
      }
    } catch (err) {
      trace.emit({ agent: "investigator", action: "execute_step", input_summary: `${qname} failed`, status: "error", output_summary: (err as Error).message });
    }
  }

  // Capture Zetaris DQ for signin_event + vpn_session (built-in rules) via RUN DQ reports if available.
  try {
    const sql = `RUN DQ TABLE lightning.metastore.whytrace.security_usl.signin_event`;
    const r = await opts.zetaris.runSql(sql, { limit: 50 });
    for (const row of r.rows) {
      dq.push({ table: String(row.table ?? "signin_event"), rule: String(row.name ?? row.type ?? "?"), valid: Number(row.valid_record ?? 0), invalid: Number(row.invalid_record ?? 0) });
    }
    trace.emit({ agent: "investigator", action: "dq_check", sql_id: r.sql_id, rows: r.rows.length, status: "ok" });
  } catch (err) {
    trace.emit({ agent: "investigator", action: "dq_check", status: "degraded", output_summary: (err as Error).message });
  }

  timeline.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  // ---- Reporter (deep lane, tool call)
  const findingsSummary = findings.length ? findings.map((f) => `[${f.status}] ${f.claim}`).join("\n") : "(no findings yet)";
  const dqSummary = dq.length ? dq.map((d) => `${d.table}/${d.rule}: valid=${d.valid}, invalid=${d.invalid}`).join("\n") : "(no DQ data)";
  const reportCall = await opts.nightshift.callTool({
    messages: [
      { role: "system", content: `You are an incident reporter. Weigh the findings and DQ results and return a verdict (contain|monitor|benign|escalate) with recommended analyst actions. Keep summary < 180 words.` },
      { role: "user", content: `Case ${caseInfo.id}\nFindings:\n${findingsSummary}\n\nDQ:\n${dqSummary}` },
    ],
    toolName: "submit_report",
    description: "Submit the analyst-ready verdict.",
    schema: REPORTER_TOOL_SCHEMA,
    lane: "deep",
    maxTokens: 2000,
    agent: "reporter",
    parse: (args) => args as { verdict: string; confidence: number; summary: string; actions?: Array<{ action: string; attack?: string[] }>; limitations?: string[]; not_checked?: string[] },
  });
  trace.emit({ agent: "reporter", action: "report", routed_model: reportCall.model, receipt_id: reportCall.receipt?.receipt_id, lane: "deep", status: "ok" });

  const toArr = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];
  const report = Report.parse({
    run_id: trace.run_id,
    case_id: caseInfo.id,
    verdict: reportCall.value.verdict,
    confidence: reportCall.value.confidence,
    summary: reportCall.value.summary,
    timeline,
    findings,
    rejected_claims: [],
    actions: (reportCall.value.actions ?? []).map((a) => ({ action: a.action, attack: toArr(a.attack), requires_approval: true as const })),
    limitations: toArr(reportCall.value.limitations),
    not_checked: toArr(reportCall.value.not_checked),
    dq,
    memory_used: [],
    models: [
      { agent: "planner", routed_model: planCall.model, receipt_id: planCall.receipt?.receipt_id },
      { agent: "reporter", routed_model: reportCall.model, receipt_id: reportCall.receipt?.receipt_id },
    ],
    trace_id: trace.run_id,
    log_file: trace.files().trace,
    execution_time_seconds: Math.max(0, (Date.now() - started) / 1000),
  });
  trace.emit({ agent: "orchestrator", action: "complete", output_summary: `${report.verdict} @ ${report.confidence.toFixed(2)}`, status: "ok" });
  return report;
}

export function listDemoCases(): Case[] { return Object.values(DEMO_CASES); }

function deriveFindings(name: QueryName, step: { hypothesis_id: string; why: string }, rows: Array<Record<string, string | number | null>>, sql_id: string): FindingT[] {
  if (!rows.length) return [];
  const base = (claim: string, status: FindingT["status"], confidence: number, attack: string[] = []): FindingT => ({
    id: `F-${Math.random().toString(36).slice(2, 8)}`,
    hypothesis_id: step.hypothesis_id,
    claim,
    status,
    sql_ids: [sql_id],
    row_refs: rows.slice(0, 3).map((_, idx) => `${sql_id}#${idx}`),
    attack,
    confidence,
  });

  switch (name) {
    case "mfa_fatigue": {
      const denies = rows.filter((r) => r.result === "mfa_denied").length;
      const approvals = rows.filter((r) => r.result === "mfa_approved").length;
      if (denies >= 5 && approvals >= 1) {
        return [base(`MFA fatigue pattern: ${denies} denies followed by ${approvals} approve(s)`, "CONFIRMED", 0.9, ["T1621"])];
      }
      return [];
    }
    case "new_asn": {
      const asn = rows[0]?.asn_org;
      if (asn && asn !== "Turkcell" && asn !== "TTNET") {
        return [base(`Sign-ins from unfamiliar ASN ${asn} (${rows[0]?.country ?? "?"})`, "CONFIRMED", 0.8, ["T1078.004"])];
      }
      return [];
    }
    case "clicks_for":
      return [base(`User click on delivered mail — ${rows[0]?.sender_domain ?? "?"}`, "CONFIRMED", 0.85, ["T1204.001"])];
    case "mail_chain": {
      const phish = rows.find((r) => r.verdict === "phish_suspect");
      if (phish) return [base(`Phishing-suspect delivery from ${phish.sender_domain}`, "CONFIRMED", 0.85, ["T1566.002"])];
      return [];
    }
    case "rules_for":
      return [base(`Inbox forwarding rule — ${rows[0]?.detail ?? "?"}`, "CONFIRMED", 0.85, ["T1114.003"])];
    case "appliance_exposure": {
      const cve = rows.find((r) => r.cve_id);
      if (cve) return [base(`VPN appliance firmware matches KEV ${cve.cve_id} (${cve.product})`, "LIKELY", 0.7, ["T1133", "T1190"])];
      return [];
    }
    case "signin_count_by_country":
      return rows[0] && rows[0].country !== "TR" ? [base(`Majority of sign-ins from ${rows[0].country} (${rows[0].n} events)`, "LIKELY", 0.6)] : [];
    case "signins_for": {
      const sisBulk = rows.filter((r) => r.app === "sis" && r.result === "success").length;
      if (sisBulk >= 10) return [base(`Bulk SIS access: ${sisBulk} successful events`, "CONFIRMED", 0.85, ["T1213"])];
      return [];
    }
    default:
      return [];
  }
}
