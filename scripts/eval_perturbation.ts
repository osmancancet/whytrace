// DAY6: perturbation robustness on the 7 dev cases.
//
// For each dev case, generates N=3 deterministic label-preserving variants
// (see scripts/perturb.ts) and runs A0 once per variant. Reports
//   - verdict stability (% same verdict as the label), and
//   - flips, with trace file path.
//
// Side-effects on data: variant rows are INSERTed into Postgres and APPENDED
// to data/mailgw/*.json before the sweep, Zetaris caches are refreshed, and
// everything is CLEANED UP at the end. The dev-case rows are never touched.
import { Client } from "pg";
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";
import { Nightshift, RunTrace, Zetaris } from "../packages/adapters/src/index.ts";
import { investigate, type Report } from "../packages/agents/src/index.ts";
import { buildPerturbationSuite, DEV_CASE_UPN, type PerturbedSuite } from "./perturb.ts";

function loadDotenv() {
  const path = resolvePath(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    const h = v.indexOf(" #"); if (h >= 0) v = v.slice(0, h).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] ?? def : def; };

const MAILGW_DIR = resolvePath("data/mailgw");
const BACKUP_DIR = resolvePath("data/mailgw/.perturb-backup");

async function withZetaris<T>(fn: (z: Zetaris) => Promise<T>): Promise<T> {
  const z = new Zetaris();
  return fn(z);
}

async function recacheMailgw(z: Zetaris) {
  for (const t of ["MAILGW.deliveries", "MAILGW.clicks", "MAILGW.rules"]) {
    try { await z.runSql(`UNCACHE TABLE ${t}`, { limit: 1 }); } catch { /* ok */ }
    try { await z.runSql(`CACHE TABLE ${t}`, { limit: 1 }); } catch { /* ok */ }
  }
}

async function reloadFiles(z: Zetaris) {
  // The FILES.assets CSV is read from disk at CREATE time; after we rewrite
  // the file, drop/recreate it so the file store picks it up.
  try { await z.runSql(`UNCACHE TABLE FILES.assets`, { limit: 1 }); } catch { /* ok */ }
  // No CACHE on FILES — Zetaris reads the file on each query.
  await z.runSql(`REFRESH TABLE FILES.assets`, { limit: 1 }).catch(() => undefined);
}

async function insertVariants(pg: Client, suite: PerturbedSuite) {
  for (const i of suite.identities) {
    await pg.query("INSERT INTO identities (upn, display_name, role, department, mfa_method, home_country, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (upn) DO NOTHING", [i.upn, i.display_name, i.role, i.department, i.mfa_method, i.home_country, i.created_at]);
  }
  for (const e of suite.signins) {
    await pg.query("INSERT INTO signin_events (event_id, ts, upn, result, ip, asn, asn_org, country, city, device_id, user_agent, app, mfa_prompt_count, risk_flag, via_vpn_appliance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT (event_id) DO NOTHING", [e.event_id, e.ts, e.upn, e.result, e.ip, e.asn ?? null, e.asn_org ?? null, e.country ?? null, e.city ?? null, e.device_id ?? null, e.user_agent ?? null, e.app, e.mfa_prompt_count ?? 0, e.risk_flag ?? null, e.via_vpn_appliance ?? null]);
  }
  for (const v of suite.vpnSessions) {
    await pg.query("INSERT INTO vpn_sessions (session_id, upn, ts_start, ts_end, appliance_id, client_ip, assigned_ip) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (session_id) DO NOTHING", [v.session_id, v.upn, v.ts_start, v.ts_end ?? null, v.appliance_id, v.client_ip ?? null, v.assigned_ip ?? null]);
  }
}

async function removeVariants(pg: Client, suite: PerturbedSuite) {
  for (const i of suite.identities) {
    await pg.query("DELETE FROM signin_events WHERE upn = $1", [i.upn]);
    await pg.query("DELETE FROM vpn_sessions WHERE upn = $1", [i.upn]);
    await pg.query("DELETE FROM identities WHERE upn = $1", [i.upn]);
  }
}

function backupMailgwJson() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  for (const f of ["deliveries.json", "clicks.json", "rules.json"]) {
    copyFileSync(join(MAILGW_DIR, f), join(BACKUP_DIR, f));
  }
}
function restoreMailgwJson() {
  for (const f of ["deliveries.json", "clicks.json", "rules.json"]) {
    copyFileSync(join(BACKUP_DIR, f), join(MAILGW_DIR, f));
  }
}
function appendMailgwJson(suite: PerturbedSuite) {
  const deliveries = JSON.parse(readFileSync(join(MAILGW_DIR, "deliveries.json"), "utf8")) as { data: unknown[] };
  const clicks = JSON.parse(readFileSync(join(MAILGW_DIR, "clicks.json"), "utf8")) as { data: unknown[] };
  const rules = JSON.parse(readFileSync(join(MAILGW_DIR, "rules.json"), "utf8")) as { data: unknown[] };
  // Rules on-wire shape: 6 columns, drop `name` (matches seed.ts writeMailSnapshots).
  const rulesWire = suite.rules.map(({ name: _n, ...rest }) => rest);
  deliveries.data.push(...suite.deliveries);
  clicks.data.push(...suite.clicks);
  rules.data.push(...rulesWire);
  writeFileSync(join(MAILGW_DIR, "deliveries.json"), JSON.stringify(deliveries, null, 2));
  writeFileSync(join(MAILGW_DIR, "clicks.json"), JSON.stringify(clicks, null, 2));
  writeFileSync(join(MAILGW_DIR, "rules.json"), JSON.stringify(rules, null, 2));
}

async function appendAssetsCsv(suite: PerturbedSuite) {
  const path = resolvePath("data/assets.csv");
  const existing = readFileSync(path, "utf8");
  copyFileSync(path, resolvePath("data/.assets.csv.perturb-backup"));
  const esc = (v: string | boolean) => { const s = String(v); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const body = suite.assets.map((r) => [r.device_id, r.owner_upn, r.hostname, r.os, r.os_version, r.managed, r.last_seen, r.type, r.firmware, r.location].map(esc).join(",")).join("\n");
  writeFileSync(path, existing + (existing.endsWith("\n") ? "" : "\n") + body + "\n", "utf8");
  // Re-copy to Zetaris container share dir and refresh the file store.
  const { spawnSync } = await import("node:child_process");
  const cp = spawnSync("docker", ["cp", path, "zetaris-driver-1:/home/zetaris/customer-data/shared/whytrace/assets.csv"], { encoding: "utf8" });
  if (cp.status !== 0) console.warn(`[perturb] docker cp assets.csv failed: ${cp.stderr}`);
}
function restoreAssetsCsv() {
  const backup = resolvePath("data/.assets.csv.perturb-backup");
  if (existsSync(backup)) {
    copyFileSync(backup, resolvePath("data/assets.csv"));
    unlinkSync(backup);
  }
}

type Row = { caseId: string; variant: number; newUpn: string; expected: string; verdict: string; same: boolean; seconds: number; confidence: number; rounds: number; sqlCalls: number; modelCalls: number; runId: string; routed: string[]; decidedBy: string; traceFile: string };

async function runOne(variant: { caseId: string; variant: number; newUpn: string; expected: string }, runNonce: string): Promise<Row> {
  const trace = new RunTrace();
  const zetaris = new Zetaris({ trace, agent: "investigator" });
  const nightshift = new Nightshift({ trace, runNonce });
  const started = Date.now();
  try {
    const r: Report = await investigate({
      caseId: `${variant.caseId}-p${variant.variant}`,
      caseInfo: { id: `${variant.caseId}-p${variant.variant}`, upn: variant.newUpn, expected: variant.expected as "contain" | "monitor" | "benign" | "escalate", description: `Perturbation variant p${variant.variant} of ${variant.caseId}` },
      trace, zetaris, nightshift,
    });
    const routed = (r.models ?? []).map((m) => m.routed_model).filter(Boolean) as string[];
    return {
      caseId: variant.caseId, variant: variant.variant, newUpn: variant.newUpn, expected: variant.expected,
      verdict: r.verdict, same: r.verdict === variant.expected,
      seconds: (Date.now() - started) / 1000, confidence: r.confidence, rounds: r.rounds,
      sqlCalls: r.budget?.sql_calls ?? 0, modelCalls: r.budget?.model_calls ?? 0,
      runId: r.run_id, routed: [...new Set(routed)], decidedBy: r.decided_by,
      traceFile: trace.files().trace,
    };
  } catch (err) {
    return { caseId: variant.caseId, variant: variant.variant, newUpn: variant.newUpn, expected: variant.expected, verdict: `error:${(err as Error).message.slice(0, 60)}`, same: false, seconds: (Date.now() - started) / 1000, confidence: 0, rounds: 0, sqlCalls: 0, modelCalls: 0, runId: "-", routed: [], decidedBy: "-", traceFile: trace.files().trace };
  }
}

async function main() {
  loadDotenv();
  const cases = arg("cases", Object.keys(DEV_CASE_UPN).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const perVariant = Number(arg("variants", "3"));
  const outFile = arg("out", "evidence/heldout-perturbation.md");
  console.log(`[perturb] cases=${cases.join(",")} variants=${perVariant}`);

  const suite = buildPerturbationSuite(cases, perVariant);
  console.log(`[perturb] generated: identities=${suite.identities.length} signins=${suite.signins.length} vpn=${suite.vpnSessions.length} deliveries=${suite.deliveries.length} rules=${suite.rules.length} assets=${suite.assets.length}`);

  const pg = new Client({ host: process.env.WHYTRACE_PG_HOST ?? "localhost", port: Number(process.env.WHYTRACE_PG_PORT ?? 5433), user: process.env.WHYTRACE_PG_USER ?? "whytrace", password: process.env.WHYTRACE_PG_PASSWORD ?? "whytrace", database: process.env.WHYTRACE_PG_DB ?? "authlogs" });
  await pg.connect();
  let staged = false;
  try {
    backupMailgwJson();
    await insertVariants(pg, suite);
    appendMailgwJson(suite);
    await appendAssetsCsv(suite);
    staged = true;
    await withZetaris(async (z) => { await recacheMailgw(z); await reloadFiles(z); });

    const rows: Row[] = [];
    for (const v of suite.variantMap) {
      const nonce = `nonce:perturb:${v.caseId}:p${v.variant}:${Date.now().toString(36)}`;
      const r = await runOne(v, nonce);
      rows.push(r);
      console.log(`[perturb] ${v.caseId}-p${v.variant} (${v.newUpn}): ${r.verdict} (expected ${v.expected}) ${r.seconds.toFixed(1)}s decided_by=${r.decidedBy}`);
    }

    const total = rows.length;
    const stable = rows.filter((r) => r.same).length;
    const flips = rows.filter((r) => !r.same);
    const byCase: Record<string, { total: number; stable: number }> = {};
    for (const r of rows) {
      byCase[r.caseId] ??= { total: 0, stable: 0 };
      byCase[r.caseId].total += 1; if (r.same) byCase[r.caseId].stable += 1;
    }

    const md: string[] = [`# WhyTrace perturbation robustness — ${new Date().toISOString()}`, ""];
    md.push(`N=${perVariant} deterministic label-preserving variants per dev case (${cases.length} cases → ${total} runs, A0 only). See \`scripts/perturb.ts\` for the transforms.`, "");
    md.push(`Headline: ${stable}/${total} variants verdict the same as the label (${((stable / total) * 100).toFixed(0)}%). Flips: ${flips.length}.`, "");
    md.push(`## Per-case stability`, "", "| case | expected | variants | stable | flipped |", "|---|---|---|---|---|");
    for (const [caseId, s] of Object.entries(byCase)) md.push(`| ${caseId} | ${rows.find((r) => r.caseId === caseId)?.expected} | ${s.total} | ${s.stable} | ${s.total - s.stable} |`);
    md.push("");
    md.push(`## All runs`, "", "| case | variant | upn | expected | verdict | ok | conf | rounds | SQL | model | s | decided_by | run_id | trace |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) md.push(`| ${r.caseId} | p${r.variant} | ${r.newUpn} | ${r.expected} | ${r.verdict} | ${r.same ? "✅" : "❌"} | ${r.confidence} | ${r.rounds} | ${r.sqlCalls} | ${r.modelCalls} | ${r.seconds.toFixed(1)} | ${r.decidedBy} | ${r.runId} | \`${r.traceFile}\` |`);
    md.push("");
    if (flips.length) {
      md.push(`## Flips`, "");
      for (const r of flips) md.push(`- \`${r.caseId}-p${r.variant}\` (${r.newUpn}): expected **${r.expected}**, got **${r.verdict}**. Trace: \`${r.traceFile}\`.`);
      md.push("");
    }
    writeFileSync(resolvePath(outFile), md.join("\n"));
    console.log(`\nwrote ${outFile}: ${stable}/${total} stable, ${flips.length} flip(s).`);
  } finally {
    if (staged) {
      restoreMailgwJson();
      restoreAssetsCsv();
      try { await removeVariants(pg, suite); } catch (e) { console.warn(`[perturb] cleanup error: ${(e as Error).message}`); }
      await withZetaris(async (z) => { await recacheMailgw(z); await reloadFiles(z); });
      const { spawnSync } = await import("node:child_process");
      spawnSync("docker", ["cp", resolvePath("data/assets.csv"), "zetaris-driver-1:/home/zetaris/customer-data/shared/whytrace/assets.csv"], { encoding: "utf8" });
      console.log(`[perturb] cleaned up variant rows and restored data/mailgw/*, data/assets.csv.`);
    }
    await pg.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
