// Named, parameterised, read-only Zetaris queries. Each returns `{sql, params}`
// which the Investigator passes through the Zetaris adapter.
// The USL namespace is fixed to `lightning.metastore.whytrace.security_usl`.
export const USL = "lightning.metastore.whytrace.security_usl";
// The user's own ASN baseline is now derived from the data — ASNs they have
// *successfully* signed in from (with MFA) in the past N days. No ISP / org
// name is hard-coded. `BASELINE_LOOKBACK_DAYS` is intentionally conservative:
// shorter would miss conference / holiday patterns, longer would drift into
// rotated-CGNAT noise. Config-tunable but not operator-tunable at run time —
// changes go through code review so the baseline cannot be silently widened.
export const BASELINE_LOOKBACK_DAYS = 60;
export const HOME_DOMAIN = "aegean.edu";
/** @deprecated Kept as an empty array for one release so external callers do
 *  not break. The baseline is now data-derived per UPN (see `new_asn` query).
 *  No ISP / org names appear in product code. */
export const BASELINE_ASNS: string[] = [];

export type QueryName =
  | "signins_for"
  | "mfa_fatigue"
  | "new_asn"
  | "mail_chain"
  | "rules_for"
  | "clicks_for"
  | "device_for"
  | "appliance_exposure"
  | "vpn_sessions_for"
  | "peer_baseline"
  | "dq_signin_bad_vpn_order"
  | "signin_count_by_country"
  | "spray_source_for"
  | "spray_failures_window"
  | "identity_for";

export type SqlCatalogueEntry = { sql: string; description: string };

export function queryFor(name: QueryName, params: Record<string, string | number | null>): SqlCatalogueEntry {
  switch (name) {
    case "signins_for":
      return {
        description: "all sign-in events for a UPN within a window",
        sql: `SELECT event_id, ts, upn, result, ip, asn_org, country, city, device_id, app, mfa_prompt_count, risk_flag, via_vpn_appliance FROM ${USL}.signin_event WHERE upn = '${esc(params.upn)}' ORDER BY ts DESC`,
      };
    case "mfa_fatigue":
      return {
        description: "runs of mfa_denied followed by mfa_approved for a UPN",
        sql: `SELECT event_id, ts, result, ip, asn_org, mfa_prompt_count FROM ${USL}.signin_event WHERE upn = '${esc(params.upn)}' AND result IN ('mfa_denied','mfa_approved') ORDER BY ts`,
      };
    case "new_asn":
      return {
        description: "sign-ins from ASNs the UPN has not seen on ≥ 2 distinct days in the last 60 d (data-derived baseline)",
        // Data-derived baseline: the subquery returns the user's own historical
        // ASN set — any ASN they have signed into successfully (with MFA) on
        // ≥ 2 distinct calendar days in the last BASELINE_LOOKBACK_DAYS. The
        // "distinct days" threshold stops an attacker's one-day cluster of
        // MFA-fatigue sign-ins from accidentally becoming the baseline (which
        // the simpler "≥ 2 events" check would allow when the compromise
        // itself produced several successes). No ISP / org name is hard-coded.
        sql: `SELECT ts, asn_org, country, ip, result, device_id, via_vpn_appliance FROM ${USL}.signin_event WHERE upn = '${esc(params.upn)}' AND asn_org NOT IN (SELECT asn_org FROM ${USL}.signin_event WHERE upn = '${esc(params.upn)}' AND result IN ('success','mfa_approved') AND ts >= CURRENT_DATE - INTERVAL '${BASELINE_LOOKBACK_DAYS}' DAY AND asn_org IS NOT NULL GROUP BY asn_org HAVING COUNT(DISTINCT CAST(ts AS DATE)) >= 2) ORDER BY ts`,
      };
    case "mail_chain":
      return {
        description: "mail events (delivery, click, rule) for a UPN",
        sql: `SELECT event_id, ts, kind, verdict, sender_domain, detail FROM ${USL}.mail_event WHERE upn = '${esc(params.upn)}' ORDER BY ts`,
      };
    case "rules_for":
      return {
        description: "inbox rules for a UPN",
        sql: `SELECT event_id, ts, verdict, detail FROM ${USL}.mail_event WHERE upn = '${esc(params.upn)}' AND kind = 'rule' ORDER BY ts`,
      };
    case "clicks_for":
      return {
        description: "clicks for a UPN",
        sql: `SELECT event_id, ts, sender_domain, detail FROM ${USL}.mail_event WHERE upn = '${esc(params.upn)}' AND kind = 'click' ORDER BY ts`,
      };
    case "device_for":
      return {
        description: "device inventory row by device_id",
        sql: `SELECT device_id, owner_upn, type, os_version, managed, firmware, last_seen FROM ${USL}.device WHERE device_id = '${esc(params.device_id)}'`,
      };
    case "appliance_exposure":
      return {
        description: "KEV match for a VPN appliance firmware",
        sql: `SELECT d.device_id, d.firmware, v.cve_id, v.vendor, v.product, v.date_added, v.ransomware_use FROM ${USL}.device d LEFT JOIN ${USL}.vulnerability v ON LOWER(v.product) LIKE '%connect secure%' WHERE d.device_id = '${esc(params.appliance_id)}'`,
      };
    case "vpn_sessions_for":
      return {
        description: "VPN sessions for a UPN",
        sql: `SELECT session_id, upn, ts_start, ts_end, appliance_id, client_ip, assigned_ip FROM ${USL}.vpn_session WHERE upn = '${esc(params.upn)}' ORDER BY ts_start`,
      };
    case "peer_baseline":
      return {
        description: "peer sign-in baseline for a department",
        sql: `SELECT i.department, s.country, COUNT(*) AS n FROM ${USL}.signin_event s JOIN ${USL}.identity i ON i.upn = s.upn WHERE i.department = '${esc(params.department)}' GROUP BY i.department, s.country ORDER BY n DESC`,
      };
    case "dq_signin_bad_vpn_order":
      return {
        description: "VPN sessions where ts_end < ts_start (clock skew DQ defect)",
        sql: `SELECT session_id, upn, appliance_id, ts_start, ts_end FROM ${USL}.vpn_session WHERE ts_end IS NOT NULL AND ts_end < ts_start`,
      };
    case "spray_source_for":
      return {
        description: "failed sign-ins across many accounts from the IPs this UPN later signed in from",
        sql: `SELECT s.ip, COUNT(DISTINCT s.upn) AS accounts, COUNT(*) AS failures, MIN(s.ts) AS first_ts, MAX(s.ts) AS last_ts FROM ${USL}.signin_event s WHERE s.result = 'failure' AND s.ip IN (SELECT ip FROM ${USL}.signin_event WHERE upn = '${esc(params.upn)}' AND result = 'success') GROUP BY s.ip ORDER BY accounts DESC`,
      };
    case "signin_count_by_country":
      return {
        description: "sign-in distribution by country for a UPN",
        sql: `SELECT country, COUNT(*) AS n FROM ${USL}.signin_event WHERE upn = '${esc(params.upn)}' GROUP BY country ORDER BY n DESC`,
      };
    case "spray_failures_window":
      return {
        description: "failed sign-ins from one source IP within a time window (paginated spray sweep)",
        sql: `SELECT event_id, ts, upn, result, ip, asn_org, country, mfa_prompt_count FROM ${USL}.signin_event WHERE ip = '${esc(params.ip)}' AND result IN ('failure','mfa_denied') AND ts >= '${esc(params.from)}' AND ts < '${esc(params.to)}' ORDER BY ts`,
      };
    case "identity_for":
      return {
        description: "identity row (role, mfa_method, department) for a UPN",
        // Reads the frozen USL identity view. The Risk Gate reads `role` and
        // `mfa_method` to decide whether a privilege boundary applies — e.g.
        // L1 only raises the "admin baseline-break" finding on `role='admin'`
        // or `mfa_method='none'` accounts, and L4 upgrades a clean-follow-up
        // exposure from `monitor` to `escalate` when `mfa_method='none'`.
        sql: `SELECT upn, role, department, mfa_method, home_country FROM ${USL}.identity WHERE upn = '${esc(params.upn)}'`,
      };
  }
}

export function listCatalogue(): Array<{ name: QueryName; description: string; params: string[] }> {
  return [
    { name: "signins_for", description: "all sign-in events for a UPN", params: ["upn"] },
    { name: "mfa_fatigue", description: "mfa_denied/mfa_approved pattern", params: ["upn"] },
    { name: "new_asn", description: "sign-ins from unfamiliar ASNs", params: ["upn"] },
    { name: "mail_chain", description: "all mail events for a UPN", params: ["upn"] },
    { name: "rules_for", description: "inbox rules for a UPN", params: ["upn"] },
    { name: "clicks_for", description: "clicks for a UPN", params: ["upn"] },
    { name: "device_for", description: "device inventory row", params: ["device_id"] },
    { name: "appliance_exposure", description: "KEV match for a VPN appliance", params: ["appliance_id"] },
    { name: "vpn_sessions_for", description: "VPN sessions for a UPN", params: ["upn"] },
    { name: "peer_baseline", description: "department sign-in baseline", params: ["department"] },
    { name: "signin_count_by_country", description: "sign-in counts by country", params: ["upn"] },
    { name: "spray_source_for", description: "password-spray sources behind this UPN's successful sign-ins", params: ["upn"] },
    { name: "spray_failures_window", description: "paginated failures from one IP across a time window (Markovian step)", params: ["ip", "from", "to"] },
    { name: "dq_signin_bad_vpn_order", description: "VPN sessions with ts_end < ts_start", params: [] },
    { name: "identity_for", description: "identity row for a UPN (role, mfa_method, department)", params: ["upn"] },
  ];
}

export function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.replace(/'/g, "''");
}
