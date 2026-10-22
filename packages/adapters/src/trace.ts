// Append-only trace + queryLog writer. Each run_id gets its own folder in logs/.
import { appendFileSync, mkdirSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type TraceEvent = {
  ts: string;
  run_id: string;
  step_id: string;
  parent_id?: string;
  agent: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  sql_id?: string;
  rows?: number;
  receipt_id?: string;
  routed_model?: string;
  lane?: string;
  confidence?: number;
  status: "ok" | "degraded" | "error";
  retry_count?: number;
  ms?: number;
  [extra: string]: unknown;
};

export type QueryLogEntry = {
  sql_id: string;
  sql: string;
  rows: number;
  ms: number;
  ts: string;
  status: "ok" | "error";
};

export class RunTrace {
  readonly run_id: string;
  readonly rootDir: string;
  private readonly traceFile: string;
  private readonly queryFile: string;
  private seq = 0;

  constructor(opts: { run_id?: string; logsRoot?: string } = {}) {
    this.run_id = opts.run_id ?? ulidish();
    const base = opts.logsRoot ?? resolvePath(process.cwd(), "logs");
    this.rootDir = resolvePath(base, this.run_id);
    mkdirSync(this.rootDir, { recursive: true });
    this.traceFile = resolvePath(this.rootDir, "trace.jsonl");
    this.queryFile = resolvePath(this.rootDir, "queries.jsonl");
  }

  stepId(prefix = "s"): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString().padStart(4, "0")}`;
  }

  emit(event: Omit<TraceEvent, "run_id" | "ts" | "step_id"> & { step_id?: string }): TraceEvent {
    const step_id = event.step_id ?? this.stepId();
    const full: TraceEvent = { ...event, run_id: this.run_id, step_id, ts: new Date().toISOString() };
    appendFileSync(this.traceFile, JSON.stringify(full) + "\n", "utf8");
    return full;
  }

  recordQuery(entry: QueryLogEntry) {
    appendFileSync(this.queryFile, JSON.stringify(entry) + "\n", "utf8");
  }

  files(): { trace: string; queries: string } {
    return { trace: this.traceFile, queries: this.queryFile };
  }
}

export function sqlId(sql: string): string {
  const normalised = sql.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalised).digest("hex").slice(0, 12);
}

// Monotonic, URL-safe id (crockford-ish). Not strictly ULID.
function ulidish(): string {
  const ts = Date.now().toString(36);
  const rand = randomUUID().replace(/-/g, "").slice(0, 10);
  return `${ts}_${rand}`;
}
