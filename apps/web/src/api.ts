import type { MarkovianSummary, Report, SavedRun, TraceEvent } from "./types.ts";

const base = "/api";

export async function fetchCases(): Promise<Array<{ id: string; upn: string; expected?: string; description?: string }>> {
  const r = await fetch(`${base}/cases`);
  if (!r.ok) throw new Error(`cases: HTTP ${r.status}`);
  const j = await r.json();
  return j.cases;
}

export async function fetchRuns(): Promise<SavedRun[]> {
  const r = await fetch(`${base}/runs`);
  if (!r.ok) throw new Error(`runs: HTTP ${r.status}`);
  const j = await r.json();
  return j.runs;
}

export async function fetchReport(id: string): Promise<Report> {
  const r = await fetch(`${base}/runs/${id}`);
  if (!r.ok) throw new Error(`run ${id}: HTTP ${r.status}`);
  return r.json();
}

export async function fetchTrace(id: string): Promise<TraceEvent[]> {
  const r = await fetch(`${base}/runs/${id}/trace`);
  if (!r.ok) return [];
  const txt = await r.text();
  return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l) as TraceEvent);
}

export async function fetchQueries(id: string): Promise<Array<{ sql_id: string; sql: string; rows: number; ms: number; ts: string; status: string }>> {
  const r = await fetch(`${base}/runs/${id}/queries`);
  if (!r.ok) return [];
  const txt = await r.text();
  return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export async function fetchMarkovian(id: string): Promise<MarkovianSummary | null> {
  const r = await fetch(`${base}/runs/${id}/markovian`);
  if (!r.ok) return null;
  return r.json();
}

export async function startRun(caseId: string, ablate?: { critic?: boolean; dq?: boolean; memory?: boolean }): Promise<{ run_id: string }> {
  const r = await fetch(`${base}/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ case_id: caseId, ablate }),
  });
  if (!r.ok) throw new Error(`start run: HTTP ${r.status}`);
  return r.json();
}

export async function approveRun(id: string, body: { analyst: string; action: string; note: string }): Promise<void> {
  const r = await fetch(`${base}/runs/${id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`approve: HTTP ${r.status}`);
}

export function subscribeStream(id: string, onEvent: (e: TraceEvent) => void, onError?: (err: Event) => void): () => void {
  const es = new EventSource(`${base}/runs/${id}/stream`);
  es.onmessage = (ev) => {
    try { onEvent(JSON.parse(ev.data) as TraceEvent); } catch { /* ignore malformed */ }
  };
  es.onerror = (err) => { onError?.(err); };
  return () => es.close();
}
