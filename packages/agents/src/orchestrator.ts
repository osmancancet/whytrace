// Orchestrator: Plan → Investigate → Critic (≤ 3 rounds, Planner revises on
// needs_more / rejections) → scoped DQ → Risk Gate → Reporter → validateReport.
// Hard caps: 25 SQL calls, 30 model calls, 8 min wall clock.
// Models choose and narrate; code derives findings, checks them, enforces the
// evidence contract and guards the verdict.
import { join } from "node:path";
import { RunTrace, type Nightshift, type Zetaris } from "@whytrace/adapters";
import { PLANNER_TOOL_SCHEMA, PlannerOutput, RISK_TOOL_SCHEMA, Report, Verdict, type CriticVerdictT, type FindingT, type PlannerStep, type VerdictT } from "./schema.ts";
import { listCatalogue, queryFor, type QueryName } from "./sql-catalogue.ts";
import { FindingIds, deriveFindings, type Row } from "./investigator.ts";
import { critique, rubric } from "./critic.ts";
import { appliancesFromRows, applyDqPenalty, runScopedDq, type DqResult } from "./dq.ts";
import { gate, policy } from "./risk-gate.ts";
import { readQueryLog, validateReport, type QueryLogRecord } from "./validate.ts";
import { CaseMemory } from "./memory.ts";
import { EvidenceGraph } from "./evidence-graph.ts";

export type Case = { id: string; upn: string; expected?: VerdictT; description?: string };

const DEMO_CASES: Record<string, Case> = {
  "case-001": { id: "case-001", upn: "d.yilmaz@aegean.edu", expected: "contain", description: "Payroll phishing → mail compromise suspected" },
  "case-002": { id: "case-002", upn: "prof.kaya@aegean.edu", expected: "benign", description: "Faculty travelling abroad, device + VPN" },
  "case-003": { id: "case-003", upn: "s.demir@aegean.edu", expected: "escalate", description: "Lab-admin sign-in via a vulnerable appliance" },
  "case-004": { id: "case-004", upn: "m.aslan@aegean.edu", expected: "contain", description: "Many failed sign-ins across accounts, then one success" },
  "case-005": { id: "case-005", upn: "e.oz@aegean.edu", expected: "benign", description: "New inbox forwarding rule reported" },
  "case-006": { id: "case-006", upn: "b.cetin@aegean.edu", expected: "monitor", description: "Sign-in from a new device" },
};

export const LIMITS = { sql: 25, model: 30, wallMs: 8 * 60_000, rounds: 3 };

export type ZetarisLike = Pick<Zetaris, "runSql">;
export type NightshiftLike = Pick<Nightshift, "callTool">;

export type OrchestratorOptions = {
  caseId: string;
  caseInfo?: Case;
  trace?: RunTrace;
  zetaris: ZetarisLike;
  nightshift: NightshiftLike;
  memory?: CaseMemory | null;
  maxQueries?: number;
  now?: () => number;
  /** Ablations for npm run eval. */
  ablate?: { critic?: boolean; dq?: boolean; memory?: boolean };
};

const REPORT_NOTE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    actions: { type: "array", items: { type: "object", properties: { action: { type: "string" }, attack: { type: "array", items: { type: "string" } } }, required: ["action"] } },
    limitations: { type: "array", items: { type: "string" } },
    not_checked: { type: "array", items: { type: "string" } },
  },
  required: ["summary"],
} as const;

class Budget {
  sql = 0; model = 0;
  constructor(private readonly started: number, private readonly now: () => number, private readonly maxSql: number) {}
  canSql() { return this.sql < this.maxSql && !this.timeUp(); }
  canModel() { return this.model < LIMITS.model && !this.timeUp(); }
  timeUp() { return this.now() - this.started > LIMITS.wallMs; }
}

export function defaultSteps(upn: string): PlannerStep[] {
  return [
    { hypothesis_id: "H1", query_name: "mail_chain", params: { upn }, why: "coverage: mail gateway" },
    { hypothesis_id: "H1", query_name: "signins_for", params: { upn }, why: "coverage: identity provider" },
    { hypothesis_id: "H1", query_name: "spray_source_for", params: { upn }, why: "coverage: credential attacks behind successful sign-ins" },
  ];
}

export async function investigate(opts: OrchestratorOptions): Promise<Report> {
  const now = opts.now ?? Date.now;
  const started = now();
  const trace = opts.trace ?? new RunTrace();
  const caseInfo = opts.caseInfo ?? DEMO_CASES[opts.caseId];
  if (!caseInfo) throw new Error(`Unknown case: ${opts.caseId}`);
  const budget = new Budget(started, now, opts.maxQueries ?? LIMITS.sql);
  const ids = new FindingIds();
  const graph = new EvidenceGraph(trace.run_id, caseInfo.id, new Date(started).toISOString());
  await graph.open(caseInfo.upn);
  const memory = opts.ablate?.memory === false ? null : opts.memory ?? null;
  let degraded = false;
  let plannerSucceeded = false;
  let plannerDegradedRounds = 0;
  const models: Array<{ agent: string; routed_model: string; receipt_id?: string }> = [];

  const root = trace.emit({ agent: "orchestrator", action: "start", input_summary: `${caseInfo.id} / ${caseInfo.upn}`, status: "ok" });

  // ---- Memory recall (H-MEM)
  const recall = { context: "", ids: [] as string[], lines: [] as string[] };
  const remember = (query: string, phase: string) => {
    if (!memory) return;
    const r = memory.recall(query);
    for (let i = 0; i < r.ids.length; i++) if (!recall.ids.includes(r.ids[i]!)) { recall.ids.push(r.ids[i]!); recall.lines.push(r.lines[i]!); }
    recall.context = recall.lines.map((l) => `- ${l}`).join("\n");
    trace.emit({ agent: "memory", action: "recall", parent_id: root.step_id, input_summary: phase, output_summary: `${r.ids.length} lesson(s)`, status: "ok", memory_ids: r.ids });
  };
  remember(`${caseInfo.description ?? ""} ${caseInfo.upn}`, "alert");

  const ran = new Map<string, { name: QueryName; rows: Row[] }>(); // sql_id → rows
  const ranSql = new Set<string>();
  const allRows: Row[] = [];
  let findings: FindingT[] = [];
  const rejected: Array<{ claim: string; reason: string }> = [];
  const verdictsById = new Map<string, CriticVerdictT>();
  const checkedSources = new Set<string>();
  let feedback: string[] = [];
  let rounds = 0;

  const run = async (sql: string, agent: string, parent?: string) => {
    if (!budget.canSql()) throw new Error("SQL budget exhausted");
    budget.sql += 1;
    const r = await opts.zetaris.runSql(sql, { limit: 200 });
    trace.emit({ agent, action: "sql", parent_id: parent, sql_id: r.sql_id, rows: r.rows.length, status: "ok" });
    return r;
  };
  const criticZ = { runSql: (sql: string) => run(sql, "critic") };

  const catalogueDesc = listCatalogue().map((c) => `${c.name}(${c.params.join(",")}): ${c.description}`).join("\n");

  for (let round = 1; round <= LIMITS.rounds; round++) {
    rounds = round;
    // ---- Planner (deep lane)
    let steps: PlannerStep[] = [];
    if (budget.canModel()) {
      budget.model += 1;
      try {
        const plan = await opts.nightshift.callTool({
          messages: [
            { role: "system", content: `You are a university SOC planner. Produce <= 5 hypotheses and <= 10 named-query steps.\nCatalogue (name(params): description):\n${catalogueDesc}\nOnly use these query names. Params: upn, device_id, appliance_id, department. Return via submit_plan.${recall.context ? `\n\n[MEMORY CONTEXT]\n${recall.context}` : ""}` },
            { role: "user", content: round === 1
              ? `Case ${caseInfo.id} — alert for ${caseInfo.upn} (${caseInfo.description ?? ""}). Produce competing hypotheses (compromise vs benign explanations), then steps that could confirm OR refute each.`
              : `Round ${round}. Queries already run: ${[...new Set([...ran.values()].map((v) => v.name))].join(", ")}.\nCritic feedback:\n${feedback.join("\n") || "(none)"}\nAdd only NEW steps that resolve the open questions (e.g. device_for, vpn_sessions_for, appliance_exposure).` },
          ],
          toolName: "submit_plan", description: "Submit the investigation plan.", schema: PLANNER_TOOL_SCHEMA, lane: "deep", maxTokens: 2000, agent: "planner",
          parse: (args) => PlannerOutput.parse(args),
        });
        steps = plan.value.steps;
        plannerSucceeded = true;
        models.push({ agent: "planner", routed_model: plan.model, receipt_id: plan.receipt?.receipt_id });
        trace.emit({ agent: "planner", action: "plan", parent_id: root.step_id, routed_model: plan.model, receipt_id: plan.receipt?.receipt_id, lane: "deep", input_summary: `round ${round}`, output_summary: `${plan.value.hypotheses.map((h) => `${h.id}:${h.label}`).join(" | ").slice(0, 300)}; ${steps.length} steps`, status: "ok" });
      } catch (err) {
        plannerDegradedRounds += 1;
        trace.emit({ agent: "planner", action: "plan", parent_id: root.step_id, status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
      }
    }
    // Coverage + evidence pivots are code rules, not model whims.
    if (round === 1) for (const s of defaultSteps(caseInfo.upn)) if (!steps.some((x) => x.query_name === s.query_name)) steps.push(s);
    for (const a of appliancesFromRows(allRows)) {
      const sql = queryFor("appliance_exposure", { appliance_id: a }).sql;
      if (!ranSql.has(sql) && !steps.some((x) => x.query_name === "appliance_exposure" && x.params.appliance_id === a)) {
        steps.push({ hypothesis_id: "H-infra", query_name: "appliance_exposure", params: { appliance_id: a }, why: `pivot: sign-ins traverse appliance ${a}` });
      }
    }

    // ---- Investigator
    const newFindings: FindingT[] = [];
    for (const step of steps) {
      if (!budget.canSql()) break;
      const name = step.query_name as QueryName;
      const params = { ...step.params, upn: caseInfo.upn };
      let entry;
      try { entry = queryFor(name, params); } catch { entry = undefined; }
      if (!entry) { trace.emit({ agent: "investigator", action: "query_unknown", input_summary: String(step.query_name), status: "degraded" }); continue; }
      if (ranSql.has(entry.sql)) continue;
      ranSql.add(entry.sql);
      try {
        const r = await run(entry.sql, "investigator", root.step_id);
        ran.set(r.sql_id, { name, rows: r.rows });
        allRows.push(...r.rows);
        if (/\.signin_event\b/.test(entry.sql)) checkedSources.add("signin_event");
        if (/\.mail_event\b/.test(entry.sql)) checkedSources.add("mail_event");
        if (/\.vpn_session\b/.test(entry.sql)) checkedSources.add("vpn_session");
        if (/\.device\b/.test(entry.sql)) checkedSources.add("device");
        await graph.ingestRows(r.sql_id, name, r.rows);
        const derived = deriveFindings(name, { upn: caseInfo.upn, hypothesis_id: step.hypothesis_id, params }, r.rows, r.sql_id, ids);
        newFindings.push(...derived);
        trace.emit({ agent: "investigator", action: "execute_step", sql_id: r.sql_id, rows: r.rows.length, input_summary: `${name}(${JSON.stringify(step.params)}) — ${step.why}`.slice(0, 240), output_summary: derived.map((f) => `${f.id} ${f.claim}`).join(" | ").slice(0, 400), status: "ok" });
      } catch (err) {
        trace.emit({ agent: "investigator", action: "execute_step", input_summary: `${name} failed`, status: "error", output_summary: (err as Error).message.slice(0, 200) });
      }
    }

    // ---- Critic
    let needsMore: string[] = [];
    if (opts.ablate?.critic === false) {
      findings.push(...newFindings);
    } else {
      const c = await critique(criticZ, newFindings, verdictsById);
      for (const v of c.verdicts) {
        verdictsById.set(v.finding_id, v);
        trace.emit({ agent: "critic", action: `verdict_${v.status}`, sql_id: v.check_sql_id, input_summary: v.finding_id, output_summary: v.reason.slice(0, 300), lane: "code", status: "ok" });
      }
      findings.push(...c.approved);
      rejected.push(...c.rejected);
      needsMore = c.needsMore;
    }
    const pendingPivot = appliancesFromRows(allRows).some((a) => !ranSql.has(queryFor("appliance_exposure", { appliance_id: a }).sql));
    feedback = [...needsMore, ...rejected.map((r) => `rejected: ${r.claim} — ${r.reason}`)];
    // Second recall with what we have actually seen (signals + appliances), before the Planner revises.
    remember([...findings.map((f) => f.claim), ...rejected.map((r) => r.claim), ...appliancesFromRows(allRows)].join(" "), `round ${round} evidence`);
    if (!needsMore.length && !pendingPivot) break;
    if (budget.timeUp()) break;
  }

  // ---- Scoped DQ (drives reasoning)
  let dq: DqResult[] = [];
  let dqConflicts: string[] = [];
  const limitations: string[] = [];
  if (opts.ablate?.dq !== false) {
    try {
      dq = await runScopedDq({ runSql: (sql) => run(sql, "dq") }, caseInfo.upn, appliancesFromRows(allRows));
      const p = applyDqPenalty(findings, dq);
      findings = p.findings; limitations.push(...p.limitations); dqConflicts = p.conflicts;
      trace.emit({ agent: "dq", action: "scoped_checks", output_summary: dq.map((d) => `${d.rule}@${d.scope}: invalid=${d.invalid}`).join("; "), status: "ok" });
    } catch (err) {
      trace.emit({ agent: "dq", action: "scoped_checks", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
      limitations.push("DQ checks could not run; confidence not adjusted for data quality.");
    }
  }
  for (const f of findings) await graph.recordFinding(f, "critic");

  // Planner glitches do not mark the whole run as degraded if a later round
  // recovered and we got a plan; the fallback coverage steps always ran.
  if (!plannerSucceeded && plannerDegradedRounds > 0) degraded = true;

  // ---- Risk Gate: code policy + deep-lane opinion
  const pol = policy({ findings, rejectedCount: rejected.length, dqConflicts, degraded, checkedSources: [...checkedSources] });
  const evidenceText = findings.map((f) => `${f.id} [${f.status} ${f.confidence}] ${f.claim} {${f.attack.join(",")}}`).join("\n") || "(no surviving findings)";
  const rejectedText = rejected.map((r) => `- ${r.claim}: ${r.reason}`).join("\n") || "(none)";
  let modelOpinion: { decision: VerdictT; confidence: number; rationale: string } | undefined;
  if (budget.canModel()) {
    budget.model += 1;
    try {
      const rc = await opts.nightshift.callTool({
        messages: [
          { role: "system", content: "You are the Risk Gate of a university SOC. Decide contain | monitor | benign | escalate from the verified evidence only. contain = confirmed account takeover chain; benign = suspicious signals explained away; monitor = weak unexplained signal; escalate = exposure or conflicting/insufficient evidence needing a human. Return via submit_risk." },
          { role: "user", content: `Case ${caseInfo.id} (${caseInfo.upn}).\nVerified findings:\n${evidenceText}\n\nRejected claims:\n${rejectedText}\n\nData-quality conflicts:\n${dqConflicts.join("\n") || "(none)"}` },
        ],
        toolName: "submit_risk", description: "Submit the risk decision.", schema: RISK_TOOL_SCHEMA, lane: "deep", maxTokens: 2000, agent: "risk_gate",
        parse: (a) => ({ decision: Verdict.parse(a.decision), confidence: Math.min(1, Math.max(0, Number(a.confidence))), rationale: String(a.rationale ?? "") }),
      });
      modelOpinion = rc.value;
      models.push({ agent: "risk_gate", routed_model: rc.model, receipt_id: rc.receipt?.receipt_id });
    } catch (err) {
      degraded = true;
      trace.emit({ agent: "risk_gate", action: "model_opinion", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
    }
  }
  const g = gate(degraded && pol.decision !== "escalate" ? { ...pol, decision: "escalate", escalate_reasons: [...pol.escalate_reasons, "a model step was degraded"] } : pol, modelOpinion);
  trace.emit({ agent: "risk_gate", action: "decide", parent_id: root.step_id, output_summary: `${g.decision} @ ${g.confidence} (policy ${pol.decision}, model ${modelOpinion?.decision ?? "n/a"}) ${pol.reasons.join("; ")}`.slice(0, 400), confidence: g.confidence, status: "ok" });

  // ---- Reporter (deep lane): narrates the decided verdict, cannot change it
  let note: { summary: string; actions: Array<{ action: string; attack: string[] }>; limitations: string[]; not_checked: string[] } = {
    summary: `${g.decision.toUpperCase()}: ${pol.reasons.join("; ")}.`, actions: [], limitations: [], not_checked: [],
  };
  const toArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  if (budget.canModel()) {
    budget.model += 1;
    try {
      const rep = await opts.nightshift.callTool({
        messages: [
          { role: "system", content: `You write analyst-ready incident notes for a university SOC. The verdict is already decided by the Risk Gate: ${g.decision} (confidence ${g.confidence}). Do not change it. Summary < 150 words, cite finding ids (F1…). Actions are recommendations for the analyst, each with ATT&CK ids from the findings. List limitations and what could not be checked (e.g. travel calendar, EDR).` },
          { role: "user", content: `Case ${caseInfo.id} (${caseInfo.upn}).\nVerified findings:\n${evidenceText}\n\nRejected claims:\n${rejectedText}\n\nRisk Gate reasons: ${[...pol.reasons, ...g.escalate_reasons].join("; ")}` },
        ],
        toolName: "submit_note", description: "Submit the incident note.", schema: REPORT_NOTE_SCHEMA, lane: "deep", maxTokens: 2000, agent: "reporter",
        parse: (a) => ({ summary: String(a.summary ?? ""), actions: (Array.isArray(a.actions) ? a.actions : []).map((x: { action?: unknown; attack?: unknown }) => ({ action: String(x.action ?? ""), attack: toArr(x.attack) })).filter((x) => x.action), limitations: toArr(a.limitations), not_checked: toArr(a.not_checked) }),
      });
      note = rep.value;
      models.push({ agent: "reporter", routed_model: rep.model, receipt_id: rep.receipt?.receipt_id });
      trace.emit({ agent: "reporter", action: "report", routed_model: rep.model, receipt_id: rep.receipt?.receipt_id, lane: "deep", status: "ok" });
    } catch (err) {
      trace.emit({ agent: "reporter", action: "report", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
      limitations.push("Reporter model unavailable; summary generated from findings.");
    }
  }

  // ---- Timeline from cited rows
  const timeline: Array<{ ts: string; event: string; sql_id: string }> = [];
  for (const f of findings) {
    for (const ref of f.row_refs.slice(0, 3)) {
      const [sid, idx] = ref.split("#");
      const row = ran.get(sid!)?.rows[Number(idx)];
      if (row && typeof row.ts === "string") timeline.push({ ts: row.ts, event: `${f.id} ${f.claim}`.slice(0, 120), sql_id: sid! });
    }
  }
  timeline.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  let decision = g.decision;
  let confidence = g.confidence;
  const escalate_reasons = [...g.escalate_reasons];
  const score = rubric({ approved: findings, rejected: rejected.length, verdict: decision, confidence, actions: note.actions, conflicts: dqConflicts });
  const total = score.accuracy + score.appropriateness + score.actionability;
  if (total < 7 && decision !== "escalate") {
    escalate_reasons.push(`critic rubric ${total}/9 < 7`);
    decision = "escalate";
  }
  trace.emit({ agent: "critic", action: "rubric", output_summary: `accuracy=${score.accuracy} appropriateness=${score.appropriateness} actionability=${score.actionability}`, status: "ok" });

  const draft = Report.parse({
    run_id: trace.run_id,
    case_id: caseInfo.id,
    verdict: decision,
    confidence,
    summary: note.summary,
    timeline,
    findings,
    rejected_claims: rejected,
    actions: note.actions.map((a) => ({ ...a, requires_approval: true as const })),
    limitations: [...limitations, ...note.limitations, ...escalate_reasons.map((r) => `Escalation reason: ${r}`)],
    not_checked: note.not_checked,
    dq: dq.map((d) => ({ table: d.table, rule: d.rule, valid: d.valid, invalid: d.invalid, scope: d.scope, sql_id: d.sql_id })),
    memory_used: recall.lines,
    critic_score: score,
    critic_verdicts: [...verdictsById.values()],
    risk: { decision, policy_decision: pol.decision, model_decision: modelOpinion?.decision, confidence, rationale: modelOpinion?.rationale ?? pol.reasons.join("; "), escalate_reasons },
    rounds,
    budget: { sql_calls: budget.sql, model_calls: budget.model },
    models,
    trace_id: trace.run_id,
    log_file: trace.files().trace,
    execution_time_seconds: Math.max(0, (now() - started) / 1000),
  });

  // ---- Code-enforced evidence contract
  const log: QueryLogRecord[] = readQueryLog(trace.files().queries);
  const { report, issues } = validateReport(draft, log);
  for (const i of issues) trace.emit({ agent: "validator", action: "reject", input_summary: i.item, output_summary: i.reason, status: "degraded" });

  // ---- Memory write-back + engine logs
  if (memory) {
    memory.feedback(recall.ids, report.verdict === "escalate" ? "not_helpful" : "helpful");
    const added = memory.learn(report);
    trace.emit({ agent: "memory", action: "learn", output_summary: `${added.length} lesson(s) stored`, status: "ok" });
  }
  try { graph.writeAudit(join(trace.rootDir, "world-model-audit.jsonl")); } catch { /* best effort */ }
  trace.emit({ agent: "orchestrator", action: "complete", output_summary: `${report.verdict} @ ${report.confidence.toFixed(2)} (${rounds} round(s), ${budget.sql} SQL, ${budget.model} model calls, graph ${JSON.stringify(graph.summary())})`, status: "ok" });
  return report;
}

export function listDemoCases(): Case[] { return Object.values(DEMO_CASES); }
export function getCase(id: string): Case | undefined { return DEMO_CASES[id]; }
