// Cross-case memory on the Meterless H-MEM engine. Before planning we recall
// lessons relevant to the alert; after a case we store what the Critic learned
// (with provenance = case id + sql_ids) so the next case starts smarter.
//
// Hygiene (DAY3E): a run only writes lessons when the verdict came from a
// successful model + policy decision — degraded or policy_fallback runs are
// skipped because their lessons disagree with the next clean run on the same
// case. Each written lesson carries a schema_version tag; recall filters to the
// current tag so old lessons that quote removed code paths never reach the
// Planner. User-correction lessons bypass the filter — the analyst's call is
// always authoritative. On write, the same pattern key supersedes the older
// lesson instead of adding a duplicate, so a pattern surfaces once in recall
// with the latest verdict + a count of supporting runs.
import { HMEM, type MemoryRecord } from "@whytrace/hmem";
import type { Report } from "./schema.ts";

export type Recall = { context: string; ids: string[]; lines: string[] };

// Bump this when the lesson text format or the orchestrator paths that
// generated earlier lessons change in a way that invalidates older recall.
// The current value is set when DAY3D's shared-egress Critic path, the
// hygienic learn() and the schema_version-filtered recall landed together.
export const MEMORY_SCHEMA_VERSION = "wt-day3e-1";
const SCHEMA_TAG = `schema:${MEMORY_SCHEMA_VERSION}`;

type PatternKey = { kind: "rejected" | "pattern"; key: string };

// Case ids embedded in the stored content are stripped so the same rejected
// claim seen across different cases consolidates onto one lesson. Numeric
// instance counts ("1 event(s)", "201 distinct accounts") also normalise — the
// signal is the SHAPE of the claim, not that this exact run saw this exact
// count.
function normaliseClaim(claim: string): string {
  return claim
    .replace(/\(case-\d+[^)]*\)/gi, "(case-X)")
    .replace(/\bcase-\d+\b/gi, "case-X")
    .replace(/\b\d+(?:\.\d+)?\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function patternKeyFor(content: string): PatternKey | null {
  const rejected = content.match(/^Rejected claim pattern \([^)]+\):\s*"([^"]+)"/);
  if (rejected) return { kind: "rejected", key: normaliseClaim(rejected[1]!) };
  const pattern = content.match(/^Case pattern \((case-[^)]+)\):\s*confirmed signals \[([^\]]*)\]/);
  if (pattern) {
    const caseId = pattern[1]!.toLowerCase();
    const sortedSignals = pattern[2]!.split(",").map((s) => s.trim()).filter(Boolean).sort().join(",");
    return { kind: "pattern", key: `${caseId}|${sortedSignals}` };
  }
  return null;
}

export class CaseMemory {
  readonly hmem: HMEM;
  constructor(opts: { persistDir?: string; clock?: () => number } = {}) {
    this.hmem = new HMEM({ persistDir: opts.persistDir, clock: opts.clock, actor: "whytrace" });
  }

  recall(query: string): Recall {
    // The engine ranks everything; we filter the result list so lessons from
    // older builds (missing SCHEMA_TAG) are hidden unless they are analyst
    // corrections, which are always load-bearing.
    const r = this.hmem.query(query, { topN: 10 });
    const kept = r.memories.filter(({ memory }) => isCurrentSchema(memory) || isAnalystCorrection(memory));
    const top = kept.slice(0, 3).map((m) => m.memory);
    return { context: top.map((m) => `- ${m.content}`).join("\n"), ids: top.map((m) => m.id), lines: top.map((m) => m.content) };
  }

  /** Lessons are derived from the report's own evidence, never from the expected label.
   *  Hygiene: runs where decided_by === "policy_fallback" (degraded Risk Gate
   *  or Reporter) write no lessons at all — their verdict is honest humility,
   *  not a repeatable pattern. Consolidation: a new lesson with the same
   *  pattern key supersedes any still-current older lesson instead of being
   *  stored as a duplicate. The newer lesson keeps `derivedFrom: [olderId]`
   *  so provenance survives. */
  learn(report: Report): string[] {
    if (report.decided_by === "policy_fallback") return [];

    const refs = [...new Set(report.findings.flatMap((f) => f.sql_ids))];
    const criticSqlRefs = [...new Set(report.critic_verdicts.map((v) => v.check_sql_id).filter((x): x is string => !!x))];
    const added: string[] = [];

    const writeLesson = (content: string, extras: { type: "factual" | "episodic"; confidence: number; tags: string[]; refs: string[] }) => {
      const key = patternKeyFor(content);
      const supersedes = key ? this.findSupersedable(key) : undefined;
      const rec = this.hmem.add({
        content,
        type: extras.type,
        layer: "working",
        source: `case:${report.case_id}`,
        confidence: extras.confidence,
        tags: [SCHEMA_TAG, ...extras.tags],
        provenance: { origin: "plan_completion", label: report.run_id, refs: extras.refs },
        supersedes: supersedes?.id,
        derivedFrom: supersedes ? [supersedes.id] : undefined,
      });
      added.push(rec.id);
    };

    for (const rc of report.rejected_claims.filter((c) => c.reason.startsWith("critic: "))) {
      writeLesson(
        `Rejected claim pattern (${report.case_id}): "${rc.claim}" was wrong because ${rc.reason.slice(8)}. Verdict: ${report.verdict}.`,
        { type: "factual", confidence: 0.75, tags: ["lesson", `verdict:${report.verdict}`], refs: criticSqlRefs },
      );
    }

    const kinds = [...new Set(report.findings.filter((f) => f.status === "CONFIRMED").map((f) => f.kind ?? "signal"))].sort();
    if (report.verdict !== "escalate" || kinds.length) {
      const tactics = [...new Set(report.findings.flatMap((f) => f.attack))].sort();
      writeLesson(
        `Case pattern (${report.case_id}): confirmed signals [${kinds.join(", ") || "none"}] led to verdict ${report.verdict} at confidence ${report.confidence}.`,
        { type: "episodic", confidence: report.confidence, tags: ["pattern", `verdict:${report.verdict}`, ...tactics.map((t) => `tactic:${t}`)], refs },
      );
    }

    return added;
  }

  feedback(ids: string[], kind: "helpful" | "not_helpful" | "wrong") {
    for (const id of ids) {
      try { this.hmem.feedback(id, kind); } catch { /* unknown id: ignore */ }
    }
  }

  // Walk the current store for the newest non-superseded lesson sharing the
  // given pattern key. Only current-schema lessons can be superseded this way;
  // older lessons stay hidden through recall filtering and will fall out via
  // the normal H-MEM sleep cycle.
  private findSupersedable(key: PatternKey): MemoryRecord | undefined {
    let newest: MemoryRecord | undefined;
    for (const rec of this.hmem.store.all()) {
      if (rec.supersededBy) continue;
      if (!isCurrentSchema(rec)) continue;
      const k = patternKeyFor(rec.content);
      if (!k || k.kind !== key.kind || k.key !== key.key) continue;
      if (!newest || rec.timestamp > newest.timestamp) newest = rec;
    }
    return newest;
  }
}

function isCurrentSchema(rec: MemoryRecord): boolean { return rec.tags.includes(SCHEMA_TAG); }
function isAnalystCorrection(rec: MemoryRecord): boolean { return rec.provenance?.origin === "user_correction" || rec.tags.includes("origin:user_correction"); }
