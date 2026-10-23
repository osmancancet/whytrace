export type Verdict = "contain" | "monitor" | "benign" | "escalate";

export type Finding = {
  id: string;
  hypothesis_id: string;
  claim: string;
  status: "CONFIRMED" | "LIKELY" | "SUSPECTED" | "UNCONFIRMED";
  sql_ids: string[];
  row_refs: string[];
  attack: string[];
  confidence: number;
  kind?: string;
  entity_ids: string[];
  facts: Record<string, string | number | boolean | null>;
};

export type RejectedClaim = { claim: string; reason: string };

export type Dq = { table: string; rule: string; valid: number; invalid: number; scope?: string; sql_id?: string };

export type Report = {
  run_id: string;
  case_id: string;
  verdict: Verdict;
  confidence: number;
  summary: string;
  timeline: Array<{ ts: string; event: string; sql_id: string }>;
  findings: Finding[];
  rejected_claims: RejectedClaim[];
  actions: Array<{ action: string; attack: string[]; requires_approval: true }>;
  limitations: string[];
  not_checked: string[];
  dq: Dq[];
  memory_used: string[];
  critic_score?: { accuracy: number; appropriateness: number; actionability: number };
  critic_verdicts: Array<{ finding_id: string; status: "approved" | "rejected" | "needs_more"; reason: string; check_sql_id?: string }>;
  risk?: {
    decision: Verdict;
    policy_decision: Verdict;
    model_decision?: Verdict;
    confidence: number;
    rationale: string;
    escalate_reasons: string[];
  };
  rounds: number;
  budget?: { sql_calls: number; model_calls: number };
  models: Array<{ agent: string; routed_model: string; receipt_id?: string }>;
  trace_id: string;
  log_file: string;
  execution_time_seconds: number;
  explanation?: Explanation;
};

export type AttributionRow = {
  finding_id: string;
  claim: string;
  attack: string[];
  sql_ids: string[];
  shapley: number;
  rank: number;
};

export type Explanation = {
  verdict: Verdict;
  confidence: number;
  mode: "exact" | "sampled";
  n_findings: number;
  samples_used: number;
  attribution: AttributionRow[];
  counterfactuals: {
    leave_one_out: Array<{ finding_id: string; verdict_without: Verdict; confidence_without: number; changes_verdict: boolean }>;
    minimal_set: { finding_ids: string[]; verdict: Verdict; confidence: number } | null;
  };
  contrastive: { runner_up: Verdict; explanation: string; blocking_findings: string[]; missing_evidence: string[] } | null;
  faithfulness: { top_k: number; top_shapley_ids: string[]; cited_ids: string[]; overlap: number; score: number; revised: boolean; score_before_revision: number | null } | null;
};

export type SavedRun = { id: string; case_id: string; verdict: Verdict; confidence: number; file: string; ts: string };

export type TraceEvent = {
  ts: string;
  run_id: string;
  step_id: string;
  parent_id?: string;
  agent: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  sql_id?: string;
  rows?: number;
  receipt_id?: string;
  routed_model?: string;
  lane?: string;
  confidence?: number;
  status: "ok" | "degraded" | "error";
  retry_count?: number;
  ms?: number;
};

export type MarkovianSummary = {
  engine: string;
  goal: string;
  windows: Array<{ from: string; to: string }>;
  status: string;
  tokenLabel: "measured" | "estimated";
  totalTokensUsed: number;
  efficiencyPercent: number;
  durationMs: number;
  measured: { tokens_in: number; tokens_out: number; model_calls: number };
  victims: string[];
  victim_count: number;
  per_step: Array<{ step: number; sql_id: string; rows: number; receipt_id?: string; routed_model?: string; tokens_in?: number; tokens_out?: number }>;
};
