// Markovian long sweep. When the Investigator sees a password-spray source
// (spray_source_for finding), we page the IP's failures through the Meterless
// Markovian engine so the Investigator can characterise the whole roster
// without stuffing every row into one prompt. Each chunk fetches one page via
// Zetaris and asks the fast lane to extract SUSPECT:<upn> lines; carryover
// accumulates the roster. Nightshift receipts give us measured tokens so the
// resulting MarkovianRun carries tokenLabel="measured".
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Markovian, type MarkovianRun, type StepFn } from "@whytrace/markovian";
import type { Nightshift, RunTrace, Zetaris } from "@whytrace/adapters";
import { queryFor } from "./sql-catalogue.ts";
import { FindingIds, toMs } from "./investigator.ts";
import type { FindingT } from "./schema.ts";

export type SprayWindow = { from: string; to: string };

export type SprayMarkovianInput = {
  caseId: string;
  upn: string;
  ip: string;
  firstTs: string;
  lastTs: string;
  memoryContext?: string;
};

export type SprayMarkovianResult = {
  run: MarkovianRun;
  victims: string[];
  windows: SprayWindow[];
  measuredTokensIn: number;
  measuredTokensOut: number;
  modelCalls: number;
  findings: FindingT[];
};

/** Split [firstTs, lastTs] into evenly-sized windows. Clamps to ≥1 window and ≤maxWindows. */
export function buildWindows(firstTs: string, lastTs: string, maxWindows = 24): SprayWindow[] {
  const start = toMs(firstTs);
  const end = toMs(lastTs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return [{ from: firstTs, to: new Date(Number.isFinite(start) ? start + 60_000 : Date.now()).toISOString() }];
  }
  // One window every ~2 minutes, capped at maxWindows and ≥ 2 windows for a sweep.
  const totalMs = end - start;
  const target = Math.min(maxWindows, Math.max(2, Math.ceil(totalMs / (2 * 60_000))));
  const step = Math.ceil(totalMs / target);
  const out: SprayWindow[] = [];
  for (let i = 0; i < target; i++) {
    const from = new Date(start + i * step).toISOString();
    const to = new Date(Math.min(end + 1_000, start + (i + 1) * step)).toISOString();
    out.push({ from, to });
  }
  return out;
}

const SUSPECT_RE = /SUSPECT:\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)(?:\s+count=(\d+))?/gi;

export function parseSuspects(carryover: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of carryover.matchAll(SUSPECT_RE)) {
    const upn = m[1]!.toLowerCase();
    const count = Number(m[2] ?? 1);
    map.set(upn, (map.get(upn) ?? 0) + count);
  }
  return map;
}

export type SprayMarkovianDeps = {
  zetaris: Pick<Zetaris, "runSql">;
  nightshift: Pick<Nightshift, "chat">;
  trace: RunTrace;
};

export async function runSprayMarkovian(deps: SprayMarkovianDeps, input: SprayMarkovianInput, ids: FindingIds): Promise<SprayMarkovianResult> {
  const windows = buildWindows(input.firstTs, input.lastTs);
  const historyDir = join(deps.trace.rootDir, "markovian-history");
  const markovian = new Markovian({ historyDir, chunkConfig: { chunkSize: 8000, maxChunks: Math.max(2, Math.min(24, windows.length + 1)), carryoverTokens: 800, overlapTokens: 0 } });
  let measuredTokensIn = 0;
  let measuredTokensOut = 0;
  let modelCalls = 0;
  const sqlIds = new Set<string>();
  const perStep: Array<{ step: number; sql_id: string; rows: number; receipt_id?: string; routed_model?: string; tokens_in?: number; tokens_out?: number }> = [];

  const stepFn: StepFn = async ({ step, carryover }) => {
    if (step > windows.length) return { content: "[TASK_COMPLETE]" };
    const w = windows[step - 1]!;
    const sql = queryFor("spray_failures_window", { ip: input.ip, from: w.from, to: w.to }).sql;
    const r = await deps.zetaris.runSql(sql, { limit: 200 });
    sqlIds.add(r.sql_id);
    deps.trace.emit({ agent: "markovian", action: "sweep_page", sql_id: r.sql_id, rows: r.rows.length, input_summary: `page ${step}/${windows.length} ${w.from}→${w.to}`, status: "ok" });
    const rowsText = r.rows.map((row) => `${row.ts} ${row.upn} ${row.result}`).join("\n") || "(no rows)";
    const sys = "You are a SOC assistant extracting password-spray victims. Return SUSPECT lines, one per unique upn seen as a failure in this slice, in the form: SUSPECT:<upn> count=<n>. Do not restate upns already in carryover; only add new ones or increment counts.";
    const user = `[CARRYOVER]\n${carryover || "(empty)"}\n\n[PAGE ${step} ${w.from} → ${w.to}, ip ${input.ip}]\n${rowsText}\n\nList new or updated SUSPECT lines; nothing else.`;
    let text = "";
    try {
      const chat = await deps.nightshift.chat({
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        lane: "fast",
        maxTokens: 2000,
        agent: "markovian",
      });
      modelCalls += 1;
      text = chat.text;
      const u = chat.receipt?.usage;
      if (u) { measuredTokensIn += Number(u.input_tokens ?? 0); measuredTokensOut += Number(u.output_tokens ?? 0); }
      perStep.push({ step, sql_id: r.sql_id, rows: r.rows.length, receipt_id: chat.receipt?.receipt_id, routed_model: chat.model, tokens_in: Number(u?.input_tokens ?? 0), tokens_out: Number(u?.output_tokens ?? 0) });
    } catch (err) {
      // Deterministic fallback keeps the sweep bounded even when the model is unavailable.
      const seen = new Set<string>();
      for (const row of r.rows) { const u = String(row.upn ?? "").toLowerCase(); if (u && !seen.has(u)) { seen.add(u); text += `SUSPECT:${u} count=1\n`; } }
      deps.trace.emit({ agent: "markovian", action: "step_model_degraded", status: "degraded", output_summary: (err as Error).message.slice(0, 160) });
      perStep.push({ step, sql_id: r.sql_id, rows: r.rows.length });
    }
    if (step === windows.length) text += "\n[TASK_COMPLETE]";
    return { content: text };
  };

  const goal = `Enumerate the full list of UPNs targeted by password-spray source ${input.ip} between ${input.firstTs} and ${input.lastTs}.`;
  const run = await markovian.run({ goal, stepFn, memoryContext: input.memoryContext, reflect: false });
  if (measuredTokensIn + measuredTokensOut > 0) {
    (run as { tokenLabel: "estimated" | "measured" }).tokenLabel = "measured";
    (run as { totalTokensUsed: number }).totalTokensUsed = measuredTokensIn + measuredTokensOut;
  }

  const suspects = parseSuspects(run.output);
  const victims = [...suspects.keys()].sort();
  const findings: FindingT[] = [];
  if (victims.length) {
    findings.push({
      id: ids.next(),
      hypothesis_id: "H-spray",
      claim: `Password-spray roster from ${input.ip} (Markovian sweep across ${windows.length} time window(s)): ${victims.length} unique UPNs failed; this account appears in the roster.`,
      status: "LIKELY",
      sql_ids: [...sqlIds],
      row_refs: [],
      attack: ["T1110.003"],
      confidence: 0.7,
      kind: "spray_roster",
      entity_ids: [`account:idp:${input.upn}`, `ip:net:${input.ip}`],
      facts: { ip: input.ip, victims: victims.join(","), unique_victims: victims.length, windows: windows.length, token_label: run.tokenLabel, measured_tokens_total: measuredTokensIn + measuredTokensOut, model_calls: modelCalls },
    });
  }

  // Per-run engine log that the Reporter + DAY1C can cite.
  const logPath = join(deps.trace.rootDir, "markovian.json");
  const summary = {
    engine: "meterless-markovian",
    goal,
    windows,
    chunkConfig: run.chunkConfig,
    status: run.status,
    tokenLabel: run.tokenLabel,
    totalTokensUsed: run.totalTokensUsed,
    efficiencyPercent: run.efficiencyPercent,
    durationMs: run.durationMs,
    measured: { tokens_in: measuredTokensIn, tokens_out: measuredTokensOut, model_calls: modelCalls },
    sql_ids: [...sqlIds],
    per_step: perStep,
    victims,
    victim_count: victims.length,
  };
  try { writeFileSync(logPath, JSON.stringify(summary, null, 2), "utf8"); } catch { /* best-effort */ }
  deps.trace.emit({ agent: "markovian", action: "sweep_complete", output_summary: `${windows.length} pages, ${victims.length} victims, tokens ${run.totalTokensUsed} (${run.tokenLabel}), efficiency ${run.efficiencyPercent.toFixed(1)}%`, status: run.status === "errored" ? "degraded" : "ok" });

  return { run, victims, windows, measuredTokensIn, measuredTokensOut, modelCalls, findings };
}
