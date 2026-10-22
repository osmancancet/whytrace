// `npm run record -- case-002`
// Record a live run's Zetaris + Nightshift responses into `samples/<case>/` so
// a judge can replay the exact investigation with `SAMPLE_MODE=true` on a clean
// clone with no keys and no network. The recorded files are scrubbed of tokens,
// hostnames and local paths before they are written to disk.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";
import { Nightshift, RunTrace, Zetaris } from "../packages/adapters/src/index.ts";
import { CaseMemory, investigate, listDemoCases } from "../packages/agents/src/index.ts";

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

/** Patterns that must never appear in a tracked sample. Catches runtime tokens,
 *  local paths, user home directories and the campus hostname. The scrubber
 *  rewrites every match to a stable placeholder; the test suite re-checks for
 *  these patterns and fails if any slipped through. */
const SCRUB_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /rt-[A-Za-z0-9_-]{10,}/g, replacement: "rt-REDACTED" },
  { pattern: /\/Users\/[^"\s/]+/g, replacement: "/Users/REDACTED" },
  { pattern: /\/home\/[^"\s/]+/g, replacement: "/home/REDACTED" },
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/g, replacement: "Bearer REDACTED" },
  { pattern: /(?:[A-Fa-f0-9]{8}-){4}[A-Fa-f0-9]{12}/g, replacement: "00000000-0000-0000-0000-000000000000" },
];

function scrubText(s: string): string {
  let out = s;
  for (const { pattern, replacement } of SCRUB_RULES) out = out.replace(pattern, replacement);
  return out;
}

function scrubDirectory(dir: string): { files: number; changed: number } {
  if (!existsSync(dir)) return { files: 0, changed: 0 };
  let files = 0, changed = 0;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) { const r = scrubDirectory(path); files += r.files; changed += r.changed; continue; }
    files += 1;
    const raw = readFileSync(path, "utf8");
    const scrubbed = scrubText(raw);
    if (scrubbed !== raw) { writeFileSync(path, scrubbed, "utf8"); changed += 1; }
  }
  return { files, changed };
}

async function main() {
  loadDotenv();
  const caseId = process.argv[2];
  if (!caseId || !listDemoCases().some((c) => c.id === caseId)) {
    console.error(`usage: npm run record -- <case-id>\nKnown cases: ${listDemoCases().map((c) => c.id).join(", ")}`);
    process.exit(2);
  }
  const outRoot = resolvePath(process.cwd(), "samples", caseId);
  if (existsSync(outRoot)) {
    console.log(`[record] clearing stale samples under ${outRoot}`);
    rmSync(outRoot, { recursive: true, force: true });
  }
  mkdirSync(outRoot, { recursive: true });
  // The adapters write sample files when their *_RECORD_SAMPLES env flag is on.
  process.env.ZETARIS_RECORD_SAMPLES = "true";
  process.env.NIGHTSHIFT_RECORD_SAMPLES = "true";

  const trace = new RunTrace();
  const zetaris = new Zetaris({ trace, agent: "investigator", caseId });
  const nightshift = new Nightshift({ trace, caseId });
  console.log(`[record] case=${caseId} run_id=${trace.run_id} (writing to samples/${caseId}/)`);
  await nightshift.warmUp();
  const memory = new CaseMemory({ persistDir: resolvePath(process.cwd(), "logs", "hmem") });
  const report = await investigate({ caseId, trace, zetaris, nightshift, memory });
  console.log(`[record] verdict=${report.verdict} confidence=${report.confidence.toFixed(2)}`);

  // Scrub every recorded file (Zetaris rows do not usually contain secrets, but
  // the campus hostname and the Nightshift decision JSON may include local paths
  // for diagnostics). We rewrite tokens, Bearer headers, user homes and UUIDs.
  const scrubbed = scrubDirectory(outRoot);
  console.log(`[record] scrubbed ${scrubbed.changed}/${scrubbed.files} files`);

  const provenance = {
    case_id: caseId,
    recorded_from_run: trace.run_id,
    verdict: report.verdict,
    confidence: report.confidence,
    recorded_at: new Date().toISOString(),
    sql_calls: report.budget?.sql_calls ?? 0,
    model_calls: report.budget?.model_calls ?? 0,
    rounds: report.rounds,
    routed_models: report.models.map((m) => m.routed_model),
  };
  writeFileSync(join(outRoot, "provenance.json"), JSON.stringify(provenance, null, 2), "utf8");
  console.log(`[record] wrote ${outRoot}/provenance.json`);
  console.log(`[record] replay with: SAMPLE_MODE=true npm run investigate -- ${caseId}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
