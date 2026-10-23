// Explain-why module (DAY5). Attribution + counterfactuals + contrastive
// explanations over the deterministic Risk-Gate policy, with no extra model
// calls. Players = the approved findings that feed policy(); value =
// policy(S).confidence toward the chosen verdict (0 if policy flips the
// verdict on subset S). Shapley values are exact when n ≤ 12 (2^n subsets;
// policy() is pure and sub-millisecond), otherwise a seeded permutation
// sampler takes over so the numbers stay deterministic.
import type { FindingT, VerdictT } from "./schema.ts";
import { policy, type PolicyDecision } from "./risk-gate.ts";

export type PolicyContext = {
  rejectedCount: number;
  dqConflicts: string[];
  degraded: boolean;
  checkedSources: string[];
};

export type ExplainOptions = PolicyContext & {
  findings: FindingT[];
  /** Hard cap for the exact algorithm. Above this n the sampler kicks in. */
  exactMax?: number;
  /** Number of random permutations when sampling. */
  samples?: number;
  /** Deterministic seed for the sampler. */
  seed?: number;
  /** How many attribution rows feed `faithfulness@k`. */
  topK?: number;
};

export type Attribution = {
  finding_id: string;
  claim: string;
  attack: string[];
  sql_ids: string[];
  shapley: number;
  rank: number;
};

export type LeaveOneOut = {
  finding_id: string;
  verdict_without: VerdictT;
  confidence_without: number;
  changes_verdict: boolean;
};

export type MinimalCounterfactualSet = {
  finding_ids: string[];
  verdict: VerdictT;
  confidence: number;
};

export type Contrastive = {
  runner_up: VerdictT;
  explanation: string;
  blocking_findings: string[];
  missing_evidence: string[];
};

export type Faithfulness = {
  top_k: number;
  top_shapley_ids: string[];
  cited_ids: string[];
  overlap: number;
  score: number;
};

export type Explanation = {
  verdict: VerdictT;
  confidence: number;
  mode: "exact" | "sampled";
  n_findings: number;
  samples_used: number;
  attribution: Attribution[];
  counterfactuals: {
    leave_one_out: LeaveOneOut[];
    minimal_set: MinimalCounterfactualSet | null;
  };
  contrastive: Contrastive | null;
};

const DEFAULT_TOP_K = 3;
const DEFAULT_EXACT_MAX = 12;
const DEFAULT_SAMPLES = 2000;
const DEFAULT_SEED = 42;

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function policyFor(findings: FindingT[], ctx: PolicyContext): PolicyDecision {
  return policy({
    findings,
    rejectedCount: ctx.rejectedCount,
    dqConflicts: ctx.dqConflicts,
    degraded: ctx.degraded,
    checkedSources: ctx.checkedSources,
  });
}

/** Value function: policy confidence toward the full-set verdict on subset S. */
export function valueFor(findings: FindingT[], ctx: PolicyContext, targetVerdict: VerdictT): number {
  const p = policyFor(findings, ctx);
  return p.decision === targetVerdict ? p.confidence : 0;
}

/** Mulberry32 PRNG — tiny, fast, deterministic from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Exact Shapley over `findings` by enumerating all 2^n subsets. */
export function exactShapley(findings: FindingT[], ctx: PolicyContext, targetVerdict: VerdictT): number[] {
  const n = findings.length;
  if (!n) return [];
  const total = 1 << n;
  const values = new Float64Array(total);
  for (let mask = 0; mask < total; mask++) {
    const subset: FindingT[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(findings[i]!);
    values[mask] = valueFor(subset, ctx, targetVerdict);
  }
  const factorial: number[] = new Array(n + 1);
  factorial[0] = 1;
  for (let k = 1; k <= n; k++) factorial[k] = factorial[k - 1]! * k;
  const nFact = factorial[n]!;
  const phi = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const bit = 1 << i;
    for (let mask = 0; mask < total; mask++) {
      if (mask & bit) continue;
      let size = 0;
      let m = mask;
      while (m) { size += m & 1; m >>>= 1; }
      const weight = (factorial[size]! * factorial[n - size - 1]!) / nFact;
      phi[i] = (phi[i] ?? 0) + weight * (values[mask | bit]! - values[mask]!);
    }
  }
  return phi;
}

/** Monte-Carlo Shapley: average marginal contribution over random permutations. */
export function sampledShapley(findings: FindingT[], ctx: PolicyContext, targetVerdict: VerdictT, samples: number, seed: number): number[] {
  const n = findings.length;
  if (!n) return [];
  const rand = mulberry32(seed);
  const phi = new Array<number>(n).fill(0);
  const indices = findings.map((_, i) => i);
  for (let k = 0; k < samples; k++) {
    const order = shuffle(indices, rand);
    const subset: FindingT[] = [];
    let prev = valueFor(subset, ctx, targetVerdict);
    for (const idx of order) {
      subset.push(findings[idx]!);
      const next = valueFor(subset, ctx, targetVerdict);
      phi[idx] = (phi[idx] ?? 0) + (next - prev);
      prev = next;
    }
  }
  return phi.map((x) => x / samples);
}

function rankAttribution(findings: FindingT[], phi: number[]): Attribution[] {
  const rows = findings.map((f, i) => ({
    finding_id: f.id,
    claim: f.claim,
    attack: f.attack.slice(),
    sql_ids: f.sql_ids.slice(),
    shapley: r4(phi[i]!),
    rank: 0,
  }));
  const sorted = rows.slice().sort((a, b) => b.shapley - a.shapley || a.finding_id.localeCompare(b.finding_id));
  sorted.forEach((row, i) => (row.rank = i + 1));
  // Return in the sorted order so top contributors come first.
  return sorted;
}

function leaveOneOut(findings: FindingT[], ctx: PolicyContext, verdict: VerdictT): LeaveOneOut[] {
  return findings.map((f) => {
    const subset = findings.filter((x) => x.id !== f.id);
    const p = policyFor(subset, ctx);
    return {
      finding_id: f.id,
      verdict_without: p.decision,
      confidence_without: p.confidence,
      changes_verdict: p.decision !== verdict,
    };
  });
}

function combinations<T>(xs: T[], k: number): T[][] {
  const out: T[][] = [];
  const n = xs.length;
  if (k <= 0 || k > n) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    out.push(idx.map((i) => xs[i]!));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i] = idx[i]! + 1;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
  return out;
}

/** Smallest set of findings whose removal flips the verdict. Searches size 1,
 *  2, 3; returns the first set found at the smallest size (ties resolved by
 *  the input order of `findings`) so the result is deterministic. */
export function minimalCounterfactualSet(findings: FindingT[], ctx: PolicyContext, verdict: VerdictT, maxSize = 3): MinimalCounterfactualSet | null {
  const n = findings.length;
  const limit = Math.min(maxSize, n);
  for (let k = 1; k <= limit; k++) {
    for (const combo of combinations(findings, k)) {
      const removedIds = new Set(combo.map((f) => f.id));
      const subset = findings.filter((f) => !removedIds.has(f.id));
      const p = policyFor(subset, ctx);
      if (p.decision !== verdict) {
        return { finding_ids: combo.map((f) => f.id), verdict: p.decision, confidence: p.confidence };
      }
    }
  }
  return null;
}

const ALL_VERDICTS: VerdictT[] = ["contain", "escalate", "monitor", "benign"];

/** Deterministic contrastive: for the runner-up verdict most often reached under single-finding removals / minimal counterfactual search, name the findings whose removal reaches it and the policy ingredients it would need. */
export function contrastive(findings: FindingT[], ctx: PolicyContext, verdict: VerdictT, loo: LeaveOneOut[], minSet: MinimalCounterfactualSet | null): Contrastive | null {
  const counts = new Map<VerdictT, { count: number; blocking: Set<string>; maxConf: number }>();
  const bump = (v: VerdictT, blockingFinding: string | null, conf: number) => {
    if (v === verdict) return;
    const row = counts.get(v) ?? { count: 0, blocking: new Set<string>(), maxConf: 0 };
    row.count += 1;
    if (blockingFinding) row.blocking.add(blockingFinding);
    if (conf > row.maxConf) row.maxConf = conf;
    counts.set(v, row);
  };
  for (const r of loo) bump(r.verdict_without, r.changes_verdict ? r.finding_id : null, r.confidence_without);
  if (minSet) {
    const row = counts.get(minSet.verdict) ?? { count: 0, blocking: new Set<string>(), maxConf: 0 };
    row.count += 1;
    for (const id of minSet.finding_ids) row.blocking.add(id);
    if (minSet.confidence > row.maxConf) row.maxConf = minSet.confidence;
    counts.set(minSet.verdict, row);
  }
  if (counts.size === 0) {
    // No single removal flips the verdict; fall back to a sweep over
    // {contain, escalate, monitor, benign} \ {verdict} to see if any smaller
    // configuration we have not probed could reach it. If still nothing, bail.
    const probe: Array<{ v: VerdictT; row: ReturnType<typeof counts.get> }> = [];
    for (const v of ALL_VERDICTS) if (v !== verdict) probe.push({ v, row: undefined });
    if (!probe.length) return null;
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].maxConf - a[1].maxConf || b[1].count - a[1].count);
  if (!ranked.length) return null;
  const [runnerUp, row] = ranked[0]!;
  const blocking = [...row.blocking].sort();
  const missing: string[] = [];
  const explanation = buildContrastiveText(verdict, runnerUp, blocking, findings, missing, ctx);
  return { runner_up: runnerUp, explanation, blocking_findings: blocking, missing_evidence: missing };
}

function buildContrastiveText(verdict: VerdictT, runnerUp: VerdictT, blocking: string[], findings: FindingT[], missing: string[], ctx: PolicyContext): string {
  const pretty = (ids: string[]) => (ids.length ? ids.join(", ") : "(none)");
  const describe = (ids: string[]) => findings.filter((f) => ids.includes(f.id)).map((f) => `${f.id} (${f.attack.join(",") || "no technique"})`).join(", ");
  // Why not <runner-up>: the policy would reach <runner-up> if these findings were removed; which policy ingredient is missing/present.
  if (verdict === "contain") {
    if (runnerUp === "benign") {
      if (blocking.length) return `Removing ${describe(blocking)} would collapse the abuse chain to zero surviving signals, so the policy would call this benign.`;
      return `No single-finding removal would flip to benign; the chain stands on multiple confirmed abuse signals.`;
    }
    if (runnerUp === "escalate") return `Removing ${pretty(blocking)} would drop the chain below the "≥2 confirmed abuse OR 1 abuse + 2 access" threshold, so the policy would escalate for human review.`;
    if (runnerUp === "monitor") return `Removing ${pretty(blocking)} would leave only unconfirmed signals, so the policy would monitor.`;
  }
  if (verdict === "benign") {
    if (runnerUp === "escalate") return `A confirmed exposure (T1133/T1190) or an abuse technique on this account would push the policy to escalate; the surviving findings today do not carry one.`;
    if (runnerUp === "monitor") return `A promoted LIKELY→CONFIRMED signal with an ATT&CK technique would turn benign into monitor; today every signal was either explained away or had no technique.`;
    if (runnerUp === "contain") return `Two confirmed post-auth abuse signals (T1621/T1114.003/T1213/T1110.003) would be needed to contain; the Critic approved none here.`;
  }
  if (verdict === "escalate") {
    if (runnerUp === "contain") return `Promoting ${pretty(blocking)} to CONFIRMED on a post-auth abuse technique would complete the chain and let the policy contain; today the chain is partial.`;
    if (runnerUp === "benign") return `Rejecting ${pretty(blocking)} would leave no surviving signal and the policy would land on benign — the opposite of the human-review path we chose.`;
    if (runnerUp === "monitor") return `Downgrading ${pretty(blocking)} to a LIKELY signal with a technique would land on monitor instead of escalate.`;
  }
  if (verdict === "monitor") {
    if (runnerUp === "benign") return `Rejecting ${pretty(blocking)} as unsupported would leave zero surviving signals and the policy would call this benign.`;
    if (runnerUp === "escalate") return `A DQ conflict or a confirmed exposure signal would push the policy from monitor to escalate.`;
    if (runnerUp === "contain") return `Promoting ${pretty(blocking)} to CONFIRMED with a post-auth abuse technique would let the policy contain.`;
  }
  return `Removing ${pretty(blocking)} would push the policy to ${runnerUp}.`;
}

/** Faithfulness: overlap between the Reporter's cited finding ids and the top-k Shapley findings. */
export function faithfulness(topShapley: Attribution[], citedIds: string[], k: number = DEFAULT_TOP_K): Faithfulness {
  const top = topShapley.slice(0, k).map((a) => a.finding_id);
  const citedSet = new Set(citedIds);
  const overlap = top.filter((id) => citedSet.has(id)).length;
  return { top_k: k, top_shapley_ids: top, cited_ids: citedIds, overlap, score: top.length ? r4(overlap / top.length) : 0 };
}

/** Extract F<n> finding ids cited in free-text (Reporter summary + action text). */
export function extractCitedFindingIds(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(/\bF(\d{1,3})\b/g)) {
    const id = `F${m[1]}`;
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Full explanation payload. */
export function explain(opts: ExplainOptions): Explanation {
  const ctx: PolicyContext = {
    rejectedCount: opts.rejectedCount,
    dqConflicts: opts.dqConflicts,
    degraded: opts.degraded,
    checkedSources: opts.checkedSources,
  };
  const findings = opts.findings;
  const full = policyFor(findings, ctx);
  const verdict = full.decision;
  const n = findings.length;
  const exactMax = opts.exactMax ?? DEFAULT_EXACT_MAX;
  const samples = opts.samples ?? DEFAULT_SAMPLES;
  const seed = opts.seed ?? DEFAULT_SEED;
  const useExact = n <= exactMax;
  const phi = useExact ? exactShapley(findings, ctx, verdict) : sampledShapley(findings, ctx, verdict, samples, seed);
  const attribution = rankAttribution(findings, phi);
  const loo = leaveOneOut(findings, ctx, verdict);
  const minSet = minimalCounterfactualSet(findings, ctx, verdict, 3);
  const contr = contrastive(findings, ctx, verdict, loo, minSet);
  return {
    verdict,
    confidence: full.confidence,
    mode: useExact ? "exact" : "sampled",
    n_findings: n,
    samples_used: useExact ? 0 : samples,
    attribution,
    counterfactuals: { leave_one_out: loo, minimal_set: minSet },
    contrastive: contr,
  };
}
