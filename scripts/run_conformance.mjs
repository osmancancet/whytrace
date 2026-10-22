#!/usr/bin/env node
// Runs all three Meterless conformance runners against our engines and
// writes evidence/conformance-<engine>.txt. Exit non-zero if any fails.
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

process.exit(failed === 0 ? 0 : 1);
