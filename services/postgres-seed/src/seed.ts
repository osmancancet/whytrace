// Deterministic Postgres seed for WhyTrace. Mirrors notes/SCENARIOS.md
// line-by-line for the three demo cases and the three eval cases, then adds
// background noise. Also writes the asset CSV to data/ for the Zetaris file
// store.
import { Client } from "pg";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { seededRng } from "./rng.ts";
import type { AssetRow, IdentitySeed, MailClick, MailDelivery, MailRule, SigninSeed, VpnSeed } from "./scenarios.ts";

const SEED = 20261022;
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolvePath(HERE, "..", "..", "..");
const DATA_DIR = resolvePath(REPO_ROOT, "data");

const rng = seededRng(SEED);
const { int, pick } = rng;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhyBrowser/1.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) WhyBrowser/1.0",
  "Mozilla/5.0 (Android 14) WhyMobile/1.0",
  "ExchangeSync/15",
];

const CAMPUS_IPS = ["193.140.10.44", "193.140.10.21", "193.140.10.9", "193.140.10.17"];
const TURKCELL_IPS = ["78.187.4.44", "78.187.9.1", "78.187.19.22"];
const APPLIANCES = { bad: "vpn-edge-01", good: "vpn-edge-02" } as const;

const IDENTITIES: IdentitySeed[] = [
  { upn: "d.yilmaz@aegean.edu", display_name: "Deniz Yılmaz", role: "staff", department: "Finance", mfa_method: "push", home_country: "TR", created_at: "2024-01-15T10:00:00Z" },
  { upn: "prof.kaya@aegean.edu", display_name: "Prof. Elif Kaya", role: "faculty", department: "Computer Engineering", mfa_method: "totp", home_country: "TR", created_at: "2019-09-01T08:00:00Z" },
  { upn: "s.demir@aegean.edu", display_name: "Selim Demir", role: "student", department: "Computer Engineering (Lab Admin)", mfa_method: "push", home_country: "TR", created_at: "2024-10-01T09:00:00Z" },
  { upn: "m.aslan@aegean.edu", display_name: "Mehmet Aslan", role: "staff", department: "Library", mfa_method: "totp", home_country: "TR", created_at: "2023-02-14T10:00:00Z" },
  { upn: "e.oz@aegean.edu", display_name: "Ece Öz", role: "staff", department: "Student Affairs", mfa_method: "push", home_country: "TR", created_at: "2024-05-02T10:00:00Z" },
  { upn: "b.cetin@aegean.edu", display_name: "Baran Çetin", role: "staff", department: "IT Operations", mfa_method: "push", home_country: "TR", created_at: "2023-11-11T10:00:00Z" },
];

const BG_FIRST = ["Ahmet", "Ayşe", "Can", "Deniz", "Emre", "Fatma", "Gül", "Hakan", "Irmak", "Jale", "Kerem", "Leyla", "Mert", "Nazlı", "Osman", "Pelin", "Rıza", "Sedef", "Tuğçe", "Ulaş", "Volkan", "Yasemin", "Zeynep"];
const BG_LAST = ["Yıldız", "Çelik", "Şahin", "Arslan", "Doğan", "Koç", "Polat", "Erden", "Tekin", "Barış", "Avcı", "Keskin"];
const DEPTS = ["Mathematics", "Physics", "Biology", "Mechanical Engineering", "Civil Engineering", "Business", "Economics", "History", "Linguistics"];

function addBackgroundIdentities(n: number): IdentitySeed[] {
  const out: IdentitySeed[] = [];
  const seenUpns = new Set(IDENTITIES.map((i) => i.upn));
  const roles: IdentitySeed["role"][] = ["student", "student", "student", "staff", "staff", "faculty"];
  const mfas: IdentitySeed["mfa_method"][] = ["push", "totp", "sms"];
  for (let i = 0; i < n; i++) {
    const first = BG_FIRST[int(0, BG_FIRST.length - 1)]!.toLowerCase();
    const last = BG_LAST[int(0, BG_LAST.length - 1)]!.toLowerCase();
    const upn = `${first[0]}.${last}${i}@aegean.edu`;
    if (seenUpns.has(upn)) continue;
    seenUpns.add(upn);
    out.push({
      upn,
      display_name: `${BG_FIRST[int(0, BG_FIRST.length - 1)]} ${BG_LAST[int(0, BG_LAST.length - 1)]}`,
      role: roles[int(0, roles.length - 1)]!,
      department: DEPTS[int(0, DEPTS.length - 1)]!,
      mfa_method: mfas[int(0, mfas.length - 1)]!,
      home_country: "TR",
      created_at: `2023-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}T10:00:00Z`,
    });
  }
  return out;
}

type Suite = {
  signins: SigninSeed[];
  vpnSessions: VpnSeed[];
  deliveries: MailDelivery[];
  clicks: MailClick[];
  rules: MailRule[];
  assets: AssetRow[];
};

const bump = (seq: { n: number }) => `evt_${(seq.n++).toString().padStart(6, "0")}`;

function caseOne(signinSeq: { n: number }, s: Suite) {
  const BAD_IP = "185.220.101.7";
  const BAD_ASN = "AS14618";
  const BAD_ASN_ORG = "BulwarkHost Ltd";
  const campusIp = CAMPUS_IPS[0]!;
  // 7× mfa_denied 06:52-06:58
  for (let i = 0; i < 7; i++) {
    const ts = new Date(Date.UTC(2026, 9, 14, 6, 52 + i, 0)).toISOString();
    s.signins.push({ event_id: bump(signinSeq), ts, upn: "d.yilmaz@aegean.edu", result: "mfa_denied", ip: BAD_IP, asn: BAD_ASN, asn_org: BAD_ASN_ORG, country: "NL", city: "Amsterdam", device_id: null, user_agent: USER_AGENTS[0], app: "mail", mfa_prompt_count: i + 1, risk_flag: "unfamiliar-sign-in-properties" });
  }
  // 06:59 mfa_approved then success same IP
  const tsApprove = new Date(Date.UTC(2026, 9, 14, 6, 59, 0)).toISOString();
  s.signins.push({ event_id: bump(signinSeq), ts: tsApprove, upn: "d.yilmaz@aegean.edu", result: "mfa_approved", ip: BAD_IP, asn: BAD_ASN, asn_org: BAD_ASN_ORG, country: "NL", city: "Amsterdam", device_id: null, user_agent: USER_AGENTS[0], app: "mail", mfa_prompt_count: 8, risk_flag: "suspicious-mfa-approval" });
  const tsSuccess = new Date(Date.UTC(2026, 9, 14, 6, 59, 30)).toISOString();
  s.signins.push({ event_id: bump(signinSeq), ts: tsSuccess, upn: "d.yilmaz@aegean.edu", result: "success", ip: BAD_IP, asn: BAD_ASN, asn_org: BAD_ASN_ORG, country: "NL", city: "Amsterdam", device_id: null, user_agent: USER_AGENTS[0], app: "mail", mfa_prompt_count: 8 });
  // 07:05-07:40 bulk SIS access, 38 events (mix minutes 05..40, roughly uniform)
  for (let i = 0; i < 38; i++) {
    const minute = 5 + Math.floor(i * 35 / 38);
    const second = (i * 11) % 60;
    const ts = new Date(Date.UTC(2026, 9, 14, 7, minute, second)).toISOString();
    s.signins.push({ event_id: bump(signinSeq), ts, upn: "d.yilmaz@aegean.edu", result: "success", ip: BAD_IP, asn: BAD_ASN, asn_org: BAD_ASN_ORG, country: "NL", city: "Amsterdam", device_id: null, user_agent: USER_AGENTS[0], app: "sis", mfa_prompt_count: 0, risk_flag: i === 0 ? "mass-access" : undefined });
  }
  // Baseline 60 days: 30 benign TR sign-ins before incident
  for (let i = 0; i < 30; i++) {
    const day = 2 + Math.floor(i / 2);
    const hour = 7 + (i % 10);
    const ts = new Date(Date.UTC(2026, 9, day, hour, 10 + i, 0)).toISOString();
    s.signins.push({ event_id: bump(signinSeq), ts, upn: "d.yilmaz@aegean.edu", result: "success", ip: campusIp, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: "LT-2207", user_agent: USER_AGENTS[0], app: i % 3 === 0 ? "sis" : "mail", mfa_prompt_count: 0 });
  }
  // Mail
  s.deliveries.push({ message_id: "msg-001-phish", ts: new Date(Date.UTC(2026, 9, 14, 6, 12, 0)).toISOString(), sender: "support@aegean-edu.co", sender_domain: "aegean-edu.co", recipient_upn: "d.yilmaz@aegean.edu", subject: "Acil hesap doğrulaması", verdict: "phish_suspect", url_count: 1, spf: "fail", dkim: "none", dmarc: "fail" });
  s.clicks.push({ click_id: "clk-001", ts: new Date(Date.UTC(2026, 9, 14, 6, 15, 0)).toISOString(), message_id: "msg-001-phish", upn: "d.yilmaz@aegean.edu", url: "https://aegean-edu.co/verify", url_domain: "aegean-edu.co", user_ip: campusIp });
  s.rules.push({ rule_id: "rule-001", ts: new Date(Date.UTC(2026, 9, 14, 7, 3, 0)).toISOString(), upn: "d.yilmaz@aegean.edu", action: "forward", target: "d.yilmaz.payroll@gmail.com", created_via: "api" });
}

function caseTwo(signinSeq: { n: number }, s: Suite) {
  // 10-15 06:40 Manisa success (actually a mail-sync token, user_agent ExchangeSync)
  s.signins.push({ event_id: bump(signinSeq), ts: new Date(Date.UTC(2026, 9, 15, 6, 40, 0)).toISOString(), upn: "prof.kaya@aegean.edu", result: "success", ip: CAMPUS_IPS[1]!, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: null, user_agent: "ExchangeSync/15", app: "mail", mfa_prompt_count: 0 });
  // VPN edge-02 at 07:10
  s.vpnSessions.push({ session_id: "vpn-k-01", upn: "prof.kaya@aegean.edu", ts_start: new Date(Date.UTC(2026, 9, 15, 7, 10, 0)).toISOString(), ts_end: new Date(Date.UTC(2026, 9, 16, 18, 0, 0)).toISOString(), appliance_id: APPLIANCES.good, client_ip: "89.180.44.17", assigned_ip: "10.20.5.17" });
  // Successes from Lisbon on managed laptop LT-3104
  const times = [
    [15, 7, 12], [15, 8, 15], [15, 10, 1], [15, 12, 20], [15, 14, 45], [15, 19, 2], [16, 7, 5], [16, 9, 30], [16, 11, 10], [16, 14, 0],
  ] as const;
  for (const [day, hour, minute] of times) {
    s.signins.push({ event_id: bump(signinSeq), ts: new Date(Date.UTC(2026, 9, day, hour, minute, 0)).toISOString(), upn: "prof.kaya@aegean.edu", result: "success", ip: "89.180.44.17", asn: "AS2860", asn_org: "MEO", country: "PT", city: "Lisbon", device_id: "LT-3104", user_agent: USER_AGENTS[1], app: hour < 12 ? "mail" : "lms", mfa_prompt_count: 0, via_vpn_appliance: APPLIANCES.good });
  }
}

function caseThree(signinSeq: { n: number }, s: Suite) {
  s.vpnSessions.push({ session_id: "vpn-s-01", upn: "s.demir@aegean.edu", ts_start: new Date(Date.UTC(2026, 9, 17, 21, 30, 0)).toISOString(), ts_end: new Date(Date.UTC(2026, 9, 17, 22, 15, 0)).toISOString(), appliance_id: APPLIANCES.bad, client_ip: "45.142.10.9", assigned_ip: "10.20.9.9" });
  // 12 extra sessions with ts_end < ts_start (clock skew DQ defect)
  for (let i = 0; i < 12; i++) {
    const start = new Date(Date.UTC(2026, 9, 17 - (i % 3), 20 + (i % 4), 30 + i, 0));
    const bad_end = new Date(start.getTime() - 60_000);
    s.vpnSessions.push({ session_id: `vpn-skew-${i}`, upn: "s.demir@aegean.edu", ts_start: start.toISOString(), ts_end: bad_end.toISOString(), appliance_id: APPLIANCES.bad, client_ip: "45.142.10.9", assigned_ip: `10.20.9.${10 + i}` });
  }
  // mfa_approved + normal activity
  s.signins.push({ event_id: bump(signinSeq), ts: new Date(Date.UTC(2026, 9, 17, 21, 31, 0)).toISOString(), upn: "s.demir@aegean.edu", result: "mfa_approved", ip: "45.142.10.9", asn: "AS58061", asn_org: "Cloudvault VPS", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENTS[0], app: "portal", mfa_prompt_count: 1, via_vpn_appliance: APPLIANCES.bad });
  for (let i = 0; i < 7; i++) {
    const t = new Date(Date.UTC(2026, 9, 17, 21, 32 + i * 5, 0));
    s.signins.push({ event_id: bump(signinSeq), ts: t.toISOString(), upn: "s.demir@aegean.edu", result: "success", ip: "45.142.10.9", asn: "AS58061", asn_org: "Cloudvault VPS", country: "DE", city: "Frankfurt", device_id: null, user_agent: USER_AGENTS[0], app: i % 2 ? "lms" : "portal", mfa_prompt_count: 0, via_vpn_appliance: APPLIANCES.bad });
  }
}

function caseFour(signinSeq: { n: number }, s: Suite) {
  // Password spray: 140 failures across 60 accounts from one IP in 20 min, then 1 success for m.aslan
  const sprayIp = "185.213.44.9";
  const asn = "AS60117";
  const asnOrg = "SprayNet AS";
  const targets: string[] = ["m.aslan@aegean.edu"];
  // We will spread 140 failures across 60 synthetic upns (not stored as identities but harmless).
  for (let i = 0; i < 59; i++) targets.push(`bg${i}.spray@aegean.edu`);
  const start = Date.UTC(2026, 9, 18, 2, 0, 0);
  for (let i = 0; i < 140; i++) {
    const ts = new Date(start + i * 8_500).toISOString();
    const upn = targets[i % targets.length]!;
    s.signins.push({ event_id: bump(signinSeq), ts, upn, result: "failure", ip: sprayIp, asn, asn_org: asnOrg, country: "RU", city: "Moscow", device_id: null, user_agent: USER_AGENTS[2], app: "portal", mfa_prompt_count: 0, risk_flag: "password-spray" });
  }
  // Success at the end for m.aslan
  s.signins.push({ event_id: bump(signinSeq), ts: new Date(start + 150 * 8_500).toISOString(), upn: "m.aslan@aegean.edu", result: "success", ip: sprayIp, asn, asn_org: asnOrg, country: "RU", city: "Moscow", device_id: null, user_agent: USER_AGENTS[2], app: "portal", mfa_prompt_count: 0, risk_flag: "unfamiliar-sign-in-properties" });
}

function caseFive(signinSeq: { n: number }, s: Suite) {
  // user-created forwarding rule to own alias; normal sign-ins
  for (let d = 10; d < 18; d++) {
    const ts = new Date(Date.UTC(2026, 9, d, 8, 10, 0)).toISOString();
    s.signins.push({ event_id: bump(signinSeq), ts, upn: "e.oz@aegean.edu", result: "success", ip: CAMPUS_IPS[2]!, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: "LT-7701", user_agent: USER_AGENTS[1], app: "mail", mfa_prompt_count: 0 });
  }
  s.rules.push({ rule_id: "rule-005", ts: new Date(Date.UTC(2026, 9, 16, 11, 0, 0)).toISOString(), upn: "e.oz@aegean.edu", action: "forward", target: "e.oz.archive@aegean.edu", created_via: "owa" });
}

function caseSix(signinSeq: { n: number }, s: Suite) {
  // b.cetin new device, same ASN/country, TOTP, no other signals
  for (let d = 10; d < 17; d++) {
    const ts = new Date(Date.UTC(2026, 9, d, 7, 15, 0)).toISOString();
    s.signins.push({ event_id: bump(signinSeq), ts, upn: "b.cetin@aegean.edu", result: "success", ip: CAMPUS_IPS[3]!, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: "LT-6002", user_agent: USER_AGENTS[1], app: "portal", mfa_prompt_count: 0 });
  }
  s.signins.push({ event_id: bump(signinSeq), ts: new Date(Date.UTC(2026, 9, 18, 7, 15, 0)).toISOString(), upn: "b.cetin@aegean.edu", result: "mfa_approved", ip: TURKCELL_IPS[0]!, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: "PH-9900", user_agent: USER_AGENTS[2], app: "portal", mfa_prompt_count: 1 });
  s.signins.push({ event_id: bump(signinSeq), ts: new Date(Date.UTC(2026, 9, 18, 7, 15, 30)).toISOString(), upn: "b.cetin@aegean.edu", result: "success", ip: TURKCELL_IPS[0]!, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: "PH-9900", user_agent: USER_AGENTS[2], app: "portal", mfa_prompt_count: 1 });
}

function addNoise(signinSeq: { n: number }, s: Suite, bgIdents: IdentitySeed[]) {
  for (const idn of bgIdents) {
    const days = int(2, 10);
    for (let i = 0; i < days; i++) {
      const d = 5 + (i % 14);
      const hr = int(7, 19);
      const minute = int(0, 59);
      const ts = new Date(Date.UTC(2026, 9, d, hr, minute, 0)).toISOString();
      const result = pick<SigninSeed["result"]>(["success", "success", "success", "success", "failure"]);
      s.signins.push({ event_id: bump(signinSeq), ts, upn: idn.upn, result, ip: pick([...CAMPUS_IPS, ...TURKCELL_IPS]), asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: `BG-${idn.upn.length}`, user_agent: USER_AGENTS[int(0, 2)]!, app: pick<SigninSeed["app"]>(["mail", "lms", "sis", "portal"]), mfa_prompt_count: 0 });
    }
  }
  // VPN noise on edge-02 for 20 BG users
  for (let i = 0; i < 20; i++) {
    const u = bgIdents[int(0, bgIdents.length - 1)]!;
    const start = new Date(Date.UTC(2026, 9, int(6, 18), int(8, 20), int(0, 59), 0)).toISOString();
    s.vpnSessions.push({ session_id: `vpn-bg-${i}`, upn: u.upn, ts_start: start, ts_end: new Date(Date.parse(start) + 3600_000).toISOString(), appliance_id: APPLIANCES.good, client_ip: `78.187.${int(1,254)}.${int(1,254)}`, assigned_ip: `10.20.${int(1,254)}.${int(1,254)}` });
  }
  // Alias UPN FK defect: 14 sign-ins for dyilmaz@aegean.edu (not in identities)
  for (let i = 0; i < 14; i++) {
    const ts = new Date(Date.UTC(2026, 9, 11 + (i % 5), 9 + (i % 8), 20 + i, 0)).toISOString();
    s.signins.push({ event_id: bump(signinSeq), ts, upn: "dyilmaz@aegean.edu", result: "success", ip: CAMPUS_IPS[0]!, asn: "AS9121", asn_org: "Turkcell", country: "TR", city: "Manisa", device_id: null, user_agent: USER_AGENTS[0], app: "mail", mfa_prompt_count: 0 });
  }
  // Benign OWA forwarding rules
  for (let i = 0; i < 5; i++) {
    const u = bgIdents[int(0, bgIdents.length - 1)]!;
    const ts = new Date(Date.UTC(2026, 9, int(6, 18), int(9, 17), 0, 0)).toISOString();
    s.rules.push({ rule_id: `rule-noise-${i}`, ts, upn: u.upn, action: pick(["move", "move", "forward"]), target: u.upn.replace("@aegean.edu", ".archive@aegean.edu"), created_via: "owa" });
  }
  // Spam deliveries (never clicked)
  for (let i = 0; i < 40; i++) {
    const u = bgIdents[int(0, bgIdents.length - 1)]!;
    s.deliveries.push({ message_id: `msg-noise-${i}`, ts: new Date(Date.UTC(2026, 9, int(6, 18), int(8, 18), 0, 0)).toISOString(), sender: `noreply@spamhost${int(1, 50)}.com`, sender_domain: `spamhost${int(1, 50)}.com`, recipient_upn: u.upn, subject: pick(["Discount", "Final notice", "Update your profile", "Package pending"]), verdict: pick<"spam" | "clean" | "phish_suspect">(["spam", "spam", "spam", "phish_suspect", "clean"]), url_count: int(0, 3), spf: pick(["pass", "fail"]), dkim: pick(["pass", "none"]), dmarc: pick(["pass", "fail"]) });
  }
}

function buildAssets(): AssetRow[] {
  const list: AssetRow[] = [
    { device_id: "LT-2207", owner_upn: "d.yilmaz@aegean.edu", hostname: "finance-lt-2207.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-13T18:12:00Z", type: "laptop", firmware: "n/a", location: "Manisa / Finance" },
    { device_id: "LT-3104", owner_upn: "prof.kaya@aegean.edu", hostname: "ce-lt-3104.aegean.edu", os: "macOS", os_version: "14.4.1", managed: true, last_seen: "2026-10-16T18:12:00Z", type: "laptop", firmware: "n/a", location: "Manisa / CE" },
    { device_id: "LT-7701", owner_upn: "e.oz@aegean.edu", hostname: "sa-lt-7701.aegean.edu", os: "Windows", os_version: "11 23H2", managed: true, last_seen: "2026-10-18T18:12:00Z", type: "laptop", firmware: "n/a", location: "Manisa / Student Affairs" },
    { device_id: "LT-6002", owner_upn: "b.cetin@aegean.edu", hostname: "it-lt-6002.aegean.edu", os: "Linux", os_version: "Ubuntu 24.04", managed: true, last_seen: "2026-10-19T18:12:00Z", type: "laptop", firmware: "n/a", location: "Manisa / IT" },
    { device_id: "PH-9900", owner_upn: "b.cetin@aegean.edu", hostname: "it-ph-9900", os: "Android", os_version: "14", managed: false, last_seen: "2026-10-19T18:00:00Z", type: "phone", firmware: "n/a", location: "Manisa" },
    { device_id: APPLIANCES.bad, owner_upn: "it-infra@aegean.edu", hostname: "vpn-edge-01.aegean.edu", os: "Ivanti Connect Secure", os_version: "22.7R2.3", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "vpn_appliance", firmware: "22.7R2.3", location: "Manisa / DMZ" },
    { device_id: APPLIANCES.good, owner_upn: "it-infra@aegean.edu", hostname: "vpn-edge-02.aegean.edu", os: "Ivanti Connect Secure", os_version: "22.7R2.8", managed: true, last_seen: "2026-10-19T18:00:00Z", type: "vpn_appliance", firmware: "22.7R2.8", location: "Manisa / DMZ" },
  ];
  // Background devices
  for (let i = 0; i < 20; i++) {
    list.push({ device_id: `BG-${30 + i}`, owner_upn: `${BG_FIRST[int(0, BG_FIRST.length - 1)]!.toLowerCase()}.${BG_LAST[int(0, BG_LAST.length - 1)]!.toLowerCase()}${i}@aegean.edu`, hostname: `bg-${i}.aegean.edu`, os: pick(["Windows", "macOS", "Linux"]), os_version: pick(["11 23H2", "14.4.1", "Ubuntu 24.04"]), managed: pick([true, true, false]), last_seen: `2026-10-${String(10 + (i % 10)).padStart(2, "0")}T12:00:00Z`, type: pick(["laptop", "desktop", "phone"]), firmware: "n/a", location: "Manisa" });
  }
  return list;
}

function writeAssetsCsv(rows: AssetRow[]) {
  mkdirSync(DATA_DIR, { recursive: true });
  const header = "device_id,owner_upn,hostname,os,os_version,managed,last_seen,type,firmware,location";
  const esc = (v: string | boolean) => {
    const s = String(v);
    return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => [r.device_id, r.owner_upn, r.hostname, r.os, r.os_version, r.managed, r.last_seen, r.type, r.firmware, r.location].map(esc).join(",")).join("\n");
  writeFileSync(resolvePath(DATA_DIR, "assets.csv"), `${header}\n${body}\n`, "utf8");
}

function writeMailSnapshots(suite: Suite) {
  mkdirSync(resolvePath(DATA_DIR, "mailgw"), { recursive: true });
  writeFileSync(resolvePath(DATA_DIR, "mailgw", "deliveries.json"), JSON.stringify({ data: suite.deliveries }, null, 2));
  writeFileSync(resolvePath(DATA_DIR, "mailgw", "clicks.json"), JSON.stringify({ data: suite.clicks }, null, 2));
  writeFileSync(resolvePath(DATA_DIR, "mailgw", "rules.json"), JSON.stringify({ data: suite.rules }, null, 2));
}

async function main() {
  const suite: Suite = { signins: [], vpnSessions: [], deliveries: [], clicks: [], rules: [], assets: [] };
  const signinSeq = { n: 1 };
  caseOne(signinSeq, suite);
  caseTwo(signinSeq, suite);
  caseThree(signinSeq, suite);
  caseFour(signinSeq, suite);
  caseFive(signinSeq, suite);
  caseSix(signinSeq, suite);
  const bg = addBackgroundIdentities(400);
  addNoise(signinSeq, suite, bg);
  suite.assets = buildAssets();
  writeAssetsCsv(suite.assets);
  writeMailSnapshots(suite);

  const host = process.env.WHYTRACE_PG_HOST ?? "localhost";
  const port = Number(process.env.WHYTRACE_PG_PORT ?? 5433);
  const user = process.env.WHYTRACE_PG_USER ?? "whytrace";
  const password = process.env.WHYTRACE_PG_PASSWORD ?? "whytrace";
  const database = process.env.WHYTRACE_PG_DB ?? "authlogs";

  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    const schema = readFileSync(resolvePath(HERE, "schema.sql"), "utf8");
    await client.query(schema);
    for (const i of [...IDENTITIES, ...bg]) {
      await client.query("INSERT INTO identities (upn, display_name, role, department, mfa_method, home_country, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (upn) DO NOTHING", [i.upn, i.display_name, i.role, i.department, i.mfa_method, i.home_country, i.created_at]);
    }
    // Only insert signins whose UPN is in identities OR explicitly the alias defect; FK is enforced only logically in Zetaris DQ.
    for (const e of suite.signins) {
      await client.query("INSERT INTO signin_events (event_id, ts, upn, result, ip, asn, asn_org, country, city, device_id, user_agent, app, mfa_prompt_count, risk_flag, via_vpn_appliance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (event_id) DO NOTHING", [e.event_id, e.ts, e.upn, e.result, e.ip, e.asn ?? null, e.asn_org ?? null, e.country ?? null, e.city ?? null, e.device_id ?? null, e.user_agent ?? null, e.app, e.mfa_prompt_count ?? 0, e.risk_flag ?? null, e.via_vpn_appliance ?? null]);
    }
    for (const v of suite.vpnSessions) {
      await client.query("INSERT INTO vpn_sessions (session_id, upn, ts_start, ts_end, appliance_id, client_ip, assigned_ip) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (session_id) DO NOTHING", [v.session_id, v.upn, v.ts_start, v.ts_end ?? null, v.appliance_id, v.client_ip ?? null, v.assigned_ip ?? null]);
    }
    const counts = await client.query<{ r: string }>("SELECT 'identities ' || count(*) AS r FROM identities UNION ALL SELECT 'signin_events ' || count(*) FROM signin_events UNION ALL SELECT 'vpn_sessions ' || count(*) FROM vpn_sessions");
    for (const row of counts.rows) console.log(row.r);
    console.log(`seed done. assets.csv rows=${suite.assets.length} deliveries=${suite.deliveries.length} clicks=${suite.clicks.length} rules=${suite.rules.length}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
