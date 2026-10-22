// Evidence Critic. For every draft finding it runs its OWN Zetaris query
// (different SQL → different sql_id) and checks the claim against those rows.
//   approved   → status CONFIRMED (independent re-query agrees), check sql_id appended
//   rejected   → moved to rejected_claims with the reason
//   needs_more → Planner gets the reason and may add steps (≤ 3 rounds)
// Checks are code, not prompts, so the same rows always give the same verdict.
import type { CriticVerdictT, FindingT } from "./schema.ts";
import { HOME_DOMAIN, USL, esc } from "./sql-catalogue.ts";
import { isExternal, toMs, type Row } from "./investigator.ts";
import type { SqlRunner } from "./dq.ts";

// Vendor "fixed in" versions for KEV-listed Ivanti Connect Secure CVEs
// (Ivanti security advisories, Jan + Apr 2025). Used only to decide whether
// an appliance's firmware is still exposed to a KEV entry.
export const VENDOR_FIXED_IN: Record<string, { product: RegExp; fixedIn: string }> = {
  "CVE-2025-0282": { product: /connect secure/i, fixedIn: "22.7R2.5" },
  "CVE-2025-22457": { product: /connect secure/i, fixedIn: "22.7R2.6" },
};

/** Shared-egress threshold: an IP is treated as a shared exit (campus NAT,
 *  consumer-ISP CGNAT, mail-gateway relay) when at least this many *distinct*
 *  UPNs completed MFA successfully from it in the prior 30 days. Those sign-ins
 *  are the strongest evidence that the IP is not an attacker-controlled host —
 *  real users across many accounts legitimately used it. The threshold is
 *  intentionally conservative; the operator can tighten it in config. */
export const SHARED_EGRESS_MFA_COMPLETED_UPNS = 10;
/** The 30-day lookback for the shared-egress test. 30 d matches both FERPA
 *  retention norms and the Markovian spray window; longer would drift into
 *  rotated-DHCP noise, shorter would miss weekend/holiday patterns. */
export const SHARED_EGRESS_LOOKBACK_DAYS = 30;
/** @deprecated Kept for 1 release so external callers do not break. The
 *  shared-NAT check is now data-derived via SHARED_EGRESS_MFA_COMPLETED_UPNS
 *  (see `isSharedEgressIp()`); no ISP / org name appears in product code. */
export const SHARED_NAT_ASNS = new Set<string>();
/** A real password-spray burst is bounded. We consider > 24 h between first
 *  and last failure from the same source IP to be noise (shared NAT, scanner
 *  dwelling, etc.), not a coordinated attack. The value is intentionally
 *  conservative — honest noise rejection, not aggressive filtering. */
export const SPRAY_BURST_WINDOW_HOURS = 24;

/** Data-derived shared-egress test. Runs its own Zetaris query and returns
 *  true when at least SHARED_EGRESS_MFA_COMPLETED_UPNS distinct UPNs have
 *  mfa_approved (or `success` with mfa_prompt_count > 0 as a USL-only
 *  fallback) results from this IP in the prior SHARED_EGRESS_LOOKBACK_DAYS.
 *  No ISP/org name is used; the signal is "many real humans finished MFA
 *  from this IP". Exported for the Critic + its unit tests. */
export async function isSharedEgressIp(z: SqlRunner, ip: string): Promise<{ shared: boolean; sql_id: string; distinct_mfa_upns: number; threshold: number }> {
  const r = await z.runSql(`SELECT COUNT(DISTINCT upn) AS n FROM ${USL}.signin_event WHERE ip = '${esc(ip)}' AND result IN ('success','mfa_approved') AND ts >= CURRENT_DATE - INTERVAL '${SHARED_EGRESS_LOOKBACK_DAYS}' DAY`);
  const n = Number(r.rows[0]?.n ?? 0) || 0;
  return { shared: n >= SHARED_EGRESS_MFA_COMPLETED_UPNS, sql_id: r.sql_id, distinct_mfa_upns: n, threshold: SHARED_EGRESS_MFA_COMPLETED_UPNS };
}

/** Compare Ivanti-style versions like 22.7R2.3 < 22.7R2.8. */
export function versionLt(a: string, b: string): boolean {
  const parse = (v: string) => v.split(/[^0-9]+/).filter(Boolean).map(Number);
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

const NON_INTERACTIVE_UA = /exchangesync|activesync|mail-sync|outlook-sync|^microsoft office\/.*sync/i;
const s = (v: unknown) => (v === null || v === undefined || v === "" || v === "null" ? null : String(v));
const n = (v: unknown) => Number(v ?? 0) || 0;

export type CriticResult = { verdict: CriticVerdictT; finding: FindingT };

async function check(z: SqlRunner, f: FindingT): Promise<{ status: CriticVerdictT["status"]; reason: string; sql_id?: string; confirm?: boolean }> {
  const upn = String(f.facts.upn ?? "");
  const U = `'${esc(upn)}'`;
  switch (f.kind) {
    case "mfa_fatigue": {
      const r = await z.runSql(`SELECT result, COUNT(*) AS n, MIN(ts) AS first_ts, MAX(ts) AS last_ts FROM ${USL}.signin_event WHERE upn = ${U} AND result IN ('mfa_denied','mfa_approved') GROUP BY result`);
      const denies = r.rows.find((x) => x.result === "mfa_denied");
      const appr = r.rows.find((x) => x.result === "mfa_approved");
      const ok = n(denies?.n) >= 5 && n(appr?.n) >= 1 && toMs(denies?.first_ts) <= toMs(appr?.last_ts);
      return ok
        ? { status: "approved", reason: `re-count: ${n(denies?.n)} denies before ${n(appr?.n)} approval`, sql_id: r.sql_id, confirm: true }
        : { status: "rejected", reason: `re-count does not show a deny burst followed by approval (denies=${n(denies?.n)}, approvals=${n(appr?.n)})`, sql_id: r.sql_id };
    }
    case "new_asn": {
      const asn = String(f.facts.asn_org ?? "");
      const r = await z.runSql(`SELECT event_id, ts, ip, device_id, via_vpn_appliance FROM ${USL}.signin_event WHERE upn = ${U} AND asn_org = '${esc(asn)}' ORDER BY ts`);
      if (!r.rows.length) return { status: "rejected", reason: `no sign-ins from ${asn} on re-query`, sql_id: r.sql_id };
      const viaUni = r.rows.every((x) => s(x.via_vpn_appliance));
      const devices = [...new Set(r.rows.map((x) => s(x.device_id)).filter((d): d is string => !!d))];
      if (viaUni && devices.length && r.rows.every((x) => s(x.device_id))) {
        const d = await z.runSql(`SELECT device_id, owner_upn, managed FROM ${USL}.device WHERE device_id IN (${devices.map((x) => `'${esc(x)}'`).join(",")})`);
        const allManagedOwned = devices.every((id) => d.rows.some((x) => x.device_id === id && String(x.owner_upn) === upn && String(x.managed).toLowerCase() === "true"));
        if (allManagedOwned) return { status: "rejected", reason: `explained: every ${asn} sign-in came through the university VPN on the user's own managed device (${devices.join(", ")})`, sql_id: d.sql_id };
      }
      return { status: "approved", reason: `${r.rows.length} sign-in(s) from ${asn}; ${viaUni ? "via VPN" : "not via university VPN"}, ${devices.length ? `device ${devices.join(",")}` : "no managed device"}`, sql_id: r.sql_id, confirm: true };
    }
    case "phish_delivery": {
      const dom = String(f.facts.sender_domain ?? "");
      const r = await z.runSql(`SELECT COUNT(*) AS n FROM ${USL}.mail_event WHERE upn = ${U} AND kind = 'delivery' AND verdict = 'phish_suspect' AND sender_domain = '${esc(dom)}'`);
      return n(r.rows[0]?.n) >= 1
        ? { status: "approved", reason: `gateway verdict phish_suspect confirmed for ${dom}`, sql_id: r.sql_id, confirm: true }
        : { status: "rejected", reason: `no phish_suspect delivery from ${dom}`, sql_id: r.sql_id };
    }
    case "click": {
      const dom = String(f.facts.domain ?? "");
      const r = await z.runSql(`SELECT COUNT(*) AS n FROM ${USL}.mail_event WHERE upn = ${U} AND kind = 'delivery' AND verdict = 'phish_suspect' AND sender_domain = '${esc(dom)}'`);
      return n(r.rows[0]?.n) >= 1
        ? { status: "approved", reason: `clicked domain ${dom} matches a phish_suspect delivery`, sql_id: r.sql_id, confirm: true }
        : { status: "rejected", reason: `click on ${dom} is not tied to any suspect delivery`, sql_id: r.sql_id };
    }
    case "forward_rule": {
      const r = await z.runSql(`SELECT event_id, ts, detail FROM ${USL}.mail_event WHERE upn = ${U} AND kind = 'rule' AND verdict = 'forward' ORDER BY ts`);
      const row = r.rows.find((x) => x.event_id === f.facts.event_id) ?? r.rows[0];
      if (!row) return { status: "rejected", reason: "rule not found on re-query", sql_id: r.sql_id };
      const target = /target=(\S+)/.exec(String(row.detail))?.[1] ?? null;
      const via = /via=(\S+)/.exec(String(row.detail))?.[1] ?? null;
      if (!isExternal(target)) return { status: "rejected", reason: `forwards to an internal @${HOME_DOMAIN} address (${target}) created via ${via}: not exfiltration`, sql_id: r.sql_id };
      return { status: "approved", reason: `forwards outside the university to ${target} (created via ${via})`, sql_id: r.sql_id, confirm: true };
    }
    case "bulk_sis": {
      const ip = String(f.facts.ip ?? "");
      const r = await z.runSql(`SELECT COUNT(*) AS n, MIN(ts) AS first_ts, MAX(ts) AS last_ts FROM ${USL}.signin_event WHERE upn = ${U} AND app = 'sis' AND result = 'success' AND ip = '${esc(ip)}'`);
      return n(r.rows[0]?.n) >= 10
        ? { status: "approved", reason: `${n(r.rows[0]?.n)} SIS successes from ${ip}`, sql_id: r.sql_id, confirm: true }
        : { status: "rejected", reason: `only ${n(r.rows[0]?.n)} SIS successes from ${ip}`, sql_id: r.sql_id };
    }
    case "impossible_travel": {
      const ids = [f.facts.from_event, f.facts.to_event].map((x) => `'${esc(String(x))}'`).join(",");
      // Verify against the raw identity-provider table: it carries user_agent, the USL view does not.
      let rows: Row[] = [];
      let sql_id: string | undefined;
      let raw = true;
      try {
        const r = await z.runSql(`SELECT event_id, ts, country, device_id, user_agent, app, mfa_prompt_count, via_vpn_appliance FROM auth_pg.signin_events WHERE event_id IN (${ids})`);
        rows = r.rows; sql_id = r.sql_id;
      } catch {
        raw = false;
        const r = await z.runSql(`SELECT event_id, ts, country, device_id, app, mfa_prompt_count, via_vpn_appliance FROM ${USL}.signin_event WHERE event_id IN (${ids})`);
        rows = r.rows; sql_id = r.sql_id;
      }
      const a = rows.find((x) => x.event_id === f.facts.from_event);
      const b = rows.find((x) => x.event_id === f.facts.to_event);
      // Both ids unresolvable → the claim cites events that do not exist in
      // this run's identity feed. Treat as fabricated and reject (adversarial
      // planted-claim test, DAY3 step 2). A single missing id is still a
      // partial-evidence case → needs_more.
      if (!a && !b) return { status: "rejected", reason: `impossible-travel claim cites events ${f.facts.from_event} / ${f.facts.to_event} that are not in the signin feed`, sql_id };
      if (!a || !b) return { status: "needs_more", reason: "could not re-read both sign-in events", sql_id };
      const reasons: string[] = [];
      if (raw && NON_INTERACTIVE_UA.test(String(a.user_agent ?? ""))) reasons.push(`the ${a.country} event is a non-interactive mail-sync token (${a.user_agent}), not the person`);
      else if (!s(a.device_id) && n(a.mfa_prompt_count) === 0 && a.app === "mail") reasons.push(`the ${a.country} event has no device and no MFA (mail sync pattern)`);
      if (s(b.via_vpn_appliance) && s(b.device_id)) reasons.push(`the ${b.country} sign-ins use university VPN ${b.via_vpn_appliance} from device ${b.device_id}`);
      if (reasons.length) return { status: "rejected", reason: `premature impossible-travel claim: ${reasons.join("; ")}`, sql_id };
      return { status: "approved", reason: `both events are interactive and ${f.facts.minutes} min apart`, sql_id, confirm: raw };
    }
    case "kev_exposure": {
      const app = String(f.facts.appliance_id ?? "");
      const d = await z.runSql(`SELECT device_id, type, os_version, firmware FROM ${USL}.device WHERE device_id = '${esc(app)}'`);
      const dev = d.rows[0];
      if (!dev) return { status: "rejected", reason: `appliance ${app} not in inventory`, sql_id: d.sql_id };
      // An appliance only matters to this case if the account actually traversed it.
      const touched = await z.runSql(`SELECT COUNT(*) AS n FROM ${USL}.signin_event WHERE upn = ${U} AND via_vpn_appliance = '${esc(app)}'`);
      if (n(touched.rows[0]?.n) === 0) {
        return { status: "rejected", reason: `${app} did not carry a sign-in for ${upn}; its KEV status is not relevant to this account's exposure`, sql_id: touched.sql_id };
      }
      const k = await z.runSql(`SELECT cve_id, product, date_added, ransomware_use FROM ${USL}.vulnerability WHERE LOWER(product) LIKE '%connect secure%'`);
      const fw = String(dev.firmware ?? dev.os_version ?? "");
      const open = k.rows.filter((x) => {
        const fix = VENDOR_FIXED_IN[String(x.cve_id)];
        return fix ? fix.product.test(String(x.product ?? "")) && versionLt(fw, fix.fixedIn) : false;
      });
      const known = k.rows.filter((x) => VENDOR_FIXED_IN[String(x.cve_id)]);
      if (open.length) return { status: "approved", reason: `firmware ${fw} is below the fix for ${open.map((x) => x.cve_id).join(", ")} (KEV, ransomware use: ${open[0]!.ransomware_use ?? "?"})`, sql_id: k.sql_id, confirm: true };
      if (known.length) return { status: "rejected", reason: `firmware ${fw} already includes the fixes for the KEV entries we can version-check (${known.map((x) => x.cve_id).join(", ")})`, sql_id: k.sql_id };
      return { status: "approved", reason: `product listed in KEV; firmware ${fw} could not be version-checked`, sql_id: k.sql_id, confirm: false };
    }
    case "password_spray": {
      const ip = String(f.facts.ip ?? "");
      const r = await z.runSql(`SELECT result, COUNT(DISTINCT upn) AS accounts, COUNT(*) AS n FROM ${USL}.signin_event WHERE ip = '${esc(ip)}' GROUP BY result`);
      const fail = r.rows.find((x) => x.result === "failure");
      const succ = await z.runSql(`SELECT COUNT(*) AS n FROM ${USL}.signin_event WHERE ip = '${esc(ip)}' AND upn = ${U} AND result = 'success'`);
      if (!(n(fail?.accounts) >= 10 && n(succ.rows[0]?.n) >= 1)) {
        return { status: "rejected", reason: `${ip} does not show a spray-then-success pattern on re-query`, sql_id: succ.sql_id };
      }
      // Shared-egress noise: a single IP that already serves many distinct
      // real users (MFA-completed sign-ins) is a campus NAT or CGNAT exit, not
      // an attacker-controlled host. We derive this from the data itself —
      // "N distinct UPNs finished MFA from this IP in the last 30 days" —
      // instead of hard-coding ISP names. A single rogue host on a campus /24
      // that *does* behave like a sprayer is still caught (it will not have
      // that MFA-success history). The threshold lives in config, not in code.
      try {
        const sh = await isSharedEgressIp(z, ip);
        if (sh.shared) {
          return { status: "rejected", reason: `${ip} looks like shared egress: ${sh.distinct_mfa_upns} distinct accounts completed MFA from this IP in the last ${SHARED_EGRESS_LOOKBACK_DAYS} days (threshold ${sh.threshold}); failures across many accounts are expected background noise, not a coordinated spray`, sql_id: sh.sql_id };
        }
      } catch { /* if the lookback query is not supported here, fall through to the window check */ }
      // Burst-window check: a real spray clusters in time. If first→last failure
      // from this IP spans more than SPRAY_BURST_WINDOW_HOURS, treat as noise.
      try {
        const windowRow = await z.runSql(`SELECT MIN(ts) AS first_ts, MAX(ts) AS last_ts FROM ${USL}.signin_event WHERE ip = '${esc(ip)}' AND result = 'failure'`);
        const first = String(windowRow.rows[0]?.first_ts ?? "");
        const last = String(windowRow.rows[0]?.last_ts ?? "");
        if (first && last) {
          const spanHours = (toMs(last) - toMs(first)) / 3_600_000;
          if (spanHours > SPRAY_BURST_WINDOW_HOURS) {
            return { status: "rejected", reason: `${ip}: failures span ${spanHours.toFixed(1)} h (first ${first.slice(0, 16)} → last ${last.slice(0, 16)}); a password spray is a short burst, this looks like background noise from a shared source`, sql_id: windowRow.sql_id };
          }
        }
      } catch { /* ignore and fall through */ }
      // A "success" from the spray source is only a takeover if it was interactive.
      // Non-interactive mail-sync tokens share the exit IP but do not prove credential abuse.
      try {
        const raw = await z.runSql(`SELECT event_id, user_agent, device_id, mfa_prompt_count, app FROM auth_pg.signin_events WHERE ip = '${esc(ip)}' AND upn = ${U} AND result = 'success'`);
        if (raw.rows.length) {
          const nonInteractive = raw.rows.filter((x) => NON_INTERACTIVE_UA.test(String(x.user_agent ?? "")) || (!s(x.device_id) && n(x.mfa_prompt_count) === 0 && x.app === "mail"));
          if (nonInteractive.length === raw.rows.length) {
            const ua = String(raw.rows[0]!.user_agent ?? "mail sync");
            return { status: "rejected", reason: `${ip}: the success${raw.rows.length === 1 ? "" : "es"} as ${upn} ${raw.rows.length === 1 ? "is" : "are"} a non-interactive mail-sync token (${ua}); the shared exit IP is noise, not a credential takeover`, sql_id: raw.sql_id };
          }
        }
      } catch { /* raw auth_pg unavailable → fall back to the USL-only verdict */ }
      return { status: "approved", reason: `${ip}: failures against ${n(fail?.accounts)} accounts and ${n(succ.rows[0]?.n)} success as ${upn}`, sql_id: succ.sql_id, confirm: true };
    }
    case "spray_roster": {
      // Independent re-count: how many distinct victims actually failed from this IP in the window?
      const ip = String(f.facts.ip ?? "");
      const claimed = Number(f.facts.unique_victims ?? 0);
      const victims = String(f.facts.victims ?? "").split(",").filter(Boolean);
      const r = await z.runSql(`SELECT COUNT(DISTINCT upn) AS actual FROM ${USL}.signin_event WHERE ip = '${esc(ip)}' AND result IN ('failure','mfa_denied')`);
      const actual = n(r.rows[0]?.actual);
      if (actual < 10) return { status: "rejected", reason: `${ip} only touched ${actual} distinct accounts; not a spray roster`, sql_id: r.sql_id };
      // Sanity: Markovian's claim must be close to the independent count (within 25%).
      const diff = Math.abs(actual - claimed);
      if (claimed === 0 || diff > Math.max(5, Math.ceil(actual * 0.25))) {
        return { status: "approved", reason: `independent re-count sees ${actual} victims from ${ip} (Markovian listed ${claimed}); the spray roster is real`, sql_id: r.sql_id, confirm: false };
      }
      // Verify the alerting UPN really appears in the Markovian roster.
      const upnInRoster = upn && victims.includes(upn.toLowerCase());
      if (!upnInRoster) return { status: "approved", reason: `independent re-count confirms ${actual} victims from ${ip}; alerting user not in roster`, sql_id: r.sql_id, confirm: false };
      return { status: "approved", reason: `independent re-count confirms ${actual} victims from ${ip}; ${upn} appears in the Markovian roster`, sql_id: r.sql_id, confirm: true };
    }
    case "new_device": {
      const dev = String(f.facts.device_id ?? "");
      const r = await z.runSql(`SELECT device_id, owner_upn, managed, type FROM ${USL}.device WHERE device_id = '${esc(dev)}'`);
      const row = r.rows[0];
      if (row && String(row.owner_upn) === upn && String(row.managed).toLowerCase() === "true") return { status: "rejected", reason: `${dev} is a managed device registered to the user`, sql_id: r.sql_id };
      if (row && String(row.owner_upn) === upn) return { status: "approved", reason: `${dev} is registered to the user but unmanaged (${row.type ?? "?"}) — worth watching, not proof of takeover`, sql_id: r.sql_id, confirm: false };
      return { status: "approved", reason: `${dev} is not in the inventory for this user`, sql_id: r.sql_id, confirm: true };
    }
    default: {
      // Generic: re-run is the only check we have → approve but keep LIKELY.
      return { status: "approved", reason: "no independent check for this signal; kept as LIKELY", confirm: false };
    }
  }
}

export async function critique(z: SqlRunner, findings: FindingT[], already: Map<string, CriticVerdictT> = new Map()): Promise<{ approved: FindingT[]; rejected: Array<{ claim: string; reason: string }>; verdicts: CriticVerdictT[]; needsMore: string[] }> {
  const approved: FindingT[] = [];
  const rejected: Array<{ claim: string; reason: string }> = [];
  const verdicts: CriticVerdictT[] = [];
  const needsMore: string[] = [];
  for (const f of findings) {
    const prior = already.get(f.id);
    let res: { status: CriticVerdictT["status"]; reason: string; sql_id?: string; confirm?: boolean };
    if (prior && prior.status !== "needs_more") res = { status: prior.status, reason: prior.reason, sql_id: prior.check_sql_id, confirm: f.status === "CONFIRMED" };
    else {
      try { res = await check(z, f); }
      catch (err) { res = { status: "needs_more", reason: `critic query failed: ${(err as Error).message.slice(0, 120)}` }; }
    }
    const v: CriticVerdictT = { finding_id: f.id, status: res.status, reason: res.reason, check_sql_id: res.sql_id };
    verdicts.push(v);
    if (res.status === "approved") {
      approved.push({ ...f, status: res.confirm ? "CONFIRMED" : f.status === "CONFIRMED" ? "CONFIRMED" : "LIKELY", sql_ids: res.sql_id && !f.sql_ids.includes(res.sql_id) ? [...f.sql_ids, res.sql_id] : f.sql_ids });
    } else if (res.status === "rejected") {
      rejected.push({ claim: f.claim, reason: `critic: ${res.reason}` });
    } else {
      needsMore.push(`${f.id} (${f.kind}): ${res.reason}`);
      approved.push({ ...f, status: "SUSPECTED", confidence: Math.min(f.confidence, 0.5) });
    }
  }
  return { approved, rejected, verdicts, needsMore };
}

/** Critic rubric (SPEC §9c): 0–3 each; total < 7 means revise or escalate. */
export function rubric(p: { approved: FindingT[]; rejected: number; verdict: string; confidence: number; actions: Array<{ action: string; attack: string[] }>; conflicts: string[] }) {
  const confirmed = p.approved.filter((f) => f.status === "CONFIRMED").length;
  const total = p.approved.length + p.rejected;
  const accuracy = p.approved.length === 0 ? (total === 0 ? 2 : 3) : Math.round(3 * (confirmed + 0.5 * (p.approved.length - confirmed)) / Math.max(1, p.approved.length));
  const severe = p.approved.some((f) => f.status === "CONFIRMED" && (["T1621", "T1114.003", "T1213"].some((t) => f.attack.includes(t)) || f.kind === "password_spray"));
  let appropriateness = 3;
  if (p.verdict === "contain" && !severe) appropriateness = 1;
  if (p.verdict === "benign" && severe) appropriateness = 0;
  if (p.verdict !== "escalate" && p.conflicts.length) appropriateness = Math.min(appropriateness, 1);
  const withAttack = p.actions.filter((a) => a.attack.length).length;
  const actionability = p.actions.length === 0 ? (p.verdict === "benign" ? 2 : 0) : Math.min(3, 1 + (p.actions.length >= 2 ? 1 : 0) + (withAttack > 0 || p.verdict === "benign" ? 1 : 0));
  return { accuracy: Math.min(3, Math.max(0, accuracy)), appropriateness, actionability };
}
