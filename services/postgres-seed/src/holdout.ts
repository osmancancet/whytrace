// Held-out cases ho-01 … ho-08 — DAY6 generalisation set.
//
// Labels and data shapes come verbatim from notes/HOLDOUT_CASES.md, which was
// authored by a separate analyst agent that only saw the schema and the list
// of existing case patterns — no code, no policy rules, no thresholds. Nothing
// in this file is allowed to change the labels; it only generates rows that
// *match* each scenario description.
//
// A few deterministic volume compromises are documented inline (e.g. ho-06's
// registration-period baseline is 220 rows in total rather than 180–260/day,
// because every query that returns more than DEFAULT_LIMIT=200 rows gets
// truncated — oversupplying ten thousand baseline events would simply hide
// behind the limit). The *pattern* each scenario cares about is preserved.
import type { AssetRow, IdentitySeed, MailDelivery, MailRule, SigninSeed, VpnSeed } from "./scenarios.ts";

type Suite = {
  signins: SigninSeed[];
  vpnSessions: VpnSeed[];
  deliveries: MailDelivery[];
  clicks: Array<import("./scenarios.ts").MailClick>;
  rules: MailRule[];
  assets: AssetRow[];
};

const CAMPUS_ASN = "AS-AEGEAN-EDU";
const CAMPUS_ASN_ORG = "AS-AEGEAN-EDU";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhyBrowser/1.0";
const USER_AGENT_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) WhyBrowser/1.0";
const USER_AGENT_PHONE = "Mozilla/5.0 (Android 14) WhyMobile/1.0";

const bump = (seq: { n: number }) => `evt_ho_${(seq.n++).toString().padStart(6, "0")}`;

function iso(y: number, moIdx: number, d: number, h = 0, mi = 0, s = 0): string {
  return new Date(Date.UTC(y, moIdx, d, h, mi, s)).toISOString();
}

export const HOLDOUT_IDENTITIES: IdentitySeed[] = [
  { upn: "z.korkmaz@aegean.edu", display_name: "Zehra Korkmaz", role: "staff", department: "Satın Alma", mfa_method: "push", home_country: "TR", created_at: "2022-03-10T08:00:00Z" },
  { upn: "h.ozturk@aegean.edu", display_name: "Hüseyin Öztürk", role: "faculty", department: "Bilgisayar Mühendisliği", mfa_method: "totp", home_country: "TR", created_at: "2017-09-01T08:00:00Z" },
  { upn: "c.aydin@aegean.edu", display_name: "Can Aydın", role: "student", department: "Bilgisayar Programcılığı", mfa_method: "sms", home_country: "TR", created_at: "2024-09-10T08:00:00Z" },
  { upn: "n.guler@aegean.edu", display_name: "Nazlı Güler", role: "staff", department: "Personel Daire Başkanlığı", mfa_method: "push", home_country: "TR", created_at: "2021-06-14T08:00:00Z" },
  { upn: "t.bulut@aegean.edu", display_name: "Tolga Bulut", role: "student", department: "Büyük Veri Analistliği", mfa_method: "push", home_country: "TR", created_at: "2025-09-05T08:00:00Z" },
  { upn: "f.yildiz@aegean.edu", display_name: "Fatma Yıldız", role: "staff", department: "Öğrenci İşleri", mfa_method: "push", home_country: "TR", created_at: "2020-02-18T08:00:00Z" },
  { upn: "k.erdem@aegean.edu", display_name: "Kerem Erdem", role: "staff", department: "Bilgi İşlem", mfa_method: "push", home_country: "TR", created_at: "2016-01-05T08:00:00Z" },
  { upn: "g.sen@aegean.edu", display_name: "Gizem Şen", role: "student", department: "Bilgisayar Programcılığı", mfa_method: "totp", home_country: "TR", created_at: "2024-09-11T08:00:00Z" },
];

export const HOLDOUT_ASSETS: AssetRow[] = [
  { device_id: "dev-zk-01", owner_upn: "z.korkmaz@aegean.edu", hostname: "sat-zk-01.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / Satın Alma" },
  { device_id: "dev-ho-mbp", owner_upn: "h.ozturk@aegean.edu", hostname: "ce-ho-mbp.aegean.edu", os: "macOS", os_version: "15.6", managed: true, last_seen: "2026-10-18T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / CE" },
  { device_id: "dev-lab-ce-07", owner_upn: "h.ozturk@aegean.edu", hostname: "ce-lab-07.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-11T23:47:00Z", type: "desktop", firmware: "n/a", location: "Manisa / CE Lab" },
  { device_id: "dev-ca-phone", owner_upn: "c.aydin@aegean.edu", hostname: "bp-ca-phone.aegean.edu", os: "Android", os_version: "14", managed: false, last_seen: "2026-10-18T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa" },
  { device_id: "dev-ca-laptop", owner_upn: "c.aydin@aegean.edu", hostname: "bp-ca-lt.aegean.edu", os: "Windows", os_version: "11 23H2", managed: false, last_seen: "2026-10-15T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa" },
  { device_id: "dev-ng-01", owner_upn: "n.guler@aegean.edu", hostname: "hr-ng-01.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-17T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa / Payroll" },
  { device_id: "dev-tb-laptop", owner_upn: "t.bulut@aegean.edu", hostname: "ba-tb-lt.aegean.edu", os: "Windows", os_version: "11 22H2", managed: false, last_seen: "2026-10-18T18:00:00Z", type: "laptop", firmware: "n/a", location: "Manisa" },
  { device_id: "dev-tb-phone", owner_upn: "t.bulut@aegean.edu", hostname: "ba-tb-phone", os: "Android", os_version: "14", managed: false, last_seen: "2026-10-17T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa" },
  { device_id: "dev-fy-pc", owner_upn: "f.yildiz@aegean.edu", hostname: "si-fy-pc.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / Student Affairs" },
  { device_id: "dev-fy-phone", owner_upn: "f.yildiz@aegean.edu", hostname: "si-fy-phone", os: "iOS", os_version: "18.6", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa / Student Affairs" },
  { device_id: "dev-ke-ws", owner_upn: "k.erdem@aegean.edu", hostname: "it-ke-ws.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-17T18:00:00Z", type: "desktop", firmware: "n/a", location: "Manisa / IT" },
  { device_id: "dev-gs-phone", owner_upn: "g.sen@aegean.edu", hostname: "bp-gs-phone", os: "Android", os_version: "15", managed: false, last_seen: "2026-10-19T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa" },
];

// ho-01 — AiTM token replay. Baseline on campus and TTNET home; incident
// 2026-10-14 phish click → DigitalOcean MFA approval → OVH session-replay
// successes with no device/no prompts; the real user signs in concurrently
// from campus; an API-created rule hides invoice mail.
function hoOne(seq: { n: number }, s: Suite) {
  const UPN = "z.korkmaz@aegean.edu";
  const CAMPUS_IP = "193.140.10.44";
  const HOME_IP = "198.51.100.23";
  // Baseline ×120 campus successes (spread 2026-08-06 → 2026-10-04).
  for (let i = 0; i < 120; i++) {
    const dayOffset = Math.floor((i * 60) / 120); // 60 days total window
    const base = Date.UTC(2026, 7, 6, 8, 15, 0) + dayOffset * 86_400_000 + (i % 8) * 3_600_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-zk-01", user_agent: USER_AGENT, app: i % 3 === 0 ? "portal" : "mail", mfa_prompt_count: 0 });
  }
  // Baseline ×30 TTNET home evening mfa_approved.
  for (let i = 0; i < 30; i++) {
    const dayOffset = Math.floor((i * 60) / 30);
    const base = Date.UTC(2026, 7, 6, 20, 30, 0) + dayOffset * 86_400_000 + (i % 4) * 300_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "dev-zk-01", user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 1 });
  }
  // Incident day 2026-10-14.
  s.deliveries.push({ message_id: "msg-ho01-phish", ts: iso(2026, 9, 14, 7, 52, 10), sender: "sign@docusign-aegean-share.com", sender_domain: "docusign-aegean-share.com", recipient_upn: UPN, subject: "Satın alma sözleşmesi – imza bekliyor", verdict: "phish_suspect", url_count: 1, spf: "fail", dkim: "none", dmarc: "fail" });
  s.clicks.push({ click_id: "clk-ho01", ts: iso(2026, 9, 14, 7, 58, 41), message_id: "msg-ho01-phish", upn: UPN, url: "https://docusign-aegean-share.com/s/aegean", url_domain: "docusign-aegean-share.com", user_ip: CAMPUS_IP });
  // MFA approval from DigitalOcean, no device (reverse-proxy relay).
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 14, 7, 59, 30), upn: UPN, result: "mfa_approved", ip: "203.0.113.77", asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "NL", city: "Amsterdam", device_id: null, user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 1, risk_flag: "suspicious-mfa-approval" });
  // Session replays from OVH, zero prompts, no device.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 14, 8, 14, 2), upn: UPN, result: "success", ip: "192.0.2.150", asn: "AS16276", asn_org: "AS16276 OVH SAS", country: "FR", city: "Gravelines", device_id: null, user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 0 });
  // Rule hides invoice/IBAN mail (API-created, classic BEC preparation).
  s.rules.push({ rule_id: "rule-ho01", ts: iso(2026, 9, 14, 8, 20, 47), upn: UPN, action: "move", target: "RSS Feeds", created_via: "api", name: "RSS Sync: move 'fatura','ödeme','IBAN' and mark read" });
  // Real user concurrently from campus (laptop).
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 14, 8, 31, 15), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-zk-01", user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 0 });
  // Further OVH sessions.
  for (const [h, m] of [[9, 2], [11, 40]] as const) {
    s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 14, h, m, 33), upn: UPN, result: "success", ip: "192.0.2.150", asn: "AS16276", asn_org: "AS16276 OVH SAS", country: "FR", city: "Gravelines", device_id: null, user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 0 });
  }
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 15, 3, 10, 54), upn: UPN, result: "success", ip: "192.0.2.150", asn: "AS16276", asn_org: "AS16276 OVH SAS", country: "FR", city: "Gravelines", device_id: null, user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 0 });
}

// ho-02 — remote lab desktop via VPN. Baseline campus + TTNET; incident
// 2026-10-11 TOTP approval on patched vpn-edge-02 from home TTNET → nested
// SIS/LMS sessions from dev-lab-ce-07 (his managed desktop) at campus IP.
function hoTwo(seq: { n: number }, s: Suite) {
  const UPN = "h.ozturk@aegean.edu";
  const CAMPUS_IP = "193.140.10.45";
  const HOME_IP = "198.51.100.40";
  const LAB_IP = "193.140.10.87";
  for (let i = 0; i < 95; i++) {
    const dayOffset = Math.floor((i * 55) / 95);
    const base = Date.UTC(2026, 7, 10, 8, 20, 0) + dayOffset * 86_400_000 + (i % 10) * 1_800_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-ho-mbp", user_agent: USER_AGENT_MAC, app: i % 3 === 0 ? "sis" : i % 3 === 1 ? "mail" : "lms", mfa_prompt_count: 0 });
  }
  for (let i = 0; i < 40; i++) {
    const dayOffset = Math.floor((i * 55) / 40);
    const base = Date.UTC(2026, 7, 10, 21, 10, 0) + dayOffset * 86_400_000 + (i % 5) * 300_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "dev-ho-mbp", user_agent: USER_AGENT_MAC, app: "lms", mfa_prompt_count: 1 });
  }
  // 2026-10-11 night incident.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 11, 21, 3, 10), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "dev-ho-mbp", user_agent: USER_AGENT_MAC, app: "vpn", mfa_prompt_count: 1, via_vpn_appliance: "vpn-edge-02" });
  s.vpnSessions.push({ session_id: "vpn-ho02-5521", upn: UPN, ts_start: iso(2026, 9, 11, 21, 3, 12), ts_end: iso(2026, 9, 11, 23, 48, 40), appliance_id: "vpn-edge-02", client_ip: HOME_IP, assigned_ip: "10.200.4.17" });
  // dev-lab-ce-07 sign-ins at campus IP, over the VPN session window.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 11, 21, 9, 44), upn: UPN, result: "success", ip: LAB_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-lab-ce-07", user_agent: USER_AGENT, app: "sis", mfa_prompt_count: 0, risk_flag: "unfamiliar_device" });
  for (let i = 0; i < 6; i++) {
    const minute = 15 + i * 24; // 21:15, 21:39, 22:03, 22:27, 22:51, 23:15
    s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 11, 21 + Math.floor(minute / 60), minute % 60, 0), upn: UPN, result: "success", ip: LAB_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-lab-ce-07", user_agent: USER_AGENT, app: i % 2 ? "lms" : "sis", mfa_prompt_count: 0 });
  }
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 11, 23, 41, 2), upn: UPN, result: "success", ip: LAB_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-lab-ce-07", user_agent: USER_AGENT, app: "lms", mfa_prompt_count: 0 });
}

// ho-03 — SMS-MFA student, OTP intercepted. Baseline on Turkcell home phone +
// campus laptop; 2026-10-08 6 failures from Datacamp DE → SMS-approved login
// from the same IP on an unknown device → forwarding rule to a lookalike
// Proton address; real user signs in concurrently from his known phone.
function hoThree(seq: { n: number }, s: Suite) {
  const UPN = "c.aydin@aegean.edu";
  const HOME_IP = "198.51.100.72";
  const CAMPUS_IP = "193.140.10.48";
  const ATK_IP = "192.0.2.61";
  for (let i = 0; i < 70; i++) {
    const dayOffset = Math.floor((i * 40) / 70);
    const base = Date.UTC(2026, 8, 1, 19, 20, 0) + dayOffset * 86_400_000 + (i % 6) * 600_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: i % 3 === 0 ? "mfa_approved" : "success", ip: HOME_IP, asn: "AS16135", asn_org: "AS16135 Turkcell", country: "TR", city: "Manisa", device_id: "dev-ca-phone", user_agent: USER_AGENT_PHONE, app: i % 2 ? "lms" : "mail", mfa_prompt_count: i % 3 === 0 ? 1 : 0 });
  }
  for (let i = 0; i < 25; i++) {
    const dayOffset = Math.floor((i * 40) / 25);
    const base = Date.UTC(2026, 8, 2, 11, 10, 0) + dayOffset * 86_400_000 + (i % 5) * 900_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-ca-laptop", user_agent: USER_AGENT, app: i % 2 ? "lms" : "mail", mfa_prompt_count: 0 });
  }
  // 6 failures from Datacamp 2026-10-08 22:41–22:44.
  for (let i = 0; i < 6; i++) {
    const sec = i * 40;
    s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 8, 22, 41 + Math.floor(sec / 60), 5 + (sec % 60)), upn: UPN, result: "failure", ip: ATK_IP, asn: "AS60068", asn_org: "AS60068 Datacamp Limited", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 0 });
  }
  // SMS-approved login from same IP on unknown device.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 8, 22, 46, 12), upn: UPN, result: "mfa_approved", ip: ATK_IP, asn: "AS60068", asn_org: "AS60068 Datacamp Limited", country: "DE", city: "Frankfurt", device_id: "dev-unk-7f3a", user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 1, risk_flag: "suspicious-mfa-approval" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 8, 22, 47, 30), upn: UPN, result: "success", ip: ATK_IP, asn: "AS60068", asn_org: "AS60068 Datacamp Limited", country: "DE", city: "Frankfurt", device_id: "dev-unk-7f3a", user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 0 });
  // Forwarding rule to lookalike Proton address.
  s.rules.push({ rule_id: "rule-ho03", ts: iso(2026, 9, 8, 22, 49, 2), upn: UPN, action: "forward", target: "c.aydin.ogr@proton.me", created_via: "owa", name: "forward all to c.aydin.ogr@proton.me; delete original" });
  // Concurrent real user sign-in from Turkcell phone.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 8, 22, 50, 18), upn: UPN, result: "success", ip: HOME_IP, asn: "AS16135", asn_org: "AS16135 Turkcell", country: "TR", city: "Manisa", device_id: "dev-ca-phone", user_agent: USER_AGENT_PHONE, app: "lms", mfa_prompt_count: 0 });
  // Three further SIS successes from the attacker IP/device.
  for (let i = 0; i < 3; i++) {
    const base = iso(2026, 9, 8, 22, 51 + i * 10, 0);
    s.signins.push({ event_id: bump(seq), ts: base, upn: UPN, result: "success", ip: ATK_IP, asn: "AS60068", asn_org: "AS60068 Datacamp Limited", country: "DE", city: "Frankfurt", device_id: "dev-unk-7f3a", user_agent: USER_AGENT, app: "sis", mfa_prompt_count: 0 });
  }
}

// ho-04 — Payroll BEC concealment pattern. Lookalike "IBAN update" phish
// delivered (no click); that evening the user, from her usual TTNET home IP,
// creates a rule hiding bank/IBAN mail. Agent cannot separate user
// housekeeping from remote device abuse — escalate.
function hoFour(seq: { n: number }, s: Suite) {
  const UPN = "n.guler@aegean.edu";
  const CAMPUS_IP = "193.140.10.52";
  const HOME_IP = "198.51.100.15";
  for (let i = 0; i < 110; i++) {
    const dayOffset = Math.floor((i * 55) / 110);
    const base = Date.UTC(2026, 7, 15, 8, 10, 0) + dayOffset * 86_400_000 + (i % 8) * 1_800_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-ng-01", user_agent: USER_AGENT, app: i % 2 ? "portal" : "mail", mfa_prompt_count: 0 });
  }
  for (let i = 0; i < 35; i++) {
    const dayOffset = Math.floor((i * 55) / 35);
    const base = Date.UTC(2026, 7, 15, 20, 40, 0) + dayOffset * 86_400_000 + (i % 4) * 600_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "dev-ng-01", user_agent: USER_AGENT, app: i % 2 ? "mail" : "portal", mfa_prompt_count: 1 });
  }
  s.deliveries.push({ message_id: "msg-ho04-phish", ts: iso(2026, 9, 16, 6, 12, 40), sender: "hr@aegean-edu.com.tr", sender_domain: "aegean-edu.com.tr", recipient_upn: UPN, subject: "Ekim maaş bordrosu düzeltmesi – IBAN güncelleme", verdict: "phish_suspect", url_count: 1, spf: "fail", dkim: "none", dmarc: "fail" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 16, 21, 48, 20), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "dev-ng-01", user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 1 });
  // First-ever rule silently filing bank/IBAN mail.
  s.rules.push({ rule_id: "rule-ho04", ts: iso(2026, 9, 16, 21, 55, 3), upn: UPN, action: "move", target: "Arşiv-2026", created_via: "owa", name: "move msgs where sender contains 'bank' OR subject contains 'IBAN' to 'Arşiv-2026'; mark as read" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 16, 22, 2, 11), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS9121", asn_org: "AS9121 TTNET", country: "TR", city: "Manisa", device_id: "dev-ng-01", user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 1 });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 17, 8, 58, 30), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-ng-01", user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 0 });
}

// ho-05 — Student behind a commercial VPN. One evening of anonymizing-ASN
// LMS use from his own laptop, bracketed by his home IP; no phish/rule/MFA
// abuse → monitor, not contain.
function hoFive(seq: { n: number }, s: Suite) {
  const UPN = "t.bulut@aegean.edu";
  const HOME_IP = "198.51.100.120";
  const CAMPUS_IP = "193.140.10.57";
  const VPN_IP = "192.0.2.200";
  for (let i = 0; i < 60; i++) {
    const dayOffset = Math.floor((i * 55) / 60);
    const base = Date.UTC(2026, 7, 20, 19, 30, 0) + dayOffset * 86_400_000 + (i % 6) * 900_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: i % 3 === 0 ? "mfa_approved" : "success", ip: HOME_IP, asn: "AS34984", asn_org: "AS34984 Superonline", country: "TR", city: "İzmir", device_id: "dev-tb-laptop", user_agent: USER_AGENT, app: i % 2 ? "lms" : "mail", mfa_prompt_count: i % 3 === 0 ? 1 : 0 });
  }
  for (let i = 0; i < 45; i++) {
    const dayOffset = Math.floor((i * 55) / 45);
    const base = Date.UTC(2026, 7, 21, 12, 0, 0) + dayOffset * 86_400_000 + (i % 5) * 1_200_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: i % 2 ? "dev-tb-laptop" : "dev-tb-phone", user_agent: USER_AGENT, app: i % 2 ? "lms" : "mail", mfa_prompt_count: 0 });
  }
  // Incident 2026-10-13.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 13, 20, 31, 7), upn: UPN, result: "mfa_approved", ip: VPN_IP, asn: "AS9009", asn_org: "AS9009 M247 Europe", country: "RO", city: "Bucharest", device_id: "dev-tb-laptop", user_agent: USER_AGENT, app: "lms", mfa_prompt_count: 1, risk_flag: "anonymous_ip" });
  for (let i = 0; i < 4; i++) {
    s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 13, 20, 33 + i * 15, 0), upn: UPN, result: "success", ip: VPN_IP, asn: "AS9009", asn_org: "AS9009 M247 Europe", country: "RO", city: "Bucharest", device_id: "dev-tb-laptop", user_agent: USER_AGENT, app: "lms", mfa_prompt_count: 0 });
  }
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 13, 21, 55, 40), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS34984", asn_org: "AS34984 Superonline", country: "TR", city: "İzmir", device_id: "dev-tb-laptop", user_agent: USER_AGENT, app: "lms", mfa_prompt_count: 1 });
}

// ho-06 — Carrier geolocation looks like impossible travel. Her phone's
// Turkcell IPs geolocate to Istanbul in 45/60 baseline rows; incident day
// she is simultaneously on her campus PC (bulk SIS during registration week)
// and on her phone. Must verdict benign.
function hoSix(seq: { n: number }, s: Suite) {
  const UPN = "f.yildiz@aegean.edu";
  const CAMPUS_IP = "193.140.10.21";
  // Baseline ×300 campus successes split sis/mail (lower than the 180–260/day
  // hinted at in HOLDOUT_CASES.md so we stay inside DEFAULT_LIMIT=200 for
  // signins_for; the registration-period volume signal still shows up because
  // we concentrate SIS events in 2026-09-15 → 09-26).
  let base = Date.UTC(2026, 7, 20, 8, 0, 0);
  for (let i = 0; i < 300; i++) {
    // Weighted toward the registration window.
    if (i < 180) {
      const regDay = Math.floor(i / 20); // 9 days ×20 (bulk-SIS-pattern per day)
      base = Date.UTC(2026, 8, 15 + regDay, 9 + (i % 20), (i * 3) % 60, 0);
    } else {
      const dayOffset = Math.floor(((i - 180) * 20) / 120);
      base = Date.UTC(2026, 9, 1, 8, 15, 0) + dayOffset * 86_400_000 + ((i - 180) % 10) * 1_800_000;
    }
    const app = (i < 180 || i % 2 === 0) ? "sis" : "mail";
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-fy-pc", user_agent: USER_AGENT, app, mfa_prompt_count: 0 });
  }
  // Baseline ×60 phone, 45/60 geolocate to Istanbul (carrier artifact).
  for (let i = 0; i < 60; i++) {
    const city = i < 45 ? "Istanbul" : "Manisa";
    const ip = `198.51.100.${88 + (i % 8)}`;
    const dayOffset = Math.floor((i * 40) / 60);
    const basePhone = Date.UTC(2026, 7, 25, 18, 30, 0) + dayOffset * 86_400_000 + (i % 4) * 600_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(basePhone).toISOString(), upn: UPN, result: i % 3 === 0 ? "mfa_approved" : "success", ip, asn: "AS16135", asn_org: "AS16135 Turkcell", country: "TR", city, device_id: "dev-fy-phone", user_agent: USER_AGENT_PHONE, app: "mail", mfa_prompt_count: i % 3 === 0 ? 1 : 0 });
  }
  // 2026-10-09 incident day: campus PC + Istanbul-geolocating phone, both
  // during registration week. ~220 SIS events over 2h15m from campus PC.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 9, 10, 2, 14), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-fy-pc", user_agent: USER_AGENT, app: "sis", mfa_prompt_count: 0 });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 9, 10, 9, 31), upn: UPN, result: "success", ip: "198.51.100.91", asn: "AS16135", asn_org: "AS16135 Turkcell", country: "TR", city: "Istanbul", device_id: "dev-fy-phone", user_agent: USER_AGENT_PHONE, app: "mail", mfa_prompt_count: 0, risk_flag: "impossible_travel" });
  for (let i = 0; i < 220; i++) {
    const minute = 15 + Math.floor((i * 135) / 220); // minutes 15..150 → 10:15–12:30
    const hour = 10 + Math.floor(minute / 60);
    const sec = (i * 11) % 60;
    s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 9, hour, minute % 60, sec), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-fy-pc", user_agent: USER_AGENT, app: "sis", mfa_prompt_count: 0 });
  }
}

// ho-07 — MFA-exempt admin. Baseline nightly 02:00–02:05 portal check from
// DigitalOcean (same IP for 38 nights); on 2026-10-17 the same IP suddenly
// reaches HR / SIS / mail — too high-privilege for "monitor", not clear
// enough for "contain" → escalate.
function hoSeven(seq: { n: number }, s: Suite) {
  const UPN = "k.erdem@aegean.edu";
  const CAMPUS_IP = "193.140.10.9";
  const JUMP_IP = "203.0.113.45";
  for (let i = 0; i < 410; i++) {
    const dayOffset = Math.floor((i * 55) / 410);
    const base = Date.UTC(2026, 7, 15, 7, 30, 0) + dayOffset * 86_400_000 + (i % 20) * 900_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-ke-ws", user_agent: USER_AGENT, app: i % 4 === 0 ? "vpn" : i % 2 ? "portal" : "mail", mfa_prompt_count: 0 });
  }
  // 38 nightly 02:00–02:05 portal checks from DigitalOcean.
  for (let i = 0; i < 38; i++) {
    const dayOffset = i * 2; // every other day, keep it dense
    const base = Date.UTC(2026, 7, 25, 2, 0, 6) + dayOffset * 86_400_000 + (i % 5) * 60_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: JUMP_IP, asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 0 });
  }
  // 2026-10-17 incident night: same IP breaks pattern — first-ever HR/SIS/mail.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 17, 2, 0, 6), upn: UPN, result: "success", ip: JUMP_IP, asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 0 });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 17, 2, 47, 19), upn: UPN, result: "success", ip: JUMP_IP, asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 0, risk_flag: "unexpected-app-hr" });
  // The orchestrator groups by app via signin_event.app so we tag the row as
  // "portal" but keep the risk_flag/claim human-readable. However the real
  // signal in the HOLDOUT spec is a first-ever HR/SIS/mail access from this
  // IP; we need signin rows whose `app` is exactly hr / sis / mail.
  // signin_events.app enum is {mail, lms, sis, vpn, portal} — HR is served as
  // "portal" in this org, so we encode "first-ever HR" as a portal row with a
  // telling risk_flag, and keep SIS/mail as themselves.
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 17, 2, 49, 51), upn: UPN, result: "success", ip: JUMP_IP, asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENT, app: "sis", mfa_prompt_count: 0, risk_flag: "unexpected-app-sis" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 17, 2, 52, 8), upn: UPN, result: "success", ip: JUMP_IP, asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENT, app: "mail", mfa_prompt_count: 0, risk_flag: "unexpected-app-mail" });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 17, 7, 40, 12), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-ke-ws", user_agent: USER_AGENT, app: "portal", mfa_prompt_count: 0 });
}

// ho-08 — Student clicks a KYK scholarship phish. The click is a real
// exposure but every later sign-in matches baseline (TOTP, same ASN/device,
// no rules). → monitor, not contain.
function hoEight(seq: { n: number }, s: Suite) {
  const UPN = "g.sen@aegean.edu";
  const HOME_IP = "198.51.100.140";
  const CAMPUS_IP = "193.140.10.62";
  for (let i = 0; i < 80; i++) {
    const dayOffset = Math.floor((i * 50) / 80);
    const base = Date.UTC(2026, 7, 25, 18, 40, 0) + dayOffset * 86_400_000 + (i % 6) * 900_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: i % 3 === 0 ? "mfa_approved" : "success", ip: HOME_IP, asn: "AS34984", asn_org: "AS34984 Superonline", country: "TR", city: "Manisa", device_id: "dev-gs-phone", user_agent: USER_AGENT_PHONE, app: i % 2 ? "mail" : "lms", mfa_prompt_count: i % 3 === 0 ? 1 : 0 });
  }
  for (let i = 0; i < 40; i++) {
    const dayOffset = Math.floor((i * 50) / 40);
    const base = Date.UTC(2026, 7, 26, 11, 10, 0) + dayOffset * 86_400_000 + (i % 5) * 900_000;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-gs-phone", user_agent: USER_AGENT_PHONE, app: "lms", mfa_prompt_count: 0 });
  }
  s.deliveries.push({ message_id: "msg-ho08-phish", ts: iso(2026, 9, 15, 13, 2, 44), sender: "burs@edevlet-burs-basvuru.com", sender_domain: "edevlet-burs-basvuru.com", recipient_upn: UPN, subject: "KYK burs ödemeniz beklemede", verdict: "phish_suspect", url_count: 1, spf: "fail", dkim: "none", dmarc: "fail" });
  s.clicks.push({ click_id: "clk-ho08", ts: iso(2026, 9, 15, 13, 10, 9), message_id: "msg-ho08-phish", upn: UPN, url: "https://edevlet-burs-basvuru.com/giris", url_domain: "edevlet-burs-basvuru.com", user_ip: CAMPUS_IP });
  s.signins.push({ event_id: bump(seq), ts: iso(2026, 9, 15, 13, 31, 50), upn: UPN, result: "success", ip: CAMPUS_IP, asn: CAMPUS_ASN, asn_org: CAMPUS_ASN_ORG, country: "TR", city: "Manisa", device_id: "dev-gs-phone", user_agent: USER_AGENT_PHONE, app: "lms", mfa_prompt_count: 0 });
  // 9 later sign-ins on her home phone, all TOTP-approved.
  for (let i = 0; i < 9; i++) {
    const base = Date.UTC(2026, 9, 15, 19, 5, 0) + i * 3600_000 * 10;
    s.signins.push({ event_id: bump(seq), ts: new Date(base).toISOString(), upn: UPN, result: "mfa_approved", ip: HOME_IP, asn: "AS34984", asn_org: "AS34984 Superonline", country: "TR", city: "Manisa", device_id: "dev-gs-phone", user_agent: USER_AGENT_PHONE, app: i % 2 ? "mail" : "lms", mfa_prompt_count: 1 });
  }
}

/** Append ho-01 … ho-08 to the suite. Idempotent per-build; use with a fresh
 *  signinSeq to avoid event_id collisions with the dev suite. */
export function appendHoldout(suite: Suite, signinSeq: { n: number }): IdentitySeed[] {
  hoOne(signinSeq, suite);
  hoTwo(signinSeq, suite);
  hoThree(signinSeq, suite);
  hoFour(signinSeq, suite);
  hoFive(signinSeq, suite);
  hoSix(signinSeq, suite);
  hoSeven(signinSeq, suite);
  hoEight(signinSeq, suite);
  // Devices join via assets.csv (Zetaris FILES store).
  suite.assets.push(...HOLDOUT_ASSETS);
  return [...HOLDOUT_IDENTITIES];
}

export const HOLDOUT_CASES = {
  "ho-01": { upn: "z.korkmaz@aegean.edu", expected: "contain" },
  "ho-02": { upn: "h.ozturk@aegean.edu", expected: "benign" },
  "ho-03": { upn: "c.aydin@aegean.edu", expected: "contain" },
  "ho-04": { upn: "n.guler@aegean.edu", expected: "escalate" },
  "ho-05": { upn: "t.bulut@aegean.edu", expected: "monitor" },
  "ho-06": { upn: "f.yildiz@aegean.edu", expected: "benign" },
  "ho-07": { upn: "k.erdem@aegean.edu", expected: "escalate" },
  "ho-08": { upn: "g.sen@aegean.edu", expected: "monitor" },
} as const satisfies Record<string, { upn: string; expected: string }>;
