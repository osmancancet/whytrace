import { describe, it, expect } from "vitest";
import { canStandUnderDegrade, classifyDissent, gate, policy } from "./risk-gate.ts";
import type { FindingT } from "./schema.ts";

let n = 0;
const f = (attack: string[], status: FindingT["status"] = "CONFIRMED", confidence = 0.85): FindingT => ({ id: `F${++n}`, hypothesis_id: "H1", claim: attack.join("+"), status, sql_ids: ["aaaaaaaaaaaa"], row_refs: [], attack, confidence, entity_ids: [], facts: {}, dq_flags: [] });
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
  it("contains a standalone confirmed password-spray-then-success — the Critic has re-counted victims", () => {
    const spray: FindingT = { id: "F1", hypothesis_id: "H1", claim: "spray", status: "CONFIRMED", sql_ids: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], row_refs: [], attack: ["T1110.003", "T1078"], confidence: 0.85, kind: "password_spray", entity_ids: [], facts: {}, dq_flags: [] };
    const p = policy({ ...base, findings: [spray] });
    expect(p.decision).toBe("contain");
    expect(p.reasons.join(" ")).toMatch(/password-spray-then-success/);
  });
  it("still escalates a confirmed password-spray-then-success when DQ conflicts (independent evidence disagrees)", () => {
    const spray: FindingT = { id: "F1", hypothesis_id: "H1", claim: "spray", status: "CONFIRMED", sql_ids: ["aaaaaaaaaaaa"], row_refs: [], attack: ["T1110.003", "T1078"], confidence: 0.85, kind: "password_spray", entity_ids: [], facts: {}, dq_flags: [] };
    // Fall-through to the regular 1-abuse-1-access escalate branch when DQ conflicts.
    expect(policy({ ...base, findings: [spray], dqConflicts: ["x"] }).decision).toBe("escalate");
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
  // DAY3C: grounded-dissent tests use cited_finding_ids pointing at a
  // CONFIRMED finding id so the old (-0.1 + edge-escalation) behaviour kicks
  // in. The new ungrounded-dissent cases are covered in the dedicated
  // "grounded vs ungrounded" describe block below.
  const contain = { decision: "contain" as const, confidence: 0.95, reasons: [], escalate_reasons: [] };
  const groundedCited = { cited_finding_ids: ["F1"] };
  const groundingOpts = { approvedFindingIds: ["F1"], rejectedFindingIds: [] as string[] };

  it("keeps the policy decision when the model agrees", () => {
    expect(gate(contain, { decision: "contain", confidence: 0.9, rationale: "", ...groundedCited }, groundingOpts)).toMatchObject({ decision: "contain", agreed: true, confidence: 0.95 });
  });
  it("the model cannot downgrade strong evidence by itself, but grounded disagreement costs 0.1 confidence", () => {
    const g = gate(contain, { decision: "escalate", confidence: 0.9, rationale: "", ...groundedCited }, groundingOpts);
    expect(g).toMatchObject({ decision: "contain", agreed: false, confidence: 0.85 });
    expect(g.escalate_reasons[0]).toMatch(/model proposed escalate/);
  });
  it("grounded disagreement on a borderline contain sends the case to a human", () => {
    expect(gate({ ...contain, confidence: 0.75 }, { decision: "monitor", confidence: 0.6, rationale: "", ...groundedCited }, groundingOpts).decision).toBe("escalate");
  });
  it("the model cannot turn weak evidence into contain (even when its citation is confirmed)", () => {
    const g = gate({ decision: "monitor", confidence: 0.7, reasons: [], escalate_reasons: [] }, { decision: "contain", confidence: 0.99, rationale: "", ...groundedCited }, groundingOpts);
    expect(g.decision).toBe("escalate");
  });

  it("the model proposing contain against a partial-chain escalate stays escalate (never contain)", () => {
    const partial = { decision: "escalate" as const, confidence: 0.6, reasons: ["partial chain"], escalate_reasons: ["signals of compromise without a confirmed abuse chain"] };
    const g = gate(partial, { decision: "contain", confidence: 0.95, rationale: "", ...groundedCited }, groundingOpts);
    expect(g.decision).toBe("escalate");
    expect(g.escalate_reasons.join(" ")).toMatch(/model proposed contain/);
  });
});

describe("gate — grounded vs ungrounded model dissent", () => {
  const policyBenign = { decision: "benign" as const, confidence: 0.85, reasons: ["no surviving signal"], escalate_reasons: [] };
  const approved = ["F1", "F2"];
  const rejected = ["F3"];

  it("grounded dissent (model cites CONFIRMED finding) keeps the pre-DAY3C behaviour: -0.1 confidence and may escalate on edge", () => {
    const g = gate(policyBenign, { decision: "escalate", confidence: 0.9, rationale: "", cited_finding_ids: ["F1"] }, { approvedFindingIds: approved, rejectedFindingIds: rejected });
    expect(g.dissent?.kind).toBe("grounded_dissent");
    expect(g.confidence).toBe(0.75);
    // policy = benign, model = escalate → disruptive edge, confidence 0.75 ≥ 0.7 → still benign (but escalate_reasons records the dissent)
    expect(g.escalate_reasons.join(" ")).toMatch(/model proposed escalate/);
  });

  it("ungrounded dissent (model cites only REJECTED findings) keeps the policy verdict, drops confidence by only 0.05, and records the limitation", () => {
    const g = gate(policyBenign, { decision: "escalate", confidence: 0.9, rationale: "", cited_finding_ids: ["F3"] }, { approvedFindingIds: approved, rejectedFindingIds: rejected });
    expect(g.dissent?.kind).toBe("ungrounded_dissent");
    expect(g.confidence).toBe(0.8);
    expect(g.decision).toBe("benign");
    expect(g.escalate_reasons.join(" ")).toMatch(/model dissent not grounded/);
  });

  it("no-citations dissent (model lists no finding ids) is also ungrounded: policy kept, -0.05, limitation recorded", () => {
    const g = gate(policyBenign, { decision: "escalate", confidence: 0.9, rationale: "", cited_finding_ids: [] }, { approvedFindingIds: approved, rejectedFindingIds: rejected });
    expect(g.dissent?.kind).toBe("no_citations_dissent");
    expect(g.confidence).toBe(0.8);
    expect(g.decision).toBe("benign");
    expect(g.escalate_reasons.join(" ")).toMatch(/model dissent not grounded/);
  });

  it("no-citations dissent omitting cited_finding_ids entirely is still ungrounded", () => {
    const g = gate(policyBenign, { decision: "escalate", confidence: 0.9, rationale: "" }, { approvedFindingIds: approved, rejectedFindingIds: rejected });
    expect(g.dissent?.kind).toBe("no_citations_dissent");
    expect(g.confidence).toBe(0.8);
    expect(g.decision).toBe("benign");
  });

  it("agreed opinion is reported as `agreed`, not as any dissent kind", () => {
    const g = gate(policyBenign, { decision: "benign", confidence: 0.9, rationale: "", cited_finding_ids: ["F1"] }, { approvedFindingIds: approved, rejectedFindingIds: rejected });
    expect(g.dissent?.kind).toBe("agreed");
    expect(g.confidence).toBe(0.85);
  });

  it("classifyDissent catalogues the shapes directly", () => {
    expect(classifyDissent("benign", { decision: "benign", confidence: 1, rationale: "" }, approved, rejected)).toEqual({ kind: "agreed" });
    expect(classifyDissent("benign", { decision: "contain", confidence: 1, rationale: "" }, approved, rejected)).toEqual({ kind: "no_citations_dissent" });
    expect(classifyDissent("benign", { decision: "contain", confidence: 1, rationale: "", cited_finding_ids: ["F3"] }, approved, rejected)).toEqual({ kind: "ungrounded_dissent", cited_rejected: ["F3"] });
    expect(classifyDissent("benign", { decision: "contain", confidence: 1, rationale: "", cited_finding_ids: ["F99"] }, approved, rejected)).toEqual({ kind: "ungrounded_dissent", cited_rejected: [] });
    expect(classifyDissent("benign", { decision: "contain", confidence: 1, rationale: "", cited_finding_ids: ["F1", "F3"] }, approved, rejected)).toEqual({ kind: "grounded_dissent", cited_confirmed: ["F1"], cited_rejected: ["F3"] });
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
