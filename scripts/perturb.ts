// DAY6 perturbation generator for scripts/eval.ts.
//
// For each of the 7 dev cases (`case-001 … case-007`), generates N
// deterministic label-preserving variants by:
//   1. new UPN (`pert<v>.<original-local-part>@aegean.edu`) + identity row
//   2. shifting every timestamp by a seeded whole number of days inside the
//      2026-08-05 → 2026-10-20 window (so no row escapes the baseline range)
//   3. swapping attacker IPs/ASNs for other plausible hosting ones
//   4. remapping benign-travel city/country to another plausible pair
//      (keeping the travel ISP as the destination's major carrier)
//   5. keeping campus (193.140.10.x / AS-AEGEAN-EDU) and TR home ISPs
//      (Turkcell / Superonline / TTNET) consistent
//
// Device IDs are suffixed `-p<v>` and inserted as owned by the new UPN so
// the device table joins still fire.
//
// The script is pure data-generation; it does not touch product code. It is
// invoked only by `scripts/eval.ts --perturb`.
import { buildSuite } from "../services/postgres-seed/src/seed.ts";
import { seededRng } from "../services/postgres-seed/src/rng.ts";
import type { AssetRow, IdentitySeed, MailClick, MailDelivery, MailRule, SigninSeed, VpnSeed } from "../services/postgres-seed/src/scenarios.ts";

const CAMPUS_PREFIX = "193.140.10.";
const CAMPUS_ASN = "AS-AEGEAN-EDU";
const HOME_ISPS = ["Turkcell", "Superonline", "TTNET"];
const WINDOW_START = Date.UTC(2026, 7, 5); // 2026-08-05
const WINDOW_END = Date.UTC(2026, 9, 20);  // 2026-10-20

export const DEV_CASE_UPN: Record<string, string> = {
  "case-001": "d.yilmaz@aegean.edu",
  "case-002": "prof.kaya@aegean.edu",
  "case-003": "s.demir@aegean.edu",
  "case-004": "m.aslan@aegean.edu",
  "case-005": "e.oz@aegean.edu",
  "case-006": "b.cetin@aegean.edu",
  "case-007": "a.sahin@aegean.edu",
};

export const DEV_CASE_EXPECTED: Record<string, string> = {
  "case-001": "contain",
  "case-002": "benign",
  "case-003": "escalate",
  "case-004": "contain",
  "case-005": "benign",
  "case-006": "monitor",
  "case-007": "contain",
};

// Attacker-looking foreign hosting ASNs that we rotate between.
const ATTACKER_POOL = [
  { ip: "185.100.87.202", asn: "AS46562", asn_org: "DeepLeaseVPS", country: "US", city: "Reston" },
  { ip: "203.0.113.77", asn: "AS14061", asn_org: "AS14061 DigitalOcean", country: "NL", city: "Amsterdam" },
  { ip: "192.0.2.200", asn: "AS9009", asn_org: "AS9009 M247 Europe", country: "RO", city: "Bucharest" },
  { ip: "192.0.2.61", asn: "AS60068", asn_org: "AS60068 Datacamp Limited", country: "DE", city: "Frankfurt" },
  { ip: "192.0.2.150", asn: "AS16276", asn_org: "AS16276 OVH SAS", country: "FR", city: "Gravelines" },
] as const;

// Plausible benign-travel destinations.
const BENIGN_TRAVEL_POOL = [
  { city: "Lisbon", country: "PT", asn: "AS2860", asn_org: "MEO", ip: "89.180.44.17" },
  { city: "Madrid", country: "ES", asn: "AS3352", asn_org: "Telefonica", ip: "85.63.100.10" },
  { city: "Berlin", country: "DE", asn: "AS3320", asn_org: "Deutsche Telekom", ip: "91.65.9.44" },
  { city: "Paris", country: "FR", asn: "AS3215", asn_org: "Orange", ip: "90.56.42.1" },
  { city: "Rome", country: "IT", asn: "AS1267", asn_org: "Wind Tre", ip: "151.42.1.15" },
] as const;

function isAttackerRow(r: SigninSeed): boolean {
  const org = (r.asn_org ?? "").toLowerCase();
  return /vps|host|lease|digitalocean|datacamp|m247|ovh|spraynet|cloudvault|bulwark/.test(org);
}
function isHomeIsp(r: SigninSeed): boolean {
  const org = (r.asn_org ?? "").toLowerCase();
  return HOME_ISPS.some((n) => org.includes(n.toLowerCase())) || r.ip.startsWith(CAMPUS_PREFIX) || r.asn === CAMPUS_ASN || (r.asn_org ?? "") === CAMPUS_ASN;
}
function isBenignTravelRow(r: SigninSeed): boolean {
  if (!r.country || r.country === "TR") return false;
  return !isAttackerRow(r);
}

type Transform = {
  caseId: string;
  variant: number;
  newUpn: string;
  msShift: number;
  attackerSwap: typeof ATTACKER_POOL[number];
  benignTravelSwap: typeof BENIGN_TRAVEL_POOL[number];
};

export function computeTransform(caseId: string, variant: number): Transform {
  const baseUpn = DEV_CASE_UPN[caseId];
  if (!baseUpn) throw new Error(`Unknown dev case: ${caseId}`);
  const seed = 20261023 + variant * 1000 + hashString(caseId);
  const rng = seededRng(seed);
  const local = baseUpn.split("@")[0]!;
  const newUpn = `pert${variant}.${local}@aegean.edu`;
  // Shift ±5 days, non-zero (so variant always differs from original).
  const dayShiftRaw = rng.int(1, 9) - 5; // -4..+4
  const dayShift = dayShiftRaw === 0 ? -3 : dayShiftRaw;
  const msShift = dayShift * 86_400_000;
  const attackerSwap = rng.pick(ATTACKER_POOL);
  const benignTravelSwap = rng.pick(BENIGN_TRAVEL_POOL);
  return { caseId, variant, newUpn, msShift, attackerSwap, benignTravelSwap };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function shiftTs(iso: string, msShift: number): string {
  const t = Date.parse(iso) + msShift;
  if (t < WINDOW_START) return new Date(WINDOW_START + 3_600_000).toISOString();
  if (t > WINDOW_END) return new Date(WINDOW_END - 3_600_000).toISOString();
  return new Date(t).toISOString();
}

function applySigninTransform(r: SigninSeed, tr: Transform): SigninSeed {
  const out: SigninSeed = { ...r, upn: tr.newUpn, ts: shiftTs(r.ts, tr.msShift), event_id: `pert${tr.variant}_${r.event_id}` };
  if (r.device_id) out.device_id = `${r.device_id}-p${tr.variant}`;
  if (isHomeIsp(r)) return out; // keep campus/home ISP consistent
  if (isAttackerRow(r)) {
    out.ip = tr.attackerSwap.ip;
    out.asn = tr.attackerSwap.asn;
    out.asn_org = tr.attackerSwap.asn_org;
    out.country = tr.attackerSwap.country;
    out.city = tr.attackerSwap.city;
    return out;
  }
  if (isBenignTravelRow(r)) {
    out.ip = tr.benignTravelSwap.ip;
    out.asn = tr.benignTravelSwap.asn;
    out.asn_org = tr.benignTravelSwap.asn_org;
    out.country = tr.benignTravelSwap.country;
    out.city = tr.benignTravelSwap.city;
    return out;
  }
  return out;
}

function applyVpnTransform(v: VpnSeed, tr: Transform): VpnSeed {
  return {
    ...v,
    session_id: `pert${tr.variant}_${v.session_id}`,
    upn: tr.newUpn,
    ts_start: shiftTs(v.ts_start, tr.msShift),
    ts_end: v.ts_end ? shiftTs(v.ts_end, tr.msShift) : v.ts_end,
    client_ip: v.client_ip,
    assigned_ip: v.assigned_ip,
  };
}

function applyDeliveryTransform(d: MailDelivery, tr: Transform): MailDelivery {
  return { ...d, message_id: `pert${tr.variant}_${d.message_id}`, recipient_upn: tr.newUpn, ts: shiftTs(d.ts, tr.msShift) };
}
function applyClickTransform(c: MailClick, tr: Transform): MailClick {
  return { ...c, click_id: `pert${tr.variant}_${c.click_id}`, upn: tr.newUpn, message_id: `pert${tr.variant}_${c.message_id}`, ts: shiftTs(c.ts, tr.msShift) };
}
function applyRuleTransform(r: MailRule, tr: Transform): MailRule {
  return { ...r, rule_id: `pert${tr.variant}_${r.rule_id}`, upn: tr.newUpn, ts: shiftTs(r.ts, tr.msShift) };
}
function applyAssetTransform(a: AssetRow, tr: Transform): AssetRow {
  return { ...a, device_id: `${a.device_id}-p${tr.variant}`, owner_upn: tr.newUpn };
}

export type PerturbedSuite = {
  identities: IdentitySeed[];
  signins: SigninSeed[];
  vpnSessions: VpnSeed[];
  deliveries: MailDelivery[];
  clicks: MailClick[];
  rules: MailRule[];
  assets: AssetRow[];
  variantMap: Array<{ caseId: string; variant: number; newUpn: string; expected: string; transform: Transform }>;
};

export function buildPerturbationSuite(cases: string[], perVariant: number): PerturbedSuite {
  const base = buildSuite({ withCaseSeven: true, withHoldout: false });
  const byUpn = new Map<string, { signins: SigninSeed[]; vpnSessions: VpnSeed[]; deliveries: MailDelivery[]; clicks: MailClick[]; rules: MailRule[] }>();
  const identsByUpn = new Map(base.identities.map((i) => [i.upn, i]));
  const assetsByOwner = new Map<string, AssetRow[]>();
  for (const a of base.suite.assets) {
    const list = assetsByOwner.get(a.owner_upn) ?? [];
    list.push(a);
    assetsByOwner.set(a.owner_upn, list);
  }
  const upns = Object.values(DEV_CASE_UPN);
  for (const u of upns) byUpn.set(u, { signins: [], vpnSessions: [], deliveries: [], clicks: [], rules: [] });
  for (const r of base.suite.signins) if (byUpn.has(r.upn)) byUpn.get(r.upn)!.signins.push(r);
  for (const v of base.suite.vpnSessions) if (byUpn.has(v.upn)) byUpn.get(v.upn)!.vpnSessions.push(v);
  for (const d of base.suite.deliveries) if (byUpn.has(d.recipient_upn)) byUpn.get(d.recipient_upn)!.deliveries.push(d);
  for (const c of base.suite.clicks) if (byUpn.has(c.upn)) byUpn.get(c.upn)!.clicks.push(c);
  for (const r of base.suite.rules) if (byUpn.has(r.upn)) byUpn.get(r.upn)!.rules.push(r);

  const out: PerturbedSuite = { identities: [], signins: [], vpnSessions: [], deliveries: [], clicks: [], rules: [], assets: [], variantMap: [] };
  for (const caseId of cases) {
    const upn = DEV_CASE_UPN[caseId];
    if (!upn) continue;
    const srcIdent = identsByUpn.get(upn);
    if (!srcIdent) continue;
    const src = byUpn.get(upn)!;
    for (let v = 1; v <= perVariant; v++) {
      const tr = computeTransform(caseId, v);
      out.identities.push({ ...srcIdent, upn: tr.newUpn, display_name: `pert${v} · ${srcIdent.display_name}`, created_at: shiftTs(srcIdent.created_at, tr.msShift) });
      out.signins.push(...src.signins.map((r) => applySigninTransform(r, tr)));
      out.vpnSessions.push(...src.vpnSessions.map((r) => applyVpnTransform(r, tr)));
      out.deliveries.push(...src.deliveries.map((r) => applyDeliveryTransform(r, tr)));
      out.clicks.push(...src.clicks.map((r) => applyClickTransform(r, tr)));
      out.rules.push(...src.rules.map((r) => applyRuleTransform(r, tr)));
      for (const a of assetsByOwner.get(upn) ?? []) out.assets.push(applyAssetTransform(a, tr));
      out.variantMap.push({ caseId, variant: v, newUpn: tr.newUpn, expected: DEV_CASE_EXPECTED[caseId] ?? "?", transform: tr });
    }
  }
  return out;
}
