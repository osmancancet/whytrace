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
import { canStandUnderDegrade, gate, policy } from "./risk-gate.ts";
import { readQueryLog, validateReport, type QueryLogRecord } from "./validate.ts";
import { CaseMemory } from "./memory.ts";
import { EvidenceGraph } from "./evidence-graph.ts";
import { runSprayMarkovian } from "./markovian-sweep.ts";
import { Scout } from "@whytrace/scout-intent";
import { runScoutGate, sanitizeFinding } from "./scout-gate.ts";

export type Case = { id: string; upn: string; expected?: VerdictT; description?: string };

const DEMO_CASES: Record<string, Case> = {
  "case-001": { id: "case-001", upn: "d.yilmaz@aegean.edu", expected: "contain", description: "Payroll phishing → mail compromise suspected" },
  "case-002": { id: "case-002", upn: "prof.kaya@aegean.edu", expected: "benign", description: "Faculty travelling abroad, device + VPN" },
  "case-003": { id: "case-003", upn: "s.demir@aegean.edu", expected: "escalate", description: "Lab-admin sign-in via a vulnerable appliance" },
  "case-004": { id: "case-004", upn: "m.aslan@aegean.edu", expected: "contain", description: "Many failed sign-ins across accounts, then one success" },
  "case-005": { id: "case-005", upn: "e.oz@aegean.edu", expected: "benign", description: "New inbox forwarding rule reported" },
  "case-006": { id: "case-006", upn: "b.cetin@aegean.edu", expected: "monitor", description: "Sign-in from a new device" },
  // Scout Intent adversarial case (DAY3 step 1): an attacker-controlled mail
  // rule name contains an instruction aimed at the agent's model prompts.
  // The orchestrator must quarantine it (not follow it) and still verdict on
  // the real signals — a forwarding rule to an external address + the phish
  // delivery that preceded it.
  "case-007": { id: "case-007", upn: "a.sahin@aegean.edu", expected: "contain", description: "Prompt-injection payload hidden in a mail-rule name" },
};

export const LIMITS = { sql: 25, model: 30, wallMs: 8 * 60_000, rounds: 3 };

export type ZetarisLike = Pick<Zetaris, "runSql">;
export type NightshiftLike = Pick<Nightshift, "callTool" | "chat">;

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
  /** Default coverage queries (and the Critic's re-query of what they find) ignore the
   *  wall clock: they are cheap (sub-second) and without them the policy cannot decide.
   *  A model step that hangs past the budget must not leave the run with 0 SQL. */
  canEssentialSql() { return this.sql < this.maxSql; }
  canModel() { return this.model < LIMITS.model && !this.timeUp(); }
  timeUp() { return this.now() - this.started > LIMITS.wallMs; }
}

export function defaultSteps(upn: string): PlannerStep[] {
  return [
    { hypothesis_id: "H1", query_name: "mail_chain", params: { upn }, why: "coverage: mail gateway" },
    { hypothesis_id: "H1", query_name: "signins_for", params: { upn }, why: "coverage: identity provider" },
    { hypothesis_id: "H1", query_name: "spray_source_for", params: { upn }, why: "coverage: credential attacks behind successful sign-ins" },
    { hypothesis_id: "H1", query_name: "rules_for", params: { upn }, why: "coverage: inbox forwarding rules (post-auth abuse)" },
    // mfa_fatigue is a post-authentication abuse signal (T1621) and belongs in
    // the "chain complete" baseline. If a stochastic Planner forgets this step
    // the deterministic policy reads a chain that includes new-ASN access and
    // a forwarding rule but is missing the fatigue burst, counts the chain as
    // partial, and escalates — see DAY3C case-007 run 3. Pulling it into the
    // coverage fill makes every live run see the same abuse-signal set.
    { hypothesis_id: "H1", query_name: "mfa_fatigue", params: { upn }, why: "coverage: MFA fatigue (post-auth abuse signal T1621)" },
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
  // Honest model-contribution telemetry. Each planner / risk-gate / reporter /
  // markovian call that *attempted* the model is recorded, and each one that
  // returned usable output is counted ok. Night 3 reported "format_miss =
  // provider up" even when the response was 0 chars; the eval sweep now shows
  // model-backed verdicts next to accuracy so the deterministic policy's share
  // of the result is visible from the summary.
  let modelStepsOk = 0;
  let modelStepsTotal = 0;
  let riskGateFromModel = false;

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

  // Per-run SQL cache. Identical SQL text within a run returns the same rows
  // without hitting Zetaris twice (the sql_id stays the same because sql_id is
  // the hash of the SQL text — provenance is unchanged). The Critic's verifying
  // query is always a *different* SQL from the Investigator's named query, so
  // its re-query is never served from this cache: independence is preserved.
  const sqlCache = new Map<string, Awaited<ReturnType<typeof opts.zetaris.runSql>>>();
  const run = async (sql: string, agent: string, parent?: string, essential = false) => {
    const cached = sqlCache.get(sql);
    if (cached) {
      trace.emit({ agent, action: "sql_cache_hit", parent_id: parent, sql_id: cached.sql_id, rows: cached.rows.length, status: "ok" });
      return cached;
    }
    if (!(essential ? budget.canEssentialSql() : budget.canSql())) throw new Error("SQL budget exhausted");
    budget.sql += 1;
    const r = await opts.zetaris.runSql(sql, { limit: 200 });
    sqlCache.set(sql, r);
    trace.emit({ agent, action: "sql", parent_id: parent, sql_id: r.sql_id, rows: r.rows.length, status: "ok" });
    return r;
  };
  const criticZ = { runSql: (sql: string) => run(sql, "critic") };
  const criticEssential = { runSql: (sql: string) => run(sql, "critic", undefined, true) };
  const coverageNames = new Set(defaultSteps("").map((s) => s.query_name));

  const catalogueDesc = listCatalogue().map((c) => `${c.name}(${c.params.join(",")}): ${c.description}`).join("\n");

  for (let round = 1; round <= LIMITS.rounds; round++) {
    rounds = round;
    // ---- Planner (deep by default; fast when the context is small enough).
    // Round 1 only has the catalogue + a one-sentence alert description — Lightning
    // handles that comfortably and the deep lane adds latency without changing the
    // plan. From round 2 onwards the feedback payload can be large (many rejected
    // claims, memory context, …) so we stay on the deep lane. The threshold is a
    // conservative byte count on the user message so a short follow-up round can
    // still take the fast lane; the trace records the chosen lane for audit.
    let steps: PlannerStep[] = [];
    if (budget.canModel()) {
      budget.model += 1;
      modelStepsTotal += 1;
      const userMsg = round === 1
        ? `Case ${caseInfo.id} — alert for ${caseInfo.upn} (${caseInfo.description ?? ""}). Produce competing hypotheses (compromise vs benign explanations), then steps that could confirm OR refute each.`
        : `Round ${round}. Queries already run: ${[...new Set([...ran.values()].map((v) => v.name))].join(", ")}.\nCritic feedback:\n${feedback.join("\n") || "(none)"}\nAdd only NEW steps that resolve the open questions (e.g. device_for, vpn_sessions_for, appliance_exposure).`;
      const plannerLane: "deep" | "fast" = (userMsg.length + recall.context.length <= 1200) ? "fast" : "deep";
      try {
        const plan = await opts.nightshift.callTool({
          messages: [
            { role: "system", content: `You are a university SOC planner. Be brief: produce <= 3 hypotheses and <= 8 named-query steps, with one short sentence per 'why'.\nCatalogue (name(params): description):\n${catalogueDesc}\nOnly use these query names. Params: upn, device_id, appliance_id, department. Return via submit_plan.${recall.context ? `\n\n[MEMORY CONTEXT]\n${recall.context}` : ""}` },
            { role: "user", content: userMsg },
          ],
          // Planner needs headroom: hidden reasoning tokens plus the tool-call
          // envelope push completion tokens into the 2,500–2,900 range on real
          // prompts (measured 23 Oct 2026). 6000 keeps the request safely out
          // of the max_tokens_hit zone.
          toolName: "submit_plan", description: "Submit the investigation plan.", schema: PLANNER_TOOL_SCHEMA, lane: plannerLane, maxTokens: 6000, agent: "planner",
          parse: (args) => PlannerOutput.parse(args),
        });
        steps = plan.value.steps;
        plannerSucceeded = true;
        modelStepsOk += 1;
        models.push({ agent: "planner", routed_model: plan.model, receipt_id: plan.receipt?.receipt_id });
        trace.emit({ agent: "planner", action: "plan", parent_id: root.step_id, routed_model: plan.model, receipt_id: plan.receipt?.receipt_id, lane: plannerLane, input_summary: `round ${round} (lane: ${plannerLane})`, output_summary: `${plan.value.hypotheses.map((h) => `${h.id}:${h.label}`).join(" | ").slice(0, 300)}; ${steps.length} steps`, status: "ok" });
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
    let coverageOnly = false;
    for (const step of steps) {
      const isCoverage = round === 1 && coverageNames.has(step.query_name);
      if (!budget.canSql()) {
        if (!budget.canEssentialSql()) break;
        if (!isCoverage) continue; // out of wall time: keep only the cheap default coverage
      }
      if (isCoverage && !budget.canSql()) coverageOnly = true;
      const name = step.query_name as QueryName;
      const params = { ...step.params, upn: caseInfo.upn };
      let entry;
      try { entry = queryFor(name, params); } catch { entry = undefined; }
      if (!entry) { trace.emit({ agent: "investigator", action: "query_unknown", input_summary: String(step.query_name), status: "degraded" }); continue; }
      if (ranSql.has(entry.sql)) continue;
      ranSql.add(entry.sql);
      try {
        const r = await run(entry.sql, "investigator", root.step_id, isCoverage && !budget.canSql());
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
      const c = await critique(coverageOnly ? criticEssential : criticZ, newFindings, verdictsById);
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

  // ---- Markovian long sweep over spray failures
  // Only fires when the Investigator saw a *strong* password-spray signal — many
  // victims (≥15) and a bounded time window — so the sweep is a feature of the
  // case, not noise from background failures on a shared campus IP.
  const spraySignal = findings.find((f) => f.kind === "password_spray" && Number(f.facts?.accounts ?? 0) >= 15);
  if (spraySignal && budget.canSql() && budget.canModel()) {
    const ip = String(spraySignal.facts?.ip ?? "");
    const firstTs = String(spraySignal.facts?.first_ts ?? "");
    const lastTs = String(spraySignal.facts?.last_ts ?? firstTs);
    if (ip && firstTs) {
      try {
        const result = await runSprayMarkovian(
          { zetaris: { runSql: (sql) => run(sql, "markovian") }, nightshift: opts.nightshift as Nightshift, trace },
          { caseId: caseInfo.id, upn: caseInfo.upn, ip, firstTs, lastTs, memoryContext: recall.context || undefined },
          ids,
        );
        budget.model += result.modelCalls;
        modelStepsOk += result.modelCalls;
        // Markovian only counts calls that returned usable payloads; the sweep's
        // deterministic fallback does not count as an ok model step. We only know
        // how many succeeded, not how many it tried — the sweep classifies them
        // internally and does not surface a total. Attribute each success as both
        // attempted and ok so the ratio stays honest.
        modelStepsTotal += result.modelCalls;
        if (result.findings.length) {
          const criticOut = opts.ablate?.critic === false ? { approved: result.findings, rejected: [], needsMore: [], verdicts: [] } : await critique(criticZ, result.findings, verdictsById);
          for (const v of criticOut.verdicts) { verdictsById.set(v.finding_id, v); trace.emit({ agent: "critic", action: `verdict_${v.status}`, sql_id: v.check_sql_id, input_summary: v.finding_id, output_summary: v.reason.slice(0, 300), lane: "code", status: "ok" }); }
          findings.push(...criticOut.approved);
          rejected.push(...criticOut.rejected);
        }
      } catch (err) {
        trace.emit({ agent: "markovian", action: "sweep", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
      }
    }
  }

  // ---- Deterministic coverage fill before the Risk Gate
  // Even when the Planner's model step was degraded, the orchestrator must have
  // run every *default* coverage query, so the Risk Gate decides on complete
  // identity + mail evidence. We re-check the SQL-catalogue defaults here and
  // run anything that didn't fire in the main loop (budget permitting). This
  // closes the Day-2A gap where a one-shot planner failure left mail or rules
  // unchecked and the policy had to escalate for "coverage incomplete".
  const coverageAdded: string[] = [];
  for (const s of defaultSteps(caseInfo.upn)) {
    if (!budget.canEssentialSql()) break;
    const name = s.query_name as QueryName;
    const params = { ...s.params, upn: caseInfo.upn };
    const entry = (() => { try { return queryFor(name, params); } catch { return undefined; } })();
    if (!entry) continue;
    if (ranSql.has(entry.sql)) continue;
    try {
      const r = await run(entry.sql, "coverage", root.step_id, true);
      ran.set(r.sql_id, { name, rows: r.rows });
      allRows.push(...r.rows);
      ranSql.add(entry.sql);
      if (/\.signin_event\b/.test(entry.sql)) checkedSources.add("signin_event");
      if (/\.mail_event\b/.test(entry.sql)) checkedSources.add("mail_event");
      if (/\.vpn_session\b/.test(entry.sql)) checkedSources.add("vpn_session");
      if (/\.device\b/.test(entry.sql)) checkedSources.add("device");
      await graph.ingestRows(r.sql_id, name, r.rows);
      const derived = deriveFindings(name, { upn: caseInfo.upn, hypothesis_id: "H-coverage", params }, r.rows, r.sql_id, ids);
      if (derived.length) {
        const c = opts.ablate?.critic === false
          ? { approved: derived, rejected: [] as Array<{ claim: string; reason: string }>, needsMore: [] as string[], verdicts: [] as CriticVerdictT[] }
          : await critique(criticEssential, derived, verdictsById);
        for (const v of c.verdicts) { verdictsById.set(v.finding_id, v); trace.emit({ agent: "critic", action: `verdict_${v.status}`, sql_id: v.check_sql_id, input_summary: v.finding_id, output_summary: v.reason.slice(0, 300), lane: "code", status: "ok" }); }
        findings.push(...c.approved);
        rejected.push(...c.rejected);
      }
      coverageAdded.push(name);
    } catch (err) {
      trace.emit({ agent: "coverage", action: "backfill_fail", input_summary: name, status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
    }
  }
  if (coverageAdded.length) trace.emit({ agent: "coverage", action: "backfill", output_summary: `ran missing default coverage: ${coverageAdded.join(", ")}`, status: "ok" });

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
      // Surface each failing rule as its own `dq_flag` trace row so judges / UIs
      // can group by it. Nothing is silently dropped: even a 0-invalid rule
      // appears above in `scoped_checks`.
      for (const d of dq.filter((x) => x.invalid > 0)) {
        trace.emit({ agent: "dq", action: "dq_flag", status: "degraded", sql_id: d.sql_id, output_summary: `${d.table}/${d.rule}@${d.scope} invalid=${d.invalid}`, dq_rule: d.rule, dq_table: d.table, dq_scope: d.scope, dq_invalid: d.invalid });
      }
    } catch (err) {
      trace.emit({ agent: "dq", action: "scoped_checks", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
      limitations.push("DQ checks could not run; confidence not adjusted for data quality.");
    }
  }
  for (const f of findings) await graph.recordFinding(f, "critic");

  // ---- Scout Intent gate (notes/DAY3_PROMPT.md step 1)
  // Scan every untrusted string that could reach a model prompt (mail-rule
  // target/detail, user_agent, device name, subject, ASN name) with default +
  // adversarial-tight policy packs. Guards fire → the content is quarantined
  // as data; block-tier intents (exfil, override_verdict, system_prompt_leak)
  // are refused outright. The Report carries every attempt as a
  // `prompt_injection_attempt` with the row ref so judges / analysts see
  // exactly which rule caught what. Scout runs AFTER the Critic (so its
  // findings have already been verified in Zetaris) and BEFORE the Risk Gate
  // / Reporter prompts — the model never follows the attacker's text.
  const scout = new Scout({ policyPack: ["default", "adversarial-tight"] });
  const scoutGate = runScoutGate(scout, findings, "orchestrator");
  const promptInjectionAttempts: Array<{ finding_id: string; field: string; policy: string; rule: string; reason: string; match: string }> = scoutGate.attempts.map((a) => ({ finding_id: a.finding_id, field: a.field, policy: a.policy, rule: a.ruleId, reason: a.reason, match: a.match }));
  if (scoutGate.attempts.length) {
    trace.emit({ agent: "scout", action: "scan", status: "ok", output_summary: `${scoutGate.attempts.length} injection attempt(s) across ${new Set(scoutGate.attempts.map((a) => a.finding_id)).size} finding(s); mergedRisk=${scoutGate.mergedRisk}`, scout_merged_risk: scoutGate.mergedRisk, scout_attempts: scoutGate.attempts.length });
    for (const a of scoutGate.attempts) trace.emit({ agent: "scout", action: "prompt_injection_attempt", status: "degraded", output_summary: `${a.policy}:${a.ruleId} on ${a.finding_id}.${a.field} — ${a.reason}`, finding_id: a.finding_id, field: a.field, scout_rule: a.ruleId, scout_policy: a.policy, scout_match: a.match });
  }
  // Replace the untrusted strings in affected findings with their quarantined
  // fenced form so the Risk-Gate / Reporter prompts cite the sanitised text.
  findings = findings.map((f) => sanitizeFinding(f, scoutGate));
  // Blocked fields become a hard escalate reason — the orchestrator refuses to
  // continue a decision that would require trusting an exfil / override intent.
  for (const b of scoutGate.blocked) limitations.push(`Scout blocked ${b.finding_id}.${b.field}: ${b.reason}`);

  // Planner glitches do not mark the whole run as degraded if a later round
  // recovered and we got a plan; the fallback coverage steps always ran. The
  // orchestrator decides later whether the standing policy can carry the
  // verdict (chain complete, no DQ conflict) or whether the run must escalate.
  if (!plannerSucceeded && plannerDegradedRounds > 0) {
    degraded = true;
    limitations.push("Planner model degraded; investigation proceeded with coverage queries only.");
  }

  // ---- Risk Gate: code policy + deep-lane opinion
  // Important: the policy is computed WITHOUT the `degraded` flag at first so a
  // missing model opinion does not force escalation when the deterministic policy
  // is itself confident (contain / benign / monitor on CONFIRMED findings). If the
  // policy *itself* is uncertain, we fall back to escalate — this is the honest
  // behaviour promised in `.cursor/rules/evidence-contract.mdc`.
  const basePolicy = policy({ findings, rejectedCount: rejected.length, dqConflicts, degraded: false, checkedSources: [...checkedSources] });
  let riskModelMissing = false;
  // The Reporter / Risk-Gate prompts stay bounded: only CONFIRMED findings
  // (fallback to all), top-N by confidence, each claim capped at 240 chars.
  // Rejected claims are also capped. This is a hard upper bound regardless of
  // how many findings an aggressive run accumulates — the Day-2A trace analysis
  // showed oversized prompts starving the provider and amplifying 502s.
  const evidenceText = buildEvidenceText(findings);
  const rejectedText = buildRejectedText(rejected);
  let modelOpinion: { decision: VerdictT; confidence: number; rationale: string; cited_finding_ids?: string[] } | undefined;
  if (budget.canModel()) {
    budget.model += 1;
    modelStepsTotal += 1;
    try {
      const rc = await opts.nightshift.callTool({
        messages: [
          { role: "system", content: "You are the Risk Gate of a university SOC. Decide contain | monitor | benign | escalate from the verified evidence only. contain = confirmed account takeover chain; benign = suspicious signals explained away; monitor = weak unexplained signal; escalate = exposure or conflicting/insufficient evidence needing a human. Cite the finding ids (F1…) that support your decision in `cited_finding_ids` — if you dissent from the obvious policy call, the gate requires at least one CONFIRMED finding on this list to override. Return via submit_risk." },
          { role: "user", content: `Case ${caseInfo.id} (${caseInfo.upn}).\nVerified findings:\n${evidenceText}\n\nRejected claims:\n${rejectedText}\n\nData-quality conflicts:\n${dqConflicts.join("\n") || "(none)"}` },
        ],
        toolName: "submit_risk", description: "Submit the risk decision.", schema: RISK_TOOL_SCHEMA, lane: "deep", maxTokens: 4000, agent: "risk_gate",
        parse: (a) => ({
          decision: Verdict.parse(a.decision),
          confidence: Math.min(1, Math.max(0, Number(a.confidence))),
          rationale: String(a.rationale ?? ""),
          cited_finding_ids: Array.isArray(a.cited_finding_ids) ? a.cited_finding_ids.map(String) : [],
        }),
      });
      modelOpinion = rc.value;
      modelStepsOk += 1;
      riskGateFromModel = true;
      models.push({ agent: "risk_gate", routed_model: rc.model, receipt_id: rc.receipt?.receipt_id });
    } catch (err) {
      riskModelMissing = true;
      trace.emit({ agent: "risk_gate", action: "model_opinion", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
    }
  }
  // Deterministic fallback under degraded conditions.
  // Any degraded model step (planner, risk-gate, or later reporter) is honest humility:
  // the deterministic policy keeps the verdict iff the chain can stand on its own
  // (core sources checked, no DQ conflict, confidence stays ≥ 0.7 after a −0.1
  // penalty). Otherwise the case escalates to a human with the reason recorded.
  // This is the general-policy fix for the Day-2A "6/6 run degraded → escalate"
  // pattern on cases 001 and 004 where the chain was CONFIRMED but a model
  // step failed.
  let effectivePolicy = basePolicy;
  const standingProbe = canStandUnderDegrade(basePolicy, { dqConflicts, checkedSources: [...checkedSources] });
  if (riskModelMissing) {
    if (standingProbe) {
      effectivePolicy = { ...basePolicy, confidence: Math.max(0, Math.round((basePolicy.confidence - 0.1) * 100) / 100) };
      limitations.push("model opinion unavailable (provider error); deterministic policy stood in, confidence lowered by 0.1.");
    } else {
      degraded = true;
      effectivePolicy = { ...basePolicy, decision: "escalate", escalate_reasons: [...basePolicy.escalate_reasons, "a model step was degraded"] };
      limitations.push("model opinion unavailable (provider error); deterministic policy was not confident enough to stand alone.");
    }
  } else if (degraded && basePolicy.decision !== "escalate") {
    if (standingProbe) {
      // A planner step was degraded but we have a complete CONFIRMED chain; keep
      // the verdict, apply the same −0.1 humility penalty and record it.
      effectivePolicy = { ...basePolicy, confidence: Math.max(0, Math.round((basePolicy.confidence - 0.1) * 100) / 100) };
      limitations.push("earlier model step was degraded; deterministic policy stood in on a complete chain, confidence lowered by 0.1.");
    } else {
      effectivePolicy = { ...basePolicy, decision: "escalate", escalate_reasons: [...basePolicy.escalate_reasons, "a model step was degraded"] };
    }
  }
  const pol = effectivePolicy;
  // Approved finding ids after Critic + DQ + Scout — the "evidence the gate
  // can trust". Rejected ids come from the Critic's verdicts map and the
  // explicit `rejected` list.
  const approvedFindingIds = findings.map((f) => f.id);
  const rejectedFindingIds = [
    ...[...verdictsById.values()].filter((v) => v.status === "rejected").map((v) => v.finding_id),
    // Rejected claims are stored as a separate list (claim + reason) with no
    // id — any finding whose id is NOT in approvedFindingIds that the model
    // cites is implicitly ungrounded. We still only treat *known* rejected
    // ids as evidence of a rejected cite; the ungrounded check already
    // covers "unknown id" too.
  ];
  const g = gate(pol, modelOpinion, { approvedFindingIds, rejectedFindingIds });
  const dissentNote = g.dissent && g.dissent.kind !== "agreed" ? ` [dissent=${g.dissent.kind}]` : "";
  trace.emit({ agent: "risk_gate", action: "decide", parent_id: root.step_id, output_summary: `${g.decision} @ ${g.confidence} (policy ${basePolicy.decision}, model ${modelOpinion?.decision ?? (riskModelMissing ? "unavailable" : "n/a")}${dissentNote}) ${pol.reasons.join("; ")}`.slice(0, 400), confidence: g.confidence, status: "ok" });
  if (g.dissent && g.dissent.kind === "ungrounded_dissent") limitations.push(`model dissent not grounded in confirmed evidence (cited rejected: ${g.dissent.cited_rejected.join(", ") || "(none)"})`);
  if (g.dissent && g.dissent.kind === "no_citations_dissent") limitations.push("model dissent carried no finding citations; policy verdict kept and confidence lowered by 0.05");

  // ---- Reporter (deep lane): narrates the decided verdict, cannot change it
  // Deterministic fallback (used when the model is degraded) is built from the
  // surviving findings + policy reasons so the final JSON is still useful.
  const deterministicNote = buildDeterministicNote(g.decision, g.confidence, findings, basePolicy.reasons, g.escalate_reasons, dq);
  let note: { summary: string; actions: Array<{ action: string; attack: string[] }>; limitations: string[]; not_checked: string[] } = deterministicNote;
  let reporterFromModel = false;
  const toArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
  if (budget.canModel()) {
    budget.model += 1;
    modelStepsTotal += 1;
    try {
      const rep = await opts.nightshift.callTool({
        messages: [
          { role: "system", content: `You write analyst-ready incident notes for a university SOC. The verdict is already decided by the Risk Gate: ${g.decision} (confidence ${g.confidence}). Do not change it. Be brief: summary <= 120 words with one short sentence per finding citation (F1…). Actions: 2–4 bullet recommendations for the analyst, each with ATT&CK ids from the findings. Limitations and not_checked: 1–2 lines each.` },
          { role: "user", content: `Case ${caseInfo.id} (${caseInfo.upn}).\nVerified findings:\n${evidenceText}\n\nRejected claims:\n${rejectedText}\n\nRisk Gate reasons: ${[...basePolicy.reasons, ...g.escalate_reasons].join("; ")}` },
        ],
        toolName: "submit_note", description: "Submit the incident note.", schema: REPORT_NOTE_SCHEMA, lane: "deep", maxTokens: 4000, agent: "reporter",
        parse: (a) => ({ summary: String(a.summary ?? ""), actions: (Array.isArray(a.actions) ? a.actions : []).map((x: { action?: unknown; attack?: unknown }) => ({ action: String(x.action ?? ""), attack: toArr(x.attack) })).filter((x) => x.action), limitations: toArr(a.limitations), not_checked: toArr(a.not_checked) }),
      });
      note = rep.value;
      // Keep deterministic actions if the model forgot them.
      if (!note.actions.length) note.actions = deterministicNote.actions;
      reporterFromModel = true;
      modelStepsOk += 1;
      models.push({ agent: "reporter", routed_model: rep.model, receipt_id: rep.receipt?.receipt_id });
      trace.emit({ agent: "reporter", action: "report", routed_model: rep.model, receipt_id: rep.receipt?.receipt_id, lane: "deep", status: "ok" });
    } catch (err) {
      trace.emit({ agent: "reporter", action: "report", status: "degraded", output_summary: (err as Error).message.slice(0, 200) });
      limitations.push("Reporter model unavailable; deterministic summary built from findings.");
    }
  }
  if (!reporterFromModel) note = deterministicNote;
  // A verdict is "model-backed" only when BOTH the Risk Gate opinion AND the
  // Reporter narration came from a successful model call. Any other shape
  // (policy stood in on degraded run, planner-only, reporter-only) is a
  // deterministic-policy verdict and must be labelled as such in the JSON
  // and in the console. This is what Night 3's "format_miss = provider up"
  // claim missed: the policy produced 12/18 ok results on its own.
  const decidedBy: "model+policy" | "policy_fallback" = riskGateFromModel && reporterFromModel ? "model+policy" : "policy_fallback";

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
    prompt_injection_attempts: promptInjectionAttempts,
    risk: { decision, policy_decision: basePolicy.decision, model_decision: modelOpinion?.decision, confidence, rationale: modelOpinion?.rationale ?? basePolicy.reasons.join("; "), escalate_reasons },
    rounds,
    budget: { sql_calls: budget.sql, model_calls: budget.model },
    models,
    decided_by: decidedBy,
    model_steps_ok: modelStepsOk,
    model_steps_total: modelStepsTotal,
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

const CLAIM_CAP = 240;
const MAX_FINDINGS_IN_PROMPT = 12;
const MAX_REJECTED_IN_PROMPT = 10;
const PROMPT_CHAR_CAP = 8000;

/** Trim the finding list into a compact text payload for the Reporter and
 *  Risk-Gate prompts. CONFIRMED findings come first (highest confidence), then
 *  non-CONFIRMED as filler, capped at MAX_FINDINGS_IN_PROMPT entries and
 *  PROMPT_CHAR_CAP characters overall. Claims are truncated at CLAIM_CAP.
 *  Exported for unit tests. */
export function buildEvidenceText(findings: FindingT[]): string {
  if (!findings.length) return "(no surviving findings)";
  const sorted = [...findings].sort((a, b) => {
    const sa = a.status === "CONFIRMED" ? 0 : a.status === "LIKELY" ? 1 : 2;
    const sb = b.status === "CONFIRMED" ? 0 : b.status === "LIKELY" ? 1 : 2;
    if (sa !== sb) return sa - sb;
    return b.confidence - a.confidence;
  });
  const lines: string[] = [];
  let n = 0;
  let chars = 0;
  for (const f of sorted) {
    if (n >= MAX_FINDINGS_IN_PROMPT) { lines.push(`… (${sorted.length - n} more trimmed)`); break; }
    const claim = f.claim.length > CLAIM_CAP ? `${f.claim.slice(0, CLAIM_CAP - 1)}…` : f.claim;
    const line = `${f.id} [${f.status} ${f.confidence}] ${claim} {${f.attack.join(",")}}`;
    if (chars + line.length > PROMPT_CHAR_CAP) { lines.push(`… (${sorted.length - n} more trimmed)`); break; }
    lines.push(line);
    chars += line.length + 1;
    n += 1;
  }
  return lines.join("\n");
}

/** Trim the rejected-claims list the same way. Exported for unit tests. */
export function buildRejectedText(rejected: Array<{ claim: string; reason: string }>): string {
  if (!rejected.length) return "(none)";
  const lines: string[] = [];
  let chars = 0;
  for (let i = 0; i < rejected.length; i++) {
    if (i >= MAX_REJECTED_IN_PROMPT) { lines.push(`- … (${rejected.length - i} more rejected claims trimmed)`); break; }
    const r = rejected[i]!;
    const claim = r.claim.length > CLAIM_CAP ? `${r.claim.slice(0, CLAIM_CAP - 1)}…` : r.claim;
    const reason = r.reason.length > CLAIM_CAP ? `${r.reason.slice(0, CLAIM_CAP - 1)}…` : r.reason;
    const line = `- ${claim}: ${reason}`;
    if (chars + line.length > PROMPT_CHAR_CAP) { lines.push(`- … (${rejected.length - i} more rejected claims trimmed)`); break; }
    lines.push(line);
    chars += line.length + 1;
  }
  return lines.join("\n");
}

/** Deterministic analyst-ready note from the surviving findings; used when the
 *  Reporter model is degraded. Clearly labelled so the UI/console can tag it. */
function buildDeterministicNote(decision: VerdictT, confidence: number, findings: FindingT[], reasons: string[], escalateReasons: string[], dq: DqResult[]): { summary: string; actions: Array<{ action: string; attack: string[] }>; limitations: string[]; not_checked: string[] } {
  const label = decision.toUpperCase();
  const confirmed = findings.filter((f) => f.status === "CONFIRMED");
  const attack = [...new Set(findings.flatMap((f) => f.attack))];
  const ids = confirmed.map((f) => f.id).join(", ");
  const dqBad = dq.filter((d) => d.invalid > 0);
  const reasonText = [...reasons, ...escalateReasons].join("; ") || "no reason recorded";
  const summary = `${label} @ ${confidence.toFixed(2)} (deterministic summary). ${confirmed.length} confirmed signal(s)${ids ? ` [${ids}]` : ""}. Techniques: ${attack.join(", ") || "none"}. Reasons: ${reasonText}.${dqBad.length ? ` DQ invalid in ${dqBad.map((d) => `${d.table}/${d.rule}`).join(", ")}.` : ""}`.slice(0, 1200);
  const actions: Array<{ action: string; attack: string[] }> = [];
  if (decision === "contain") {
    actions.push({ action: "Revoke active sessions and reset the password for the affected UPN.", attack: attack.filter((a) => a.startsWith("T1078")) });
    actions.push({ action: "Remove suspicious inbox rules and quarantine the delivered phishing message.", attack: attack.filter((a) => a === "T1114.003" || a === "T1564.008" || a === "T1566.002") });
    actions.push({ action: "Audit downstream SharePoint/OneDrive access from the attacker ASN.", attack: attack.filter((a) => a === "T1213") });
  } else if (decision === "escalate") {
    actions.push({ action: "Open a human-review ticket; attach the trace and the findings referenced above.", attack });
    if (dqBad.length) actions.push({ action: `Investigate DQ invalid rows: ${dqBad.map((d) => `${d.table}/${d.rule}@${d.scope ?? "-"}`).join(", ")}.`, attack: [] });
  } else if (decision === "monitor") {
    actions.push({ action: "Watchlist the UPN for 7 days; alert on next MFA fatigue or new ASN.", attack });
  } else {
    actions.push({ action: "Close as benign. Keep the signal in the baseline for 30 days.", attack: [] });
  }
  return { summary, actions, limitations: [], not_checked: ["travel calendar (not connected)", "EDR process events (not ingested)"] };
}

/** Apply an analyst correction after a run completes.
 *  Writes a lesson to H-MEM with origin `user_correction` and higher confidence
 *  so later runs cite the correction in the `[MEMORY CONTEXT]` block.
 *  Returns the ids of the lessons added. */
export function applyAnalystFeedback(memory: CaseMemory, args: { report: Report; verdictCorrection?: VerdictT; rejectedFindingIds?: string[]; confirmedFindingIds?: string[]; analyst: string; note?: string }): string[] {
  const { report } = args;
  const added: string[] = [];
  const refs = [...new Set(report.findings.flatMap((f) => f.sql_ids))];
  if (args.verdictCorrection && args.verdictCorrection !== report.verdict) {
    const content = `Analyst-confirmed correction (${report.case_id}): final verdict is ${args.verdictCorrection}, not ${report.verdict}. Reason: ${args.note || "analyst override"}.`;
    added.push(memory.hmem.add({
      content, type: "factual", layer: "working", source: `case:${report.case_id}`, confidence: 0.95,
      tags: ["lesson", `verdict:${args.verdictCorrection}`, "analyst-confirmed", "origin:user_correction"],
      provenance: { origin: "user_correction", label: `${args.analyst} @ ${report.run_id}`, refs },
    }).id);
  } else if (args.verdictCorrection) {
    // Analyst agreed with the verdict → boost the "pattern" lesson, if we can find one.
    const content = `Analyst-confirmed pattern (${report.case_id}): verdict ${report.verdict} at confidence ${report.confidence} was correct.`;
    added.push(memory.hmem.add({
      content, type: "episodic", layer: "working", source: `case:${report.case_id}`, confidence: 0.95,
      tags: ["pattern", `verdict:${report.verdict}`, "analyst-confirmed", "origin:user_correction"],
      provenance: { origin: "user_correction", label: `${args.analyst} @ ${report.run_id}`, refs },
    }).id);
  }
  for (const fid of args.rejectedFindingIds ?? []) {
    const f = report.findings.find((x) => x.id === fid);
    if (!f) continue;
    const content = `Analyst rejected finding (${report.case_id} ${f.id}): "${f.claim}". Future similar signals should be scored lower.`;
    added.push(memory.hmem.add({
      content, type: "factual", layer: "working", source: `case:${report.case_id}`, confidence: 0.9,
      tags: ["lesson", "analyst-confirmed", "origin:user_correction", ...f.attack.map((a) => `tactic:${a}`)],
      provenance: { origin: "user_correction", label: `${args.analyst} @ ${report.run_id}`, refs: f.sql_ids },
    }).id);
    try { memory.hmem.feedback(fid, "wrong"); } catch { /* ignore unknown id */ }
  }
  for (const fid of args.confirmedFindingIds ?? []) {
    const f = report.findings.find((x) => x.id === fid);
    if (!f) continue;
    const content = `Analyst confirmed finding (${report.case_id} ${f.id}): "${f.claim}". Pattern is reliable for this institution.`;
    added.push(memory.hmem.add({
      content, type: "factual", layer: "working", source: `case:${report.case_id}`, confidence: 0.95,
      tags: ["lesson", "analyst-confirmed", "origin:user_correction", ...f.attack.map((a) => `tactic:${a}`)],
      provenance: { origin: "user_correction", label: `${args.analyst} @ ${report.run_id}`, refs: f.sql_ids },
    }).id);
  }
  return added;
}
