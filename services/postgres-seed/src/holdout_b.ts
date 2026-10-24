// Blind held-out set B — hb-01 … hb-08 (DAY7 v2 generalisation measure).
//
// Labels and data shapes come verbatim from notes/HOLDOUT_CASES_B.md (which
// was authored by a separate analyst agent that saw no code, no policy
// rules, no thresholds, no held-out lessons). Nothing in this file is
// allowed to change the labels; it only generates rows that *match* each
// scenario description. Expressibility carve-outs are documented inline.
//
// Appended STRICTLY after case-007 + ho-01..ho-08, so the dev + ho suite
// hashes stay byte-identical.
import type {
  AssetRow,
  IdentitySeed,
  MailDelivery,
  MailRule,
  SigninSeed,
  VpnSeed,
  MailClick,
} from "./scenarios.ts";

type Suite = {
  signins: SigninSeed[];
  vpnSessions: VpnSeed[];
  deliveries: MailDelivery[];
  clicks: MailClick[];
  rules: MailRule[];
  assets: AssetRow[];
};

const CAMPUS_ASN = "AS-AEGEAN-EDU";
const CAMPUS_ASN_ORG = "AS-AEGEAN-EDU";
const UA_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhyBrowser/1.0";
const UA_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) WhyBrowser/1.0";
const UA_PHONE = "Mozilla/5.0 (Android 14) WhyMobile/1.0";
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) WhyMobile/1.0";
const UA_IMAP = "WhyMail-IMAP/2.3";

const bump = (seq: { n: number }) => `evt_hb_${(seq.n++).toString().padStart(6, "0")}`;

function iso(y: number, moIdx: number, d: number, h = 0, mi = 0, s = 0): string {
  return new Date(Date.UTC(y, moIdx, d, h, mi, s)).toISOString();
}

export const HOLDOUT_B_IDENTITIES: IdentitySeed[] = [
  { upn: "i.tekin@aegean.edu", display_name: "İlker Tekin", role: "staff", department: "Library", mfa_method: "none", home_country: "TR", created_at: "2015-09-02T08:00:00Z" },
  { upn: "lab.kiosk-b@aegean.edu", display_name: "Lab B Kiosk (shared)", role: "staff", department: "Computer Lab B", mfa_method: "none", home_country: "TR", created_at: "2021-10-01T08:00:00Z" },
  { upn: "it.karaca@aegean.edu", display_name: "Burak Karaca", role: "admin", department: "IT Operations", mfa_method: "totp", home_country: "TR", created_at: "2017-02-14T08:00:00Z" },
  { upn: "p.gunes@aegean.edu", display_name: "Pınar Güneş", role: "staff", department: "Finance", mfa_method: "push", home_country: "TR", created_at: "2022-05-11T08:00:00Z" },
  { upn: "o.polat@aegean.edu", display_name: "Onur Polat", role: "faculty", department: "Mechanical Engineering", mfa_method: "totp", home_country: "TR", created_at: "2016-09-20T08:00:00Z" },
  { upn: "l.duman@aegean.edu", display_name: "Leyla Duman", role: "faculty", department: "Physics", mfa_method: "push", home_country: "TR", created_at: "2019-02-10T08:00:00Z" },
  { upn: "u.kilic@aegean.edu", display_name: "Ulaş Kılıç", role: "student", department: "Computer Engineering", mfa_method: "push", home_country: "TR", created_at: "2024-09-10T08:00:00Z" },
  { upn: "r.yavuz@aegean.edu", display_name: "Rasim Yavuz", role: "faculty", department: "Business Administration", mfa_method: "totp", home_country: "TR", created_at: "2018-08-30T08:00:00Z" },
];
// hb-03 recipient staff identities (stf001..stf042) so the mail_event rule
// rows pass FK and the Risk Gate sees the targets as real users.
for (let i = 1; i <= 42; i++) {
  HOLDOUT_B_IDENTITIES.push({
    upn: `stf${String(i).padStart(3, "0")}@aegean.edu`,
    display_name: `Staff ${String(i).padStart(3, "0")}`,
    role: "staff",
    department: i % 3 === 0 ? "Library" : i % 3 === 1 ? "Student Affairs" : "Finance",
    mfa_method: i % 2 ? "push" : "totp",
    home_country: "TR",
    created_at: "2022-01-10T08:00:00Z",
  });
}

export const HOLDOUT_B_ASSETS: AssetRow[] = [
  { device_id: "DEV-H01-D", owner_upn: "i.tekin@aegean.edu", hostname: "lib-tekin-d.aegean.edu", os: "Windows", os_version: "10 22H2", managed: true, last_seen: "2026-06-27T08:40:00Z", type: "desktop", firmware: "n/a", location: "Manisa / Library" },
  { device_id: "KIOSK-B01", owner_upn: "lab.kiosk-b@aegean.edu", hostname: "lab-b-01.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T17:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / Computer Lab B" },
  { device_id: "KIOSK-B02", owner_upn: "lab.kiosk-b@aegean.edu", hostname: "lab-b-02.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T17:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / Computer Lab B" },
  { device_id: "KIOSK-B03", owner_upn: "lab.kiosk-b@aegean.edu", hostname: "lab-b-03.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T17:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / Computer Lab B" },
  { device_id: "KIOSK-B04", owner_upn: "lab.kiosk-b@aegean.edu", hostname: "lab-b-04.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T17:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / Computer Lab B" },
  { device_id: "DEV-H03-W", owner_upn: "it.karaca@aegean.edu", hostname: "it-karaca-w.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / IT" },
  { device_id: "DEV-H04-L", owner_upn: "p.gunes@aegean.edu", hostname: "fin-gunes-l.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / Finance" },
  // NB: DEV-H04-X is intentionally NOT registered (the hb-04 case hinges on it).
  { device_id: "DEV-H05-L", owner_upn: "o.polat@aegean.edu", hostname: "me-polat-l.aegean.edu", os: "macOS", os_version: "15.6", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / ME" },
  { device_id: "DEV-H05-P", owner_upn: "o.polat@aegean.edu", hostname: "me-polat-p.aegean.edu", os: "iOS", os_version: "18.6", managed: false, last_seen: "2026-10-19T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa / ME" },
  { device_id: "DEV-H06-L", owner_upn: "l.duman@aegean.edu", hostname: "phy-duman-l.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / Physics" },
  { device_id: "DEV-H06-P", owner_upn: "l.duman@aegean.edu", hostname: "phy-duman-p.aegean.edu", os: "iOS", os_version: "18.6", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa / Physics" },
  { device_id: "DEV-H06-T", owner_upn: "l.duman@aegean.edu", hostname: "phy-duman-t.aegean.edu", os: "iPadOS", os_version: "18.6", managed: false, last_seen: "2026-10-19T18:00:00Z", type: "tablet", firmware: "n/a", location: "Manisa / Physics" },
  { device_id: "DEV-H07-P", owner_upn: "u.kilic@aegean.edu", hostname: "ce-kilic-p.aegean.edu", os: "Android", os_version: "15", managed: false, last_seen: "2026-10-19T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa" },
  { device_id: "DEV-H08-L", owner_upn: "r.yavuz@aegean.edu", hostname: "ba-yavuz-l.aegean.edu", os: "macOS", os_version: "15.6", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / BA" },
];

// hb-01 — dormant Library account wakes up at night, VPS + forward + harvest.
function hbOne(seq: { n: number }, s: Suite) {
  const UPN = "i.tekin@aegean.edu";
  const VPS = "203.0.113.58";
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 5, 27, 8, 12, 0), upn: UPN, result: "success", ip: "193.140.10.61", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H01-D", user_agent: UA_WIN, app: "portal", mfa_prompt_count: 0 });
  // (Baseline 08-06 → 10-04: no signin_event rows.)
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 12, 2, 14, 7), upn: UPN, result: "success", ip: VPS, asn: "AS51167", asn_org: "AS51167 Contabo GmbH", country: "DE", city: "Nuremberg", device_id: null, user_agent: UA_WIN, app: "mail", mfa_prompt_count: 0, risk_flag: "low" });
  s.rules.push({ rule_id: "ME-H01-01", ts: iso(2026, 9, 12, 2, 16, 40), upn: UPN, action: "forward", target: "l1b-archive@protonmail.com", created_via: "api" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 12, 2, 21, 5), upn: UPN, result: "success", ip: VPS, asn: "AS51167", asn_org: "AS51167 Contabo GmbH", country: "DE", city: "Nuremberg", device_id: null, user_agent: UA_WIN, app: "portal", mfa_prompt_count: 0 });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 12, 2, 23, 30), upn: UPN, result: "success", ip: VPS, asn: "AS51167", asn_org: "AS51167 Contabo GmbH", country: "DE", city: "Nuremberg", device_id: null, user_agent: UA_WIN, app: "portal", mfa_prompt_count: 0 });
  for (let i = 0; i < 12; i++) {
    const base = Date.UTC(2026, 9, 12, 2, 31, 0) + i * 150_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: VPS, asn: "AS51167", asn_org: "AS51167 Contabo GmbH", country: "DE", city: "Nuremberg", device_id: null, user_agent: UA_WIN, app: "sis", mfa_prompt_count: 0 });
  }
}

// hb-02 — shared kiosk one-off home ISP.
function hbTwo(seq: { n: number }, s: Suite) {
  const UPN = "lab.kiosk-b@aegean.edu";
  const KIOSKS = ["KIOSK-B01", "KIOSK-B02", "KIOSK-B03", "KIOSK-B04"] as const;
  const CAMPUS_IPS = ["193.140.10.120", "193.140.10.121", "193.140.10.122", "193.140.10.123"] as const;
  for (let day = 0; day < 60; day++) {
    // Weekdays 08:00–17:00Z: 6..15 successes per weekday.
    const date = new Date(Date.UTC(2026, 7, 6) + day * 86_400_000);
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue; // skip weekends
    const n = 6 + ((day * 7) % 10);
    for (let i = 0; i < n; i++) {
      const hour = 8 + (i * 9) / Math.max(1, n);
      const ts = new Date(date.getTime() + Math.floor(hour * 3600_000) + i * 300_000);
      s.signins.push({ event_id: bump(seq), ts: ts.toISOString(), upn: UPN, result: "success", ip: CAMPUS_IPS[i % 4]!, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: KIOSKS[i % 4]!, user_agent: UA_WIN, app: i % 2 ? "portal" : "lms", mfa_prompt_count: 0 });
    }
  }
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 14, 19, 47, 12), upn: UPN, result: "success", ip: "198.51.100.141", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: null, user_agent: UA_WIN, app: "portal", mfa_prompt_count: 0, risk_flag: "low" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 15, 6, 5, 0), upn: UPN, result: "success", ip: "193.140.10.121", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "KIOSK-B02", user_agent: UA_WIN, app: "lms", mfa_prompt_count: 0 });
}

// hb-03 — IT admin mass internal-folder rule push (benign).
function hbThree(seq: { n: number }, s: Suite) {
  const UPN = "it.karaca@aegean.edu";
  // Baseline: weekday campus sign-ins on DEV-H03-W.
  for (let day = 0; day < 55; day++) {
    const date = new Date(Date.UTC(2026, 7, 6) + day * 86_400_000);
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (let i = 0; i < 3; i++) {
      const base = date.getTime() + (8 + i * 3) * 3600_000;
      s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "193.140.10.15", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H03-W", user_agent: UA_WIN, app: i % 2 ? "portal" : "mail", mfa_prompt_count: 0 });
    }
  }
  // Precedent push on 2026-09-15: 38 rules, same shape, LMS Bildirimleri.
  for (let i = 0; i < 38; i++) {
    const base = Date.UTC(2026, 8, 15, 7, 30, 0) + i * 35_000;
    s.rules.push({ rule_id: `ME-H03-prec-${String(i + 1).padStart(3, "0")}`, ts: new Date(base).toISOString(), upn: `stf${String(i + 1).padStart(3, "0")}@aegean.edu`, action: "move", target: "folder:LMS Bildirimleri", created_via: "api" });
  }
  // 10-13 push: 42 rules, SIS Duyurulari (internal folder move).
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 13, 7, 2, 10), upn: UPN, result: "success", ip: "193.140.10.15", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H03-W", user_agent: UA_WIN, app: "mail", mfa_prompt_count: 0 });
  for (let i = 0; i < 42; i++) {
    const base = Date.UTC(2026, 9, 13, 7, 5, 0) + i * 51_000;
    s.rules.push({ rule_id: `ME-H03-${String(i + 1).padStart(3, "0")}`, ts: new Date(base).toISOString(), upn: `stf${String(i + 1).padStart(3, "0")}@aegean.edu`, action: "move", target: "folder:SIS Duyurulari", created_via: "api" });
  }
}

// hb-04 — duplicate event_id with conflicting geography + 14 null-field rows.
// Schema carve-outs documented in evidence/heldout-b.md:
//   • `event_id` is PRIMARY KEY in Postgres; the second row is suffixed `-dup`
//     and the conflict is kept visible in the data (as per HOLDOUT_CASES_B
//     note: "If the store's primary key rejects a duplicate `event_id`,
//     keep both rows by suffixing the second id with `-dup`").
//   • `ip` is NOT NULL in Postgres; the 14 null-field rows carry ip=''
//     (empty string) so the semantics "network fields missing" are visible
//     via the DQ check without a schema change.
function hbFour(seq: { n: number }, s: Suite) {
  const UPN = "p.gunes@aegean.edu";
  // Baseline: weekday campus on DEV-H04-L + occasional evening TTNET.
  for (let day = 0; day < 55; day++) {
    const date = new Date(Date.UTC(2026, 7, 6) + day * 86_400_000);
    const dow = date.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    for (let i = 0; i < 2; i++) {
      const base = date.getTime() + (9 + i * 4) * 3600_000;
      s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "193.140.10.77", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H04-L", user_agent: UA_WIN, app: i ? "hr" : "mail", mfa_prompt_count: 0 });
    }
    if (day % 7 === 3) {
      const base = date.getTime() + 20 * 3600_000;
      s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "mfa_approved", ip: "198.51.100.30", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H04-L", user_agent: UA_WIN, app: "mail", mfa_prompt_count: 1 });
    }
  }
  // Row A: campus session.
  s.signins.push({ event_id: "SE-H04-0731", ts: iso(2026, 9, 16, 10, 22, 31), upn: UPN, result: "success", ip: "193.140.10.77", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H04-L", user_agent: UA_WIN, app: "hr", mfa_prompt_count: 0 });
  // Row B: same event_id (per HB spec, we suffix -dup to satisfy the PK).
  s.signins.push({ event_id: "SE-H04-0731-dup", ts: iso(2026, 9, 16, 10, 22, 31), upn: UPN, result: "success", ip: "198.51.100.200", asn: "AS16276", asn_org: "AS16276 OVH SAS", country: "FR", city: "Roubaix", device_id: "DEV-H04-X", user_agent: UA_WIN, app: "hr", mfa_prompt_count: 0, risk_flag: "medium" });
  // 14 null-network HR rows on the unregistered device (ip='' as carve-out).
  for (let i = 0; i < 14; i++) {
    const base = Date.UTC(2026, 9, 16, 10, 24, 0) + i * 120_000;
    s.signins.push({ event_id: `SE-H04-07${String(32 + i).padStart(2, "0")}`, ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "", asn: undefined, asn_org: undefined, country: undefined, city: undefined, device_id: "DEV-H04-X", user_agent: UA_WIN, app: "hr", mfa_prompt_count: 0 });
  }
  s.signins.push({ event_id: "SE-H04-0746", ts: iso(2026, 9, 16, 13, 5, 0), upn: UPN, result: "success", ip: "193.140.10.77", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H04-L", user_agent: UA_WIN, app: "mail", mfa_prompt_count: 0 });
}

// hb-05 — TOTP user bypassed via legacy IMAP (null-device + zero-prompt).
function hbFive(seq: { n: number }, s: Suite) {
  const UPN = "o.polat@aegean.edu";
  // Baseline: mail/lms from campus (prompts 0) + home Superonline (prompts 1), devices L/P.
  for (let day = 0; day < 60; day++) {
    const base = Date.UTC(2026, 7, 6) + day * 86_400_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base + 9 * 3600_000).toISOString(), upn: UPN, result: "success", ip: "193.140.10.37", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H05-L", user_agent: UA_MAC, app: day % 2 ? "mail" : "lms", mfa_prompt_count: 0 });
    s.signins.push({ event_id: bump(seq), ts: new Date(base + 21 * 3600_000).toISOString(), upn: UPN, result: "mfa_approved", ip: "203.0.113.200", asn: "AS34984", asn_org: "AS34984 Superonline", country: "TR", city: "Manisa", device_id: "DEV-H05-P", user_agent: UA_PHONE, app: "mail", mfa_prompt_count: 1 });
  }
  // Attack: IMAP from two hosting ASNs, null device, zero prompts.
  s.signins.push({ event_id: "SE-H05-0201", ts: iso(2026, 9, 9, 23, 40, 15), upn: UPN, result: "failure", ip: "203.0.113.17", asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "NL", city: "Amsterdam", device_id: null, user_agent: UA_IMAP, app: "imap", mfa_prompt_count: 0 });
  s.signins.push({ event_id: "SE-H05-0202", ts: iso(2026, 9, 10, 3, 12, 4), upn: UPN, result: "success", ip: "203.0.113.17", asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "NL", city: "Amsterdam", device_id: null, user_agent: UA_IMAP, app: "imap", mfa_prompt_count: 0 });
  for (let i = 0; i < 18; i++) {
    const base = Date.UTC(2026, 9, 10, 3, 14, 0) + i * 480_000;
    s.signins.push({ event_id: `SE-H05-02${String(3 + i).padStart(2, "0")}`, ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "203.0.113.17", asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "NL", city: "Amsterdam", device_id: null, user_agent: UA_IMAP, app: "imap", mfa_prompt_count: 0 });
  }
  // User's own normal activity continues.
  s.signins.push({ event_id: "SE-H05-0221", ts: iso(2026, 9, 10, 8, 30, 0), upn: UPN, result: "mfa_approved", ip: "203.0.113.200", asn: "AS34984", asn_org: "AS34984 Superonline", country: "TR", city: "Manisa", device_id: "DEV-H05-L", user_agent: UA_MAC, app: "mail", mfa_prompt_count: 1 });
  // Second burst from Hetzner.
  for (let i = 0; i < 9; i++) {
    const base = Date.UTC(2026, 9, 11, 1, 5, 0) + i * 300_000;
    s.signins.push({ event_id: `SE-H05-02${String(30 + i).padStart(2, "0")}`, ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "192.0.2.66", asn: "AS24940", asn_org: "AS24940 Hetzner Online", country: "DE", city: "Falkenstein", device_id: null, user_agent: UA_IMAP, app: "imap", mfa_prompt_count: 0 });
  }
  s.rules.push({ rule_id: "ME-H05-01", ts: iso(2026, 9, 11, 1, 20, 30), upn: UPN, action: "delete", target: "folder:Deleted Items", created_via: "api" });
}

// hb-06 — faculty travels to Athens, new tablet alongside the baseline phone.
function hbSix(seq: { n: number }, s: Suite) {
  const UPN = "l.duman@aegean.edu";
  // Baseline: campus + TTNET home, devices L/P.
  for (let day = 0; day < 60; day++) {
    const base = Date.UTC(2026, 7, 6) + day * 86_400_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base + 7 * 3600_000).toISOString(), upn: UPN, result: "success", ip: "193.140.10.42", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H06-L", user_agent: UA_WIN, app: day % 2 ? "mail" : "lms", mfa_prompt_count: 0 });
    s.signins.push({ event_id: bump(seq), ts: new Date(base + 20 * 3600_000).toISOString(), upn: UPN, result: "mfa_approved", ip: "198.51.100.150", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H06-P", user_agent: UA_PHONE, app: "mail", mfa_prompt_count: 1 });
  }
  s.signins.push({ event_id: "SE-H06-0401", ts: iso(2026, 9, 9, 6, 40, 0), upn: UPN, result: "success", ip: "193.140.10.42", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H06-L", user_agent: UA_WIN, app: "lms", mfa_prompt_count: 0 });
  s.signins.push({ event_id: "SE-H06-0402", ts: iso(2026, 9, 10, 14, 2, 11), upn: UPN, result: "mfa_approved", ip: "198.51.100.90", asn: "AS3329", asn_org: "AS3329 Vodafone-panafon Hellenic Telecommunications", country: "GR", city: "Athens", device_id: "DEV-H06-P", user_agent: UA_PHONE, app: "mail", mfa_prompt_count: 1 });
  s.signins.push({ event_id: "SE-H06-0403", ts: iso(2026, 9, 10, 14, 9, 47), upn: UPN, result: "mfa_approved", ip: "198.51.100.90", asn: "AS3329", asn_org: "AS3329 Vodafone-panafon Hellenic Telecommunications", country: "GR", city: "Athens", device_id: "DEV-H06-T", user_agent: UA_IPAD, app: "mail", mfa_prompt_count: 1, risk_flag: "medium" });
  const altDays = [11, 12];
  let idx = 404;
  for (const d of altDays) {
    for (let i = 0; i < 3; i++) {
      const base = Date.UTC(2026, 9, d, 8 + i * 3, 15, 0);
      const dev = i % 2 ? "DEV-H06-T" : "DEV-H06-P";
      s.signins.push({ event_id: `SE-H06-0${idx++}`, ts: new Date(base).toISOString(), upn: UPN, result: i === 0 ? "mfa_approved" : "success", ip: "198.51.100.91", asn: "AS3329", asn_org: "AS3329 Vodafone-panafon Hellenic Telecommunications", country: "GR", city: "Athens", device_id: dev, user_agent: dev.endsWith("T") ? UA_IPAD : UA_PHONE, app: i === 1 ? "lms" : "mail", mfa_prompt_count: i === 0 ? 1 : 0 });
    }
  }
  s.signins.push({ event_id: "SE-H06-0410", ts: iso(2026, 9, 14, 7, 15, 0), upn: UPN, result: "success", ip: "193.140.10.42", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H06-L", user_agent: UA_WIN, app: "lms", mfa_prompt_count: 0 });
  s.signins.push({ event_id: "SE-H06-0411", ts: iso(2026, 9, 15, 9, 2, 0), upn: UPN, result: "success", ip: "193.140.10.42", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H06-T", user_agent: UA_IPAD, app: "mail", mfa_prompt_count: 0 });
}

// hb-07 — slow credential stuffing (17 failures over 6 days, no success).
function hbSeven(seq: { n: number }, s: Suite) {
  const UPN = "u.kilic@aegean.edu";
  // Baseline: lms/mail from campus + Turkcell home (geolocates Istanbul).
  for (let day = 0; day < 60; day++) {
    const base = Date.UTC(2026, 7, 6) + day * 86_400_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base + 10 * 3600_000).toISOString(), upn: UPN, result: "mfa_approved", ip: "198.51.100.77", asn: "AS16135", asn_org: "AS16135 Turkcell", country: "TR", city: "Istanbul", device_id: "DEV-H07-P", user_agent: UA_PHONE, app: day % 2 ? "lms" : "mail", mfa_prompt_count: 1 });
  }
  const fails: Array<[number, number, number, number, string, string, string, string]> = [
    [2026, 9, 7, 22 * 3600 + 10 * 60, "192.0.2.14", "AS9009", "AS9009 M247 Europe", "Bucharest"],
    [2026, 9, 8, 1 * 3600 + 40 * 60, "203.0.113.91", "AS212238", "AS212238 Datacamp Limited", "Frankfurt"],
    [2026, 9, 8, 4 * 3600 + 55 * 60, "198.51.100.61", "AS63949", "AS63949 Linode", "Newark"],
    [2026, 9, 8, 23 * 3600 + 15 * 60, "192.0.2.140", "AS16276", "AS16276 OVH SAS", "Gravelines"],
    [2026, 9, 9, 3 * 3600 + 20 * 60, "203.0.113.44", "AS51167", "AS51167 Contabo GmbH", "Nuremberg"],
    [2026, 9, 9, 21 * 3600 + 50 * 60, "192.0.2.201", "AS24940", "AS24940 Hetzner Online", "Helsinki"],
    [2026, 9, 10, 2 * 3600 + 5 * 60, "192.0.2.15", "AS9009", "AS9009 M247 Europe", "Bucharest"],
    [2026, 9, 10, 5 * 3600 + 30 * 60, "203.0.113.92", "AS212238", "AS212238 Datacamp Limited", "Frankfurt"],
    [2026, 9, 10, 22 * 3600 + 45 * 60, "198.51.100.62", "AS63949", "AS63949 Linode", "Newark"],
    [2026, 9, 11, 1 * 3600 + 10 * 60, "192.0.2.141", "AS16276", "AS16276 OVH SAS", "Gravelines"],
    [2026, 9, 11, 4 * 3600 + 25 * 60, "203.0.113.45", "AS51167", "AS51167 Contabo GmbH", "Nuremberg"],
    [2026, 9, 11, 23 * 3600 + 35 * 60, "192.0.2.202", "AS24940", "AS24940 Hetzner Online", "Helsinki"],
    [2026, 9, 12, 2 * 3600 + 50 * 60, "192.0.2.16", "AS9009", "AS9009 M247 Europe", "Bucharest"],
    [2026, 9, 12, 6 * 3600 + 0 * 60, "203.0.113.93", "AS212238", "AS212238 Datacamp Limited", "Frankfurt"],
    [2026, 9, 12, 21 * 3600 + 40 * 60, "198.51.100.63", "AS63949", "AS63949 Linode", "Newark"],
    [2026, 9, 12, 23 * 3600 + 55 * 60, "192.0.2.142", "AS16276", "AS16276 OVH SAS", "Gravelines"],
    [2026, 9, 13, 3 * 3600 + 15 * 60, "203.0.113.46", "AS51167", "AS51167 Contabo GmbH", "Nuremberg"],
  ];
  for (let i = 0; i < fails.length; i++) {
    const f = fails[i]!;
    const ts = new Date(Date.UTC(f[0], f[1], f[2], 0, 0, 0) + f[3] * 1000);
    s.signins.push({ event_id: `SE-H07-06${String(1 + i).padStart(2, "0")}`, ts: ts.toISOString(), upn: UPN, result: "failure", ip: f[4], asn: f[5], asn_org: f[6], country: f[6].slice(-2), city: f[7], device_id: null, user_agent: UA_WIN, app: "portal", mfa_prompt_count: 0 });
  }
}

// hb-08 — legitimate faculty, abnormal SIS harvesting + personal-Gmail forward.
function hbEight(seq: { n: number }, s: Suite) {
  const UPN = "r.yavuz@aegean.edu";
  // Baseline: lms ~5/day, mail; **sis 0–2 per week**; campus + TTNET home.
  for (let day = 0; day < 60; day++) {
    const date = new Date(Date.UTC(2026, 7, 6) + day * 86_400_000);
    for (let i = 0; i < 5; i++) {
      const base = date.getTime() + (9 + i * 2) * 3600_000;
      s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "193.140.10.108", asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "DEV-H08-L", user_agent: UA_MAC, app: "lms", mfa_prompt_count: 0 });
    }
    const eve = date.getTime() + 20 * 3600_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(eve).toISOString(), upn: UPN, result: "mfa_approved", ip: "198.51.100.44", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H08-L", user_agent: UA_MAC, app: "mail", mfa_prompt_count: 1 });
    if (day % 7 === 2) {
      s.signins.push({ event_id: bump(seq), ts: new Date(eve + 1800_000).toISOString(), upn: UPN, result: "success", ip: "198.51.100.44", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H08-L", user_agent: UA_MAC, app: "sis", mfa_prompt_count: 0 });
    }
  }
  s.rules.push({ rule_id: "ME-H08-01", ts: iso(2026, 9, 15, 20, 58, 12), upn: UPN, action: "forward", target: "r.yavuz.ozel@gmail.com", created_via: "owa" });
  s.signins.push({ event_id: "SE-H08-0801", ts: iso(2026, 9, 15, 21, 10, 3), upn: UPN, result: "mfa_approved", ip: "198.51.100.44", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H08-L", user_agent: UA_MAC, app: "sis", mfa_prompt_count: 1 });
  for (let i = 0; i < 63; i++) {
    const base = Date.UTC(2026, 9, 15, 21, 11, 0) + i * 220_000;
    s.signins.push({ event_id: `SE-H08-${String(802 + i).padStart(4, "0")}`, ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "198.51.100.44", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H08-L", user_agent: UA_MAC, app: "sis", mfa_prompt_count: 0 });
  }
  for (let i = 0; i < 51; i++) {
    const base = Date.UTC(2026, 9, 16, 21, 30, 0) + i * 150_000;
    s.signins.push({ event_id: `SE-H08-${String(865 + i).padStart(4, "0")}`, ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: "198.51.100.44", asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "DEV-H08-L", user_agent: UA_MAC, app: "sis", mfa_prompt_count: 0 });
  }
}

/** Append hb-01 … hb-08 to the suite. */
export function appendHoldoutB(suite: Suite, signinSeq: { n: number }): IdentitySeed[] {
  hbOne(signinSeq, suite);
  hbTwo(signinSeq, suite);
  hbThree(signinSeq, suite);
  hbFour(signinSeq, suite);
  hbFive(signinSeq, suite);
  hbSix(signinSeq, suite);
  hbSeven(signinSeq, suite);
  hbEight(signinSeq, suite);
  suite.assets.push(...HOLDOUT_B_ASSETS);
  return [...HOLDOUT_B_IDENTITIES];
}

export const HOLDOUT_B_CASES = {
  "hb-01": { upn: "i.tekin@aegean.edu", expected: "contain" },
  "hb-02": { upn: "lab.kiosk-b@aegean.edu", expected: "monitor" },
  "hb-03": { upn: "it.karaca@aegean.edu", expected: "benign" },
  "hb-04": { upn: "p.gunes@aegean.edu", expected: "escalate" },
  "hb-05": { upn: "o.polat@aegean.edu", expected: "contain" },
  "hb-06": { upn: "l.duman@aegean.edu", expected: "benign" },
  "hb-07": { upn: "u.kilic@aegean.edu", expected: "monitor" },
  "hb-08": { upn: "r.yavuz@aegean.edu", expected: "escalate" },
} as const satisfies Record<string, { upn: string; expected: string }>;
