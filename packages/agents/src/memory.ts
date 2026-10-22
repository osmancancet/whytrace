// Cross-case memory on the Meterless H-MEM engine. Before planning we recall
// lessons relevant to the alert; after a case we store what the Critic learned
// (with provenance = case id + sql_ids) so the next case starts smarter.
import { HMEM } from "@whytrace/hmem";
import type { Report } from "./schema.ts";

export type Recall = { context: string; ids: string[]; lines: string[] };

export class CaseMemory {
  readonly hmem: HMEM;
  constructor(opts: { persistDir?: string; clock?: () => number } = {}) {
    this.hmem = new HMEM({ persistDir: opts.persistDir, clock: opts.clock, actor: "whytrace" });
  }

  recall(query: string): Recall {
    const r = this.hmem.query(query, { topN: 3 });
    const mems = r.memories.map((m) => m.memory);
    return { context: r.context, ids: mems.map((m) => m.id), lines: mems.map((m) => m.content) };
  }

  /** Lessons are derived from the report's own evidence, never from the expected label. */
  learn(report: Report): string[] {
    const added: string[] = [];
    const refs = [...new Set(report.findings.flatMap((f) => f.sql_ids))];
    for (const rc of report.rejected_claims.filter((c) => c.reason.startsWith("critic: "))) {
      const content = `Rejected claim pattern (${report.case_id}): "${rc.claim}" was wrong because ${rc.reason.slice(8)}. Verdict: ${report.verdict}.`;
      added.push(this.hmem.add({ content, type: "factual", layer: "working", source: `case:${report.case_id}`, confidence: 0.75, tags: ["lesson", `verdict:${report.verdict}`], provenance: { origin: "plan_completion", label: report.run_id, refs: [...new Set(report.critic_verdicts.map((v) => v.check_sql_id).filter((x): x is string => !!x))] } }).id);
    }
    const kinds = [...new Set(report.findings.filter((f) => f.status === "CONFIRMED").map((f) => f.kind ?? "signal"))].sort();
    if (report.verdict !== "escalate" || kinds.length) {
      const tactics = [...new Set(report.findings.flatMap((f) => f.attack))].sort();
      const content = `Case pattern (${report.case_id}): confirmed signals [${kinds.join(", ") || "none"}] led to verdict ${report.verdict} at confidence ${report.confidence}.`;
      added.push(this.hmem.add({ content, type: "episodic", layer: "working", source: `case:${report.case_id}`, confidence: report.confidence, tags: ["pattern", `verdict:${report.verdict}`, ...tactics.map((t) => `tactic:${t}`)], provenance: { origin: "plan_completion", label: report.run_id, refs } }).id);
    }
    return added;
  }

  feedback(ids: string[], kind: "helpful" | "not_helpful" | "wrong") {
    for (const id of ids) {
      try { this.hmem.feedback(id, kind); } catch { /* unknown id: ignore */ }
    }
  }
}
