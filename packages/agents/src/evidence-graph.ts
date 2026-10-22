// Shared investigation state on the Meterless World Model: every Zetaris row
// set becomes an evidence context (keyed by sql_id) under the case context, and
// accounts / IPs / devices are keyed entities, so "explain why" can walk
// claim → fact → evidence context → sql_id → rows.
import { appendFileSync } from "node:fs";
import { WorldModel } from "@whytrace/world-model";
import type { FindingT } from "./schema.ts";
import type { Row } from "./investigator.ts";

const isoOr = (ts: unknown, fallback: string) => {
  if (typeof ts !== "string" || !ts) return fallback;
  let s = ts.trim().replace(" ", "T");
  if (!/[zZ]|[+-]\d\d:?\d\d$/.test(s)) s += "Z";
  return Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : fallback;
};

export class EvidenceGraph {
  readonly wm: WorldModel;
  private caseCtx = "";
  constructor(private readonly runId: string, private readonly caseId: string, private readonly at: string) {
    this.wm = new WorldModel({ namespace: `whytrace-${runId}`, storage: "memory", clock: () => new Date(at) });
  }

  private src(by: string, at: string, sqlId?: string) {
    return { kind: "pipeline", by, at, url: sqlId ? `zetaris://sql/${sqlId}` : undefined, runId: this.runId };
  }

  async open(upn: string) {
    const c = await this.wm.upsertContext({ type: "case", externalKey: { system: "whytrace", id: this.caseId }, attrs: { upn }, source: this.src("orchestrator", this.at) });
    this.caseCtx = c.id;
    await this.wm.upsertEntity({ type: "account", externalKey: { system: "idp", id: upn }, name: upn, source: this.src("orchestrator", this.at) });
  }

  async ingestRows(sqlId: string, queryName: string, rows: Row[]) {
    const ctx = await this.wm.upsertContext({ type: "evidence", externalKey: { system: "zetaris", id: sqlId }, parent: this.caseCtx, attrs: { query: queryName, rows: rows.length }, source: this.src("investigator", this.at, sqlId) });
    for (const r of rows.slice(0, 200)) {
      const at = isoOr(r.ts ?? r.ts_start, this.at);
      const upn = typeof r.upn === "string" ? r.upn : null;
      const ip = typeof r.ip === "string" && r.ip ? r.ip : typeof r.client_ip === "string" ? r.client_ip : null;
      const dev = typeof r.device_id === "string" && r.device_id ? r.device_id : null;
      const appl = typeof r.via_vpn_appliance === "string" && r.via_vpn_appliance ? r.via_vpn_appliance : typeof r.appliance_id === "string" ? r.appliance_id : null;
      if (ip) await this.wm.upsertEntity({ type: "ip", externalKey: { system: "net", id: ip }, name: ip, attrs: { asn_org: r.asn_org ?? undefined, country: r.country ?? undefined }, source: this.src("investigator", at, sqlId) });
      if (dev) await this.wm.upsertEntity({ type: "device", externalKey: { system: "cmdb", id: dev }, name: dev, source: this.src("investigator", at, sqlId) });
      if (appl) await this.wm.upsertEntity({ type: "device", externalKey: { system: "cmdb", id: appl }, name: appl, attrs: { role: "vpn_appliance" }, source: this.src("investigator", at, sqlId) });
      if (upn && ip) await this.wm.relate({ from: `account:idp:${upn}`, type: "seen_from", to: `ip:net:${ip}`, context: ctx.id, source: this.src("investigator", at, sqlId) });
      if (upn && appl) await this.wm.relate({ from: `account:idp:${upn}`, type: "via_appliance", to: `device:cmdb:${appl}`, context: ctx.id, source: this.src("investigator", at, sqlId) });
    }
    return ctx.id;
  }

  async recordFinding(f: FindingT, by: string) {
    for (const e of f.entity_ids) {
      await this.wm.assertFact({ about: e, predicate: `finding:${f.kind ?? "signal"}`, value: { id: f.id, claim: f.claim, status: f.status, sql_ids: f.sql_ids }, confidence: f.confidence, context: `evidence:zetaris:${f.sql_ids[0]}`, source: this.src(by, this.at, f.sql_ids[0]) });
    }
  }

  writeAudit(file: string) {
    for (const a of this.wm.audit()) appendFileSync(file, JSON.stringify(a) + "\n", "utf8");
  }

  summary() {
    const g = this.wm.view("graph");
    return { entities: g.query().length, audit_entries: this.wm.audit().length };
  }
}
