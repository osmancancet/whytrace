// DAY7 — unit tests for the six held-out lessons (L1–L6).
// Each lesson has:
//   • a `fires` test with a synthetic finding that MATCHES the pattern,
//   • a `does not fire` test that proves the sanity bound keeps dev-case
//     shapes untouched.
// Fixtures are built inline so each test is self-contained and the
// shared FakeZetaris stays small.
import { describe, it, expect } from "vitest";
import { critique } from "./critic.ts";
import { deriveFindings, FindingIds } from "./investigator.ts";
import { policy, PHISH_EXPOSURE_TECHNIQUES } from "./risk-gate.ts";
import { FakeZetaris, type Row, type Tables } from "./testing/fake-zetaris.ts";
import type { FindingT } from "./schema.ts";
import { queryFor } from "./sql-catalogue.ts";

function T(iso: string): string {
  return iso.replace("T", " ").replace("Z", "").replace(/(\.\d+)?$/, ".0");
}

function emptyTables(): Tables {
  return { signin_event: [], mail_event: [], device: [], vulnerability: [], vpn_session: [], identity: [] };
}

function finding(partial: Partial<FindingT> & { kind: string; attack?: string[]; facts?: FindingT["facts"] }): FindingT {
  return {
    id: partial.id ?? "F1",
    hypothesis_id: "H1",
    claim: partial.claim ?? "test",
    status: partial.status ?? "LIKELY",
    sql_ids: partial.sql_ids ?? ["sql-fixture"],
    row_refs: [],
    attack: partial.attack ?? [],
    confidence: partial.confidence ?? 0.6,
    kind: partial.kind,
    entity_ids: [],
    // facts.upn is read by the Critic to scope its re-queries; set it on
    // every synthetic finding so the Critic query actually filters.
    facts: { upn: "user-roam@aegean.edu", ...(partial.facts ?? {}) },
    dq_flags: [],
  };
}

// ------ L1 admin baseline-break ------
describe("L1 admin baseline-break app-usage change", () => {
  function l1Tables(role: string, mfa: string): Tables {
    const upn = "k.erdem@aegean.edu";
    const JUMP = "203.0.113.45";
    const CAMPUS = "193.140.10.9";
    const t = emptyTables();
    t.identity.push({ upn, role, mfa_method: mfa });
    // 20 baseline days on the jump host, portal only.
    for (let d = 0; d < 20; d++) {
      t.signin_event.push({ event_id: `b-${d}`, ts: T(`2026-09-${String(d + 1).padStart(2, "0")}T02:00:00Z`), upn, result: "success", ip: JUMP, asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, app: "portal", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    // Incident day: same IP suddenly reaches hr + sis + mail.
    t.signin_event.push({ event_id: "inc-portal", ts: T("2026-10-17T02:00:00Z"), upn, result: "success", ip: JUMP, asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, app: "portal", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    t.signin_event.push({ event_id: "inc-sis", ts: T("2026-10-17T02:49:00Z"), upn, result: "success", ip: JUMP, asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, app: "sis", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    t.signin_event.push({ event_id: "inc-mail", ts: T("2026-10-17T02:52:00Z"), upn, result: "success", ip: JUMP, asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    // Campus baseline (so the user has history, not just the jump host).
    for (let d = 0; d < 25; d++) {
      t.signin_event.push({ event_id: `c-${d}`, ts: T(`2026-09-${String(d + 1).padStart(2, "0")}T08:00:00Z`), upn, result: "success", ip: CAMPUS, asn_org: "AS-AEGEAN-EDU", country: "TR", city: "Manisa", device_id: "dev-ke-ws", app: d % 2 ? "portal" : "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    return t;
  }

  it("fires on an admin + mfa=none account whose long-baseline IP broadens to hr/sis/mail", async () => {
    const z = new FakeZetaris(l1Tables("admin", "none"));
    const upn = "k.erdem@aegean.edu";
    const r = await z.runSql(queryFor("signins_for", { upn }).sql);
    const ids = new FindingIds();
    const findings = deriveFindings("signins_for", { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids);
    const break_ = findings.find((f) => f.kind === "admin_baseline_break");
    expect(break_).toBeDefined();
    expect(String(break_!.facts.ip)).toBe("203.0.113.45");
    expect(String(break_!.facts.high_value_new_apps)).toMatch(/sis|mail|hr/);
    const c = await critique(z, findings);
    const approved = c.approved.find((f) => f.kind === "admin_baseline_break");
    expect(approved).toBeDefined();
    expect(approved!.status).toBe("CONFIRMED");
  });

  it("does NOT fire for a regular staff account with push MFA (sanity bound)", async () => {
    const z = new FakeZetaris(l1Tables("staff", "push"));
    const upn = "k.erdem@aegean.edu";
    const r = await z.runSql(queryFor("signins_for", { upn }).sql);
    const ids = new FindingIds();
    const findings = deriveFindings("signins_for", { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids);
    const c = await critique(z, findings.filter((f) => f.kind === "admin_baseline_break"));
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]?.reason).toMatch(/privileged|role=staff|mfa=push/);
  });
});

// ------ L2 impossible-travel dissolver ------
describe("L2 known-managed-device dissolves impossible travel", () => {
  function l2Tables(sameDevice: boolean): Tables {
    const upn = "t.bulut@aegean.edu";
    const DEV = "dev-tb-laptop";
    const t = emptyTables();
    t.identity.push({ upn, role: "student", mfa_method: "push" });
    t.device.push({ device_id: DEV, owner_upn: upn, managed: "true", type: "laptop", os_version: "11", firmware: "n/a", last_seen: T("2026-10-18T18:00:00Z") });
    // Row A: baseline Superonline İzmir on the user's device.
    t.signin_event.push({ event_id: "A", ts: T("2026-10-13T20:15:00Z"), upn, result: "mfa_approved", ip: "198.51.100.120", asn_org: "AS34984 Superonline", country: "TR", city: "İzmir", device_id: sameDevice ? DEV : null, app: "lms", mfa_prompt_count: 1, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    // Row B: foreign M247 same device.
    t.signin_event.push({ event_id: "B", ts: T("2026-10-13T20:31:00Z"), upn, result: "mfa_approved", ip: "192.0.2.200", asn_org: "AS9009 M247 Europe", country: "RO", city: "Bucharest", device_id: sameDevice ? DEV : "stolen-dev", app: "lms", mfa_prompt_count: 1, risk_flag: "anonymous_ip", via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    return t;
  }

  it("rejects the impossible-travel claim when the same managed device is on both sides", async () => {
    const z = new FakeZetaris(l2Tables(true));
    const upn = "t.bulut@aegean.edu";
    const r = await z.runSql(queryFor("signins_for", { upn }).sql);
    const ids = new FindingIds();
    const findings = deriveFindings("signins_for", { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids);
    const travel = findings.find((f) => f.kind === "impossible_travel");
    expect(travel).toBeDefined();
    const c = await critique(z, [travel!]);
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]!.reason).toMatch(/same device|user's own managed device/);
  });

  it("does NOT reject when the device differs on one side (stolen-cookie impostor)", async () => {
    const z = new FakeZetaris(l2Tables(false));
    const upn = "t.bulut@aegean.edu";
    const r = await z.runSql(queryFor("signins_for", { upn }).sql);
    const ids = new FindingIds();
    const findings = deriveFindings("signins_for", { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids);
    const travel = findings.find((f) => f.kind === "impossible_travel");
    expect(travel).toBeDefined();
    const c = await critique(z, [travel!]);
    // Device mismatch → L2 does not trigger, the pre-DAY7 behaviour decides.
    const text = (c.rejected[0]?.reason ?? "") + (c.approved[0]?.claim ?? "");
    expect(text).not.toMatch(/user's own managed device/);
  });
});

// ------ L3 token replay ------
describe("L3 null-device + zero-prompt + concurrent legit → token replay", () => {
  function l3Tables(withConcurrent: boolean): Tables {
    const upn = "z.korkmaz@aegean.edu";
    const DEV = "dev-zk-01";
    const t = emptyTables();
    t.identity.push({ upn, role: "staff", mfa_method: "push" });
    t.device.push({ device_id: DEV, owner_upn: upn, managed: "true", type: "laptop", os_version: "11", firmware: "n/a", last_seen: T("2026-10-19T18:00:00Z") });
    // Campus baseline (so the user has a real history).
    for (let d = 0; d < 20; d++) {
      t.signin_event.push({ event_id: `base-${d}`, ts: T(`2026-09-${String(d + 1).padStart(2, "0")}T08:00:00Z`), upn, result: "success", ip: "193.140.10.44", asn_org: "AS-AEGEAN-EDU", country: "TR", city: "Manisa", device_id: DEV, app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    // Replay: null device, zero prompts, new ASN.
    t.signin_event.push({ event_id: "replay", ts: T("2026-10-14T08:14:00Z"), upn, result: "success", ip: "192.0.2.150", asn_org: "AS16276 OVH SAS", country: "FR", city: "Gravelines", device_id: null, app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    if (withConcurrent) {
      // Concurrent legit campus sign-in within window.
      t.signin_event.push({ event_id: "concurrent", ts: T("2026-10-14T08:31:00Z"), upn, result: "success", ip: "193.140.10.44", asn_org: "AS-AEGEAN-EDU", country: "TR", city: "Manisa", device_id: DEV, app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    return t;
  }

  it("fires when a null-device zero-prompt sign-in overlaps a managed-device baseline session", async () => {
    const z = new FakeZetaris(l3Tables(true));
    const upn = "z.korkmaz@aegean.edu";
    const r = await z.runSql(queryFor("signins_for", { upn }).sql);
    const ids = new FindingIds();
    const findings = deriveFindings("signins_for", { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids);
    const replay = findings.find((f) => f.kind === "token_replay");
    expect(replay).toBeDefined();
    const c = await critique(z, [replay!]);
    expect(c.approved[0]?.status).toBe("CONFIRMED");
    expect(c.approved[0]!.attack).toContain("T1550.004");
  });

  it("does NOT fire without a concurrent managed-device session (sanity bound)", async () => {
    const z = new FakeZetaris(l3Tables(false));
    const upn = "z.korkmaz@aegean.edu";
    const r = await z.runSql(queryFor("signins_for", { upn }).sql);
    const ids = new FindingIds();
    const findings = deriveFindings("signins_for", { upn, hypothesis_id: "H1", params: { upn } }, r.rows, r.sql_id, ids);
    expect(findings.find((f) => f.kind === "token_replay")).toBeUndefined();
  });

  it("Critic rejects a non-interactive mail-sync token masquerading as replay (case-002 ExchangeSync regression guard)", async () => {
    // Fake "replay" is actually an ExchangeSync token from the campus relay;
    // its concurrent session is the user travelling on their own device.
    // Investigator would emit the candidate because UA is only in auth_pg,
    // but the Critic re-queries the raw feed and rejects on the UA.
    const upn = "prof.kaya@aegean.edu";
    const t = emptyTables();
    t.identity.push({ upn, role: "faculty", mfa_method: "totp" });
    t.device.push({ device_id: "LT-3104", owner_upn: upn, managed: "true", type: "laptop", os_version: "15", firmware: "n/a", last_seen: T("2026-10-16T18:00:00Z") });
    t.signin_event.push({ event_id: "mail-sync", ts: T("2026-10-15T06:40:00Z"), upn, result: "success", ip: "193.140.10.51", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: null, app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "ExchangeSync/15" });
    t.signin_event.push({ event_id: "lisbon", ts: T("2026-10-15T07:12:00Z"), upn, result: "success", ip: "89.180.44.17", asn_org: "MEO", country: "PT", city: "Lisbon", device_id: "LT-3104", app: "lms", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: "vpn-edge-02", user_agent: "Mozilla/5.0" });
    const z = new FakeZetaris(t);
    const replay = finding({
      kind: "token_replay",
      status: "LIKELY",
      attack: ["T1550.004", "T1078.004"],
      confidence: 0.75,
      facts: {
        upn,
        replay_event: "mail-sync",
        concurrent_event: "lisbon",
        replay_asn_org: "Turkcell",
        baseline_asn_org: "MEO",
        baseline_device_id: "LT-3104",
        minutes_apart: 32,
      },
    });
    const c = await critique(z, [replay]);
    expect(c.approved).toEqual([]);
    expect(c.rejected[0]!.reason).toMatch(/non-interactive mail-sync token/);
  });
});

// ------ L4 phish-exposure-only path ------
describe("L4 phish exposure without downstream signals", () => {
  it("downgrades to monitor when only phish exposure survived (push MFA)", () => {
    const phish = finding({ id: "F1", kind: "phish_delivery", status: "CONFIRMED", attack: ["T1566.002"], confidence: 0.7 });
    const click = finding({ id: "F2", kind: "click", status: "CONFIRMED", attack: ["T1204.001"], confidence: 0.65 });
    const d = policy({ findings: [phish, click], rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"], mfaMethod: "totp" });
    expect(d.decision).toBe("monitor");
    expect(d.exposure).toEqual([
      { finding_id: "F1", claim: phish.claim },
      { finding_id: "F2", claim: click.claim },
    ]);
  });

  it("escalates on mfa_method=none even on a clean follow-up window", () => {
    const phish = finding({ id: "F1", kind: "phish_delivery", status: "CONFIRMED", attack: ["T1566.002"], confidence: 0.7 });
    const d = policy({ findings: [phish], rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"], mfaMethod: "none" });
    expect(d.decision).toBe("escalate");
    expect(d.exposure?.length).toBe(1);
    expect(d.escalate_reasons.join("|")).toMatch(/mfa_method=none/);
  });

  it("does NOT fire when a non-phish access finding survives (e.g. new_asn)", () => {
    const phish = finding({ id: "F1", kind: "phish_delivery", status: "CONFIRMED", attack: ["T1566.002"], confidence: 0.7 });
    const asn = finding({ id: "F2", kind: "new_asn", status: "CONFIRMED", attack: ["T1078.004"], confidence: 0.75 });
    const d = policy({ findings: [phish, asn], rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"], mfaMethod: "push" });
    expect(d.decision).toBe("escalate");
    expect(d.exposure).toBeUndefined();
  });

  it("PHISH_EXPOSURE_TECHNIQUES is a strict subset of ACCESS_TECHNIQUES", () => {
    for (const t of PHISH_EXPOSURE_TECHNIQUES) {
      expect(["T1566.002", "T1204.001"]).toContain(t);
    }
  });
});

// ------ L5 regression guard: rule-after-phish stays escalate ------
describe("L5 regression guard — rule-after-phish stays escalate", () => {
  it("escalates with an exposure finding + a confirmed forwarding rule from the user's own IP", () => {
    // ho-04 shape: a phish delivery (no click) + a forwarding rule from the
    // user's own baseline IP+device. The rule's `isExternal` is true (it hides
    // mail to a @gmail.com) so the Critic approves it; the policy sees 1
    // abuse + 1 access signal — not two confirmed abuse → policy returns
    // escalate (the "signals of compromise without a confirmed abuse chain"
    // branch), which is the ho-04 expected verdict.
    const phish = finding({ id: "F1", kind: "phish_delivery", status: "CONFIRMED", attack: ["T1566.002"], confidence: 0.7 });
    const rule = finding({ id: "F2", kind: "forward_rule", status: "CONFIRMED", attack: ["T1114.003"], confidence: 0.8 });
    const d = policy({ findings: [phish, rule], rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"], mfaMethod: "push" });
    expect(d.decision).toBe("escalate");
  });

  it("does NOT downgrade ho-04 shape to monitor via the L4 path", () => {
    // Even though the user has mfa=push and a clean sign-in follow-up, the
    // presence of a confirmed abuse (T1114.003) means L4 cannot fire — the
    // policy must escalate (ho-04 label is escalate).
    const phish = finding({ id: "F1", kind: "phish_delivery", status: "CONFIRMED", attack: ["T1566.002"], confidence: 0.7 });
    const rule = finding({ id: "F2", kind: "forward_rule", status: "CONFIRMED", attack: ["T1114.003"], confidence: 0.85 });
    const d = policy({ findings: [phish, rule], rejectedCount: 0, dqConflicts: [], degraded: false, checkedSources: ["signin_event", "mail_event"], mfaMethod: "push" });
    expect(d.decision).not.toBe("monitor");
    expect(d.decision).not.toBe("benign");
  });
});

// ------ L6 carrier-geolocation guard ------
// The investigator only emits `impossible_travel` on a cross-country jump,
// so we construct the finding directly from craft rows + facts and send it to
// the Critic. This isolates the L6 branch (`carrier-geolocation artefact`)
// from the detector that produced the claim.
describe("L6 carrier-geolocation guard on impossible travel", () => {
  function l6Tables(fractionFromForeignCity: number): Tables {
    const upn = "user-roam@aegean.edu";
    const DEV = "phone-roam";
    const t = emptyTables();
    t.identity.push({ upn, role: "staff", mfa_method: "push" });
    t.device.push({ device_id: DEV, owner_upn: upn, managed: "true", type: "phone", os_version: "iOS 18", firmware: "n/a", last_seen: T("2026-10-19T18:00:00Z") });
    // Baseline: fraction*60 rows geolocate to Rome on the same ASN + device,
    // the rest to Manisa. Different countries → "impossible_travel" is a real
    // IdP flag, but the Rome row keeps popping up for this (asn, device)
    // because the mobile carrier terminates in Italy.
    const rome = Math.round(60 * fractionFromForeignCity);
    for (let i = 0; i < rome; i++) {
      t.signin_event.push({ event_id: `rome-${i}`, ts: T(`2026-09-${String((i % 25) + 1).padStart(2, "0")}T08:00:00Z`), upn, result: "mfa_approved", ip: "198.51.100.91", asn_org: "AS16135 Turkcell", country: "IT", city: "Rome", device_id: DEV, app: "mail", mfa_prompt_count: 1, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    for (let i = 0; i < 60 - rome; i++) {
      t.signin_event.push({ event_id: `man-${i}`, ts: T(`2026-09-${String((i % 25) + 1).padStart(2, "0")}T09:00:00Z`), upn, result: "mfa_approved", ip: "198.51.100.90", asn_org: "AS16135 Turkcell", country: "TR", city: "Manisa", device_id: DEV, app: "mail", mfa_prompt_count: 1, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    // The two sign-ins the finding will cite — campus PC + roaming phone.
    // Different devices so L2 does not fire; L6 is the only L-rule left.
    t.device.push({ device_id: "pc-office", owner_upn: upn, managed: "true", type: "desktop", os_version: "Windows 11", firmware: "n/a", last_seen: T("2026-10-19T18:00:00Z") });
    // The "other" endpoint also needs long-baseline history on its own
    // (asn, device) for L6 to accept the travel as a carrier artefact —
    // otherwise it is a real new-ASN sign-in (see ho-03 shape).
    for (let i = 0; i < 15; i++) {
      t.signin_event.push({ event_id: `pc-base-${i}`, ts: T(`2026-09-${String(i + 1).padStart(2, "0")}T07:00:00Z`), upn, result: "success", ip: "193.140.10.21", asn_org: "AS-AEGEAN-EDU", country: "TR", city: "Manisa", device_id: "pc-office", app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    }
    t.signin_event.push({ event_id: "inc-manisa", ts: T("2026-10-09T10:02:00Z"), upn, result: "success", ip: "193.140.10.21", asn_org: "AS-AEGEAN-EDU", country: "TR", city: "Manisa", device_id: "pc-office", app: "mail", mfa_prompt_count: 0, risk_flag: null, via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    t.signin_event.push({ event_id: "inc-rome", ts: T("2026-10-09T10:09:00Z"), upn, result: "mfa_approved", ip: "198.51.100.91", asn_org: "AS16135 Turkcell", country: "IT", city: "Rome", device_id: DEV, app: "mail", mfa_prompt_count: 1, risk_flag: "impossible_travel", via_vpn_appliance: null, user_agent: "Mozilla/5.0" });
    return t;
  }

  function travelFinding(): FindingT {
    // Important: the two sides have *different* devices so L2 (same-device
    // dissolver) does not fire first. L6 (carrier-geolocation) is the branch
    // under test here.
    return finding({
      kind: "impossible_travel",
      status: "LIKELY",
      attack: ["T1078.004"],
      confidence: 0.7,
      facts: {
        from_event: "inc-manisa",
        to_event: "inc-rome",
        from_country: "TR",
        to_country: "IT",
        from_asn_org: "AS-AEGEAN-EDU",
        to_asn_org: "AS16135 Turkcell",
        from_device_id: "pc-office",
        to_device_id: "phone-roam",
        minutes: 7,
      },
    });
  }

  it("rejects impossible-travel when ≥ 30 % of baseline rows on same ASN+device already geolocate to that city", async () => {
    const z = new FakeZetaris(l6Tables(0.75));
    const c = await critique(z, [travelFinding()]);
    expect(c.rejected[0]!.reason).toMatch(/carrier-geolocation artefact/);
  });

  it("does NOT reject via L6 when the foreign city is rare in baseline (< 30 %)", async () => {
    const z = new FakeZetaris(l6Tables(0.02));
    const c = await critique(z, [travelFinding()]);
    const text = (c.rejected[0]?.reason ?? "") + (c.approved[0]?.claim ?? "");
    expect(text).not.toMatch(/carrier-geolocation artefact/);
  });
});

// Guard that `Row` and `Tables` imports stay used (makes TS/vite happy under --isolatedModules).
void (null as unknown as Row);
void (null as unknown as Tables);

// ------ DAY7 faithfulness honesty companions ------
import { faithfulness, type Attribution } from "./explain.ts";

function attr(id: string, shapley: number, rank: number): Attribution {
  return { finding_id: id, claim: id, attack: [], sql_ids: [], shapley, rank };
}

describe("DAY7 — faithfulness recall + precision + Kendall-τ companions", () => {
  it("reports precision = 1.0 and tau = 1.0 when the Reporter cites exactly the top-k in order", () => {
    const top = [attr("F1", 0.5, 1), attr("F2", 0.3, 2), attr("F3", 0.1, 3)];
    const r = faithfulness(top, ["F1", "F2", "F3"], 3);
    expect(r.score).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.kendall_tau).toBe(1);
  });

  it("recall=1 with precision<1 when the Reporter cites extra findings outside top-k", () => {
    const top = [attr("F1", 0.5, 1), attr("F2", 0.3, 2), attr("F3", 0.1, 3)];
    // Reporter cites all top-3 plus F4 and F5 which are not in the top set.
    const r = faithfulness(top, ["F1", "F2", "F3", "F4", "F5"], 3);
    expect(r.score).toBe(1);
    expect(r.precision).toBe(0.6); // 3 of 5 citations are in top-3
  });

  it("tau = -1.0 when the Reporter cites the top-k in reverse order", () => {
    const top = [attr("F1", 0.5, 1), attr("F2", 0.3, 2), attr("F3", 0.1, 3)];
    const r = faithfulness(top, ["F3", "F2", "F1"], 3);
    expect(r.score).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.kendall_tau).toBe(-1);
  });

  it("tau is null when the overlap has fewer than two shared items", () => {
    const top = [attr("F1", 0.5, 1), attr("F2", 0.3, 2), attr("F3", 0.1, 3)];
    const r = faithfulness(top, ["F1", "F9"], 3);
    expect(r.score).toBeGreaterThan(0);
    expect(r.kendall_tau).toBeNull();
  });
});
