// Code-enforced evidence contract (SPEC §9i). Pure: no I/O except readQueryLog.
// A claim survives only if every sql_id it cites is in this run's append-only
// query log, every row_ref points at a row that query actually returned, and
// every ATT&CK id is on the local allow-list. Everything else is moved to
// rejected_claims with a reason, so the analyst sees what was dropped and why.
import { existsSync, readFileSync } from "node:fs";
import { ATTACK_ALLOWLIST, Verdict, type FindingT, type Report } from "./schema.ts";

export type QueryLogRecord = { sql_id: string; rows: number; status: "ok" | "error"; limit?: number };

export type ValidationIssue = { item: string; reason: string };

export function readQueryLog(path: string): QueryLogRecord[] {
  if (!existsSync(path)) return [];
  const out: QueryLogRecord[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as Partial<QueryLogRecord>;
      if (typeof e.sql_id === "string") out.push({ sql_id: e.sql_id, rows: Number(e.rows ?? 0), status: e.status === "error" ? "error" : "ok", limit: e.limit });
    } catch {
      // a torn line is not evidence
    }
  }
  return out;
}

/** sql_id → max rows seen in a successful execution. */
export function indexQueryLog(log: QueryLogRecord[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (const e of log) {
    if (e.status !== "ok") continue;
    idx.set(e.sql_id, Math.max(idx.get(e.sql_id) ?? 0, e.rows));
  }
  return idx;
}

export function checkFinding(f: FindingT, idx: Map<string, number>, allow: Set<string> = ATTACK_ALLOWLIST): string | null {
  if (!f.sql_ids.length) return "no sql_id cited";
  for (const id of f.sql_ids) {
    if (!idx.has(id)) return `sql_id ${id} not in this run's query log`;
  }
  for (const ref of f.row_refs) {
    const m = /^([0-9a-f]{12})#(\d+)$/.exec(ref);
    if (!m) return `malformed row_ref ${ref}`;
    const [, id, n] = m;
    if (!f.sql_ids.includes(id!)) return `row_ref ${ref} cites a query the finding does not list`;
    const rows = idx.get(id!);
    if (rows === undefined) return `row_ref ${ref} cites unknown sql_id`;
    if (Number(n) >= rows) return `row_ref ${ref} out of range (query returned ${rows} rows)`;
  }
  for (const t of f.attack) {
    if (!allow.has(t)) return `ATT&CK id ${t} not in allow-list`;
  }
  if (!(f.confidence >= 0 && f.confidence <= 1)) return `confidence ${f.confidence} outside [0,1]`;
  return null;
}

export function validateReport(report: Report, log: QueryLogRecord[], allow: Set<string> = ATTACK_ALLOWLIST): { report: Report; issues: ValidationIssue[] } {
  const idx = indexQueryLog(log);
  const issues: ValidationIssue[] = [];
  const rejected = [...report.rejected_claims];

  const findings: FindingT[] = [];
  for (const f of report.findings) {
    const why = checkFinding(f, idx, allow);
    if (why) {
      issues.push({ item: f.id, reason: why });
      rejected.push({ claim: f.claim, reason: `validator: ${why}` });
    } else findings.push(f);
  }

  const timeline = report.timeline.filter((t) => {
    if (!t.sql_id) { issues.push({ item: `timeline ${t.ts}`, reason: "timeline event has no sql_id" }); return false; }
    if (!idx.has(t.sql_id)) { issues.push({ item: `timeline ${t.ts}`, reason: `sql_id ${t.sql_id} not in query log` }); return false; }
    return true;
  });

  const actions = report.actions.map((a) => {
    const bad = a.attack.filter((t) => !allow.has(t));
    if (bad.length) issues.push({ item: `action "${a.action.slice(0, 40)}"`, reason: `dropped ATT&CK ids ${bad.join(",")}` });
    return { ...a, attack: a.attack.filter((t) => allow.has(t)) };
  });

  let verdict = report.verdict;
  let confidence = report.confidence;
  const limitations = [...report.limitations];
  if (!Verdict.safeParse(verdict).success) { issues.push({ item: "verdict", reason: `invalid verdict ${String(verdict)}` }); verdict = "escalate"; }
  if (!(confidence >= 0 && confidence <= 1)) { issues.push({ item: "confidence", reason: `confidence ${confidence} outside [0,1]` }); confidence = Math.min(1, Math.max(0, Number.isFinite(confidence) ? confidence : 0)); }

  // A contain verdict that lost all its evidence is not defensible.
  if (verdict === "contain" && findings.length === 0) {
    issues.push({ item: "verdict", reason: "contain without any surviving finding" });
    verdict = "escalate";
    limitations.push("Verdict downgraded to escalate: no finding survived citation checks.");
  }

  return { report: { ...report, verdict, confidence, findings, timeline, actions, rejected_claims: rejected, limitations }, issues };
}
