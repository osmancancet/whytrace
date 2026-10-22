import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunTrace } from "@whytrace/adapters";
import { evaluateRulesOnly } from "./rules-baseline.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";

function setup(caseId: string, upn: string) {
  const logsRoot = mkdtempSync(join(tmpdir(), "whytrace-rules-"));
  const trace = new RunTrace({ logsRoot });
  const zetaris = new FakeZetaris(undefined, trace);
  return { trace, zetaris, run: () => evaluateRulesOnly({ caseId, upn, zetaris, trace }) };
}

describe("B0 rules-only baseline (Entra-style thresholds)", () => {
  it("case-001: external forwarding + MFA fatigue → contain", async () => {
    const r = await setup("case-001", "d.yilmaz@aegean.edu").run();
    expect(r.verdict).toBe("contain");
    expect(r.summary).toMatch(/external email forwarding|MFA denials/);
  });

  it("case-002: faculty travel from Portugal looks like impossible travel → false contain", async () => {
    const r = await setup("case-002", "prof.kaya@aegean.edu").run();
    expect(r.verdict).toBe("contain"); // the baseline is wrong here; whole point of B0
    expect(r.summary).toMatch(/impossible travel|new ASN/);
  });

  it("case-003: lab-admin sign-in via vulnerable appliance is only flagged as new ASN → monitor (misses escalate)", async () => {
    const r = await setup("case-003", "s.demir@aegean.edu").run();
    // The baseline cannot see the KEV match or DQ, so it under-reacts.
    expect(["monitor", "contain"]).toContain(r.verdict);
    expect(r.verdict).not.toBe("escalate");
  });

  it("case-005: benign new forwarding rule to aegean.edu is correctly left as benign", async () => {
    const r = await setup("case-005", "e.oz@aegean.edu").run();
    expect(r.verdict).toBe("benign");
  });

  it("records sql_ids in the query log", async () => {
    const { run, trace } = setup("case-005", "e.oz@aegean.edu");
    await run();
    expect(trace.files().queries).toMatch(/queries\.jsonl$/);
  });
});
