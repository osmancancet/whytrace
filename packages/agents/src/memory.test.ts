import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CaseMemory, MEMORY_SCHEMA_VERSION } from "./memory.ts";
import type { Report } from "./schema.ts";

function tmp(): string { return mkdtempSync(join(tmpdir(), "whytrace-mem-")); }

function baseReport(overrides: Partial<Report>): Report {
  return {
    run_id: overrides.run_id ?? "run_" + Math.random().toString(36).slice(2, 8),
    case_id: overrides.case_id ?? "case-001",
    verdict: overrides.verdict ?? "contain",
    confidence: overrides.confidence ?? 0.9,
    summary: "test summary",
    timeline: [],
    findings: overrides.findings ?? [{
      id: "F1", hypothesis_id: "H1", claim: "takeover chain", status: "CONFIRMED",
      sql_ids: ["sql-1"], row_refs: [], attack: ["T1078"], confidence: 0.9,
      kind: "phish_delivery", entity_ids: [], facts: {}, dq_flags: [],
    }],
    rejected_claims: overrides.rejected_claims ?? [],
    actions: [],
    limitations: [],
    not_checked: [],
    dq: [],
    memory_used: [],
    critic_score: { accuracy: 3, appropriateness: 3, actionability: 3 },
    critic_verdicts: [],
    prompt_injection_attempts: [],
    exposure: [],
    risk: { decision: "contain", policy_decision: "contain", confidence: 0.9, rationale: "r", escalate_reasons: [] },
    rounds: 1,
    budget: { sql_calls: 1, model_calls: 1 },
    models: [],
    decided_by: overrides.decided_by ?? "model+policy",
    model_steps_ok: 2, model_steps_total: 2,
    trace_id: "trace_id",
    log_file: "log",
    execution_time_seconds: 1,
  } as Report;
}

describe("CaseMemory hygiene", () => {
  it("writes a schema-version tag on every lesson", () => {
    const mem = new CaseMemory({ persistDir: tmp() });
    mem.learn(baseReport({ case_id: "case-002", verdict: "benign", confidence: 0.85 }));
    const stored = mem.hmem.store.all();
    expect(stored.length).toBeGreaterThan(0);
    for (const rec of stored) expect(rec.tags).toContain(`schema:${MEMORY_SCHEMA_VERSION}`);
  });

  it("writes nothing when decided_by is policy_fallback", () => {
    const mem = new CaseMemory({ persistDir: tmp() });
    const added = mem.learn(baseReport({ case_id: "case-005", decided_by: "policy_fallback", verdict: "escalate" }));
    expect(added).toEqual([]);
    expect(mem.hmem.store.all().length).toBe(0);
  });

  it("supersedes an older lesson with the same pattern key instead of duplicating", () => {
    const mem = new CaseMemory({ persistDir: tmp() });
    mem.learn(baseReport({
      case_id: "case-002", verdict: "escalate", confidence: 0.65,
      findings: [{ id: "F1", hypothesis_id: "H1", claim: "sign-in from new ASN", status: "CONFIRMED", sql_ids: ["sql-1"], row_refs: [], attack: [], confidence: 0.6, kind: "new_asn", entity_ids: [], facts: {}, dq_flags: [] }],
    }));
    const first = mem.hmem.store.all();
    expect(first.length).toBeGreaterThan(0);
    const firstPattern = first.find((r) => r.content.includes("Case pattern (case-002)"))!;
    expect(firstPattern.supersededBy).toBeUndefined();

    // Later run on the same case with the same signal set but a different verdict.
    mem.learn(baseReport({
      case_id: "case-002", verdict: "benign", confidence: 0.85,
      findings: [{ id: "F1", hypothesis_id: "H1", claim: "sign-in from new ASN", status: "CONFIRMED", sql_ids: ["sql-2"], row_refs: [], attack: [], confidence: 0.6, kind: "new_asn", entity_ids: [], facts: {}, dq_flags: [] }],
    }));
    const after = mem.hmem.store.all();
    const previous = after.find((r) => r.id === firstPattern.id)!;
    expect(previous.supersededBy).toBeDefined();
    const newer = after.find((r) => r.id === previous.supersededBy)!;
    expect(newer.content).toContain("verdict benign");
    expect(newer.derivedFrom).toContain(firstPattern.id);
  });

  it("consolidates rejected-claim patterns across cases (same shape → one surviving lesson)", () => {
    const mem = new CaseMemory({ persistDir: tmp() });
    const sharedRejection = { claim: "Password spray then success", reason: "critic: shared-egress IP" };
    mem.learn(baseReport({ case_id: "case-002", verdict: "benign", confidence: 0.85, rejected_claims: [sharedRejection], findings: [] }));
    mem.learn(baseReport({ case_id: "case-003", verdict: "escalate", confidence: 0.5, rejected_claims: [sharedRejection], findings: [] }));
    const stored = mem.hmem.store.all();
    const rejected = stored.filter((r) => r.content.startsWith("Rejected claim pattern"));
    const survivors = rejected.filter((r) => !r.supersededBy);
    expect(rejected.length).toBe(2);
    expect(survivors.length).toBe(1);
    expect(survivors[0]!.content).toContain("case-003");
  });

  it("recall hides lessons that lack the current schema tag (older build)", () => {
    const mem = new CaseMemory({ persistDir: tmp() });
    mem.hmem.add({
      content: "Legacy lesson from an older build (no schema tag)",
      source: "case:case-002",
      tags: ["lesson"],
      type: "factual",
      layer: "working",
      confidence: 0.95,
    });
    mem.learn(baseReport({ case_id: "case-001" }));
    const r = mem.recall("case-002");
    for (const line of r.lines) expect(line).not.toMatch(/Legacy lesson from an older build/);
  });

  it("recall keeps analyst-correction lessons regardless of schema tag", () => {
    const mem = new CaseMemory({ persistDir: tmp() });
    mem.hmem.add({
      content: "Analyst-confirmed: case-002 benign is the correct call.",
      source: "case:case-002",
      tags: ["analyst-confirmed", "origin:user_correction"],
      type: "factual",
      layer: "working",
      confidence: 0.95,
      provenance: { origin: "user_correction", label: "analyst@univ.edu" },
    });
    const r = mem.recall("case-002 benign");
    const matched = r.lines.some((l) => l.includes("Analyst-confirmed"));
    expect(matched).toBe(true);
  });
});
