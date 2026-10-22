// DQ drives reasoning (SPEC §9b). Data-quality rules are evaluated *scoped to
// the evidence of this case* (the account and the VPN appliances it used), so
// unrelated noise elsewhere in the estate does not taint every verdict.
// A finding that rests on rows from a failing rule gets confidence × 0.7 and a
// limitation line; the Risk Gate treats such failures as evidence conflict.
import type { FindingT } from "./schema.ts";
import { USL } from "./sql-catalogue.ts";

export type DqResult = { table: string; rule: string; scope: string; valid: number; invalid: number; sql_id?: string };
export type DqQuery = { table: string; rule: string; scope: string; sql: string };
export type SqlRunner = { runSql(sql: string, opts?: { limit?: number }): Promise<{ sql_id: string; rows: Array<Record<string, string | number | null>> }> };

export const DQ_PENALTY = 0.7;

const q = (s: string) => s.replace(/'/g, "''");

export function scopedDqQueries(upn: string, appliances: string[]): DqQuery[] {
  const out: DqQuery[] = [
    {
      table: "signin_event", rule: "fk_identity", scope: `account:${upn}`,
      sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN i.upn IS NULL THEN 1 ELSE 0 END) AS invalid_record FROM ${USL}.signin_event s LEFT JOIN ${USL}.identity i ON i.upn = s.upn WHERE s.upn = '${q(upn)}'`,
    },
    {
      table: "signin_event", rule: "ts_not_null", scope: `account:${upn}`,
      sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN ts IS NULL THEN 1 ELSE 0 END) AS invalid_record FROM ${USL}.signin_event WHERE upn = '${q(upn)}'`,
    },
  ];
  for (const a of [...new Set(appliances)].sort()) {
    out.push({
      table: "vpn_session", rule: "vpn_session_order", scope: `appliance:${a}`,
      sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN ts_end IS NOT NULL AND ts_end < ts_start THEN 1 ELSE 0 END) AS invalid_record FROM ${USL}.vpn_session WHERE appliance_id = '${q(a)}'`,
    });
  }
  return out;
}

export async function runScopedDq(z: SqlRunner, upn: string, appliances: string[]): Promise<DqResult[]> {
  const out: DqResult[] = [];
  for (const dq of scopedDqQueries(upn, appliances)) {
    const r = await z.runSql(dq.sql, { limit: 1 });
    const total = Number(r.rows[0]?.total ?? 0);
    const invalid = Number(r.rows[0]?.invalid_record ?? 0);
    out.push({ table: dq.table, rule: dq.rule, scope: dq.scope, valid: Math.max(0, total - invalid), invalid, sql_id: r.sql_id });
  }
  return out;
}

/** Appliances referenced by any evidence row (signin via_vpn_appliance, vpn_session appliance_id). */
export function appliancesFromRows(rows: Array<Record<string, unknown>>): string[] {
  const s = new Set<string>();
  for (const r of rows) {
    for (const k of ["via_vpn_appliance", "appliance_id"]) {
      const v = r[k];
      if (typeof v === "string" && v && v !== "null") s.add(v);
    }
  }
  return [...s].sort();
}

/** Does this failing DQ result touch the evidence behind this finding? */
export function dqTouches(f: FindingT, d: DqResult): boolean {
  if (d.invalid <= 0) return false;
  if (d.scope.startsWith("appliance:")) {
    const a = d.scope.slice("appliance:".length);
    return f.entity_ids.includes(`device:cmdb:${a}`) || f.facts.via_vpn_appliance === a || f.facts.appliance_id === a;
  }
  if (d.scope.startsWith("account:")) {
    const upn = d.scope.slice("account:".length);
    return f.entity_ids.includes(`account:idp:${upn}`) && (f.kind ?? "").length > 0 && d.table === "signin_event" && SIGNIN_KINDS.has(f.kind ?? "");
  }
  return false;
}

const SIGNIN_KINDS = new Set(["mfa_fatigue", "new_asn", "bulk_sis", "impossible_travel", "foreign_majority", "appliance_signin"]);

export function applyDqPenalty(findings: FindingT[], dq: DqResult[]): { findings: FindingT[]; limitations: string[]; conflicts: string[] } {
  const limitations: string[] = [];
  const conflicts: string[] = [];
  const out = findings.map((f) => {
    const hits = dq.filter((d) => dqTouches(f, d));
    if (!hits.length) return f;
    for (const h of hits) {
      const line = `${f.id} rests on ${h.table} rows where DQ rule ${h.rule} fails for ${h.scope} (${h.invalid} invalid) — confidence × ${DQ_PENALTY}.`;
      limitations.push(line);
      conflicts.push(`DQ ${h.rule} failing for ${h.scope}`);
    }
    return { ...f, confidence: round2(f.confidence * DQ_PENALTY ** hits.length) };
  });
  return { findings: out, limitations: [...new Set(limitations)], conflicts: [...new Set(conflicts)] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
