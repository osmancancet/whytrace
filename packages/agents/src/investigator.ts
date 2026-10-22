// Investigator: turns the rows of one named query into draft findings.
// Deterministic and unit-tested: the model chooses *which* queries to run
// (Planner), code decides what the rows say. Every finding starts as LIKELY;
// only the Critic's independent re-query can promote it to CONFIRMED.
import type { FindingT } from "./schema.ts";
import { HOME_DOMAIN, type QueryName } from "./sql-catalogue.ts";

export type Row = Record<string, string | number | null>;

export class FindingIds {
  private n = 0;
  next(): string { this.n += 1; return `F${this.n}`; }
}

export function toMs(ts: unknown): number {
  if (typeof ts !== "string" || !ts) return NaN;
  let s = ts.trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  return Date.parse(s);
}

const str = (v: unknown): string | null => (v === null || v === undefined || v === "" || v === "null" ? null : String(v));

export function parseRuleDetail(detail: unknown): { target: string | null; via: string | null } {
  const d = String(detail ?? "");
  const target = /target=(\S+)/.exec(d)?.[1] ?? null;
  const via = /via=(\S+)/.exec(d)?.[1] ?? null;
  return { target, via };
}

export function deriveFindings(
  name: QueryName,
  ctx: { upn: string; hypothesis_id: string; params: Record<string, string | number | null> },
  rows: Row[],
  sql_id: string,
  ids: FindingIds,
): FindingT[] {
  if (!rows.length) return [];
  const acct = `account:idp:${ctx.upn}`;
  const mk = (p: { kind: string; claim: string; confidence: number; attack?: string[]; rowIdx: number[]; entities?: string[]; facts?: FindingT["facts"] }): FindingT => ({
    id: ids.next(),
    hypothesis_id: ctx.hypothesis_id,
    claim: p.claim,
    status: "LIKELY",
    sql_ids: [sql_id],
    row_refs: [...new Set(p.rowIdx)].slice(0, 5).map((i) => `${sql_id}#${i}`),
    attack: p.attack ?? [],
    confidence: p.confidence,
    kind: p.kind,
    entity_ids: [...new Set([acct, ...(p.entities ?? [])])],
    facts: { upn: ctx.upn, ...(p.facts ?? {}) },
    dq_flags: [],
  });
  const idxOf = (pred: (r: Row) => boolean) => rows.map((r, i) => (pred(r) ? i : -1)).filter((i) => i >= 0);

  switch (name) {
    case "mfa_fatigue": {
      const denies = idxOf((r) => r.result === "mfa_denied");
      const approves = idxOf((r) => r.result === "mfa_approved");
      if (denies.length >= 5 && approves.length >= 1) {
        const ip = str(rows[approves[0]!]!.ip);
        return [mk({ kind: "mfa_fatigue", claim: `MFA fatigue: ${denies.length} denied pushes followed by ${approves.length} approval${ip ? ` from ${ip}` : ""}`, confidence: 0.9, attack: ["T1621"], rowIdx: [...denies.slice(0, 2), approves[0]!], entities: ip ? [`ip:net:${ip}`] : [], facts: { denies: denies.length, approves: approves.length, ip } })];
      }
      return [];
    }
    case "new_asn": {
      // The SQL already filters to ASNs outside the user's data-derived
      // baseline (see sql-catalogue.ts). We only need a null guard here.
      const foreign = idxOf((r) => !!str(r.asn_org));
      if (!foreign.length) return [];
      const byAsn = new Map<string, number[]>();
      for (const i of foreign) { const a = String(rows[i]!.asn_org); byAsn.set(a, [...(byAsn.get(a) ?? []), i]); }
      return [...byAsn.entries()].map(([asn, idx]) => {
        const first = rows[idx[0]!]!;
        const ip = str(first.ip);
        const appliance = str(first.via_vpn_appliance);
        return mk({ kind: "new_asn", claim: `Suspicious sign-ins from an ASN outside the account's baseline: ${asn} (${first.country ?? "?"}), ${idx.length} event(s)`, confidence: 0.75, attack: ["T1078.004"], rowIdx: idx, entities: [ip ? `ip:net:${ip}` : "", appliance ? `device:cmdb:${appliance}` : ""].filter(Boolean), facts: { asn_org: asn, country: str(first.country), ip, first_ts: str(first.ts), via_vpn_appliance: appliance, events: idx.length } });
      });
    }
    case "mail_chain": {
      const phish = idxOf((r) => r.kind === "delivery" && r.verdict === "phish_suspect");
      if (!phish.length) return [];
      const r = rows[phish[0]!]!;
      return [mk({ kind: "phish_delivery", claim: `Phishing-suspect mail delivered from ${r.sender_domain ?? "?"} (${String(r.detail ?? "").slice(0, 60)})`, confidence: 0.8, attack: ["T1566.002"], rowIdx: phish, facts: { sender_domain: str(r.sender_domain), ts: str(r.ts) } })];
    }
    case "clicks_for": {
      const r = rows[0]!;
      return [mk({ kind: "click", claim: `User clicked a link to ${r.sender_domain ?? "?"}`, confidence: 0.7, attack: ["T1204.001"], rowIdx: [0], facts: { domain: str(r.sender_domain), ts: str(r.ts) } })];
    }
    case "rules_for": {
      const fwd = idxOf((r) => r.verdict === "forward");
      return fwd.map((i) => {
        const { target, via } = parseRuleDetail(rows[i]!.detail);
        return mk({ kind: "forward_rule", claim: `Inbox forwarding rule to ${target ?? "?"} (created via ${via ?? "?"})`, confidence: 0.8, attack: ["T1114.003"], rowIdx: [i], facts: { target, via, event_id: str(rows[i]!.event_id), ts: str(rows[i]!.ts) } });
      });
    }
    case "signins_for": {
      const out: FindingT[] = [];
      // Bulk SIS access: >= 10 successful SIS events from one IP inside 60 minutes.
      const sis = idxOf((r) => r.app === "sis" && r.result === "success");
      const byIp = new Map<string, number[]>();
      for (const i of sis) { const ip = String(rows[i]!.ip ?? "?"); byIp.set(ip, [...(byIp.get(ip) ?? []), i]); }
      for (const [ip, idx] of byIp) {
        const ts = idx.map((i) => toMs(rows[i]!.ts)).filter(Number.isFinite).sort((a, b) => a - b);
        let best = 0;
        for (let a = 0, b = 0; b < ts.length; b++) { while (ts[b]! - ts[a]! > 60 * 60_000) a++; best = Math.max(best, b - a + 1); }
        if (best >= 10) out.push(mk({ kind: "bulk_sis", claim: `Bulk student-information-system access: ${best} successful SIS events within 60 min from ${ip}`, confidence: 0.85, attack: ["T1213"], rowIdx: idx, entities: [`ip:net:${ip}`], facts: { ip, events: best } }));
      }
      // Impossible travel: consecutive successful sign-ins in different countries < 4 h apart.
      const ok = idxOf((r) => (r.result === "success" || r.result === "mfa_approved") && !!str(r.country)).sort((a, b) => toMs(rows[a]!.ts) - toMs(rows[b]!.ts));
      for (let k = 1; k < ok.length; k++) {
        const a = rows[ok[k - 1]!]!, b = rows[ok[k]!]!;
        const dt = toMs(b.ts) - toMs(a.ts);
        if (a.country !== b.country && dt >= 0 && dt < 4 * 3600_000) {
          out.push(mk({ kind: "impossible_travel", claim: `Impossible travel: ${a.city ?? a.country} → ${b.city ?? b.country} in ${Math.round(dt / 60_000)} min`, confidence: 0.7, attack: ["T1078.004"], rowIdx: [ok[k - 1]!, ok[k]!], facts: { from_event: str(a.event_id), to_event: str(b.event_id), from_country: str(a.country), to_country: str(b.country), minutes: Math.round(dt / 60_000) } }));
          break; // one travel claim per account is enough for the Critic to test
        }
      }
      // New device: a device seen in <= 2 events while the account has a clearly dominant device.
      const devCount = new Map<string, number[]>();
      for (let i = 0; i < rows.length; i++) { const d = str(rows[i]!.device_id); if (d) devCount.set(d, [...(devCount.get(d) ?? []), i]); }
      if (devCount.size >= 2) {
        const sorted = [...devCount.entries()].sort((a, b) => b[1].length - a[1].length);
        const main = sorted[0]!;
        for (const [dev, idx] of sorted.slice(1)) {
          if (idx.length <= 2 && main[1].length >= 5) out.push(mk({ kind: "new_device", claim: `Sign-in from a device not seen before for this account: ${dev} (usual device ${main[0]})`, confidence: 0.6, attack: ["T1078"], rowIdx: idx, entities: [`device:cmdb:${dev}`], facts: { device_id: dev, usual_device: main[0] } }));
        }
      }
      return out;
    }
    case "appliance_exposure": {
      const hits = idxOf((r) => !!str(r.cve_id));
      if (!hits.length) return [];
      const r = rows[hits[0]!]!;
      const cves = [...new Set(hits.map((i) => String(rows[i]!.cve_id)))];
      return [mk({ kind: "kev_exposure", claim: `VPN appliance ${r.device_id} (firmware ${r.firmware}) runs a product listed in CISA KEV (${cves.slice(0, 3).join(", ")}${cves.length > 3 ? ", …" : ""})`, confidence: 0.7, attack: ["T1133", "T1190"], rowIdx: hits, entities: [`device:cmdb:${r.device_id}`], facts: { appliance_id: str(r.device_id), firmware: str(r.firmware), cves: cves.join(",") } })];
    }
    case "spray_source_for": {
      const hits = idxOf((r) => Number(r.accounts ?? 0) >= 10);
      return hits.map((i) => {
        const r = rows[i]!;
        const ip = str(r.ip);
        return mk({ kind: "password_spray", claim: `Password spray then success: ${ip} failed against ${r.accounts} accounts (${r.failures} failures) and later signed in as this user`, confidence: 0.85, attack: ["T1110.003", "T1078"], rowIdx: [i], entities: ip ? [`ip:net:${ip}`] : [], facts: { ip, accounts: Number(r.accounts), failures: Number(r.failures), first_ts: str(r.first_ts), last_ts: str(r.last_ts) } });
      });
    }
    case "signin_count_by_country": {
      const top = rows[0]!;
      if (top.country && top.country !== "TR") return [mk({ kind: "foreign_majority", claim: `Most sign-ins come from ${top.country} (${top.n} events)`, confidence: 0.5, rowIdx: [0], facts: { country: str(top.country) } })];
      return [];
    }
    default:
      return [];
  }
}

export function isExternal(addr: string | null): boolean {
  if (!addr) return false;
  const dom = addr.split("@")[1]?.toLowerCase() ?? "";
  return dom !== HOME_DOMAIN && !dom.endsWith(`.${HOME_DOMAIN}`);
}
