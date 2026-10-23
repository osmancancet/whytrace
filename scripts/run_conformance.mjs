#!/usr/bin/env node
// Runs all three Meterless conformance runners (World Model, H-MEM,
// Markovian) and the Scout eval harness against our engines, then writes
// evidence/conformance-<engine>.txt. Exit non-zero if any engine fails.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const evidenceDir = resolve(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const engines = [
  { name: "world-model", envKey: "WORLD_MODEL_IMPL", impl: "packages/engines/world-model/src/index.ts", runner: "conformance/world-model/runner.ts" },
  { name: "hmem", envKey: "HMEM_IMPL", impl: "packages/engines/hmem/src/index.ts", runner: "conformance/hmem/runner.ts" },
  { name: "markovian", envKey: "MARKOVIAN_IMPL", impl: "packages/engines/markovian/src/index.ts", runner: "conformance/markovian/runner.ts" },
];

let failed = 0;
for (const e of engines) {
  const implAbs = resolve(root, e.impl);
  const runnerAbs = resolve(root, e.runner);
  const env = { ...process.env, [e.envKey]: implAbs };
  const started = Date.now();
  const r = spawnSync("npx", ["tsx", runnerAbs], { env, encoding: "utf8" });
  const ms = Date.now() - started;
  const body = `# ${e.name} conformance\n# runner: ${e.runner}\n# impl:   ${e.impl}\n# ran:    ${new Date().toISOString()}\n# took:   ${ms} ms\n# exit:   ${r.status}\n\n--- STDOUT ---\n${r.stdout ?? ""}\n--- STDERR ---\n${r.stderr ?? ""}\n`;
  writeFileSync(resolve(evidenceDir, `conformance-${e.name}.txt`), body, "utf8");
  console.log(`[${e.name}] exit=${r.status} in ${ms}ms`);
  if (r.status !== 0) failed++;
}

// Scout is a metric-gate harness, not a pass/fail runner. The dedicated
// script writes evidence/scout-evals.md and exits non-zero only if the `all`
// or `intent` suites miss their gate (per-suite injection / multi-intent
// floors are undefined by corpus construction — see evidence/scout-evals.md).
const scoutStarted = Date.now();
const scout = spawnSync("node", [resolve(root, "scripts/run_scout_evals.mjs")], { encoding: "utf8" });
const scoutMs = Date.now() - scoutStarted;
const scoutBody = `# scout evals\n# runner: scripts/run_scout_evals.mjs (wraps conformance/scout/evals/runner/index.ts)\n# impl:   packages/engines/scout-intent/src/index.ts\n# ran:    ${new Date().toISOString()}\n# took:   ${scoutMs} ms\n# exit:   ${scout.status}\n\n--- STDOUT ---\n${scout.stdout ?? ""}\n--- STDERR ---\n${scout.stderr ?? ""}\n`;
writeFileSync(resolve(evidenceDir, "conformance-scout.txt"), scoutBody, "utf8");
console.log(`[scout] exit=${scout.status} in ${scoutMs}ms`);
if (scout.status !== 0) failed++;

process.exit(failed === 0 ? 0 : 1);
