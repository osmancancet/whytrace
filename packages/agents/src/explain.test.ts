import { describe, expect, it } from "vitest";
import {
  exactShapley,
  explain,
  extractCitedFindingIds,
  faithfulness,
  minimalCounterfactualSet,
  policyFor,
  valueFor,
  type PolicyContext,
} from "./explain.ts";
import type { FindingT } from "./schema.ts";

const sqlId = "aaaaaaaaaaaa";

const mk = (id: string, attack: string[], status: FindingT["status"] = "CONFIRMED", confidence = 0.85, kind?: string): FindingT => ({
  id,
  hypothesis_id: "H1",
  claim: `${id} ${attack.join("+") || "no-tech"}`,
  status,
  sql_ids: [sqlId],
  row_refs: [],
  attack,
  confidence,
  kind,
  entity_ids: [],
  facts: {},
  dq_flags: [],
});

const CORE: PolicyContext = { rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"] };

describe("explain.ts attribution + counterfactuals", () => {
  it("efficiency: Shapley values sum to v(all) − v(∅)", () => {
    const findings = [mk("F1", ["T1621"]), mk("F2", ["T1114.003"]), mk("F3", ["T1078.004"]) ];
    const verdict = policyFor(findings, CORE).decision;
    const phi = exactShapley(findings, CORE, verdict);
    const total = phi.reduce((a, b) => a + b, 0);
    const vAll = valueFor(findings, CORE, verdict);
    const vEmpty = valueFor([], CORE, verdict);
    expect(Math.abs(total - (vAll - vEmpty))).toBeLessThan(1e-9);
  });

  it("symmetry: findings that produce identical marginal contributions get the same Shapley value", () => {
    // Two confirmed post-auth abuse findings of equal confidence and attack
    // technique category — swapping them changes nothing in policy(), so
    // Shapley must give them equal attribution.
    const twinA = mk("F1", ["T1621"], "CONFIRMED", 0.9);
    const twinB = mk("F2", ["T1621"], "CONFIRMED", 0.9);
    // A third finding supplies the "access" leg so the full set lands on contain.
    const access = mk("F3", ["T1078.004"], "CONFIRMED", 0.85);
    const findings = [twinA, twinB, access];
    const verdict = policyFor(findings, CORE).decision;
    expect(verdict).toBe("contain");
    const phi = exactShapley(findings, CORE, verdict);
    expect(Math.abs(phi[0]! - phi[1]!)).toBeLessThan(1e-9);
  });

  it("dummy player: a finding that never changes v gets Shapley 0", () => {
    const strong = mk("F1", ["T1621"], "CONFIRMED", 0.9);
    const strong2 = mk("F2", ["T1114.003"], "CONFIRMED", 0.9);
    // A LIKELY finding with no attack technique never participates in any of
    // the policy's "chain complete" / "exposure" / "weak" branches — it is a
    // pure dummy with respect to policy().
    const dummy = mk("F3", [], "LIKELY", 0.5);
    const findings = [strong, strong2, dummy];
    const verdict = policyFor(findings, CORE).decision;
    const phi = exactShapley(findings, CORE, verdict);
    expect(Math.abs(phi[2]!)).toBeLessThan(1e-9);
  });

  it("exact Shapley matches sampled Shapley within a tight tolerance on small inputs", () => {
    const findings = [mk("F1", ["T1621"]), mk("F2", ["T1114.003"]), mk("F3", ["T1078.004"]), mk("F4", ["T1213"]) ];
    const verdict = policyFor(findings, CORE).decision;
    const exact = exactShapley(findings, CORE, verdict);
    const sampledOutput = explain({ findings, ...CORE, exactMax: 0, samples: 20_000, seed: 123 });
    for (const row of sampledOutput.attribution) {
      const i = findings.findIndex((f) => f.id === row.finding_id);
      expect(Math.abs(row.shapley - exact[i]!)).toBeLessThan(0.015);
    }
    expect(sampledOutput.mode).toBe("sampled");
  });

  it("minimal counterfactual set finds the smallest removal that flips the verdict", () => {
    // contain needs ≥2 confirmed abuse OR 1 abuse + 2 access. With exactly one
    // abuse signal and two access signals, removing the single abuse finding
    // (size 1) collapses the chain.
    const abuse = mk("F1", ["T1621"], "CONFIRMED", 0.9);
    const access1 = mk("F2", ["T1078.004"], "CONFIRMED", 0.85);
    const access2 = mk("F3", ["T1078.004"], "CONFIRMED", 0.8);
    const findings = [abuse, access1, access2];
    const verdict = policyFor(findings, CORE).decision;
    expect(verdict).toBe("contain");
    const set = minimalCounterfactualSet(findings, CORE, verdict, 3);
    expect(set).not.toBeNull();
    expect(set!.finding_ids).toEqual(["F1"]);
    expect(set!.verdict).not.toBe("contain");
  });

  it("explain() names the single-finding counterfactual that collapses contain to escalate", () => {
    const findings = [
      mk("F1", ["T1621"], "CONFIRMED", 0.9),
      mk("F2", ["T1078.004"], "CONFIRMED", 0.85),
      mk("F3", ["T1078.004"], "CONFIRMED", 0.8),
    ];
    const out = explain({ findings, ...CORE });
    expect(out.verdict).toBe("contain");
    expect(out.counterfactuals.minimal_set).not.toBeNull();
    expect(out.counterfactuals.minimal_set!.finding_ids).toEqual(["F1"]);
    expect(out.counterfactuals.leave_one_out).toHaveLength(3);
    const abuseLoo = out.counterfactuals.leave_one_out.find((r) => r.finding_id === "F1")!;
    expect(abuseLoo.changes_verdict).toBe(true);
    expect(out.contrastive).not.toBeNull();
    expect(["escalate", "benign", "monitor"]).toContain(out.contrastive!.runner_up);
  });

  it("contrastive explanation for benign names the ingredients that would push it elsewhere", () => {
    // A single LIKELY finding with no ATT&CK technique leaves the policy on
    // benign (nothing surviving, core sources checked). The contrastive text
    // should describe which technique family would push the verdict away.
    const findings = [mk("F1", [], "LIKELY", 0.5)];
    const out = explain({ findings, ...CORE, rejectedCount: 2 });
    expect(out.verdict).toBe("benign");
    expect(out.counterfactuals.minimal_set).toBeNull();
    if (out.contrastive) {
      expect(out.contrastive.runner_up).not.toBe("benign");
      expect(out.contrastive.explanation.length).toBeGreaterThan(10);
    }
  });

  it("faithfulness scores overlap between top-k Shapley and cited finding ids", () => {
    const findings = [
      mk("F1", ["T1621"], "CONFIRMED", 0.9),
      mk("F2", ["T1114.003"], "CONFIRMED", 0.85),
      mk("F3", ["T1078.004"], "CONFIRMED", 0.8),
      mk("F4", ["T1213"], "CONFIRMED", 0.75),
    ];
    const out = explain({ findings, ...CORE });
    const top3 = out.attribution.slice(0, 3).map((a) => a.finding_id);
    const perfect = faithfulness(out.attribution, top3, 3);
    expect(perfect.score).toBe(1);
    const partial = faithfulness(out.attribution, [top3[0]!, "F42"], 3);
    expect(partial.overlap).toBe(1);
    expect(partial.score).toBeCloseTo(1 / 3, 3);
  });

  it("extractCitedFindingIds pulls F<n> tokens in order, deduplicated", () => {
    expect(extractCitedFindingIds("F1 and F10, also F1 again, then F2.")).toEqual(["F1", "F10", "F2"]);
    expect(extractCitedFindingIds("Shape F42-ish prose with FOO or Frob").toString()).toBe("F42");
    expect(extractCitedFindingIds("(no citations here)")).toEqual([]);
  });
});
