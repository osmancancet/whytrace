// WhyTrace output contract. Zod schemas for every agent tool call and the
// final report object. See .cursor/rules/evidence-contract.mdc.
import { z } from "zod";

export const Hypothesis = z.object({
  id: z.string(),
  label: z.string(),
  attack_ids: z.array(z.string()).default([]),
  prior_support: z.number().min(0).max(1).optional(),
});

export const PlanStep = z.object({
  hypothesis_id: z.string(),
  query_name: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  why: z.string(),
});

export const PlannerOutput = z.object({
  hypotheses: z.array(Hypothesis).min(1).max(5),
  steps: z.array(PlanStep).min(1).max(12),
});
export type PlannerOutput = z.infer<typeof PlannerOutput>;

export const FindingStatus = z.enum(["CONFIRMED", "LIKELY", "SUSPECTED", "UNCONFIRMED"]);

export const Finding = z.object({
  id: z.string(),
  hypothesis_id: z.string(),
  claim: z.string(),
  status: FindingStatus,
  sql_ids: z.array(z.string()).min(1),
  row_refs: z.array(z.string()).default([]),
  attack: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  // Which named check produced this finding (drives the Critic's independent re-query).
  kind: z.string().optional(),
  // World-model style keyed ids the finding is about (account:idp:<upn>, ip:net:<ip>, device:cmdb:<id>).
  entity_ids: z.array(z.string()).default([]),
  // Structured values the Critic re-checks (e.g. {asn_org, first_ts}).
  facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export const InvestigatorOutput = z.object({
  findings: z.array(Finding),
  rejected_claims: z.array(z.object({ claim: z.string(), reason: z.string() })).default([]),
});
export type InvestigatorOutput = z.infer<typeof InvestigatorOutput>;

export const Verdict = z.enum(["contain", "monitor", "benign", "escalate"]);
export type VerdictT = z.infer<typeof Verdict>;

export const CriticVerdict = z.object({
  finding_id: z.string(),
  status: z.enum(["approved", "rejected", "needs_more"]),
  reason: z.string(),
  check_sql_id: z.string().optional(),
});
export type CriticVerdictT = z.infer<typeof CriticVerdict>;

export const Report = z.object({
  run_id: z.string(),
  case_id: z.string(),
  verdict: Verdict,
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  timeline: z.array(z.object({ ts: z.string(), event: z.string(), sql_id: z.string() })).default([]),
  findings: z.array(Finding).default([]),
  rejected_claims: z.array(z.object({ claim: z.string(), reason: z.string() })).default([]),
  actions: z.array(z.object({ action: z.string(), attack: z.array(z.string()).default([]), requires_approval: z.literal(true).default(true) })).default([]),
  limitations: z.array(z.string()).default([]),
  not_checked: z.array(z.string()).default([]),
  dq: z.array(z.object({ table: z.string(), rule: z.string(), valid: z.number(), invalid: z.number(), scope: z.string().optional(), sql_id: z.string().optional() })).default([]),
  memory_used: z.array(z.string()).default([]),
  critic_score: z.object({ accuracy: z.number(), appropriateness: z.number(), actionability: z.number() }).optional(),
  critic_verdicts: z.array(CriticVerdict).default([]),
  risk: z.object({
    decision: Verdict,
    policy_decision: Verdict,
    model_decision: Verdict.optional(),
    confidence: z.number().min(0).max(1),
    rationale: z.string(),
    escalate_reasons: z.array(z.string()).default([]),
  }).optional(),
  rounds: z.number().int().min(0).default(0),
  budget: z.object({ sql_calls: z.number(), model_calls: z.number() }).optional(),
  models: z.array(z.object({ agent: z.string(), routed_model: z.string(), receipt_id: z.string().optional() })).default([]),
  trace_id: z.string(),
  log_file: z.string(),
  execution_time_seconds: z.number(),
});
export type Report = z.infer<typeof Report>;

export type PlannerStep = z.infer<typeof PlanStep>;
export type HypothesisT = z.infer<typeof Hypothesis>;
export type FindingT = z.infer<typeof Finding>;

export const ATTACK_ALLOWLIST = new Set([
  "T1566.002", "T1204.001", "T1621", "T1078.004", "T1078",
  "T1114.003", "T1564.008", "T1213", "T1110.003", "T1133", "T1190",
]);

// Build a JSON Schema compatible with Nightshift tool calling. Zod → JSON Schema is
// not shipped standalone; we write only the subset we need to keep the dep count low.

export const PLANNER_TOOL_SCHEMA = {
  type: "object",
  properties: {
    hypotheses: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          attack_ids: { type: "array", items: { type: "string" } },
        },
        required: ["id", "label"],
      },
    },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          hypothesis_id: { type: "string" },
          query_name: { type: "string" },
          params: { type: "object", additionalProperties: true },
          why: { type: "string" },
        },
        required: ["hypothesis_id", "query_name", "why"],
      },
    },
  },
  required: ["hypotheses", "steps"],
} as const;

export const REPORTER_TOOL_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["contain", "monitor", "benign", "escalate"] },
    confidence: { type: "number" },
    summary: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          action: { type: "string" },
          attack: { type: "array", items: { type: "string" } },
        },
        required: ["action"],
      },
    },
    limitations: { type: "array", items: { type: "string" } },
    not_checked: { type: "array", items: { type: "string" } },
  },
  required: ["verdict", "confidence", "summary"],
} as const;

export const RISK_TOOL_SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["contain", "monitor", "benign", "escalate"] },
    confidence: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["decision", "confidence", "rationale"],
} as const;
