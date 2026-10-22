// Idempotent Zetaris bootstrap. Default is --dry-run (just print the plan);
// pass --apply to execute. Steps mirror notes/SPEC §9 + .cursor/rules/zetaris-data.mdc:
//
//   1. docker cp CSVs into zetaris-driver-1:/home/zetaris/customer-data/shared/whytrace/
//   2. register datasource auth_pg (Postgres JDBC)
//   3. register lightning database MAILGW with 3 REST tables + CACHE
//   4. register lightning database FILES with assets + phish_corpus CSV tables
//   5. register lightning database KEV with the public CISA catalog + CACHE
//   6. CREATE NAMESPACE lightning.metastore.whytrace
//   7. COMPILE USL whytrace.security_usl ... DEPLOY NAMESPACE
//   8. ACTIVATE USL TABLE per entity
//   9. RUN DQ TABLE per entity, print the pass/fail table
//
// We never drop anything we did not create.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Zetaris, type ZetarisTypedResult } from "../packages/adapters/src/zetaris.ts";

type Step = {
  name: string;
  sql?: string;
  cmd?: { bin: string; args: string[] };
  tolerate?: (err: Error) => boolean;
  waitAfterMs?: number;
};

const APPLY = process.argv.includes("--apply");
const RECORD = process.argv.includes("--record-samples");
if (RECORD) process.env.ZETARIS_RECORD_SAMPLES = "true";

function loadDotenv() {
  const path = resolvePath(process.cwd(), ".env");
  if (!existsSync(path)) return;
  const body = readFileSync(path, "utf8");
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith("#")) value = "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    const hashIdx = value.indexOf(" #");
    if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotenv();

const PG_HOST = "host.docker.internal";
const PG_PORT = process.env.WHYTRACE_PG_PORT ?? "5433";
const PG_DB = process.env.WHYTRACE_PG_DB ?? "authlogs";
const PG_USER = process.env.WHYTRACE_PG_USER ?? "whytrace";
const PG_PASS = process.env.WHYTRACE_PG_PASSWORD ?? "whytrace";
const MAILGW = `http://host.docker.internal:${process.env.MAILGW_PORT ?? "8090"}`;
const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const DRIVER_CTR = "zetaris-driver-1";
const SHARE_DIR = "/home/zetaris/customer-data/shared/whytrace";
const USL_NS = "lightning.metastore.whytrace";
const USL_NAME = "security_usl";

const CSV_FILES = [
  { host: "data/assets.csv", container: `${SHARE_DIR}/assets.csv` },
  { host: "data/turkish_phishing_dataset.csv", container: `${SHARE_DIR}/turkish_phishing_dataset.csv` },
] as const;

// REST tables wrap their payload in `data` / `vulnerabilities`. We expose the
// flattened rows as inline sub-queries inside the ACTIVATE statements — this
// avoids the SchemaStore CREATE VIEW syntax, which varies by release.
const DELIVERIES_FLAT = `(SELECT r.message_id, r.ts, r.sender, r.sender_domain, r.recipient_upn, r.subject, r.verdict, r.url_count, r.spf, r.dkim, r.dmarc FROM MAILGW.deliveries LATERAL VIEW explode(data) tbl AS r)`;
const CLICKS_FLAT = `(SELECT r.click_id, r.ts, r.message_id, r.upn, r.url, r.url_domain, r.user_ip FROM MAILGW.clicks LATERAL VIEW explode(data) tbl AS r)`;
const RULES_FLAT = `(SELECT r.rule_id, r.ts, r.upn, r.action, r.target, r.created_via FROM MAILGW.rules LATERAL VIEW explode(data) tbl AS r)`;
const KEV_FLAT = `(SELECT v.cveID AS cve_id, v.vendorProject AS vendor, v.product AS product, v.vulnerabilityName AS name, v.dateAdded AS date_added, v.knownRansomwareCampaignUse AS ransomware_use FROM KEV.catalog LATERAL VIEW explode(vulnerabilities) tbl AS v)`;

function registrationSteps(): Step[] {
  return [
    {
      name: `prepare share dir`,
      cmd: { bin: "docker", args: ["exec", "-u", "0", DRIVER_CTR, "mkdir", "-p", SHARE_DIR] },
    },
    ...CSV_FILES.map((f) => ({
      name: `docker cp ${f.host}`,
      cmd: { bin: "docker", args: ["cp", f.host, `${DRIVER_CTR}:${f.container}`] },
    })),
    {
      name: "ensure share dir readable",
      cmd: { bin: "docker", args: ["exec", "-u", "0", DRIVER_CTR, "chmod", "-R", "a+rX", SHARE_DIR] },
    },
    {
      name: "DROP DATASOURCE auth_pg (idempotency)",
      sql: `DROP DATASOURCE auth_pg`,
      tolerate: () => true,
    },
    {
      name: "CREATE DATASOURCE auth_pg",
      sql: `CREATE DATASOURCE auth_pg DESCRIBE BY "WhyTrace university identity and sign-in logs Postgres" OPTIONS (jdbcdriver "org.postgresql.Driver", jdbcurl "jdbc:postgresql://${PG_HOST}:${PG_PORT}/${PG_DB}", username "${PG_USER}", password "${PG_PASS}", fetchsize "1000")`,
    },
    {
      name: "REGISTER DATASOURCE TABLES FROM auth_pg",
      sql: `REGISTER DATASOURCE TABLES FROM auth_pg`,
    },
    {
      name: "DROP LIGHTNING DATABASE MAILGW (idempotency)",
      sql: `DROP LIGHTNING DATABASE MAILGW`,
      tolerate: () => true,
    },
    { name: "CREATE LIGHTNING DATABASE MAILGW", sql: `CREATE LIGHTNING DATABASE MAILGW DESCRIBE BY "Mail gateway events local Fastify mock"` },
    { name: "CREATE REST TABLE deliveries", sql: `CREATE LIGHTNING REST TABLE deliveries FROM MAILGW REQUEST(endpoint "${MAILGW}/mailgw/deliveries", method "get", response_type "json", http_encoding "URLENCODED") HEADER (user-agent "whytrace") BODY ()` },
    { name: "CREATE REST TABLE clicks", sql: `CREATE LIGHTNING REST TABLE clicks FROM MAILGW REQUEST(endpoint "${MAILGW}/mailgw/clicks", method "get", response_type "json", http_encoding "URLENCODED") HEADER (user-agent "whytrace") BODY ()` },
    { name: "CREATE REST TABLE rules", sql: `CREATE LIGHTNING REST TABLE rules FROM MAILGW REQUEST(endpoint "${MAILGW}/mailgw/rules", method "get", response_type "json", http_encoding "URLENCODED") HEADER (user-agent "whytrace") BODY ()` },
    { name: "CACHE TABLE MAILGW.deliveries", sql: `CACHE TABLE MAILGW.deliveries`, waitAfterMs: 400 },
    { name: "CACHE TABLE MAILGW.clicks", sql: `CACHE TABLE MAILGW.clicks` },
    { name: "CACHE TABLE MAILGW.rules", sql: `CACHE TABLE MAILGW.rules` },

    { name: "DROP LIGHTNING DATABASE FILES (idempotency)", sql: `DROP LIGHTNING DATABASE FILES`, tolerate: () => true },
    { name: "CREATE LIGHTNING DATABASE FILES", sql: `CREATE LIGHTNING DATABASE FILES DESCRIBE BY "Asset inventory and Turkish phishing corpus Zetaris file store"` },
    { name: "CREATE FILESTORE TABLE assets", sql: `CREATE LIGHTNING FILESTORE TABLE assets FROM FILES FORMAT CSV OPTIONS (PATH "${SHARE_DIR}/assets.csv", header "true", inferSchema "true")` },
    { name: "CREATE FILESTORE TABLE phish_corpus", sql: `CREATE LIGHTNING FILESTORE TABLE phish_corpus FROM FILES FORMAT CSV OPTIONS (PATH "${SHARE_DIR}/turkish_phishing_dataset.csv", header "true", inferSchema "true", multiLine "true", escape "\\"")` },

    { name: "DROP LIGHTNING DATABASE KEV (idempotency)", sql: `DROP LIGHTNING DATABASE KEV`, tolerate: () => true },
    { name: "CREATE LIGHTNING DATABASE KEV", sql: `CREATE LIGHTNING DATABASE KEV DESCRIBE BY "CISA known exploited vulnerabilities"` },
    { name: "CREATE REST TABLE KEV.catalog", sql: `CREATE LIGHTNING REST TABLE catalog FROM KEV REQUEST(endpoint "${KEV_URL}", method "get", response_type "json", http_encoding "URLENCODED") HEADER (user-agent "whytrace") BODY ()` },
    { name: "CACHE TABLE KEV.catalog", sql: `CACHE TABLE KEV.catalog`, waitAfterMs: 1500 },
  ];
}

function schemastoreSteps(): Step[] {
  return [];
}

function uslSteps(): Step[] {
  const compile = `COMPILE USL IF NOT EXISTS ${USL_NAME} DEPLOY NAMESPACE ${USL_NS} DDL
CREATE TABLE identity (
  upn varchar(64) NOT NULL PRIMARY KEY,
  display_name varchar(128),
  role varchar(16),
  department varchar(64),
  mfa_method varchar(8),
  home_country varchar(2)
);
CREATE TABLE signin_event (
  event_id varchar(32) NOT NULL PRIMARY KEY,
  ts timestamp,
  upn varchar(64) NOT NULL FOREIGN KEY REFERENCES identity(upn),
  result varchar(16),
  ip varchar(45),
  asn varchar(32),
  asn_org varchar(128),
  country varchar(2),
  city varchar(64),
  device_id varchar(32),
  app varchar(16),
  mfa_prompt_count int,
  risk_flag varchar(64),
  via_vpn_appliance varchar(32)
);
CREATE TABLE vpn_session (
  session_id varchar(32) NOT NULL PRIMARY KEY,
  upn varchar(64) NOT NULL FOREIGN KEY REFERENCES identity(upn),
  ts_start timestamp,
  ts_end timestamp,
  appliance_id varchar(32),
  client_ip varchar(45),
  assigned_ip varchar(45)
);
CREATE TABLE mail_event (
  event_id varchar(64) NOT NULL PRIMARY KEY,
  ts timestamp,
  upn varchar(64) FOREIGN KEY REFERENCES identity(upn),
  kind varchar(16),
  verdict varchar(16),
  sender_domain varchar(128),
  detail varchar(1024)
);
CREATE TABLE device (
  device_id varchar(32) NOT NULL PRIMARY KEY,
  owner_upn varchar(64),
  type varchar(32),
  os_version varchar(64),
  managed boolean,
  firmware varchar(64),
  last_seen timestamp
);
CREATE TABLE vulnerability (
  cve_id varchar(32) NOT NULL PRIMARY KEY,
  vendor varchar(128),
  product varchar(128),
  name varchar(256),
  date_added date,
  ransomware_use varchar(32)
);`;

  return [
    { name: "CREATE NAMESPACE lightning.metastore (parent)", sql: `CREATE NAMESPACE IF NOT EXISTS lightning.metastore`, tolerate: () => true },
    { name: `CREATE NAMESPACE ${USL_NS}`, sql: `CREATE NAMESPACE IF NOT EXISTS ${USL_NS}`, tolerate: () => true },
    { name: `REMOVE USL ${USL_NAME} NAMESPACE ${USL_NS} (idempotency)`, sql: `REMOVE USL ${USL_NAME} NAMESPACE ${USL_NS}`, tolerate: () => true },
    { name: `COMPILE USL ${USL_NAME}`, sql: compile },
    { name: `ACTIVATE identity`, sql: `ACTIVATE USL TABLE ${USL_NS}.${USL_NAME}.identity AS SELECT upn, display_name, role, department, mfa_method, home_country FROM auth_pg.identities` },
    { name: `ACTIVATE signin_event`, sql: `ACTIVATE USL TABLE ${USL_NS}.${USL_NAME}.signin_event AS SELECT event_id, ts, upn, result, ip, asn, asn_org, country, city, device_id, app, mfa_prompt_count, risk_flag, via_vpn_appliance FROM auth_pg.signin_events` },
    { name: `ACTIVATE vpn_session`, sql: `ACTIVATE USL TABLE ${USL_NS}.${USL_NAME}.vpn_session AS SELECT session_id, upn, ts_start, ts_end, appliance_id, client_ip, assigned_ip FROM auth_pg.vpn_sessions` },
    { name: `ACTIVATE mail_event`, sql: `ACTIVATE USL TABLE ${USL_NS}.${USL_NAME}.mail_event AS SELECT CONCAT('d:', COALESCE(d.message_id,'')) AS event_id, CAST(d.ts AS TIMESTAMP) AS ts, d.recipient_upn AS upn, 'delivery' AS kind, d.verdict AS verdict, d.sender_domain, CONCAT('subject=', d.subject) AS detail FROM ${DELIVERIES_FLAT} AS d UNION ALL SELECT CONCAT('c:', COALESCE(c.click_id,'')) AS event_id, CAST(c.ts AS TIMESTAMP) AS ts, c.upn, 'click' AS kind, NULL AS verdict, c.url_domain AS sender_domain, c.url AS detail FROM ${CLICKS_FLAT} AS c UNION ALL SELECT CONCAT('r:', COALESCE(r.rule_id,'')) AS event_id, CAST(r.ts AS TIMESTAMP) AS ts, r.upn, 'rule' AS kind, r.action AS verdict, NULL AS sender_domain, CONCAT('target=', r.target, ' via=', r.created_via) AS detail FROM ${RULES_FLAT} AS r` },
    { name: `ACTIVATE device`, sql: `ACTIVATE USL TABLE ${USL_NS}.${USL_NAME}.device AS SELECT COALESCE(device_id,'') AS device_id, owner_upn, type, os_version, CAST(managed AS boolean) AS managed, firmware, CAST(last_seen AS timestamp) AS last_seen FROM FILES.assets` },
    { name: `ACTIVATE vulnerability`, sql: `ACTIVATE USL TABLE ${USL_NS}.${USL_NAME}.vulnerability AS SELECT COALESCE(k.cve_id,'') AS cve_id, k.vendor, k.product, k.name, CAST(k.date_added AS DATE) AS date_added, k.ransomware_use FROM ${KEV_FLAT} AS k` },
  ];
}

function dqSteps(): Step[] {
  const tables = ["identity", "signin_event", "vpn_session", "mail_event", "device", "vulnerability"] as const;
  return tables.map((t) => ({ name: `RUN DQ TABLE ${t}`, sql: `RUN DQ TABLE ${USL_NS}.${USL_NAME}.${t}` }));
}

const EXTRA_DQ: Array<{ rule: string; table: string; sql: string }> = [
  { rule: "valid_upn", table: "signin_event", sql: `SELECT COUNT(*) AS invalid_record FROM ${USL_NS}.${USL_NAME}.signin_event WHERE upn NOT LIKE '%@aegean.edu'` },
  { rule: "ts_not_null", table: "signin_event", sql: `SELECT COUNT(*) AS invalid_record FROM ${USL_NS}.${USL_NAME}.signin_event WHERE ts IS NULL` },
  { rule: "known_result", table: "signin_event", sql: `SELECT COUNT(*) AS invalid_record FROM ${USL_NS}.${USL_NAME}.signin_event WHERE result NOT IN ('success','failure','mfa_denied','mfa_approved')` },
  { rule: "vpn_session_order", table: "vpn_session", sql: `SELECT COUNT(*) AS invalid_record FROM ${USL_NS}.${USL_NAME}.vpn_session WHERE ts_end IS NOT NULL AND ts_end < ts_start` },
  { rule: "asset_seen_recent", table: "device", sql: `SELECT COUNT(*) AS invalid_record FROM ${USL_NS}.${USL_NAME}.device WHERE last_seen < CAST('2026-09-19T00:00:00' AS TIMESTAMP)` },
];

async function run(step: Step, z: Zetaris, idx: number): Promise<string> {
  if (step.cmd) {
    if (!APPLY) return `  dry-run  [${idx}] ${step.name} :: ${step.cmd.bin} ${step.cmd.args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`;
    const started = Date.now();
    const r = spawnSync(step.cmd.bin, step.cmd.args, { encoding: "utf8" });
    const ms = Date.now() - started;
    if (r.status !== 0) {
      const msg = r.stderr?.trim() || r.stdout?.trim() || "non-zero exit";
      if (step.tolerate?.(new Error(msg))) return `  tolerated [${idx}] ${step.name} (${ms} ms): ${msg}`;
      throw new Error(`[${idx}] ${step.name} failed: ${msg}`);
    }
    return `  ok      [${idx}] ${step.name} (${ms} ms)`;
  }
  if (!step.sql) return `  skip    [${idx}] ${step.name}`;
  if (!APPLY) return `  dry-run  [${idx}] ${step.name} :: ${step.sql.replace(/\s+/g, " ").slice(0, 110)}${step.sql.length > 110 ? "…" : ""}`;
  const started = Date.now();
  try {
    const r = await z.runSql(step.sql, { limit: 50 });
    const ms = Date.now() - started;
    if (step.waitAfterMs) await new Promise((r) => setTimeout(r, step.waitAfterMs));
    return `  ok      [${idx}] ${step.name} (${ms} ms, rows=${r.rows.length})`;
  } catch (err) {
    const e = err as Error;
    if (step.tolerate?.(e)) return `  tolerated [${idx}] ${step.name}: ${e.message}`;
    throw new Error(`[${idx}] ${step.name} failed: ${e.message}`);
  }
}

async function main() {
  const z = new Zetaris({ timeoutMs: 300_000 });
  if (!APPLY) console.log("whytrace zetaris bootstrap — DRY RUN (pass --apply to execute)");
  else console.log("whytrace zetaris bootstrap — APPLY");
  const plan: Step[] = [...registrationSteps(), ...schemastoreSteps(), ...uslSteps(), ...dqSteps()];
  const log: string[] = [];
  let idx = 0;
  for (const step of plan) {
    idx += 1;
    const result = await run(step, z, idx);
    console.log(result);
    log.push(result);
  }
  if (APPLY) {
    console.log("\nExtra DQ checks:");
    for (const r of EXTRA_DQ) {
      try {
        const res = await z.runSql(r.sql, { limit: 1 });
        const invalid = Number(res.rows[0]?.invalid_record ?? 0);
        console.log(`  ${r.rule.padEnd(20)} on ${r.table.padEnd(14)} → invalid=${invalid}`);
      } catch (err) {
        console.log(`  ${r.rule} FAILED: ${(err as Error).message}`);
      }
    }
    const summary = await z.runSql(`SELECT COUNT(*) AS n FROM ${USL_NS}.${USL_NAME}.signin_event`, { limit: 1 });
    console.log(`\nUSL smoke: SELECT COUNT(*) FROM security_usl.signin_event → ${summary.rows[0]?.n ?? "?"}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
