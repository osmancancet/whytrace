// Reusable one-off runner for RUN DQ TABLE against the local Zetaris install.
// Regenerates evidence/zetaris/run-dq.md's table numbers. Usage from repo root:
//   npx tsx evidence/zetaris/run-dq.ts
//
// Requires the local Zetaris stack (zetaris-driver-1 + zetaris-api-1) and a
// valid ZETARIS_API_KEY in .env. Prints a JSON array of all DQ rows plus a
// markdown table. No credentials or absolute paths are printed.
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Zetaris } from "../../packages/adapters/src/zetaris.ts";

function loadDotenv() {
  const path = resolvePath(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    const h = v.indexOf(" #");
    if (h >= 0) v = v.slice(0, h).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const USL = "lightning.metastore.whytrace.security_usl";
const TABLES = ["identity", "signin_event", "mail_event", "device", "vulnerability", "vpn_session"];

async function main() {
  loadDotenv();
  const z = new Zetaris();
  const rows: Array<Record<string, unknown>> = [];
  for (const t of TABLES) {
    const sql = `RUN DQ TABLE ${USL}.${t}`;
    try {
      const res = await z.runSql(sql);
      for (const r of res.rows) rows.push({ table: t, ...r });
    } catch (err) {
      rows.push({ table: t, error: (err as Error).message });
    }
  }
  console.log(JSON.stringify(rows, null, 2));
  console.log("\n| table | rule name | rule type | total | valid | invalid |");
  console.log("|---|---|---|---:|---:|---:|");
  for (const r of rows) {
    const bits = [r.table, r.name ?? "—", r.type ?? "—", r.total_record ?? "—", r.valid_record ?? "—", r.invalid_record ?? "—"];
    console.log(`| ${bits.join(" | ")} |`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
