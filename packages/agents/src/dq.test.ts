import { describe, it, expect } from "vitest";
import { appliancesFromRows, applyDqPenalty, runScopedDq, scopedDqQueries } from "./dq.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";
import type { FindingT } from "./schema.ts";

const f = (over: Partial<FindingT>): FindingT => ({ id: "F1", hypothesis_id: "H", claim: "c", status: "CONFIRMED", sql_ids: ["aaaaaaaaaaaa"], row_refs: [], attack: [], confidence: 0.8, entity_ids: [], facts: {}, ...over });

describe("scoped DQ", () => {
  it("builds account checks plus one check per appliance", () => {
    const qs = scopedDqQueries("s.demir@aegean.edu", ["vpn-edge-01", "vpn-edge-01"]);
    expect(qs.map((q) => `${q.rule}@${q.scope}`)).toEqual(["fk_identity@account:s.demir@aegean.edu", "ts_not_null@account:s.demir@aegean.edu", "vpn_session_order@appliance:vpn-edge-01"]);
  });
  it("collects appliances from sign-in and VPN rows", () => {
    expect(appliancesFromRows([{ via_vpn_appliance: "vpn-edge-01" }, { appliance_id: "vpn-edge-02" }, { via_vpn_appliance: null }])).toEqual(["vpn-edge-01", "vpn-edge-02"]);
  });
  it("finds the clock-skew defect only on vpn-edge-01", async () => {
    const dq = await runScopedDq(new FakeZetaris(), "s.demir@aegean.edu", ["vpn-edge-01", "vpn-edge-02"]);
    expect(dq.find((d) => d.scope === "appliance:vpn-edge-01")?.invalid).toBe(12);
    expect(dq.find((d) => d.scope === "appliance:vpn-edge-02")?.invalid).toBe(0);
    expect(dq.every((d) => d.sql_id?.length === 12)).toBe(true);
  });
  it("penalises only findings that rest on failing evidence", () => {
    const dq = [{ table: "vpn_session", rule: "vpn_session_order", scope: "appliance:vpn-edge-01", valid: 2, invalid: 12 }];
    const out = applyDqPenalty([f({ id: "F1", entity_ids: ["device:cmdb:vpn-edge-01"] }), f({ id: "F2", facts: { via_vpn_appliance: "vpn-edge-01" } }), f({ id: "F3" })], dq);
    expect(out.findings.map((x) => x.confidence)).toEqual([0.56, 0.56, 0.8]);
    expect(out.limitations).toHaveLength(2);
    expect(out.conflicts).toEqual(["DQ vpn_session_order failing for appliance:vpn-edge-01"]);
  });
});
