import { describe, it, expect } from "vitest";
import { validateReport, checkFinding, indexQueryLog, type QueryLogRecord } from "./validate.ts";
import type { FindingT, Report } from "./schema.ts";

const A = "aaaaaaaaaaaa", B = "bbbbbbbbbbbb";
const log: QueryLogRecord[] = [
  { sql_id: A, rows: 3, status: "ok" },
  { sql_id: B, rows: 0, status: "error" },
];
const f = (over: Partial<FindingT> = {}): FindingT => ({ id: "F1", hypothesis_id: "H1", claim: "MFA fatigue", status: "CONFIRMED", sql_ids: [A], row_refs: [`${A}#0`, `${A}#2`], attack: ["T1621"], confidence: 0.9, entity_ids: [], facts: {}, dq_flags: [], ...over });
const report = (over: Partial<Report> = {}): Report => ({
  run_id: "r", case_id: "case-001", verdict: "contain", confidence: 0.9, summary: "s",
  timeline: [{ ts: "2026-10-14 06:59:00.0", event: "approve", sql_id: A }], findings: [f()], rejected_claims: [],
  actions: [{ action: "Revoke sessions", attack: ["T1078.004"], requires_approval: true }], limitations: [], not_checked: [], dq: [], memory_used: [],
  critic_verdicts: [], prompt_injection_attempts: [], exposure: [], rounds: 1, models: [], decided_by: "model+policy", model_steps_ok: 0, model_steps_total: 0, trace_id: "r", log_file: "x", execution_time_seconds: 1, ...over,
});

describe("checkFinding", () => {
  const idx = indexQueryLog(log);
  it("accepts a finding whose sql_ids and row_refs resolve", () => expect(checkFinding(f(), idx)).toBeNull());
  it("rejects an unknown sql_id", () => expect(checkFinding(f({ sql_ids: ["cccccccccccc"], row_refs: [] }), idx)).toMatch(/not in this run's query log/));
  it("rejects a sql_id that only failed", () => expect(checkFinding(f({ sql_ids: [B], row_refs: [] }), idx)).toMatch(/not in this run's query log/));
  it("rejects an out-of-range row_ref", () => expect(checkFinding(f({ row_refs: [`${A}#3`] }), idx)).toMatch(/out of range/));
  it("rejects a row_ref to a query the finding does not cite", () => expect(checkFinding(f({ row_refs: [`${B}#0`] }), idx)).toMatch(/does not list/));
  it("rejects an ATT&CK id outside the allow-list", () => expect(checkFinding(f({ attack: ["T9999"] }), idx)).toMatch(/allow-list/));
  it("rejects a finding without sql_ids", () => expect(checkFinding(f({ sql_ids: [], row_refs: [] }), idx)).toBe("no sql_id cited"));
});

describe("validateReport", () => {
  it("keeps a clean report unchanged", () => {
    const { report: r, issues } = validateReport(report(), log);
    expect(issues).toEqual([]);
    expect(r.findings).toHaveLength(1);
    expect(r.verdict).toBe("contain");
  });
  it("moves a fabricated finding into rejected_claims with the reason", () => {
    const fake = f({ id: "F2", claim: "Invented exfiltration", sql_ids: ["deadbeef0000"], row_refs: [] });
    const { report: r, issues } = validateReport(report({ findings: [f(), fake] }), log);
    expect(r.findings.map((x) => x.id)).toEqual(["F1"]);
    expect(r.rejected_claims[0]).toMatchObject({ claim: "Invented exfiltration" });
    expect(r.rejected_claims[0]!.reason).toMatch(/^validator: /);
    expect(issues).toHaveLength(1);
  });
  it("drops timeline events whose sql_id is not in the log", () => {
    const { report: r } = validateReport(report({ timeline: [{ ts: "t", event: "x", sql_id: "ffffffffffff" }] }), log);
    expect(r.timeline).toEqual([]);
  });
  it("strips unknown ATT&CK ids from actions", () => {
    const { report: r } = validateReport(report({ actions: [{ action: "Do X", attack: ["T1621", "TXXXX"], requires_approval: true }] }), log);
    expect(r.actions[0]!.attack).toEqual(["T1621"]);
  });
  it("downgrades contain to escalate when no finding survives", () => {
    const { report: r } = validateReport(report({ findings: [f({ sql_ids: ["deadbeef0000"], row_refs: [] })] }), log);
    expect(r.verdict).toBe("escalate");
    expect(r.limitations.join(" ")).toMatch(/downgraded/);
  });
  it("clamps an out-of-range confidence", () => {
    const { report: r, issues } = validateReport(report({ confidence: 1.4 }), log);
    expect(r.confidence).toBe(1);
    expect(issues.some((i) => i.item === "confidence")).toBe(true);
  });
});
