import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunTrace } from "@whytrace/adapters";
import { investigate, listDemoCases } from "./orchestrator.ts";
import { CaseMemory } from "./memory.ts";
import { readQueryLog } from "./validate.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";
import { FakeNightshift } from "./testing/fake-nightshift.ts";
import type { VerdictT } from "./schema.ts";

// A model stand-in that reasons roughly like the deep lane: reads the verified evidence only.
const riskModel = (evidence: string): { decision: VerdictT; confidence: number; rationale: string } => {
  if (/T1621|T1110\.003/.test(evidence)) return { decision: "contain", confidence: 0.9, rationale: "takeover chain" };
  if (/T1133/.test(evidence)) return { decision: "escalate", confidence: 0.6, rationale: "exposed appliance" };
  if (/LIKELY[^\n]*T1078/.test(evidence)) return { decision: "monitor", confidence: 0.7, rationale: "weak signal" };
  return { decision: "benign", confidence: 0.85, rationale: "explained" };
};

function setup(caseId: string, opts: { memory?: CaseMemory; failTools?: string[]; ablate?: { critic?: boolean; dq?: boolean } } = {}) {
  const logsRoot = mkdtempSync(join(tmpdir(), "whytrace-test-"));
  const trace = new RunTrace({ logsRoot });
  const zetaris = new FakeZetaris(undefined, trace);
  const nightshift = new FakeNightshift({ risk: riskModel, failTools: opts.failTools });
  return { trace, zetaris, nightshift, run: () => investigate({ caseId, trace, zetaris, nightshift, memory: opts.memory, ablate: opts.ablate }) };
}

describe("orchestrator end-to-end on the six labelled cases (fake Zetaris + fake Nightshift)", () => {
  for (const c of listDemoCases()) {
    it(`${c.id} → ${c.expected}`, async () => {
      const { run, trace } = setup(c.id);
      const r = await run();
      expect(r.verdict).toBe(c.expected);
      // Every surviving claim cites queries that really ran in this run.
      const logged = new Set(readQueryLog(trace.files().queries).filter((q) => q.status === "ok").map((q) => q.sql_id));
      for (const f of r.findings) for (const id of f.sql_ids) expect(logged.has(id)).toBe(true);
      expect(r.budget!.sql_calls).toBeLessThanOrEqual(25);
      expect(r.budget!.model_calls).toBeLessThanOrEqual(30);
      expect(r.risk?.policy_decision).toBeDefined();
      expect(existsSync(join(trace.rootDir, "world-model-audit.jsonl"))).toBe(true);
    });
  }

  it("case-001 confirms the full chain with high confidence", async () => {
    const r = await setup("case-001").run();
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    expect(r.findings.filter((f) => f.status === "CONFIRMED").length).toBeGreaterThanOrEqual(6);
    expect(r.rejected_claims).toEqual([]);
    expect(r.timeline.length).toBeGreaterThan(0);
  });

  it("case-002 shows the Critic rejecting impossible travel", async () => {
    const r = await setup("case-002").run();
    expect(r.rejected_claims.some((c) => /Impossible travel/.test(c.claim) && /ExchangeSync/.test(c.reason))).toBe(true);
    expect(r.critic_verdicts.some((v) => v.status === "rejected")).toBe(true);
  });

  it("case-003 escalates because of KEV exposure and failing DQ on the appliance", async () => {
    const { run, trace } = setup("case-003");
    const r = await run();
    expect(r.rounds).toBeGreaterThanOrEqual(2); // pivot to the appliance happened in a later round
    expect(r.findings.some((f) => f.kind === "kev_exposure")).toBe(true);
    expect(r.dq.find((d) => d.scope === "appliance:vpn-edge-01")?.invalid).toBe(12);
    expect(r.limitations.join(" ")).toMatch(/vpn_session_order/);
    const lines = readFileSync(trace.files().trace, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.some((l) => l.agent === "risk_gate" && l.action === "decide")).toBe(true);
  });

  it("without the Critic, case-002 is no longer called benign (ablation A1)", async () => {
    const r = await setup("case-002", { ablate: { critic: false } }).run();
    expect(r.verdict).not.toBe("benign");
  });

  it("without DQ, case-003 loses its evidence-conflict reason (ablation A2)", async () => {
    const r = await setup("case-003", { ablate: { dq: false } }).run();
    expect(r.dq).toEqual([]);
    expect(r.risk!.escalate_reasons.join(" ")).not.toMatch(/evidence conflict/);
  });

  it("a failing planner degrades to coverage queries and escalates", async () => {
    const r = await setup("case-001", { failTools: ["submit_plan"] }).run();
    expect(r.verdict).toBe("escalate");
    expect(r.limitations.join(" ")).toMatch(/degraded/);
  });

  it("a failing reporter still yields a valid report", async () => {
    const r = await setup("case-001", { failTools: ["submit_note"] }).run();
    expect(r.summary).toMatch(/CONTAIN|ESCALATE/);
    expect(r.limitations.join(" ")).toMatch(/Reporter model unavailable/);
  });

  it("H-MEM: case-003 recalls the lesson stored by case-002 and still escalates", async () => {
    const memory = new CaseMemory({ persistDir: mkdtempSync(join(tmpdir(), "whytrace-hmem-")) });
    const r2 = await setup("case-002", { memory }).run();
    expect(r2.verdict).toBe("benign");
    expect(memory.hmem.store.all().length).toBeGreaterThan(0);
    const r3 = await setup("case-003", { memory }).run();
    expect(r3.memory_used.length).toBeGreaterThan(0);
    expect(r3.verdict).toBe("escalate");
  });
});
