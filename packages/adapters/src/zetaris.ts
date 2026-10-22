// Zetaris REST adapter.
// Verified contract (notes/SPEC §10, .cursor/rules/zetaris-data.mdc):
//   POST {base}/sql-editor/sqls/run
//     headers Authorization: Bearer <key>, X-Org-ID: <id>, X-Request-ID: <uuid>
//     body {queryId, sql, source:"SqlEditor", limit}
//   success: {headers, data[[string]], total, timeUsed}
//   DDL success: {headers:["Result"], data:[], total:0}
//   error: HTTP 400 {msg:"<exception>"}
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { sqlId, type QueryLogEntry, type RunTrace } from "./trace.ts";

export type ZetarisRow = Record<string, string | number | null>;

export type ZetarisRawResponse = {
  headers: string[];
  data: string[][];
  total: number;
  timeUsed?: number;
};

export type ZetarisTypedResult = {
  sql_id: string;
  rows: ZetarisRow[];
  columns: string[];
  totalRaw: number;
  timeUsedMs?: number;
  rawStatus: number;
};

export class ZetarisError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly sqlId: string;
  constructor(status: number, detail: string, id: string) {
    super(`Zetaris ${status}: ${detail}`);
    this.name = "ZetarisError";
    this.status = status;
    this.detail = detail;
    this.sqlId = id;
  }
}

export type ZetarisOptions = {
  baseUrl?: string;
  apiKey?: string;
  orgId?: string;
  limit?: number;
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
  sampleMode?: boolean;
  sampleDir?: string;
  trace?: RunTrace;
  agent?: string;
  fetchFn?: typeof fetch;
};

const DEFAULT_LIMIT = 200;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 2;

export class Zetaris {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly orgId: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;
  private readonly sampleMode: boolean;
  private readonly sampleDir: string;
  readonly trace?: RunTrace;
  private readonly agent: string;
  private readonly maxConcurrency: number;
  private inflight = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(opts: ZetarisOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.ZETARIS_REST_URL ?? "http://localhost:8888/api/v1.0").replace(/\/+$/, "");
    this.apiKey = opts.apiKey ?? process.env.ZETARIS_API_KEY ?? "";
    this.orgId = opts.orgId ?? process.env.ZETARIS_ORG_ID ?? "1";
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sampleMode = opts.sampleMode ?? process.env.SAMPLE_MODE === "true";
    this.sampleDir = opts.sampleDir ?? resolvePath(process.cwd(), "data", "sample", "zetaris");
    this.trace = opts.trace;
    this.agent = opts.agent ?? "zetaris";
    this.maxConcurrency = opts.concurrency ?? 2;
    if (!this.sampleMode && !this.apiKey) {
      // Deferred: adapter still constructs, but requests will throw if run.
    }
  }

  async runSql(sql: string, opts?: { limit?: number; parentStep?: string }): Promise<ZetarisTypedResult> {
    const id = sqlId(sql);
    await this.acquire();
    const started = Date.now();
    try {
      if (this.sampleMode) {
        const sample = this.readSample(id);
        const typed = typeRows(sample);
        this.emitQueryLog({ sql_id: id, sql, rows: typed.rows.length, ms: Date.now() - started, status: "ok" });
        return { ...typed, sql_id: id, totalRaw: sample.total, timeUsedMs: sample.timeUsed, rawStatus: 200 };
      }
      const limit = opts?.limit ?? DEFAULT_LIMIT;
      let lastErr: unknown;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const raw = await this.callOnce(sql, limit);
          const typed = typeRows(raw);
          this.recordSample(id, raw);
          this.emitQueryLog({ sql_id: id, sql, rows: typed.rows.length, ms: Date.now() - started, status: "ok" });
          this.trace?.emit({ agent: this.agent, action: "query_zetaris", sql_id: id, rows: typed.rows.length, ms: Date.now() - started, status: "ok", retry_count: attempt });
          return { ...typed, sql_id: id, totalRaw: raw.total, timeUsedMs: raw.timeUsed, rawStatus: 200 };
        } catch (err) {
          lastErr = err;
          if (err instanceof ZetarisError && err.status >= 400 && err.status < 500) throw err;
          if (attempt >= this.retries) break;
          const backoff = Math.pow(2, attempt) * 1000;
          await sleep(backoff);
        }
      }
      this.emitQueryLog({ sql_id: id, sql, rows: 0, ms: Date.now() - started, status: "error" });
      this.trace?.emit({ agent: this.agent, action: "query_zetaris", sql_id: id, ms: Date.now() - started, status: "error", retry_count: this.retries });
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    } finally {
      this.release();
    }
  }

  private async callOnce(sql: string, limit: number): Promise<ZetarisRawResponse> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const requestId = randomUUID();
      const queryId = randomUUID();
      if (!this.apiKey) throw new Error("Zetaris API key missing (set ZETARIS_API_KEY)");
      const res = await this.fetchFn(`${this.baseUrl}/sql-editor/sqls/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "X-Org-ID": this.orgId,
          "X-Request-ID": requestId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ queryId, sql, source: "SqlEditor", limit }),
        signal: controller.signal,
      });
      const bodyText = await res.text();
      if (!res.ok) {
        let detail = bodyText;
        try {
          const parsed = JSON.parse(bodyText);
          if (parsed?.msg) detail = String(parsed.msg);
        } catch { /* keep raw */ }
        throw new ZetarisError(res.status, detail, sqlId(sql));
      }
      const parsed = JSON.parse(bodyText) as ZetarisRawResponse;
      return parsed;
    } finally {
      clearTimeout(t);
    }
  }

  private emitQueryLog(entry: Omit<QueryLogEntry, "ts"> & { ts?: string }) {
    this.trace?.recordQuery({ ...entry, ts: entry.ts ?? new Date().toISOString() });
  }

  private readSample(id: string): ZetarisRawResponse {
    const file = resolvePath(this.sampleDir, `${id}.json`);
    if (!existsSync(file)) {
      // Return an empty row set when no recording exists; let callers decide.
      return { headers: [], data: [], total: 0 };
    }
    return JSON.parse(readFileSync(file, "utf8")) as ZetarisRawResponse;
  }

  private recordSample(id: string, raw: ZetarisRawResponse) {
    if (process.env.ZETARIS_RECORD_SAMPLES !== "true") return;
    mkdirSync(this.sampleDir, { recursive: true });
    writeFileSync(resolvePath(this.sampleDir, `${id}.json`), JSON.stringify(raw), "utf8");
  }

  // ---- cooperative concurrency gate (default 2 in-flight)
  private acquire(): Promise<void> {
    if (this.inflight < this.maxConcurrency) {
      this.inflight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waitQueue.push(() => { this.inflight += 1; resolve(); }));
  }
  private release(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    const next = this.waitQueue.shift();
    if (next) next();
  }
}

export function typeRows(raw: ZetarisRawResponse): { rows: ZetarisRow[]; columns: string[] } {
  const columns = raw.headers ?? [];
  const rows: ZetarisRow[] = (raw.data ?? []).map((row) => {
    const obj: ZetarisRow = {};
    for (let i = 0; i < columns.length; i++) {
      const key = columns[i]!;
      const val = row[i];
      obj[key] = coerceValue(val, key);
    }
    return obj;
  });
  return { rows, columns };
}

function coerceValue(val: unknown, key: string): string | number | null {
  if (val === null || val === undefined) return null;
  const s = String(val);
  if (s === "" || s === "null") return null;
  const lowerKey = key.toLowerCase();
  if (/count|total|rows|duration|size|_record$/.test(lowerKey)) {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s) && !/^0\d/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n) && s.length < 17) return n;
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default Zetaris;
