// Fastify server for the Analyst Console. Reads saved runs from output_examples/
// and logs/, streams live trace events over SSE, exposes POST /run to launch an
// investigation and POST /runs/:id/approve to persist an audit entry. The real
// Nightshift / Zetaris adapters do the work; nothing is faked here.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, appendFileSync, watch } from "node:fs";
import { createHash } from "node:crypto";
import { basename, resolve as resolvePath, join } from "node:path";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Nightshift, RunTrace, Zetaris } from "@whytrace/adapters";
import { applyAnalystFeedback, CaseMemory, explain, extractCitedFindingIds, faithfulness, investigate, listDemoCases, type Report, Verdict } from "@whytrace/agents";

const PORT = Number(process.env.PORT ?? 8000);
const ROOT = resolvePath(process.cwd());
const OUTPUT_DIR = resolvePath(ROOT, "output_examples");
const LOG_DIR = resolvePath(ROOT, "logs");
const AUDIT_DIR = resolvePath(ROOT, "logs", "audit");

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

type SavedRun = { id: string; case_id: string; verdict: string; confidence: number; file: string; ts: string };

function listSavedRuns(): SavedRun[] {
  if (!existsSync(OUTPUT_DIR)) return [];
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  const out: SavedRun[] = [];
  for (const file of files) {
    try {
      const full = JSON.parse(readFileSync(join(OUTPUT_DIR, file), "utf8")) as Partial<Report>;
      if (!full.run_id || !full.case_id || !full.verdict) continue;
      const st = statSync(join(OUTPUT_DIR, file));
      out.push({ id: full.run_id, case_id: full.case_id, verdict: String(full.verdict), confidence: Number(full.confidence ?? 0), file, ts: st.mtime.toISOString() });
    } catch { /* skip malformed */ }
  }
  return out.sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

type ActiveRun = {
  run_id: string;
  case_id: string;
  started_at: string;
  trace: RunTrace;
  listeners: Set<(line: string) => void>;
  done: boolean;
  verdict?: string;
  error?: string;
};

const ACTIVE = new Map<string, ActiveRun>();

function startRun(caseId: string, opts: { ablate?: { critic?: boolean; dq?: boolean; memory?: boolean } }): ActiveRun {
  const trace = new RunTrace();
  const run_id = trace.run_id;
  const entry: ActiveRun = { run_id, case_id: caseId, started_at: new Date().toISOString(), trace, listeners: new Set(), done: false };
  ACTIVE.set(run_id, entry);
  // Tail the trace file so SSE subscribers see every event as it's written.
  const traceFile = trace.files().trace;
  // Ensure the file exists so the watcher attaches reliably.
  try { if (!existsSync(traceFile)) writeFileSync(traceFile, "", "utf8"); } catch { /* best effort */ }
  let pos = 0;
  const push = () => {
    try {
      const buf = readFileSync(traceFile, "utf8");
      if (buf.length <= pos) return;
      const chunk = buf.slice(pos);
      pos = buf.length;
      for (const line of chunk.split("\n")) if (line.trim()) for (const l of entry.listeners) l(line);
    } catch { /* file may be rotating */ }
  };
  const watcher = watch(trace.rootDir, { persistent: false }, (_evt, filename) => {
    if (filename && basename(traceFile) === String(filename)) push();
  });
  const timer = setInterval(push, 500);

  (async () => {
    try {
      const zetaris = new Zetaris({ trace, agent: "investigator", caseId });
      const nightshift = new Nightshift({ trace, caseId });
      if (process.env.SAMPLE_MODE === "true") trace.emit({ agent: "orchestrator", action: "replay_mode", status: "ok", output_summary: `Replay recorded run from samples/${caseId}/` });
      const memory = opts.ablate?.memory === false ? null : new CaseMemory({ persistDir: resolvePath(ROOT, "logs", "hmem") });
      const report = await investigate({ caseId, trace, zetaris, nightshift, memory, ablate: opts.ablate });
      mkdirSync(OUTPUT_DIR, { recursive: true });
      const outPath = resolvePath(OUTPUT_DIR, `${caseId}-${run_id}.json`);
      writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
      entry.verdict = report.verdict;
    } catch (err) {
      entry.error = (err as Error).message.slice(0, 400);
    } finally {
      entry.done = true;
      push();
      clearInterval(timer);
      try { watcher.close(); } catch { /* ignore */ }
      // Flush a terminal SSE event so clients can close their connection.
      for (const l of entry.listeners) l(JSON.stringify({ agent: "orchestrator", action: "done", verdict: entry.verdict ?? "error", error: entry.error, status: entry.error ? "error" : "ok" }));
    }
  })();

  return entry;
}

/** Compute `explanation` for a report that was saved before DAY5 wired the
 *  payload into the orchestrator. The policy context is reconstructed from
 *  the report's own fields (rejected count, DQ invalid rows, decided_by →
 *  degraded, core-sources default). Pure function — no model calls. */
function enrichExplanation(r: Report): Report {
  if (r.explanation || !Array.isArray(r.findings)) return r;
  const rejectedCount = r.rejected_claims?.length ?? 0;
  const dqConflicts: string[] = [];
  for (const d of r.dq ?? []) if (d.invalid > 0) dqConflicts.push(`DQ ${d.rule} failing for ${d.table}${d.scope ? `@${d.scope}` : ""} (invalid=${d.invalid})`);
  const degraded = r.decided_by === "policy_fallback";
  const checkedSources = ["signin_event", "mail_event"];
  const ex = explain({ findings: r.findings, rejectedCount, dqConflicts, degraded, checkedSources });
  const narrative = [r.summary ?? "", ...(r.actions ?? []).map((a) => a.action)].join("\n");
  const cited = extractCitedFindingIds(narrative);
  const faith = ex.attribution.length ? faithfulness(ex.attribution, cited, 3) : null;
  return {
    ...r,
    explanation: {
      verdict: ex.verdict,
      confidence: ex.confidence,
      mode: ex.mode,
      n_findings: ex.n_findings,
      samples_used: ex.samples_used,
      attribution: ex.attribution,
      counterfactuals: ex.counterfactuals,
      contrastive: ex.contrastive,
      faithfulness: faith ? { ...faith, revised: false, score_before_revision: null, precision_before_revision: null, kendall_tau_before_revision: null } : null,
    },
  };
}

async function readReport(id: string): Promise<Report | null> {
  if (!existsSync(OUTPUT_DIR)) return null;
  const files = readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json"));
  // Fast path: filename encodes the run_id (default name pattern case-xxx-<id>.json).
  for (const f of files) {
    if (f.includes(`-${id}`)) {
      try { return enrichExplanation(JSON.parse(readFileSync(join(OUTPUT_DIR, f), "utf8")) as Report); } catch { /* keep scanning */ }
    }
  }
  // Fallback: a sample has been renamed (e.g. canonical demo file). Match on
  // the file's run_id field so renamed exemplars still resolve by id.
  for (const f of files) {
    try {
      const r = JSON.parse(readFileSync(join(OUTPUT_DIR, f), "utf8")) as Partial<Report>;
      if (r.run_id === id) return enrichExplanation(r as Report);
    } catch { /* skip malformed */ }
  }
  return null;
}

function readLogFile(id: string, name: string): string | null {
  const path = join(LOG_DIR, id, name);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

// Canonical-JSON SHA-256 of a Zetaris sample response's returned rows. The
// sample file has {headers, data[], total, timeUsed}; we hash only the headers
// + the full `data` payload (not timeUsed, which jitters per re-run) via a
// deterministic key sort so the same row set always produces the same digest.
// Returns `null` when no sample file is on disk — honest about the limit.
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson((value as Record<string, unknown>)[k])).join(",") + "}";
}

function sampleSha256For(caseId: string | undefined, sqlId: string): { sha256: string; total: number } | null {
  if (!caseId) return null;
  const path = resolvePath(ROOT, "samples", caseId, "zetaris", `${sqlId}.json`);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as { headers?: unknown; data?: unknown; total?: number };
    const canon = canonicalJson({ headers: raw.headers ?? [], data: raw.data ?? [] });
    const sha = createHash("sha256").update(canon, "utf8").digest("hex");
    return { sha256: sha, total: typeof raw.total === "number" ? raw.total : Array.isArray(raw.data) ? (raw.data as unknown[]).length : 0 };
  } catch {
    return null;
  }
}

function caseIdForRun(runId: string): string | undefined {
  if (!existsSync(OUTPUT_DIR)) return undefined;
  for (const f of readdirSync(OUTPUT_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const r = JSON.parse(readFileSync(join(OUTPUT_DIR, f), "utf8")) as Partial<Report>;
      if (r.run_id === runId && typeof r.case_id === "string") return r.case_id;
    } catch { /* skip */ }
  }
  return undefined;
}

async function main() {
  loadDotenv();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" } });

  // Minimal CORS — only localhost dev clients need to reach this port.
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET,POST,OPTIONS");
    reply.header("access-control-allow-headers", "content-type");
    return payload;
  });
  app.options("/*", async (_req, reply) => { reply.code(204).send(); });

  app.get("/cases", async () => ({ cases: listDemoCases() }));

  app.get("/runs", async () => ({ runs: listSavedRuns() }));

  app.get<{ Params: { id: string } }>("/runs/:id", async (req, reply) => {
    const r = await readReport(req.params.id);
    if (!r) return reply.code(404).send({ error: "run not found" });
    return r;
  });

  app.get<{ Params: { id: string } }>("/runs/:id/trace", async (req, reply) => {
    const t = readLogFile(req.params.id, "trace.jsonl");
    if (t === null) return reply.code(404).send({ error: "trace not found" });
    reply.type("application/x-ndjson").send(t);
    return reply;
  });

  app.get<{ Params: { id: string } }>("/runs/:id/queries", async (req, reply) => {
    const q = readLogFile(req.params.id, "queries.jsonl");
    if (q === null) return reply.code(404).send({ error: "queries not found" });
    // Evidence provenance: enrich each row with sha256(canonical JSON of the
    // Zetaris result's {headers, data}) when the recorded sample is on disk.
    // Null when the sample has not been recorded — honest about the limit.
    const caseId = caseIdForRun(req.params.id);
    const enriched = q
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const row = JSON.parse(line) as { sql_id?: string; rows?: number };
          const prov = row.sql_id ? sampleSha256For(caseId, row.sql_id) : null;
          return JSON.stringify({ ...row, sha256: prov?.sha256 ?? null, rows_total: prov?.total ?? row.rows ?? null });
        } catch {
          return line;
        }
      })
      .join("\n");
    reply.type("application/x-ndjson").send(enriched);
    return reply;
  });

  app.get<{ Params: { id: string } }>("/runs/:id/markovian", async (req, reply) => {
    const m = readLogFile(req.params.id, "markovian.json");
    if (m === null) return reply.code(404).send({ error: "no markovian run for this id" });
    return JSON.parse(m);
  });

  app.get<{ Params: { id: string } }>("/runs/:id/stream", async (req, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "access-control-allow-origin": "*",
    });
    const active = ACTIVE.get(req.params.id);
    if (active) {
      // Live tail
      const existing = readFileSync(active.trace.files().trace, "utf8").split("\n").filter(Boolean);
      for (const line of existing) reply.raw.write(`data: ${line}\n\n`);
      const listener = (line: string) => reply.raw.write(`data: ${line}\n\n`);
      active.listeners.add(listener);
      req.raw.on("close", () => active.listeners.delete(listener));
      // Keep-alive comment every 15 s
      const beat = setInterval(() => reply.raw.write(":beat\n\n"), 15_000);
      req.raw.on("close", () => clearInterval(beat));
    } else {
      // Replay a saved trace (clearly labelled)
      const t = readLogFile(req.params.id, "trace.jsonl");
      if (t === null) { reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: "trace not found" })}\n\n`); reply.raw.end(); return reply; }
      reply.raw.write(`event: replay\ndata: ${JSON.stringify({ mode: "replay", run_id: req.params.id })}\n\n`);
      const lines = t.split("\n").filter(Boolean);
      let i = 0;
      const flush = () => {
        if (i >= lines.length) { reply.raw.write(`event: end\ndata: {}\n\n`); reply.raw.end(); return; }
        reply.raw.write(`data: ${lines[i]!}\n\n`);
        i += 1;
        setTimeout(flush, 25);
      };
      flush();
    }
    return reply;
  });

  app.post<{ Body: { case_id?: string; ablate?: { critic?: boolean; dq?: boolean; memory?: boolean } } }>("/run", async (req, reply) => {
    const caseId = req.body?.case_id ?? "";
    if (!listDemoCases().some((c) => c.id === caseId)) return reply.code(400).send({ error: `unknown case: ${caseId}` });
    const ablate = req.body?.ablate ?? {};
    const entry = startRun(caseId, { ablate });
    return { run_id: entry.run_id, started_at: entry.started_at, case_id: caseId };
  });

  app.post<{ Params: { id: string }; Body: { analyst?: string; verdict?: string; rejected?: string[]; confirmed?: string[]; note?: string } }>("/runs/:id/feedback", async (req, reply) => {
    const report = await readReport(req.params.id);
    if (!report) return reply.code(404).send({ error: "run not found" });
    const analyst = req.body?.analyst ?? "osman.cetlenbik@aegean.edu";
    let verdictCorrection = undefined as ReturnType<typeof Verdict.safeParse>["data"];
    if (req.body?.verdict) {
      const parsed = Verdict.safeParse(req.body.verdict);
      if (!parsed.success) return reply.code(400).send({ error: `bad verdict: ${req.body.verdict}` });
      verdictCorrection = parsed.data;
    }
    const memory = new CaseMemory({ persistDir: resolvePath(ROOT, "logs", "hmem") });
    const ids = applyAnalystFeedback(memory, {
      report,
      verdictCorrection,
      rejectedFindingIds: req.body?.rejected ?? [],
      confirmedFindingIds: req.body?.confirmed ?? [],
      analyst,
      note: req.body?.note,
    });
    mkdirSync(AUDIT_DIR, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      run_id: req.params.id,
      case_id: report.case_id,
      analyst,
      action: "feedback",
      verdict_correction: verdictCorrection ?? null,
      rejected: req.body?.rejected ?? [],
      confirmed: req.body?.confirmed ?? [],
      lesson_ids: ids,
      note: req.body?.note ?? "",
    };
    appendFileSync(join(AUDIT_DIR, "feedback.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    return { ok: true, lesson_ids: ids, entry };
  });

  app.post<{ Params: { id: string }; Body: { analyst?: string; action?: string; note?: string } }>("/runs/:id/approve", async (req, reply) => {
    const report = await readReport(req.params.id);
    if (!report) return reply.code(404).send({ error: "run not found" });
    mkdirSync(AUDIT_DIR, { recursive: true });
    const entry = {
      ts: new Date().toISOString(),
      run_id: req.params.id,
      case_id: report.case_id,
      verdict: report.verdict,
      action: req.body?.action ?? "approve",
      analyst: req.body?.analyst ?? "osman.cetlenbik@aegean.edu",
      note: req.body?.note ?? "",
    };
    appendFileSync(join(AUDIT_DIR, "approvals.jsonl"), JSON.stringify(entry) + "\n", "utf8");
    return { ok: true, entry };
  });

  app.get("/healthz", async () => ({ ok: true, service: "whytrace-api", runs: listSavedRuns().length, active: ACTIVE.size }));

  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`WhyTrace API ready on http://0.0.0.0:${PORT}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
