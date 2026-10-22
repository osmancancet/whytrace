// Meterless Nightshift adapter.
// Verified contract (notes/SPEC §12, .cursor/rules/nightshift-runtime.mdc).
// Reads the runtime token from env METERLESS_RUNTIME_TOKEN or from the
// Nightshift state directory's proxy-token file. Every call carries
// `meterless-app` and `meterless-scope` headers, has `/no_think` system
// message prepended for structured steps, uses tool calling for schema
// validation and respects the 180 s timeout + 2 / 4 / 8 s retry backoff.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { resolve as resolvePath } from "node:path";
import type { RunTrace } from "./trace.ts";

export type NightshiftMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type NightshiftTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type MeterlessReceipt = {
  receipt_id?: string;
  decision_id?: string;
  requested_model?: string;
  routed_model?: string;
  winning_route?: { model?: string; label?: string; provider?: string; kind?: string; tier?: string };
  phases?: Array<{ phase: string; model: string; ms: number; tokensIn: number; tokensOut: number; outputTps?: number }>;
  usage?: { input_tokens: number; output_tokens: number; latency_ms?: number };
  cost?: Record<string, unknown>;
  privacy?: Record<string, unknown>;
  cache?: Record<string, unknown>;
};

export type NightshiftResponse = {
  text: string;
  toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>;
  receipt?: MeterlessReceipt;
  rawStatus: number;
  latencyMs: number;
  retryCount: number;
  model: string;
  lane: "deep" | "fast";
};

export type NightshiftOptions = {
  baseUrl?: string;
  token?: string;
  app?: string;
  deepModel?: string;
  fastModel?: string;
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
  fetchFn?: typeof fetch;
  sampleMode?: boolean;
  sampleDir?: string;
  trace?: RunTrace;
};

export type ChatOpts = {
  messages: NightshiftMessage[];
  lane?: "deep" | "fast";
  tools?: NightshiftTool[];
  toolChoice?: "auto" | { type: "function"; function: { name: string } };
  maxTokens?: number;
  temperature?: number;
  agent?: string;
  parentStep?: string;
  abortSignal?: AbortSignal;
  /** Allow one retry on `meterless/fast` if the deep lane fails after retries. Default: true. */
  routeFallback?: boolean;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 3;
const DEFAULT_MAX_TOKENS = 2000;

export class Nightshift {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly app: string;
  private readonly deepModel: string;
  private readonly fastModel: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;
  readonly sampleMode: boolean;
  private readonly sampleDir: string;
  private readonly trace?: RunTrace;
  private readonly concurrency: number;
  private inflight = 0;
  private readonly wait: Array<() => void> = [];

  constructor(opts: NightshiftOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.METERLESS_BASE_URL ?? "http://127.0.0.1:8088/v1").replace(/\/+$/, "");
    this.token = opts.token ?? readRuntimeToken();
    this.app = opts.app ?? process.env.METERLESS_APP ?? "whytrace";
    this.deepModel = opts.deepModel ?? process.env.MODEL_DEEP ?? "meterless/auto";
    this.fastModel = opts.fastModel ?? process.env.MODEL_FAST ?? "meterless/fast";
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sampleMode = opts.sampleMode ?? process.env.SAMPLE_MODE === "true";
    this.sampleDir = opts.sampleDir ?? resolvePath(process.cwd(), "data", "sample", "nightshift");
    this.trace = opts.trace;
    this.concurrency = opts.concurrency ?? 2;
  }

  async testConnection(): Promise<"online" | "unauthorized" | "offline"> {
    try {
      const res = await this.fetchFn(`${this.baseUrl}/models`, {
        method: "GET",
        headers: this.baseHeaders(false),
      });
      if (res.status === 401 || res.status === 403) return "unauthorized";
      if (!res.ok) return "offline";
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      if (!body?.data?.some((m) => m.id.startsWith("meterless/"))) return "offline";
      return "online";
    } catch {
      return "offline";
    }
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetchFn(`${this.baseUrl}/models`, { method: "GET", headers: this.baseHeaders(false) });
    if (!res.ok) throw new Error(`Nightshift /models HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    return (body.data ?? []).map((m) => m.id);
  }

  async warmUp(): Promise<void> {
    try {
      await this.chat({ messages: [{ role: "user", content: "ready" }], lane: "fast", maxTokens: 32, agent: "warmup" });
    } catch {
      /* ignore */
    }
  }

  async chat(opts: ChatOpts): Promise<NightshiftResponse> {
    await this.acquire();
    const started = Date.now();
    const lane: "deep" | "fast" = opts.lane ?? "deep";
    const model = lane === "deep" ? this.deepModel : this.fastModel;
    const agent = opts.agent ?? "model";
    const messages = this.ensureNoThink(opts.messages);
    const routeFallback = opts.routeFallback !== false;
    try {
      if (this.sampleMode) {
        const digest = chatDigest(messages, opts.tools, lane);
        const sample = this.readSample(digest);
        this.trace?.emit({ agent, action: "chat_nightshift", lane, routed_model: sample.model, receipt_id: sample.receipt?.receipt_id, ms: Date.now() - started, status: "ok", retry_count: 0 });
        return sample;
      }
      let lastErr: unknown;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const resp = await this.callOnce({ messages, lane, model, tools: opts.tools, toolChoice: opts.toolChoice, maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, temperature: opts.temperature, abortSignal: opts.abortSignal });
          resp.retryCount = attempt;
          this.recordSample(resp, messages, opts.tools, lane);
          this.trace?.emit({ agent, action: "chat_nightshift", lane, routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, ms: Date.now() - started, status: "ok", retry_count: attempt });
          return resp;
        } catch (err) {
          lastErr = err;
          if (attempt >= this.retries) break;
          const backoff = [2000, 4000, 8000][attempt] ?? 8000;
          await sleep(backoff);
        }
      }
      // Route fallback: if the deep lane failed every retry, try one more call on the
      // fast lane (same Nemotron provider, lower TTFT). The caller sees routed_model
      // from the receipt so provenance stays honest. Reporter/Risk-Gate etc. use this
      // transparently; sweep/Markovian steps already run on fast and skip the fallback.
      if (lane === "deep" && routeFallback) {
        try {
          const resp = await this.callOnce({ messages, lane: "fast", model: this.fastModel, tools: opts.tools, toolChoice: opts.toolChoice, maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, temperature: opts.temperature, abortSignal: opts.abortSignal });
          resp.retryCount = this.retries + 1;
          this.recordSample(resp, messages, opts.tools, "fast");
          this.trace?.emit({ agent, action: "chat_nightshift_fallback", lane: "fast", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, ms: Date.now() - started, status: "ok", retry_count: this.retries + 1, output_summary: "deep lane degraded, retried on fast lane" });
          return resp;
        } catch (fallbackErr) {
          lastErr = fallbackErr;
        }
      }
      this.trace?.emit({ agent, action: "chat_nightshift", lane, routed_model: model, ms: Date.now() - started, status: "degraded", retry_count: this.retries, output_summary: lastErr instanceof Error ? lastErr.message.slice(0, 200) : undefined });
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    } finally {
      this.release();
    }
  }

  /** Health probe: /models online + one tiny tool-call probe. */
  async probe(): Promise<{ status: "online" | "unauthorized" | "offline" | "degraded"; detail?: string; routed_model?: string; receipt_id?: string }> {
    const conn = await this.testConnection();
    if (conn !== "online") return { status: conn };
    try {
      const resp = await this.callTool<{ ok: boolean }>({
        messages: [{ role: "user", content: "Probe: reply with ok=true via submit_probe." }],
        toolName: "submit_probe",
        description: "Probe tool.",
        schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        lane: "fast",
        maxTokens: 128,
        agent: "probe",
        parse: (a) => ({ ok: Boolean(a.ok ?? true) }),
      });
      return { status: "online", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id };
    } catch (err) {
      return { status: "degraded", detail: (err as Error).message.slice(0, 200) };
    }
  }

  async callTool<T>(opts: {
    messages: NightshiftMessage[];
    toolName: string;
    schema: Record<string, unknown>;
    description?: string;
    lane?: "deep" | "fast";
    maxTokens?: number;
    agent?: string;
    parse: (args: Record<string, unknown>) => T;
  }): Promise<{ value: T; receipt?: MeterlessReceipt; model: string; latencyMs: number; retryCount: number; raw: NightshiftResponse }> {
    const tool: NightshiftTool = { type: "function", function: { name: opts.toolName, description: opts.description, parameters: opts.schema } };
    const resp = await this.chat({ messages: opts.messages, lane: opts.lane ?? "deep", tools: [tool], toolChoice: { type: "function", function: { name: opts.toolName } }, maxTokens: opts.maxTokens, agent: opts.agent });
    const call = resp.toolCalls.find((c) => c.name === opts.toolName);
    if (!call) throw new Error(`Nightshift tool call "${opts.toolName}" missing from response`);
    const value = opts.parse(call.arguments);
    return { value, receipt: resp.receipt, model: resp.model, latencyMs: resp.latencyMs, retryCount: resp.retryCount, raw: resp };
  }

  private ensureNoThink(messages: NightshiftMessage[]): NightshiftMessage[] {
    if (messages.length === 0 || messages[0]!.role !== "system") {
      return [{ role: "system", content: "/no_think" }, ...messages];
    }
    const [first, ...rest] = messages;
    if (first!.content.trim().startsWith("/no_think")) return messages;
    return [{ role: "system", content: `/no_think\n${first!.content}` }, ...rest];
  }

  private async callOnce(args: { messages: NightshiftMessage[]; lane: "deep" | "fast"; model: string; tools?: NightshiftTool[]; toolChoice?: ChatOpts["toolChoice"]; maxTokens: number; temperature?: number; abortSignal?: AbortSignal }): Promise<NightshiftResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const signal = args.abortSignal ? mergeSignals(controller.signal, args.abortSignal) : controller.signal;
    const started = Date.now();
    try {
      if (!this.token) throw new Error("Nightshift token missing (set METERLESS_RUNTIME_TOKEN or install Nightshift's proxy-token)");
      const body: Record<string, unknown> = {
        model: args.model,
        messages: args.messages,
        max_tokens: args.maxTokens,
      };
      if (args.temperature !== undefined) body.temperature = args.temperature;
      if (args.tools?.length) body.tools = args.tools;
      if (args.toolChoice) body.tool_choice = args.toolChoice;
      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...this.baseHeaders(true), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const bodyText = await res.text();
      if (!res.ok) {
        let detail = bodyText;
        try { const parsed = JSON.parse(bodyText); detail = parsed?.error?.message ?? detail; } catch { /* raw */ }
        throw new Error(`Nightshift HTTP ${res.status}: ${detail}`);
      }
      const parsed = JSON.parse(bodyText) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name: string; arguments: string } }> } }>;
        meterless?: MeterlessReceipt;
      };
      const choice = parsed.choices?.[0]?.message;
      const text = choice?.content ?? "";
      const toolCalls = (choice?.tool_calls ?? []).map((c) => {
        let argsObj: Record<string, unknown> = {};
        try { argsObj = JSON.parse(c.function?.arguments ?? "{}") as Record<string, unknown>; } catch { argsObj = {}; }
        return { id: c.id, name: c.function?.name ?? "", arguments: argsObj };
      });
      return {
        text,
        toolCalls,
        receipt: parsed.meterless,
        rawStatus: res.status,
        latencyMs: Date.now() - started,
        retryCount: 0,
        model: parsed.meterless?.routed_model ?? parsed.meterless?.winning_route?.model ?? args.model,
        lane: args.lane,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private baseHeaders(forChat: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "meterless-app": this.app,
    };
    if (forChat) h["meterless-scope"] = "user";
    return h;
  }

  // sample mode helpers
  private readSample(hash: string): NightshiftResponse {
    const file = resolvePath(this.sampleDir, `${hash}.json`);
    if (!existsSync(file)) {
      return { text: "", toolCalls: [], rawStatus: 200, latencyMs: 0, retryCount: 0, model: "sample", lane: "fast" };
    }
    return JSON.parse(readFileSync(file, "utf8")) as NightshiftResponse;
  }

  private recordSample(resp: NightshiftResponse, messages: NightshiftMessage[], tools: NightshiftTool[] | undefined, lane: "deep" | "fast") {
    if (process.env.NIGHTSHIFT_RECORD_SAMPLES !== "true") return;
    const hash = chatDigest(messages, tools, lane);
    mkdirSync(this.sampleDir, { recursive: true });
    writeFileSync(resolvePath(this.sampleDir, `${hash}.json`), JSON.stringify(resp), "utf8");
  }

  // ---- cooperative concurrency gate
  private acquire(): Promise<void> {
    if (this.inflight < this.concurrency) { this.inflight += 1; return Promise.resolve(); }
    return new Promise<void>((resolve) => this.wait.push(() => { this.inflight += 1; resolve(); }));
  }
  private release(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    const next = this.wait.shift();
    if (next) next();
  }
}

function readRuntimeToken(): string {
  const envToken = process.env.METERLESS_RUNTIME_TOKEN;
  if (envToken && envToken.trim() && envToken !== "rt-local") return envToken.trim();
  const candidates = [
    resolvePath(homedir(), "Library", "Application Support", "ai.meterless.runtime", "proxy-token"),
    resolvePath(homedir(), ".config", "ai.meterless.runtime", "proxy-token"),
  ];
  for (const path of candidates) {
    try {
      if (existsSync(path)) {
        const value = readFileSync(path, "utf8").trim();
        if (value && value !== "rt-local") return value;
      }
    } catch { /* ignore */ }
  }
  return "";
}

function chatDigest(messages: NightshiftMessage[], tools: NightshiftTool[] | undefined, lane: "deep" | "fast"): string {
  const normalised = JSON.stringify({ lane, tools: tools?.map((t) => t.function.name) ?? [], messages: messages.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })) });
  return createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

function mergeSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });
  if (a.aborted || b.aborted) controller.abort();
  return controller.signal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default Nightshift;
