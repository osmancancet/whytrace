import { describe, it, expect } from "vitest";
import { canStandUnderDegrade, gate, policy } from "./risk-gate.ts";
import type { FindingT } from "./schema.ts";

let n = 0;
const f = (attack: string[], status: FindingT["status"] = "CONFIRMED", confidence = 0.85): FindingT => ({ id: `F${++n}`, hypothesis_id: "H1", claim: attack.join("+"), status, sql_ids: ["aaaaaaaaaaaa"], row_refs: [], attack, confidence, entity_ids: [], facts: {} });
const base = { rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"] };

describe("Risk Gate policy", () => {
  it("contains a confirmed takeover chain", () => {
    const p = policy({ ...base, findings: [f(["T1566.002"]), f(["T1204.001"]), f(["T1621"], "CONFIRMED", 0.9), f(["T1114.003"]), f(["T1213"]), f(["T1078.004"], "CONFIRMED", 0.75)] });
    expect(p.decision).toBe("contain");
    expect(p.confidence).toBeGreaterThanOrEqual(0.9);
  });
  it("contains password spray followed by success from a new ASN", () => {
    expect(policy({ ...base, findings: [f(["T1110.003", "T1078"]), f(["T1078.004"])] }).decision).toBe("contain");
  });
  it("escalates an exposed appliance without an abuse chain", () => {
    const p = policy({ ...base, findings: [f(["T1078.004"], "CONFIRMED", 0.53), f(["T1133", "T1190"], "CONFIRMED", 0.49)], dqConflicts: ["DQ vpn_session_order failing for appliance:vpn-edge-01"] });
    expect(p.decision).toBe("escalate");
    expect(p.escalate_reasons.join(" ")).toMatch(/evidence conflict/);
  });
  it("escalates even a strong chain when DQ conflicts and abuse < 3", () => {
    expect(policy({ ...base, findings: [f(["T1621"]), f(["T1114.003"])], dqConflicts: ["x"] }).decision).toBe("escalate");
  });
  it("calls benign when every signal was explained away and core sources were checked", () => {
    const p = policy({ ...base, findings: [f([], "LIKELY", 0.5)], rejectedCount: 2 });
    expect(p.decision).toBe("benign");
    expect(p.confidence).toBe(0.85);
  });
  it("refuses benign when core sources were not checked", () => {
    expect(policy({ ...base, findings: [], checkedSources: ["signin_event"] }).decision).toBe("escalate");
  });
  it("monitors a weak unconfirmed signal", () => {
    expect(policy({ ...base, findings: [f(["T1078"], "LIKELY", 0.6)] }).decision).toBe("monitor");
  });
  it("escalates instead of monitor when degraded", () => {
    expect(policy({ ...base, findings: [f(["T1078"], "LIKELY")], degraded: true }).decision).toBe("escalate");
  });
});

describe("gate", () => {
  const contain = { decision: "contain" as const, confidence: 0.95, reasons: [], escalate_reasons: [] };
  it("keeps the policy decision when the model agrees", () => {
    expect(gate(contain, { decision: "contain", confidence: 0.9, rationale: "" })).toMatchObject({ decision: "contain", agreed: true, confidence: 0.95 });
  });
  it("the model cannot downgrade strong evidence by itself, but disagreement costs confidence", () => {
    const g = gate(contain, { decision: "escalate", confidence: 0.9, rationale: "" });
    expect(g).toMatchObject({ decision: "contain", agreed: false, confidence: 0.85 });
    expect(g.escalate_reasons[0]).toMatch(/model proposed escalate/);
  });
  it("disagreement on a borderline contain sends the case to a human", () => {
    expect(gate({ ...contain, confidence: 0.75 }, { decision: "monitor", confidence: 0.6, rationale: "" }).decision).toBe("escalate");
  });
  it("the model cannot turn weak evidence into contain", () => {
    const g = gate({ decision: "monitor", confidence: 0.7, reasons: [], escalate_reasons: [] }, { decision: "contain", confidence: 0.99, rationale: "" });
    expect(g.decision).toBe("escalate");
  });

  it("the model proposing contain against a partial-chain escalate stays escalate (never contain)", () => {
    const partial = { decision: "escalate" as const, confidence: 0.6, reasons: ["partial chain"], escalate_reasons: ["signals of compromise without a confirmed abuse chain"] };
    const g = gate(partial, { decision: "contain", confidence: 0.95, rationale: "" });
    expect(g.decision).toBe("escalate");
    expect(g.escalate_reasons.join(" ")).toMatch(/model proposed contain/);
  });
});

describe("canStandUnderDegrade", () => {
  const base = { dqConflicts: [] as string[], checkedSources: ["signin_event", "mail_event"] };
  it("accepts a confident, DQ-clean, source-complete non-escalate policy", () => {
    expect(canStandUnderDegrade({ decision: "contain", confidence: 0.9, reasons: [], escalate_reasons: [] }, base)).toBe(true);
    expect(canStandUnderDegrade({ decision: "benign", confidence: 0.85, reasons: [], escalate_reasons: [] }, base)).toBe(true);
  });
  it("rejects a policy that already wanted to escalate", () => {
    expect(canStandUnderDegrade({ decision: "escalate", confidence: 0.9, reasons: [], escalate_reasons: [] }, base)).toBe(false);
  });
  it("rejects a policy with its own escalation reasons", () => {
    expect(canStandUnderDegrade({ decision: "monitor", confidence: 0.9, reasons: [], escalate_reasons: ["signals of compromise without a confirmed abuse chain"] }, base)).toBe(false);
  });
  it("rejects when DQ conflicts exist", () => {
    expect(canStandUnderDegrade({ decision: "contain", confidence: 0.9, reasons: [], escalate_reasons: [] }, { ...base, dqConflicts: ["x"] })).toBe(false);
  });
  it("rejects when a core source was not checked", () => {
    expect(canStandUnderDegrade({ decision: "contain", confidence: 0.9, reasons: [], escalate_reasons: [] }, { ...base, checkedSources: ["signin_event"] })).toBe(false);
  });
  it("rejects when confidence is thin — the humility penalty would drop below 0.7", () => {
    expect(canStandUnderDegrade({ decision: "monitor", confidence: 0.75, reasons: [], escalate_reasons: [] }, base)).toBe(false);
  });
});
