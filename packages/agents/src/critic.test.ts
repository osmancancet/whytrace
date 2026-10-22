import { describe, it, expect } from "vitest";
import { critique, rubric, SHARED_NAT_ASNS, SPRAY_BURST_WINDOW_HOURS } from "./critic.ts";
import { deriveFindings, FindingIds } from "./investigator.ts";
import { queryFor, type QueryName } from "./sql-catalogue.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";
import type { FindingT } from "./schema.ts";

async function draft(z: FakeZetaris, upn: string, names: QueryName[], params: Record<string, string> = {}) {
  const ids = new FindingIds();
  const out: FindingT[] = [];
  for (const n of names) {
    const r = await z.runSql(queryFor(n, { upn, ...params }).sql);
    out.push(...deriveFindings(n, { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids));
  }
  return out;
}

describe("Critic", () => {
  it("confirms the case-001 takeover chain with independent queries", async () => {
    const z = new FakeZetaris();
    const f = await draft(z, "d.yilmaz@aegean.edu", ["mail_chain", "clicks_for", "rules_for", "mfa_fatigue", "new_asn", "signins_for"]);
    const c = await critique(z, f);
    expect(c.rejected).toEqual([]);
    expect(new Set(c.approved.map((x) => x.kind))).toEqual(new Set(["phish_delivery", "click", "forward_rule", "mfa_fatigue", "new_asn", "bulk_sis"]));
    for (const a of c.approved) {
      expect(a.status).toBe("CONFIRMED");
      expect(a.sql_ids.length).toBe(2); // original + Critic's own check
      expect(a.sql_ids[0]).not.toBe(a.sql_ids[1]);
    }
  });

  it("rejects the premature impossible-travel and new-ASN claims in case-002", async () => {
    const z = new FakeZetaris();
    const f = await draft(z, "prof.kaya@aegean.edu", ["signins_for", "new_asn"]);
    expect(f.map((x) => x.kind).sort()).toEqual(["impossible_travel", "new_asn"]);
    const c = await critique(z, f);
    expect(c.approved).toEqual([]);
    expect(c.rejected.find((r) => /Impossible travel/.test(r.claim))?.reason).toMatch(/ExchangeSync/);
    expect(c.rejected.find((r) => /MEO/.test(r.claim))?.reason).toMatch(/managed device/);
    expect(z.calls.some((s) => s.includes("auth_pg.signin_events"))).toBe(true);
  });

  it("falls back to the USL when the raw source is unavailable", async () => {
    const z = new FakeZetaris();
    const f = await draft(z, "prof.kaya@aegean.edu", ["signins_for"]);
    z.failOn = /auth_pg\.signin_events/;
    const c = await critique(z, f);
    expect(c.rejected[0]!.reason).toMatch(/no device and no MFA|university VPN/);
  });

  it("rejects an internal OWA forwarding rule (case-005 decoy)", async () => {
    const z = new FakeZetaris();
    const c = await critique(z, await draft(z, "e.oz@aegean.edu", ["rules_for"]));
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]!.reason).toMatch(/internal @aegean\.edu/);
  });

  it("approves KEV exposure for the old appliance and rejects it for the patched one", async () => {
    const z = new FakeZetaris();
    const bad = await critique(z, await draft(z, "s.demir@aegean.edu", ["appliance_exposure"], { appliance_id: "vpn-edge-01" }));
    expect(bad.approved[0]).toMatchObject({ kind: "kev_exposure", status: "CONFIRMED" });
    const good = await critique(z, await draft(z, "prof.kaya@aegean.edu", ["appliance_exposure"], { appliance_id: "vpn-edge-02" }));
    expect(good.approved).toEqual([]);
    expect(good.rejected[0]!.reason).toMatch(/already includes the fixes/);
  });

  it("keeps an unmanaged-but-owned new device as LIKELY (case-006)", async () => {
    const z = new FakeZetaris();
    const c = await critique(z, (await draft(z, "b.cetin@aegean.edu", ["signins_for"])).filter((f) => f.kind === "new_device"));
    expect(c.approved[0]).toMatchObject({ kind: "new_device", status: "LIKELY" });
  });

  it("marks a finding needs_more when its check query fails", async () => {
    const z = new FakeZetaris();
    const f = await draft(z, "d.yilmaz@aegean.edu", ["mfa_fatigue"]);
    z.failOn = /GROUP BY result/;
    const c = await critique(z, f);
    expect(c.verdicts[0]!.status).toBe("needs_more");
    expect(c.needsMore).toHaveLength(1);
    expect(c.approved[0]!.status).toBe("SUSPECTED");
  });
});

describe("Critic — spray-noise detection", () => {
  const synthFinding = (upn: string, ip: string): FindingT => ({
    id: "F1", hypothesis_id: "H1", claim: `Password spray then success: ${ip} failed against 60 accounts (65 failures) and later signed in as this user`,
    status: "LIKELY", sql_ids: ["aaaaaaaaaaaa"], row_refs: ["aaaaaaaaaaaa#0"], attack: ["T1110.003", "T1078"], confidence: 0.85,
    kind: "password_spray", entity_ids: [`account:idp:${upn}`, `ip:net:${ip}`],
    facts: { upn, ip, accounts: 60, failures: 65, first_ts: "2026-10-05 09:00:00.0", last_ts: "2026-10-14 17:00:00.0" },
  });

  function tablesWithSharedNat(upn: string, ip: string, asn: string, days: number) {
    const base = {
      signin_event: [] as Record<string, string | number | null>[],
      mail_event: [] as Record<string, string | number | null>[],
      device: [] as Record<string, string | number | null>[],
      vulnerability: [] as Record<string, string | number | null>[],
      vpn_session: [] as Record<string, string | number | null>[],
      identity: [{ upn }],
    };
    let seq = 0;
    const push = (r: Record<string, string | number | null>) => { seq += 1; base.signin_event.push({ event_id: `evt_${seq}`, device_id: null, country: "TR", city: "Manisa", app: "portal", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0", ...r }); };
    for (let d = 0; d < days; d++) {
      for (let i = 0; i < 20; i++) push({ ts: `2026-10-${String(5 + d).padStart(2, "0")} 09:${String(i).padStart(2, "0")}:00.0`, upn: `student${d}_${i}@aegean.edu`, result: "failure", ip, asn_org: asn });
    }
    push({ ts: `2026-10-${String(5 + days - 1).padStart(2, "0")} 17:00:00.0`, upn, result: "success", ip, asn_org: asn, device_id: "LT-X", app: "portal" });
    return base;
  }

  it("rejects spray claim when the source IP is on a shared-NAT ASN (campus/consumer ISP)", async () => {
    const z = new FakeZetaris(tablesWithSharedNat("b.cetin@aegean.edu", "193.140.10.17", "AS-AEGEAN-EDU", 9));
    const c = await critique(z, [synthFinding("b.cetin@aegean.edu", "193.140.10.17")]);
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]!.reason).toMatch(/shared-NAT ASN/);
  });

  it("rejects spray claim when failures span more than the burst window — background noise, not a spray", async () => {
    // Use a non-shared ASN so the ASN branch does not fire; the window branch should.
    const z = new FakeZetaris(tablesWithSharedNat("x@aegean.edu", "203.0.113.9", "SomeOtherISP", 5));
    const c = await critique(z, [synthFinding("x@aegean.edu", "203.0.113.9")]);
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]!.reason).toMatch(/span.*h.*background noise/i);
  });

  it("approves a tight-burst spray with a bursty window from a non-shared ASN (case-004 shape)", async () => {
    const z = new FakeZetaris();
    const f: FindingT = {
      id: "F1", hypothesis_id: "H1", claim: "Password spray then success: 91.240.118.5 failed against 20 accounts (20 failures) and later signed in as this user",
      status: "LIKELY", sql_ids: ["aaaaaaaaaaaa"], row_refs: ["aaaaaaaaaaaa#0"], attack: ["T1110.003", "T1078"], confidence: 0.85,
      kind: "password_spray", entity_ids: ["account:idp:m.aslan@aegean.edu", "ip:net:91.240.118.5"],
      facts: { upn: "m.aslan@aegean.edu", ip: "91.240.118.5", accounts: 20, failures: 20, first_ts: "2026-10-18 02:00:00.0", last_ts: "2026-10-18 02:19:00.0" },
    };
    const c = await critique(z, [f]);
    expect(c.rejected).toEqual([]);
    expect(c.approved[0]!.status).toBe("CONFIRMED");
  });

  it("has sane constants", () => {
    expect(SHARED_NAT_ASNS.has("Turkcell")).toBe(true);
    expect(SHARED_NAT_ASNS.has("AS-AEGEAN-EDU")).toBe(true);
    expect(SPRAY_BURST_WINDOW_HOURS).toBeGreaterThan(0);
  });
});

describe("rubric", () => {
  it("penalises a contain verdict without confirmed abuse", () => {
    const s = rubric({ approved: [], rejected: 0, verdict: "contain", confidence: 0.9, actions: [], conflicts: [] });
    expect(s.appropriateness).toBe(1);
    expect(s.actionability).toBe(0);
  });
  it("scores a well-supported benign verdict >= 7", () => {
    const s = rubric({ approved: [], rejected: 2, verdict: "benign", confidence: 0.85, actions: [{ action: "Close alert", attack: [] }], conflicts: [] });
    expect(s.accuracy + s.appropriateness + s.actionability).toBeGreaterThanOrEqual(7);
  });
});
