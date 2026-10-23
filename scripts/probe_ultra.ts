// `npm run probe:ultra` — detect a Nemotron Ultra lane, probe it with a short
// tool call, and (if available) run a sample Reporter prompt against both
// Super VL and Ultra on the recorded case-001 context. Writes
// evidence/ultra-probe.md with the probe result + a side-by-side summary.
//
// This script does NOT change the orchestrator wiring; it writes evidence
// so a judge can see whether the Ultra lane was available at submission time.
// The orchestrator path is already wired: set METERLESS_REPORTER_MODEL=<id>
// and the Reporter call routes to that model (Super VL stays on the
// investigation path).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";
import { Nightshift } from "../packages/adapters/src/index.ts";

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
    if (!process.env[k]) process.env[k] = v;
  }
}

async function main() {
  loadDotenv();
  const n = new Nightshift();
  const stamp = new Date().toISOString();
  const md: string[] = [`# Nemotron Ultra probe — ${stamp}`, ""];
  let models: string[] = [];
  try {
    models = await n.listModels();
  } catch (err) {
    md.push(`**Probe failed before listing models**: ${(err as Error).message}`);
    writeOut(md.join("\n"));
    return;
  }
  const ultra = models.filter((id) => /ultra/i.test(id));
  md.push(`Listed ${models.length} models at \`METERLESS_BASE_URL\`. Ultra-ish candidates:`, "");
  if (!ultra.length) md.push("- (none)");
  for (const id of ultra) md.push(`- \`${id}\``);
  md.push("");

  if (!ultra.length) {
    md.push("No Ultra lane listed; the Reporter stays on `meterless/auto` / Super VL. No change made.");
    writeOut(md.join("\n"));
    return;
  }

  // Probe each candidate with a tiny tool call.
  // Honest reachability: HTTP 200 with a receipt is NOT enough — if Nightshift
  // aliases the Ultra id to Super VL (what the local engine does today), the
  // Ultra lane isn't actually reached. We only count a probe as "reached"
  // when the receipt's `routed_model` normalises back to the requested id.
  const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } as const;
  const reached: string[] = [];
  const aliased: Array<{ id: string; routedTo: string }> = [];
  md.push("## Probe results", "");
  for (const id of ultra) {
    const started = Date.now();
    try {
      const probe = new Nightshift({ deepModel: id });
      const rc = await probe.callTool({
        messages: [{ role: "user", content: `Probe: reply with ok=true via submit_probe. (nonce=${Math.random().toString(36).slice(2)})` }],
        toolName: "submit_probe", description: "Probe tool.", schema: SCHEMA,
        parse: (a) => a as { ok: boolean }, lane: "deep", maxTokens: 4000, agent: "ultra_probe",
      });
      const ms = Date.now() - started;
      const routedId = normaliseModelId(rc.model);
      const requestedId = normaliseModelId(id);
      if (routedId === requestedId) {
        reached.push(id);
        md.push(`- ✅ \`${id}\` reached — ${ms} ms, routed_model=\`${rc.model}\`, receipt=\`${rc.receipt?.receipt_id ?? "n/a"}\``);
      } else {
        aliased.push({ id, routedTo: rc.model });
        md.push(`- ⚠️ \`${id}\` listed, but Nightshift routed the request to \`${rc.model}\` — Ultra not reached on this install. ${ms} ms, receipt=\`${rc.receipt?.receipt_id ?? "n/a"}\``);
      }
    } catch (err) {
      const ms = Date.now() - started;
      md.push(`- ❌ \`${id}\` — failed after ${ms} ms: ${(err as Error).message.slice(0, 240)}`);
    }
  }
  md.push("");

  if (!reached.length) {
    if (aliased.length) {
      md.push(`**Ultra not reached.** Nightshift accepts the Ultra id(s) ${aliased.map((a) => `\`${a.id}\``).join(", ")} but the receipt reports \`routed_model\` ≠ requested — the proxy aliases them to \`${aliased[0]!.routedTo}\` on this install. The Reporter stays on \`meterless/auto\` / Super VL.`, "");
      md.push("## Wiring", "", `No change is made automatically. If an Ultra lane is enabled later, set \`METERLESS_REPORTER_MODEL=<id>\` and re-run \`npm run probe:ultra\` to re-verify.`);
    } else {
      md.push("No Ultra model responded; Reporter stays on `meterless/auto`.");
    }
    writeOut(md.join("\n"));
    return;
  }
  const succeeded = reached;

  // Side-by-side Reporter sample on case-001 context.
  const pick = succeeded[0]!;
  const dir = resolvePath("output_examples");
  const report = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith("case-001-")).sort().pop() : undefined;
  if (!report) {
    md.push("No case-001 report in output_examples/ to use as a Reporter prompt; wiring is live via `METERLESS_REPORTER_MODEL`.", "");
    md.push(`Recommend: \`METERLESS_REPORTER_MODEL=${pick} npm run eval -- --cases case-001,case-002,case-003 --runs 1\`.`);
    writeOut(md.join("\n"));
    return;
  }
  const base = JSON.parse(readFileSync(join(dir, report), "utf8"));
  const evidenceText = (base.findings as Array<{ id: string; status: string; confidence: number; claim: string; attack: string[] }>)
    .slice(0, 10)
    .map((f) => `${f.id} [${f.status} ${f.confidence}] ${f.claim.slice(0, 180)} {${f.attack.join(",")}}`)
    .join("\n");
  const prompt = {
    system: `You write analyst-ready incident notes for a university SOC. The verdict is already decided: ${base.verdict} (confidence ${base.confidence}). Do not change it. Summary < 150 words, cite finding ids (F1…). Return a short JSON object {summary, actions, limitations}.`,
    user: `Case ${base.case_id} (${base.case_id}). Verified findings:\n${evidenceText}`,
  };

  md.push("## Side-by-side Reporter summary (case-001 recorded findings)", "");
  for (const [label, modelId] of [["Super VL (deep lane default)", "meterless/auto"], ["Ultra", pick]] as const) {
    const started = Date.now();
    try {
      const nx = new Nightshift({ deepModel: modelId });
      const rc = await nx.callTool({
        messages: [{ role: "system", content: prompt.system }, { role: "user", content: prompt.user }],
        toolName: "submit_note",
        description: "Submit the incident note.",
        schema: {
          type: "object",
          properties: { summary: { type: "string" }, actions: { type: "array", items: { type: "object", properties: { action: { type: "string" } }, required: ["action"] } }, limitations: { type: "array", items: { type: "string" } } },
          required: ["summary"],
        },
        parse: (a) => a as { summary: string; actions: Array<{ action: string }>; limitations: string[] }, lane: "deep", maxTokens: 4000, agent: "reporter",
      });
      const ms = Date.now() - started;
      md.push(`### ${label} (${modelId}) — ${ms} ms, routed_model=\`${rc.model}\``, "", "```", rc.value.summary, "```", "");
      if (rc.value.actions?.length) {
        md.push("Actions:", "");
        for (const a of rc.value.actions.slice(0, 5)) md.push(`- ${a.action}`);
        md.push("");
      }
    } catch (err) {
      md.push(`### ${label} — failed: ${(err as Error).message.slice(0, 240)}`, "");
    }
  }
  md.push("## Wiring", "", `Set \`METERLESS_REPORTER_MODEL=${pick}\` to route the Reporter call to Ultra. The Investigator path keeps using Super VL via \`meterless/auto\`.`);
  writeOut(md.join("\n"));
}

function writeOut(contents: string) {
  mkdirSync(resolvePath("evidence"), { recursive: true });
  writeFileSync(resolvePath("evidence", "ultra-probe.md"), contents);
  console.log(`wrote evidence/ultra-probe.md`);
}

/** Normalise a Nemotron/Meterless model id for strict-equality comparison. We
 *  strip leading provider prefixes and any trailing `-v<n>` versioning so that
 *  common aliases line up (e.g. `nvidia/llama-3.1-nemotron-ultra-253b-v1` and
 *  `llama-3.1-nemotron-ultra-253b` are treated as the same model). This is
 *  intentionally strict — the point is to catch Super-VL aliasing, not to
 *  gloss over it. */
function normaliseModelId(id: string | undefined): string {
  if (!id) return "";
  const base = id.toLowerCase().replace(/^nvidia\//, "").replace(/^meterless\//, "");
  return base.replace(/-v\d+$/, "");
}

main().catch((err) => { console.error(err); process.exit(1); });
