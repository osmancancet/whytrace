// Non-destructive migration that lands case-007 on the running stack.
//
//  1. Upserts a.sahin@aegean.edu into identities + the 17 case-007 sign-in
//     events into signin_events (ON CONFLICT DO NOTHING, so re-runs are safe).
//  2. Rewrites data/mailgw/{deliveries,rules}.json so the mock mail-gateway
//     serves the case-007 phish delivery + forwarding rule.
//  3. Refreshes Zetaris' cached MAILGW tables by issuing UNCACHE + CACHE
//     through the REST adapter (REFRESH TABLE first, then UNCACHE + CACHE as
//     a fallback). Zetaris objects themselves are not dropped — only the
//     cache for the two REST tables is rebuilt from the updated JSON.
//
// Idempotent. Reads credentials from .env (same as the full seed). The script
// NEVER drops a Zetaris datasource / lightning database / USL — those stay
// as the bootstrap left them.
import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSuite } from "../services/postgres-seed/src/seed.ts";
import { Zetaris } from "../packages/adapters/src/zetaris.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolvePath(HERE, "..");

function loadDotenv() {
  const path = resolvePath(REPO, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    const hashIdx = value.indexOf(" #");
    if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function upsertPostgres(allIdents: ReturnType<typeof buildSuite>["identities"], signins: ReturnType<typeof buildSuite>["suite"]["signins"], caseSevenUpn: string) {
  const host = process.env.WHYTRACE_PG_HOST ?? "localhost";
  const port = Number(process.env.WHYTRACE_PG_PORT ?? 5433);
  const user = process.env.WHYTRACE_PG_USER ?? "whytrace";
  const password = process.env.WHYTRACE_PG_PASSWORD ?? "whytrace";
  const database = process.env.WHYTRACE_PG_DB ?? "authlogs";

  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    // Only touch rows that belong to case-007 — never touch an existing row.
    const sahin = allIdents.find((i) => i.upn === caseSevenUpn);
    if (!sahin) throw new Error(`buildSuite({withCaseSeven:true}) returned no identity for ${caseSevenUpn}`);
    const identRes = await client.query(
      "INSERT INTO identities (upn, display_name, role, department, mfa_method, home_country, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (upn) DO NOTHING",
      [sahin.upn, sahin.display_name, sahin.role, sahin.department, sahin.mfa_method, sahin.home_country, sahin.created_at],
    );
    console.log(`  identities upsert for ${sahin.upn}: ${identRes.rowCount} new row(s)`);

    const caseSevenRows = signins.filter((e) => e.upn === caseSevenUpn);
    let inserted = 0;
    for (const e of caseSevenRows) {
      const r = await client.query(
        "INSERT INTO signin_events (event_id, ts, upn, result, ip, asn, asn_org, country, city, device_id, user_agent, app, mfa_prompt_count, risk_flag, via_vpn_appliance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (event_id) DO NOTHING",
        [e.event_id, e.ts, e.upn, e.result, e.ip, e.asn ?? null, e.asn_org ?? null, e.country ?? null, e.city ?? null, e.device_id ?? null, e.user_agent ?? null, e.app, e.mfa_prompt_count ?? 0, e.risk_flag ?? null, e.via_vpn_appliance ?? null],
      );
      inserted += r.rowCount ?? 0;
    }
    console.log(`  signin_events upserted for ${caseSevenUpn}: ${inserted}/${caseSevenRows.length} new row(s)`);
  } finally {
    await client.end();
  }
}

function rewriteMailJson(suite: ReturnType<typeof buildSuite>["suite"]) {
  const dir = resolvePath(REPO, "data", "mailgw");
  writeFileSync(resolvePath(dir, "deliveries.json"), JSON.stringify({ data: suite.deliveries }, null, 2));
  // Strip optional `name` from the on-wire payload — matches the main
  // seed.ts behaviour. See the comment in writeMailSnapshots() for why.
  const rulesWire = suite.rules.map(({ name: _n, ...rest }) => rest);
  writeFileSync(resolvePath(dir, "rules.json"), JSON.stringify({ data: rulesWire }, null, 2));
  console.log(`  data/mailgw/deliveries.json: ${suite.deliveries.length} rows`);
  console.log(`  data/mailgw/rules.json:      ${rulesWire.length} rows (name field stripped on-wire)`);
}

async function refreshMailgwCache() {
  const z = new Zetaris({ timeoutMs: 120_000 });
  const steps = [
    `REFRESH TABLE MAILGW.deliveries`,
    `REFRESH TABLE MAILGW.rules`,
    // Fallback: UNCACHE then CACHE (older Lightning builds need this instead
    // of REFRESH). Both branches tolerate failures so the script stays
    // idempotent — if REFRESH is enough, the UNCACHE/CACHE just no-ops.
    `UNCACHE TABLE MAILGW.deliveries`,
    `CACHE TABLE MAILGW.deliveries`,
    `UNCACHE TABLE MAILGW.rules`,
    `CACHE TABLE MAILGW.rules`,
  ];
  for (const sql of steps) {
    try {
      await z.runSql(sql, { limit: 1 });
      console.log(`  Zetaris: ok    ${sql}`);
    } catch (err) {
      console.log(`  Zetaris: skip  ${sql} — ${(err as Error).message.slice(0, 160)}`);
    }
  }
}

async function verifyCase007() {
  const z = new Zetaris({ timeoutMs: 60_000 });
  const USL = "lightning.metastore.whytrace.security_usl";
  const queries = [
    { label: "sign-ins", sql: `SELECT COUNT(*) AS n FROM ${USL}.signin_event WHERE upn = 'a.sahin@aegean.edu'` },
    { label: "mail events", sql: `SELECT COUNT(*) AS n FROM ${USL}.mail_event WHERE upn = 'a.sahin@aegean.edu'` },
    { label: "phish subject", sql: `SELECT detail FROM ${USL}.mail_event WHERE upn = 'a.sahin@aegean.edu' AND kind = 'delivery' AND verdict = 'phish_suspect'` },
    { label: "forward rule", sql: `SELECT detail FROM ${USL}.mail_event WHERE upn = 'a.sahin@aegean.edu' AND kind = 'rule' AND verdict = 'forward'` },
  ];
  for (const q of queries) {
    try {
      const r = await z.runSql(q.sql, { limit: 10 });
      const sample = r.rows[0] ? JSON.stringify(r.rows[0]).slice(0, 200) : "(0 rows)";
      console.log(`  Zetaris: ${q.label.padEnd(14)} ${sample}`);
    } catch (err) {
      console.log(`  Zetaris: ${q.label} FAILED — ${(err as Error).message.slice(0, 180)}`);
    }
  }
}

async function main() {
  loadDotenv();
  console.log("whytrace apply-case-007 — non-destructive migration");
  const { suite, identities } = buildSuite({ withCaseSeven: true });
  const caseSevenUpn = "a.sahin@aegean.edu";
  await upsertPostgres(identities, suite.signins, caseSevenUpn);
  rewriteMailJson(suite);
  if (process.argv.includes("--zetaris")) {
    console.log("Refreshing Zetaris MAILGW cache…");
    await refreshMailgwCache();
    console.log("Verifying case-007 rows via USL…");
    await verifyCase007();
  } else {
    console.log("(pass --zetaris to refresh Zetaris MAILGW cache + verify through the USL)");
  }
  console.log("done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
