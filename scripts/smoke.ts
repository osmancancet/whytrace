// Live smoke test for the Zetaris and Nightshift adapters. Writes
// evidence/smoke-<ts>.txt so the result is reproducible.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { Nightshift, Zetaris } from "@whytrace/adapters";

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

async function main() {
  loadDotenv();
  const lines: string[] = [];
  const push = (s: string) => { console.log(s); lines.push(s); };
  push(`WhyTrace smoke test — ${new Date().toISOString()}`);
  push("");
  push("## Zetaris");
  const z = new Zetaris();
  try {
    const r = await z.runSql("SELECT 1 AS n", { limit: 1 });
    push(`  SELECT 1          sql_id=${r.sql_id}  rows=${r.rows.length}  columns=${r.columns.join(",")}`);
    push(`  value: ${JSON.stringify(r.rows[0])}`);
  } catch (e) {
    push(`  SELECT 1 FAILED: ${(e as Error).message}`);
  }
  try {
    const r = await z.runSql("SHOW DATASOURCES", { limit: 50 });
    const names = r.rows.map((row) => row[r.columns[0]!]).join(", ");
    push(`  SHOW DATASOURCES  sql_id=${r.sql_id}  total=${r.totalRaw}  rows=${r.rows.length}  → ${names}`);
  } catch (e) {
    push(`  SHOW DATASOURCES FAILED: ${(e as Error).message}`);
  }
  push("");
  push("## Nightshift");
  const n = new Nightshift();
  const status = await n.testConnection();
  push(`  testConnection    = ${status}`);
  if (status === "online") {
    try {
      const models = await n.listModels();
      const meterless = models.filter((m) => m.startsWith("meterless/"));
      const nemotron = models.filter((m) => /nemotron/i.test(m));
      push(`  listModels        = ${models.length} ids (meterless/*: ${meterless.length}, Nemotron: ${nemotron.length})`);
      for (const m of nemotron.slice(0, 4)) push(`    - ${m}`);
    } catch (e) { push(`  listModels failed: ${(e as Error).message}`); }
    try {
      const resp = await n.chat({
        messages: [{ role: "user", content: "Reply with the single word READY." }],
        lane: "fast",
        maxTokens: 64,
        agent: "smoke",
      });
      push(`  chat/fast         receipt=${resp.receipt?.receipt_id ?? "-"} model=${resp.model} ms=${resp.latencyMs} retries=${resp.retryCount}`);
      push(`  reply (first 200): ${resp.text.slice(0, 200).replace(/\n/g, " ")}`);
    } catch (e) { push(`  chat failed: ${(e as Error).message}`); }
  }
  const evidenceDir = resolvePath(process.cwd(), "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const outPath = resolvePath(evidenceDir, `smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  push("");
  push(`wrote ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
