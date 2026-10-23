// M0 ablation unit tests: label plumbing + degraded accounting.
import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunTrace } from "@whytrace/adapters";
import { evaluateModelOnly } from "./model-only.ts";
import { FakeNightshift } from "./testing/fake-nightshift.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";

function setup() {
  const trace = new RunTrace({ logsRoot: mkdtempSync(join(tmpdir(), "whytrace-m0-")) });
  const zetaris = new FakeZetaris(undefined, trace);
  return { trace, zetaris };
}

describe("M0 model-only ablation", () => {
  it("labels decided_by=model_only even on a successful model call (the configuration is model-only by construction)", async () => {
    const { trace, zetaris } = setup();
    const nightshift = new FakeNightshift({ risk: () => ({ decision: "contain", confidence: 0.72, rationale: "spray + rule" }) });
    // The adapter interface for FakeNightshift's callTool wraps `submit_verdict` the same way: use the risk script shape.
    (nightshift as unknown as { script: { risk: (u: string) => { decision: string; confidence: number; rationale: string } } }).script = { risk: () => ({ decision: "contain", confidence: 0.72, rationale: "spray + rule" }) };
    const r = await evaluateModelOnly({ caseId: "case-001", upn: "d.yilmaz@aegean.edu", description: "test", zetaris, nightshift: nightshift as never, trace });
    expect(r.decided_by).toBe("model_only");
    expect(r.model_steps_total).toBe(1);
  });

  it("still labels decided_by=model_only when the model call degrades — accounting goes in model_steps_ok (0/1)", async () => {
    const { trace, zetaris } = setup();
    // Script failTools so the Nightshift adapter throws for submit_verdict.
    const nightshift = new FakeNightshift({ failTools: ["submit_verdict"] });
    const r = await evaluateModelOnly({ caseId: "case-001", upn: "d.yilmaz@aegean.edu", zetaris, nightshift: nightshift as never, trace });
    expect(r.decided_by).toBe("model_only");
    expect(r.model_steps_ok).toBe(0);
    expect(r.model_steps_total).toBe(1);
    expect(r.verdict).toBe("escalate"); // deterministic fallback when the single call failed
  });
});
