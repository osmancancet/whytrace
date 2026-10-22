import { describe, it, expect } from "vitest";
import { buildEvidenceText, buildRejectedText } from "./orchestrator.ts";
import type { FindingT } from "./schema.ts";

const mk = (over: Partial<FindingT>): FindingT => ({
  id: "F1",
  hypothesis_id: "H1",
  claim: "claim",
  status: "LIKELY",
  sql_ids: ["sqlid"],
  row_refs: [],
  attack: [],
  confidence: 0.5,
  entity_ids: [],
  facts: {},
  ...over,
});

describe("buildEvidenceText / buildRejectedText trim behaviour", () => {
  it("prefers CONFIRMED findings over LIKELY and orders by confidence", () => {
    const findings: FindingT[] = [
      mk({ id: "F1", status: "LIKELY", confidence: 0.9, claim: "weak" }),
      mk({ id: "F2", status: "CONFIRMED", confidence: 0.7, claim: "mid confirmed" }),
      mk({ id: "F3", status: "CONFIRMED", confidence: 0.95, claim: "top" }),
    ];
    const text = buildEvidenceText(findings);
    const lines = text.split("\n");
    expect(lines[0]).toMatch(/F3.*CONFIRMED/);
    expect(lines[1]).toMatch(/F2.*CONFIRMED/);
    expect(lines[2]).toMatch(/F1.*LIKELY/);
  });

  it("caps claim length at 240 characters so a verbose claim cannot blow up the prompt", () => {
    const long = "x".repeat(500);
    const text = buildEvidenceText([mk({ claim: long, status: "CONFIRMED" })]);
    const line = text.split("\n")[0]!;
    expect(line).toContain("…");
    expect(line.length).toBeLessThan(400);
  });

  it("caps the total number of findings and reports how many were trimmed", () => {
    const findings = Array.from({ length: 25 }, (_, i) => mk({ id: `F${i + 1}`, status: "CONFIRMED", confidence: 0.9 - i * 0.01, claim: `claim ${i}` }));
    const text = buildEvidenceText(findings);
    expect(text).toMatch(/more trimmed/);
    // 12 kept + 1 "more trimmed" line.
    expect(text.split("\n").length).toBeLessThanOrEqual(13);
  });

  it("returns a stable placeholder when no findings survive", () => {
    expect(buildEvidenceText([])).toBe("(no surviving findings)");
    expect(buildRejectedText([])).toBe("(none)");
  });

  it("rejected text trims claim and reason to the character cap", () => {
    const rejected = [{ claim: "a".repeat(500), reason: "b".repeat(500) }];
    const text = buildRejectedText(rejected);
    expect(text).toContain("…");
    expect(text.length).toBeLessThan(800);
  });

  it("rejected text caps the number of items and reports the overflow", () => {
    const rejected = Array.from({ length: 20 }, (_, i) => ({ claim: `c${i}`, reason: `r${i}` }));
    const text = buildRejectedText(rejected);
    expect(text).toMatch(/more rejected claims trimmed/);
  });
});
