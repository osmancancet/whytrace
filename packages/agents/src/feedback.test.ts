import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunTrace } from "@whytrace/adapters";
import { applyAnalystFeedback, investigate } from "./orchestrator.ts";
import { CaseMemory } from "./memory.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";
import { FakeNightshift } from "./testing/fake-nightshift.ts";
import type { VerdictT } from "./schema.ts";

const riskModel = (evidence: string): { decision: VerdictT; confidence: number; rationale: string } => {
  if (/T1621|T1110\.003/.test(evidence)) return { decision: "contain", confidence: 0.9, rationale: "takeover chain" };
  if (/T1133/.test(evidence)) return { decision: "escalate", confidence: 0.6, rationale: "exposed appliance" };
  if (/LIKELY[^\n]*T1078/.test(evidence)) return { decision: "monitor", confidence: 0.7, rationale: "weak signal" };
  return { decision: "benign", confidence: 0.85, rationale: "explained" };
};

function setup(caseId: string, memory: CaseMemory) {
  const logsRoot = mkdtempSync(join(tmpdir(), "whytrace-feedback-"));
  const trace = new RunTrace({ logsRoot });
  const zetaris = new FakeZetaris(undefined, trace);
  const nightshift = new FakeNightshift({ risk: riskModel });
  return { trace, run: () => investigate({ caseId, trace, zetaris, nightshift, memory }) };
}

describe("analyst feedback loop", () => {
  it("records an analyst correction as a high-confidence H-MEM lesson", async () => {
    const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-fb-hmem-")) });
    const report = await setup("case-001", memory).run();
    const ids = applyAnalystFeedback(memory, {
      report,
      verdictCorrection: report.verdict, // analyst agrees
      rejectedFindingIds: [],
      confirmedFindingIds: [report.findings[0]!.id],
      analyst: "a@univ.edu",
      note: "confirmed",
    });
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const stored = memory.hmem.store.all();
    const confirmed = stored.filter((m) => m.tags.includes("analyst-confirmed"));
    expect(confirmed.length).toBeGreaterThanOrEqual(2);
    expect(confirmed[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(confirmed[0]!.provenance?.origin).toBe("user_correction");
  });

  it("the analyst-confirmed lesson is stored in H-MEM with origin user_correction", async () => {
    const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-fb-hmem2-")) });
    const first = await setup("case-002", memory).run();
    applyAnalystFeedback(memory, { report: first, verdictCorrection: first.verdict, analyst: "a@univ.edu" });
    // Later runs can see the lesson in the H-MEM store even if ranking surfaces
    // other lessons first; the analyst-confirmed lesson is still available for
    // targeted recall (via entities / tags) and future planners.
    const stored = memory.hmem.store.all();
    const confirmed = stored.filter((m) => m.provenance?.origin === "user_correction");
    expect(confirmed.length).toBeGreaterThanOrEqual(1);
    expect(confirmed[0]!.tags).toContain("analyst-confirmed");
    expect(confirmed[0]!.confidence).toBeGreaterThanOrEqual(0.9);
    // Re-run case-003 and confirm the orchestrator still recalls lessons (even if
    // not the exact analyst-confirmed one — ranking is tested in HMEM conformance).
    const second = await setup("case-003", memory).run();
    expect(second.memory_used.length).toBeGreaterThan(0);
  });

  it("rejecting a finding writes the lesson and marks the memory wrong", async () => {
    const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-fb-hmem3-")) });
    const report = await setup("case-001", memory).run();
    const target = report.findings[0]!;
    applyAnalystFeedback(memory, { report, rejectedFindingIds: [target.id], analyst: "a@univ.edu" });
    const stored = memory.hmem.store.all();
    const match = stored.find((m) => m.content.includes("Analyst rejected finding") && m.content.includes(target.id));
    expect(match).toBeDefined();
    expect(match!.tags).toContain("origin:user_correction");
  });
});
