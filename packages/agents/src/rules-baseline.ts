// B0 rules-only baseline. An Entra-style first-stage SIEM that flags:
//   - impossible travel (two sign-ins > 500 km apart within 2 h, computed from country-city centroid distance),
//   - new ASN (not in the baseline list),
//   - ≥ 5 MFA denials in 2 h,
//   - any external email forwarding rule.
// If any contain-rule fires → contain; new ASN alone → monitor; nothing → benign.
// There is intentionally no notion of appliance exposure, DQ, or memory. This is
// how a cheaper tool would decide — and why it mishandles case-002 (impossible
// travel by distance ignores the known-device + VPN explanation → false contain)
// and case-003 (no KEV lookup → misses the escalation).
import { BASELINE_LOOKBACK_DAYS, USL, esc, queryFor } from "./sql-catalogue.ts";
import { toMs } from "./investigator.ts";
import { Report, Verdict, type VerdictT } from "./schema.ts";
import { RunTrace } from "@whytrace/adapters";

export type RulesInput = { caseId: string; upn: string; zetaris: { runSql: (sql: string, opts?: { limit?: number }) => Promise<{ sql_id: string; rows: Array<Record<string, string | number | null>> }> }; trace?: RunTrace; now?: () => number };

// Rough country centroids (deg). Used only by the rules-only baseline. Not analytic
// quality — this is why the baseline mishandles edge cases.
const CENTROIDS: Record<string, [number, number]> = {
  TR: [39.0, 35.2], DE: [51.2, 10.5], NL: [52.1, 5.3], FR: [46.2, 2.4], IT: [42.5, 12.5], ES: [40.0, -3.7], PT: [39.5, -8.0],
  US: [38.0, -97.0], GB: [54.0, -2.0], SE: [60.1, 18.6], BE: [50.5, 4.5], UA: [48.4, 31.2], RU: [61.5, 105.3], CN: [35.9, 104.2],
};

function haversineKm(a: [number, number], b: [number, number]): number {
  const [lat1, lon1] = a; const [lat2, lon2] = b;
  const R = 6371; const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function evaluateRulesOnly(input: RulesInput): Promise<Report> {
  const started = (input.now ?? Date.now)();
  const trace = input.trace ?? new RunTrace();
  trace.emit({ agent: "rules_baseline", action: "start", input_summary: `${input.caseId} / ${input.upn}`, status: "ok" });
  const signinsEntry = queryFor("signins_for", { upn: input.upn });
  const mailEntry = queryFor("mail_chain", { upn: input.upn });
  // Data-derived ASN baseline: ASNs this UPN has completed MFA from in the
  // last BASELINE_LOOKBACK_DAYS. Replaces the former hard-coded
  // BASELINE_ASNS list so no ISP / org name sits in product code.
  const baselineSql = `SELECT asn_org FROM ${USL}.signin_event WHERE upn = '${esc(input.upn)}' AND result IN ('success','mfa_approved') AND ts >= CURRENT_DATE - INTERVAL '${BASELINE_LOOKBACK_DAYS}' DAY AND asn_org IS NOT NULL GROUP BY asn_org HAVING COUNT(DISTINCT CAST(ts AS DATE)) >= 2`;
  const signinRes = await input.zetaris.runSql(signinsEntry.sql, { limit: 200 });
  const mailRes = await input.zetaris.runSql(mailEntry.sql, { limit: 200 });
  let baselineAsns = new Set<string>();
  try {
    const b = await input.zetaris.runSql(baselineSql, { limit: 200 });
    baselineAsns = new Set(b.rows.map((r) => String(r.asn_org ?? "")).filter(Boolean));
    trace.emit({ agent: "rules_baseline", action: "sql", sql_id: b.sql_id, rows: b.rows.length, status: "ok", output_summary: `baseline ASNs: ${[...baselineAsns].join(", ") || "(none)"}` });
  } catch (err) {
    trace.emit({ agent: "rules_baseline", action: "baseline_query", status: "degraded", output_summary: (err as Error).message.slice(0, 160) });
  }
  trace.emit({ agent: "rules_baseline", action: "sql", sql_id: signinRes.sql_id, rows: signinRes.rows.length, status: "ok" });
  trace.emit({ agent: "rules_baseline", action: "sql", sql_id: mailRes.sql_id, rows: mailRes.rows.length, status: "ok" });

  const signins = signinRes.rows;
  const reasons: string[] = [];
  let decision: VerdictT = "benign";

  // Rule 1: impossible travel by distance / time.
  const succ = signins.filter((r) => r.result === "success");
  for (let i = 0; i < succ.length; i++) for (let j = i + 1; j < succ.length; j++) {
    const a = succ[i]!, b = succ[j]!;
    const ca = CENTROIDS[String(a.country ?? "").toUpperCase()];
    const cb = CENTROIDS[String(b.country ?? "").toUpperCase()];
    if (!ca || !cb) continue;
    const km = haversineKm(ca, cb);
    const h = Math.abs(toMs(a.ts) - toMs(b.ts)) / 3_600_000;
    if (km > 500 && h <= 2) {
      reasons.push(`impossible travel: ${a.country} ↔ ${b.country} ~${km.toFixed(0)} km in ${h.toFixed(1)} h`);
      decision = "contain";
    }
  }

  // Rule 2: new ASN (not in the user's own data-derived baseline).
  const newAsns = new Set<string>();
  for (const r of signins) {
    const asn = String(r.asn_org ?? "");
    if (!asn) continue;
    if (!baselineAsns.has(asn)) newAsns.add(asn);
  }
  if (newAsns.size) {
    reasons.push(`sign-in from new ASN(s): ${[...newAsns].slice(0, 3).join(", ")}`);
    if (decision === "benign") decision = "monitor";
  }

  // Rule 3: ≥ 5 MFA denials in 2 h.
  const denies = signins.filter((r) => r.result === "mfa_denied").map((r) => toMs(r.ts)).filter((ms) => Number.isFinite(ms));
  denies.sort((a, b) => a - b);
  for (let i = 0; i + 4 < denies.length; i++) {
    if (denies[i + 4]! - denies[i]! <= 2 * 3_600_000) {
      reasons.push(`${denies.length} MFA denials with 5 inside 2 h window`);
      decision = "contain";
      break;
    }
  }

  // Rule 4: external email forwarding rule (anything targeting a domain not aegean.edu).
  const externalRule = mailRes.rows.find((r) => {
    if (r.kind !== "rule") return false;
    const detail = String(r.detail ?? "");
    const target = /target=([^\s]+)/.exec(detail)?.[1] ?? "";
    return target && !target.includes("aegean.edu");
  });
  if (externalRule) {
    reasons.push(`external email forwarding rule detected: ${String(externalRule.detail ?? "").slice(0, 120)}`);
    decision = "contain";
  }

  if (reasons.length === 0) reasons.push("no sign-in / mail rule triggered.");
  const confidence = decision === "contain" ? 0.8 : decision === "monitor" ? 0.6 : 0.75;
  trace.emit({ agent: "rules_baseline", action: "decide", output_summary: `${decision} @ ${confidence} :: ${reasons.join("; ")}`.slice(0, 400), confidence, status: "ok" });
  const now = (input.now ?? Date.now);
  return Report.parse({
    run_id: trace.run_id,
    case_id: input.caseId,
    verdict: Verdict.parse(decision),
    confidence,
    summary: `B0 rules-only baseline: ${decision.toUpperCase()}. ${reasons.join("; ")}`.slice(0, 1200),
    timeline: [],
    findings: [],
    rejected_claims: [],
    actions: [],
    limitations: ["Rules-only baseline: no DQ, no USL cross-source joins, no KEV lookup, no memory."],
    not_checked: ["device inventory", "VPN appliance firmware vs KEV", "cross-case memory"],
    dq: [],
    memory_used: [],
    critic_verdicts: [],
    rounds: 0,
    budget: { sql_calls: 2, model_calls: 0 },
    models: [],
    trace_id: trace.run_id,
    log_file: trace.files().trace,
    execution_time_seconds: Math.max(0, (now() - started) / 1000),
  });
}
