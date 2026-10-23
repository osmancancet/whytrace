// M0 ablation (notes/DAY3_PROMPT.md step 3). Nemotron on its own: given the
// case alert text and the raw event dump, asked for a verdict in one shot.
// NO tools, NO Critic, NO Risk Gate, NO Reporter, NO DQ. One model call.
// Produces a Report so the eval table can judge it alongside A0 / B0.
//
// Why this exists: the hackathon brief asks for a "model alone vs through the
// agent" number. M0 isolates the raw model contribution so Readers can see
// how much of A0's accuracy comes from the orchestrator's structure vs the
// LLM's reasoning on the same inputs.
import { Nightshift, RunTrace, type Zetaris } from "@whytrace/adapters";
import { queryFor } from "./sql-catalogue.ts";
import { Report, Verdict, type VerdictT } from "./schema.ts";

export type ModelOnlyInput = {
  caseId: string;
  upn: string;
  description?: string;
  zetaris: Pick<Zetaris, "runSql">;
  nightshift: Nightshift;
  trace?: RunTrace;
};

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["contain", "monitor", "benign", "escalate"] },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["verdict", "confidence", "rationale"],
} as const;

/** Dump the signin + mail events for a UPN as a compact text table so a model
 *  can reason about them without any tool-call plumbing. */
function dumpRows(rows: Array<Record<string, unknown>>, cols: string[], max = 60): string {
  const header = cols.join(" | ");
  const body = rows.slice(0, max).map((r) => cols.map((c) => String(r[c] ?? "")).join(" | ")).join("\n");
  const truncated = rows.length > max ? `\n… (${rows.length - max} more rows truncated)` : "";
  return `${header}\n${body}${truncated}`;
}

export async function evaluateModelOnly(input: ModelOnlyInput): Promise<Report> {
  const started = Date.now();
  const trace = input.trace ?? new RunTrace();
  trace.emit({ agent: "model_only", action: "start", input_summary: `${input.caseId} / ${input.upn}`, status: "ok" });

  const signinSql = queryFor("signins_for", { upn: input.upn });
  const mailSql = queryFor("mail_chain", { upn: input.upn });
  const signinRes = await input.zetaris.runSql(signinSql.sql, { limit: 200 });
  const mailRes = await input.zetaris.runSql(mailSql.sql, { limit: 200 });
  trace.emit({ agent: "model_only", action: "sql", sql_id: signinRes.sql_id, rows: signinRes.rows.length, status: "ok" });
  trace.emit({ agent: "model_only", action: "sql", sql_id: mailRes.sql_id, rows: mailRes.rows.length, status: "ok" });

  const signinCols = ["ts", "result", "ip", "asn_org", "country", "city", "device_id", "app", "mfa_prompt_count", "via_vpn_appliance"];
  const mailCols = ["ts", "kind", "verdict", "sender_domain", "detail"];
  const dump = `Case ${input.caseId} — alert for ${input.upn}${input.description ? ` (${input.description})` : ""}\n\n` +
    `## sign-in events (${signinRes.rows.length})\n${dumpRows(signinRes.rows, signinCols)}\n\n` +
    `## mail events (${mailRes.rows.length})\n${dumpRows(mailRes.rows, mailCols)}`;

  // One model call. No tool catalogue, no Critic, no Risk Gate — just the model.
  let verdict: VerdictT = "escalate";
  let confidence = 0.5;
  let rationale = "model did not respond";
  let modelId = "n/a";
  let receiptId: string | undefined;
  let degraded = false;
  try {
    const rc = await input.nightshift.callTool({
      messages: [
        { role: "system", content: "You are a university SOC analyst. Decide contain | monitor | benign | escalate from the raw alert and event dump only. contain = confirmed account takeover; benign = suspicious signals explained; monitor = weak unexplained signal; escalate = exposure or insufficient evidence needing a human. Return via submit_verdict." },
        { role: "user", content: dump },
      ],
      toolName: "submit_verdict", description: "Submit the one-shot verdict.", schema: SCHEMA, lane: "deep", maxTokens: 4000, agent: "model_only",
      parse: (a) => ({ verdict: Verdict.parse(a.verdict), confidence: Math.min(1, Math.max(0, Number(a.confidence))), rationale: String(a.rationale ?? "") }),
    });
    verdict = rc.value.verdict;
    confidence = rc.value.confidence;
    rationale = rc.value.rationale;
    modelId = rc.model;
    receiptId = rc.receipt?.receipt_id;
    trace.emit({ agent: "model_only", action: "verdict", status: "ok", routed_model: modelId, receipt_id: receiptId, output_summary: `${verdict} @ ${confidence}` });
  } catch (err) {
    degraded = true;
    rationale = `model-only call degraded: ${(err as Error).message.slice(0, 200)}`;
    trace.emit({ agent: "model_only", action: "verdict", status: "degraded", output_summary: rationale });
  }

  return Report.parse({
    run_id: trace.run_id,
    case_id: input.caseId,
    verdict,
    confidence,
    summary: `M0 model-only verdict: ${verdict.toUpperCase()} @ ${confidence.toFixed(2)}. ${rationale}`.slice(0, 1200),
    timeline: [],
    findings: [],
    rejected_claims: [],
    actions: [],
    limitations: ["M0 ablation: Nemotron alone, no tools, no Critic, no Risk Gate, no DQ. Not a product configuration."],
    not_checked: ["device inventory", "KEV / CVE lookup", "cross-case memory", "data-quality rules"],
    dq: [],
    memory_used: [],
    critic_verdicts: [],
    prompt_injection_attempts: [],
    rounds: 0,
    budget: { sql_calls: 2, model_calls: degraded ? 0 : 1 },
    models: degraded ? [] : [{ agent: "model_only", routed_model: modelId, receipt_id: receiptId }],
    // M0 is model-only *by construction*. We always report `model_only` so the
    // configuration is visible; a degraded call shows up as 0/1 in
    // model_steps_ok/total, which the eval sweep surfaces alongside the
    // decided_by label.
    decided_by: "model_only",
    model_steps_ok: degraded ? 0 : 1,
    model_steps_total: 1,
    trace_id: trace.run_id,
    log_file: trace.files().trace,
    execution_time_seconds: Math.max(0, (Date.now() - started) / 1000),
  });
}
