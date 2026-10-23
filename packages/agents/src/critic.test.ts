import { describe, it, expect } from "vitest";
import { critique, isSharedEgressIp, rubric, SHARED_EGRESS_LOOKBACK_DAYS, SHARED_EGRESS_MFA_COMPLETED_UPNS, SHARED_NAT_ASNS, SPRAY_BURST_WINDOW_HOURS } from "./critic.ts";
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
    dq_flags: [],
  });

  /** Build a fixture that puts N distinct MFA-completed sign-ins on a single IP
   *  within the shared-egress lookback window, plus a spray-shaped success for
   *  the alerting user. The Critic should reject the spray claim because that
   *  IP already serves many legitimate accounts — it is shared egress, data-
   *  derived, not from a hard-coded ISP list. */
  function tablesWithSharedEgress(upn: string, ip: string, distinctMfaUsers: number) {
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
    // Yesterday-ish timestamps so CURRENT_DATE - INTERVAL '30' DAY includes them.
    const soon = (d: number, h = 9, m = 0) => new Date(Date.now() - d * 86_400_000 + h * 3_600_000 + m * 60_000).toISOString().replace("T", " ").replace("Z", ".0");
    for (let i = 0; i < distinctMfaUsers; i++) push({ ts: soon(2, 9, i), upn: `student${i}@aegean.edu`, result: "mfa_approved", ip, asn_org: "campus-net", mfa_prompt_count: 1 });
    // The alerting user also fails many times from the same IP; this is the pattern we are testing against.
    for (let i = 0; i < 20; i++) push({ ts: soon(1, 2, i), upn: `student${i}@aegean.edu`, result: "failure", ip, asn_org: "campus-net" });
    push({ ts: soon(0, 17), upn, result: "success", ip, asn_org: "campus-net", device_id: "LT-X" });
    return base;
  }

  it("rejects spray claim when the IP looks like shared egress (many distinct accounts completed MFA from it)", async () => {
    // 12 ≥ SHARED_EGRESS_MFA_COMPLETED_UPNS (10 default) → data-derived shared-egress.
    const z = new FakeZetaris(tablesWithSharedEgress("b.cetin@aegean.edu", "193.140.10.17", 12));
    const c = await critique(z, [synthFinding("b.cetin@aegean.edu", "193.140.10.17")]);
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]!.reason).toMatch(/shared egress/i);
    expect(c.rejected[0]!.reason).toMatch(/\d+ distinct accounts completed MFA/);
    // The reason must NOT name an ISP / org — the test guards against regressions.
    expect(c.rejected[0]!.reason).not.toMatch(/Turkcell|TTNET|Superonline|AS-AEGEAN-EDU/);
  });

  it("isSharedEgressIp returns shared=false when the MFA-completed account count is below threshold", async () => {
    const z = new FakeZetaris(tablesWithSharedEgress("x@aegean.edu", "203.0.113.9", 3));
    const r = await isSharedEgressIp(z, "203.0.113.9");
    expect(r.shared).toBe(false);
    // 3 students with mfa_approved + the alerting user's later success → 4.
    expect(r.distinct_mfa_upns).toBe(4);
    expect(r.threshold).toBe(SHARED_EGRESS_MFA_COMPLETED_UPNS);
  });

  it("approves a tight-burst spray with a bursty window from a fresh non-shared IP (case-004 shape)", async () => {
    const z = new FakeZetaris();
    const f: FindingT = {
      id: "F1", hypothesis_id: "H1", claim: "Password spray then success: 91.240.118.5 failed against 20 accounts (20 failures) and later signed in as this user",
      status: "LIKELY", sql_ids: ["aaaaaaaaaaaa"], row_refs: ["aaaaaaaaaaaa#0"], attack: ["T1110.003", "T1078"], confidence: 0.85,
      kind: "password_spray", entity_ids: ["account:idp:m.aslan@aegean.edu", "ip:net:91.240.118.5"],
      facts: { upn: "m.aslan@aegean.edu", ip: "91.240.118.5", accounts: 20, failures: 20, first_ts: "2026-10-18 02:00:00.0", last_ts: "2026-10-18 02:19:00.0" },
      dq_flags: [],
    };
    const c = await critique(z, [f]);
    expect(c.rejected).toEqual([]);
    expect(c.approved[0]!.status).toBe("CONFIRMED");
  });

  it("has sane constants and no ISP names in SHARED_NAT_ASNS (data-derived shared-egress replaced it)", () => {
    expect(SHARED_NAT_ASNS.size).toBe(0);
    expect(SPRAY_BURST_WINDOW_HOURS).toBeGreaterThan(0);
    expect(SHARED_EGRESS_LOOKBACK_DAYS).toBeGreaterThan(0);
    expect(SHARED_EGRESS_MFA_COMPLETED_UPNS).toBeGreaterThan(0);
  });
});

describe("Critic — new_asn shared-egress rejection (case-002 pattern)", () => {
  /** Build fixture tables for a user whose per-UPN baseline is one ASN but who
   *  has a single sign-in from a *different* ASN whose IP serves many distinct
   *  MFA-completed users. The per-UPN baseline (≥ 2 distinct days) flags the
   *  second ASN as "new"; the shared-egress check must reject it as
   *  organisational infrastructure. `otherMfaCount` ≥ 10 triggers the rule;
   *  smaller numbers model an attacker-controlled host (should NOT reject). */
  function sharedEgressFixture(opts: { upn: string; baselineAsn: string; newAsn: string; newIp: string; newUa?: string; otherMfaCount: number }) {
    const base = {
      signin_event: [] as Record<string, string | number | null>[],
      mail_event: [] as Record<string, string | number | null>[],
      device: [] as Record<string, string | number | null>[],
      vulnerability: [] as Record<string, string | number | null>[],
      vpn_session: [] as Record<string, string | number | null>[],
      identity: [{ upn: opts.upn }],
    };
    let seq = 0;
    const soon = (dBack: number, h = 9, m = 0) => new Date(Date.now() - dBack * 86_400_000 + h * 3_600_000 + m * 60_000).toISOString().replace("T", " ").replace("Z", ".0");
    const push = (r: Record<string, string | number | null>) => {
      seq += 1;
      base.signin_event.push({
        event_id: `evt_${seq}`, device_id: null, country: "TR", city: "Manisa", app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0", ...r,
      });
    };
    // Baseline for the user: 7 successful sign-ins on the baseline ASN across 7 distinct days.
    for (let d = 7; d <= 13; d++) push({ ts: soon(d, 9, 0), upn: opts.upn, result: "success", ip: "10.0.0.5", asn_org: opts.baselineAsn, device_id: "LT-OWN", mfa_prompt_count: 1 });
    // The one sign-in that will trip the new_asn detector (today's "mail-sync" style event).
    push({ ts: soon(0, 6, 40), upn: opts.upn, result: "success", ip: opts.newIp, asn_org: opts.newAsn, user_agent: opts.newUa ?? "Mozilla/5.0" });
    // Other distinct accounts that have completed MFA from the SAME IP as the new_asn (shared-egress signal).
    for (let i = 0; i < Math.max(0, opts.otherMfaCount - 1); i++) {
      push({ ts: soon(1 + (i % 5), 10, i), upn: `student${i}@aegean.edu`, result: "mfa_approved", ip: opts.newIp, asn_org: opts.newAsn, mfa_prompt_count: 1 });
    }
    return base;
  }

  it("rejects a new_asn claim when every sign-in from that ASN uses a shared-egress IP (ExchangeSync-style mail-sync token through the campus NAT)", async () => {
    const tables = sharedEgressFixture({ upn: "prof.kaya@aegean.edu", baselineAsn: "home-isp", newAsn: "campus-nat", newIp: "203.0.113.21", newUa: "ExchangeSync/15", otherMfaCount: 15 });
    const z = new FakeZetaris(tables);
    const f = await draft(z, "prof.kaya@aegean.edu", ["new_asn"]);
    expect(f).toHaveLength(1);
    expect(f[0]!.kind).toBe("new_asn");
    const c = await critique(z, f);
    expect(c.approved).toEqual([]);
    expect(c.rejected).toHaveLength(1);
    expect(c.rejected[0]!.reason).toMatch(/shared-egress/i);
    expect(c.rejected[0]!.reason).toMatch(/\d+ distinct accounts completed MFA/);
    // The reason must stay data-derived — no ISP, carrier, campus or UPN name baked into product strings.
    expect(c.rejected[0]!.reason).not.toMatch(/Turkcell|TTNET|Superonline|AS-AEGEAN-EDU|Aegean|prof\.kaya|Vodafone/i);
  });

  it("keeps a new_asn claim CONFIRMED when the IP serves only the alerting user (attacker-controlled host)", async () => {
    // otherMfaCount = 1 → only the alerting user; the shared-egress threshold (≥ 10) is NOT met.
    const tables = sharedEgressFixture({ upn: "victim@aegean.edu", baselineAsn: "home-isp", newAsn: "sprayhost", newIp: "198.51.100.7", otherMfaCount: 1 });
    const z = new FakeZetaris(tables);
    const f = await draft(z, "victim@aegean.edu", ["new_asn"]);
    expect(f).toHaveLength(1);
    const c = await critique(z, f);
    expect(c.rejected).toEqual([]);
    expect(c.approved).toHaveLength(1);
    expect(c.approved[0]!.status).toBe("CONFIRMED");
    expect(c.approved[0]!.sql_ids.length).toBeGreaterThanOrEqual(2); // original + Critic's re-query
  });

  it("rejects even when the shared-egress IP sits just at the threshold (≥ SHARED_EGRESS_MFA_COMPLETED_UPNS)", async () => {
    const tables = sharedEgressFixture({ upn: "prof.kaya@aegean.edu", baselineAsn: "home-isp", newAsn: "campus-nat", newIp: "203.0.113.21", otherMfaCount: SHARED_EGRESS_MFA_COMPLETED_UPNS });
    const z = new FakeZetaris(tables);
    const f = await draft(z, "prof.kaya@aegean.edu", ["new_asn"]);
    const c = await critique(z, f);
    expect(c.rejected).toHaveLength(1);
    expect(c.rejected[0]!.reason).toMatch(/shared-egress/i);
  });

  it("does NOT reject when the alerting user has mixed IPs on the ASN (one shared, one attacker-controlled) — defensive: a mix is suspicious", async () => {
    // Baseline + one shared-egress sign-in + one unique-IP sign-in on the same ASN.
    const tables = sharedEgressFixture({ upn: "victim@aegean.edu", baselineAsn: "home-isp", newAsn: "campus-nat", newIp: "203.0.113.21", otherMfaCount: 15 });
    tables.signin_event.push({ event_id: "evt_mixed", ts: new Date().toISOString().replace("T", " ").replace("Z", ".0"), upn: "victim@aegean.edu", result: "success", ip: "198.51.100.9", asn_org: "campus-nat", device_id: null, country: "TR", city: "Manisa", app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    const z = new FakeZetaris(tables);
    const f = await draft(z, "victim@aegean.edu", ["new_asn"]);
    expect(f).toHaveLength(1);
    const c = await critique(z, f);
    // 198.51.100.9 serves only 1 account → not shared; because *every* IP must be shared to reject, the ASN stays suspicious.
    expect(c.approved).toHaveLength(1);
    expect(c.approved[0]!.status).toBe("CONFIRMED");
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
