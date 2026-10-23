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
  /** True when the Nightshift receipt reports an exact-cache replay. The
   *  orchestrator forwards this into the trace as `cache_hit` so Night 3's
   *  "<200 ms with a receipt" independence problem is visible in eval tables. */
  cacheHit?: boolean;
  /** The upstream `finish_reason` for the chosen choice. `"length"` means the
   *  `max_tokens` budget cut the response short — if we also see no tool call
   *  and no complete text, that's a `max_tokens_hit` failure class (not a
   *  provider outage). */
  finishReason?: string;
  /** Completion tokens from the Nightshift / provider `usage.output_tokens`
   *  (or from `meterless.usage`). Surfaced into the trace so eval tables can
   *  group by actual token spend per agent. */
  completionTokens?: number;
  /** Upstream correlation ids captured from the raw HTTP response. These make
   *  bug reports to NVIDIA / Nightshift self-contained — `nvcf-reqid` is the
   *  Nemotron provider's trace id, `x-request-id` is the Nightshift proxy's,
   *  `meterless_detail` is the error-body message when the call failed. */
  requestIds?: { x_request_id?: string; nvcf_reqid?: string; meterless_detail?: string };
};

/** Categorical failure class for degraded model calls. */
export type FailureClass = "auth_error" | "format_miss" | "provider_error" | "timeout" | "empty_response" | "max_tokens_hit";

export type NightshiftOptions = {
  baseUrl?: string;
  token?: string;
  /** Explicit source label when `token` is provided — used so the adapter knows
   *  whether to try the proxy-token file on 401. Defaults to "explicit". */
  tokenSource?: "env" | "proxy-token-file" | "explicit";
  /** Optional override that returns the current proxy-token file contents. Lets
   *  tests inject a value without touching the real filesystem. */
  readProxyToken?: () => string;
  app?: string;
  deepModel?: string;
  fastModel?: string;
  /** Optional per-run nonce appended to the last USER message of every chat
   *  call. Nightshift's exact-prompt cache key ignores the system turn and
   *  the model id (verified directly on 23 Oct 2026), so a nonce on the
   *  system turn does not bust it. Threading the nonce through the user
   *  turn is what makes `--runs > 1` return independent samples. */
  runNonce?: string;
  /** Optional Nemotron Ultra override. When set, chat calls whose `agent` is
   *  `"reporter"` route to this model id instead of `deepModel`. We keep Super
   *  VL on the investigation path (its tool-call latency is well-studied) and
   *  only let Ultra narrate the final report — the trade-off is slow narration
   *  for a smarter closing summary. Config: `METERLESS_REPORTER_MODEL` env. */
  reporterModel?: string;
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
  fetchFn?: typeof fetch;
  sampleMode?: boolean;
  sampleDir?: string;
  /** Optional case id — when set and sampleDir is not provided, defaults to `samples/<caseId>/nightshift`. */
  caseId?: string;
  trace?: RunTrace;
};

export type ChatOpts = {
  messages: NightshiftMessage[];
  lane?: "deep" | "fast";
  tools?: NightshiftTool[];
  /** Only `"auto"` is honoured — the forced tool_choice shape was the main
   *  cause of the 45 s `provider_deadline` 502s observed on 22 Oct. Callers
   *  that need a specific tool now pass a single tool and let the model
   *  choose; the adapter runs a repair retry if it does not call it. */
  toolChoice?: "auto";
  maxTokens?: number;
  temperature?: number;
  agent?: string;
  parentStep?: string;
  abortSignal?: AbortSignal;
  /** Allow one retry on `meterless/fast` if the deep lane fails after retries. Default: true. */
  routeFallback?: boolean;
};

/** Classify a Nightshift error / response into a categorical failure class the
 *  eval tables and reports can group by. Night 3 showed 284 auth_error (stale
 *  env token) and 124 format_miss misread as provider failures; this is how we
 *  stop blaming NVIDIA for our own 401s. Exported so eval scripts can group
 *  trace rows without re-parsing error messages themselves. */
export function classifyFailure(input: unknown): FailureClass {
  const msg = input instanceof Error ? input.message : String(input ?? "");
  if (/\babort(ed)?\b/i.test(msg) || /\btimeout\b/i.test(msg) || /ETIMEDOUT/i.test(msg)) return "timeout";
  if (/\bhttp 40[13]\b/i.test(msg) || /\bunauthori[sz]ed\b/i.test(msg) || /\bforbidden\b/i.test(msg)) return "auth_error";
  if (/max_tokens_hit/i.test(msg)) return "max_tokens_hit";
  if (/empty_response/i.test(msg)) return "empty_response";
  if (/format_miss/i.test(msg) || /missing from response/i.test(msg)) return "format_miss";
  // 5xx or network — upstream was reachable but failed, or the provider refused.
  return "provider_error";
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 3;
/** Nightshift / Runtime 1.4 requires `max_tokens >= 2000`; Nemotron Super VL's
 *  tool_call_format phase also eats hidden reasoning tokens despite `/no_think`,
 *  so 2000 truncates every real tool call. Direct measurement on 23 Oct 2026
 *  showed the planner request needs 1,014–2,805 completion tokens to emit a
 *  valid `submit_plan` tool call; 4000 is the safe default. Agents that measure
 *  usage above 2,500 (planner) override to 6000. See notes/DAY3B_REPORT.md. */
const DEFAULT_MAX_TOKENS = 4000;

export class Nightshift {
  private readonly baseUrl: string;
  private token: string;
  private tokenSource: "env" | "proxy-token-file" | "explicit" | "none";
  private proxyTokenRefreshed = false;
  private readonly app: string;
  private readonly deepModel: string;
  private readonly fastModel: string;
  private readonly reporterModel?: string;
  private readonly runNonce?: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchFn: typeof fetch;
  readonly sampleMode: boolean;
  private readonly sampleDir: string;
  private readonly trace?: RunTrace;
  private readonly concurrency: number;
  private inflight = 0;
  private readonly wait: Array<() => void> = [];
  private readonly readProxyToken: () => string;

  constructor(opts: NightshiftOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.METERLESS_BASE_URL ?? "http://127.0.0.1:8088/v1").replace(/\/+$/, "");
    this.readProxyToken = opts.readProxyToken ?? readProxyTokenFile;
    if (opts.token) { this.token = opts.token; this.tokenSource = opts.tokenSource ?? "explicit"; }
    else { const t = resolveRuntimeToken(); this.token = t.token; this.tokenSource = t.source; }
    this.app = opts.app ?? process.env.METERLESS_APP ?? "whytrace";
    this.deepModel = opts.deepModel ?? process.env.MODEL_DEEP ?? "meterless/auto";
    this.fastModel = opts.fastModel ?? process.env.MODEL_FAST ?? "meterless/fast";
    const reporter = opts.reporterModel ?? process.env.METERLESS_REPORTER_MODEL;
    this.reporterModel = reporter && reporter.trim().length ? reporter.trim() : undefined;
    this.runNonce = opts.runNonce && opts.runNonce.trim().length ? opts.runNonce.trim() : undefined;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = opts.retries ?? DEFAULT_RETRIES;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sampleMode = opts.sampleMode ?? process.env.SAMPLE_MODE === "true";
    if (opts.sampleDir) this.sampleDir = opts.sampleDir;
    else if (opts.caseId) this.sampleDir = resolvePath(process.cwd(), "samples", opts.caseId, "nightshift");
    else this.sampleDir = resolvePath(process.cwd(), "data", "sample", "nightshift");
    this.trace = opts.trace;
    // Serialise upstream traffic by default: concurrent deep calls through the same
    // Nightshift proxy are a frequent cause of 502/_empty_response under provider load.
    this.concurrency = opts.concurrency ?? 1;
  }

  /** Which token source is currently in use. */
  getTokenSource(): "env" | "proxy-token-file" | "explicit" | "none" { return this.tokenSource; }

  async testConnection(): Promise<"online" | "unauthorized" | "offline"> {
    const doFetch = async () => this.fetchFn(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.baseHeaders(false),
    });
    try {
      let res = await doFetch();
      // Same token-source fallback as the chat endpoint: a 401/403 from an
      // env-sourced token triggers a one-time re-read of the proxy-token file.
      if ((res.status === 401 || res.status === 403) && !this.proxyTokenRefreshed && this.tokenSource === "env") {
        const refresh = this.readProxyToken();
        this.proxyTokenRefreshed = true;
        if (refresh && refresh !== this.token) {
          this.token = refresh;
          this.tokenSource = "proxy-token-file";
          this.trace?.emit({ agent: "nightshift", action: "token_refresh", status: "ok", output_summary: `env token rejected (${res.status}) on /models; switched to proxy-token-file` });
          res = await doFetch();
        }
      }
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
    const doFetch = async () => this.fetchFn(`${this.baseUrl}/models`, { method: "GET", headers: this.baseHeaders(false) });
    let res = await doFetch();
    // Mirror testConnection's 401 fallback so stale env tokens auto-recover.
    if ((res.status === 401 || res.status === 403) && !this.proxyTokenRefreshed && this.tokenSource === "env") {
      const refresh = this.readProxyToken();
      this.proxyTokenRefreshed = true;
      if (refresh && refresh !== this.token) {
        this.token = refresh;
        this.tokenSource = "proxy-token-file";
        this.trace?.emit({ agent: "nightshift", action: "token_refresh", status: "ok", output_summary: `env token rejected on /models (${res.status}); switched to proxy-token-file` });
        res = await doFetch();
      }
    }
    if (!res.ok) throw new Error(`Nightshift /models HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    return (body.data ?? []).map((m) => m.id);
  }

  async warmUp(): Promise<void> {
    try {
      // Runtime 1.4 contract requires `max_tokens >= 2000`; 32 was below the
      // floor and returned HTTP 502 on every call (confirmed 23 Oct 2026).
      await this.chat({ messages: [{ role: "user", content: "ready" }], lane: "fast", maxTokens: 2000, agent: "warmup" });
    } catch {
      /* ignore */
    }
  }

  async chat(opts: ChatOpts): Promise<NightshiftResponse> {
    await this.acquire();
    const started = Date.now();
    const lane: "deep" | "fast" = opts.lane ?? "deep";
    const agent = opts.agent ?? "model";
    // Reporter override: when the caller is the Reporter and an Ultra lane is
    // configured, use it only here. Investigation stays on Super VL.
    const useReporterOverride = lane === "deep" && agent === "reporter" && this.reporterModel;
    const model = useReporterOverride ? this.reporterModel! : (lane === "deep" ? this.deepModel : this.fastModel);
    if (useReporterOverride) this.trace?.emit({ agent, action: "reporter_model_override", status: "ok", output_summary: `routing Reporter call to ${this.reporterModel}` });
    // Thread the per-run nonce through the LAST USER MESSAGE. Nightshift's
    // exact-prompt cache key ignores the system turn and the model id — we
    // verified this directly against the local engine on 23 Oct 2026, so a
    // nonce on the system turn (DAY3) never busted the cache. Appending to the
    // last user turn is what actually produces independent samples.
    const nonced = this.runNonce ? appendNonceToLastUser(opts.messages, this.runNonce) : opts.messages;
    const messages = this.ensureNoThink(nonced);
    const routeFallback = opts.routeFallback !== false;
    try {
      if (this.sampleMode) {
        const digest = chatDigest(messages, opts.tools, lane);
        const sample = this.readSample(digest);
        this.trace?.emit({ agent, action: "chat_nightshift", lane, routed_model: sample.model, receipt_id: sample.receipt?.receipt_id, ms: Date.now() - started, status: "ok", retry_count: 0 });
        return sample;
      }
      // The attempt helper runs one upstream call and, if the provider replied
      // from its exact cache with no content, re-tries once immediately with a
      // cache-busting system message so a poisoned cache entry does not freeze
      // the orchestrator. Nightshift has no public cache-bypass header (checked
      // 23 Oct 2026 against the local engine's server/openai modules) so the
      // bust is semantic — we append the run_id to the first system turn, which
      // keeps the meaning identical but shifts the cache key. The original
      // messages are what we record into the sample file, so replays still key
      // off the agent's actual request.
      const callAttempt = async (callLane: "deep" | "fast", callModel: string): Promise<NightshiftResponse> => {
        const resp = await this.callOnce({ messages, lane: callLane, model: callModel, tools: opts.tools, maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, temperature: opts.temperature, abortSignal: opts.abortSignal });
        if (!isEmptyResponse(resp)) return resp;
        if (fromExactCache(resp)) {
          const bustedMessages = withCacheBuster(messages, this.trace?.run_id ?? newRunStamp());
          this.trace?.emit({ agent, action: "cache_bust", lane: callLane, status: "ok", output_summary: "exact-cache replayed an empty response; retrying with cache-busting system turn" });
          const resp2 = await this.callOnce({ messages: bustedMessages, lane: callLane, model: callModel, tools: opts.tools, maxTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, temperature: opts.temperature, abortSignal: opts.abortSignal });
          if (!isEmptyResponse(resp2)) return resp2;
          throw new Error("Nightshift empty_response after cache_bust (HTTP 200, no tool_calls, no text)");
        }
        throw new Error("Nightshift empty_response (HTTP 200, no tool_calls, no text)");
      };
      let lastErr: unknown;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const resp = await callAttempt(lane, model);
          resp.retryCount = attempt;
          this.recordSample(resp, messages, opts.tools, lane);
          this.trace?.emit({ agent, action: "chat_nightshift", lane, routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, ms: Date.now() - started, status: "ok", retry_count: attempt, cache_hit: resp.cacheHit === true, completion_tokens: resp.completionTokens, finish_reason: resp.finishReason, max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, x_request_id: resp.requestIds?.x_request_id, nvcf_reqid: resp.requestIds?.nvcf_reqid });
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
          const resp = await callAttempt("fast", this.fastModel);
          resp.retryCount = this.retries + 1;
          this.recordSample(resp, messages, opts.tools, "fast");
          this.trace?.emit({ agent, action: "chat_nightshift_fallback", lane: "fast", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, ms: Date.now() - started, status: "ok", retry_count: this.retries + 1, output_summary: "deep lane degraded, retried on fast lane", cache_hit: resp.cacheHit === true, completion_tokens: resp.completionTokens, finish_reason: resp.finishReason, max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS, x_request_id: resp.requestIds?.x_request_id, nvcf_reqid: resp.requestIds?.nvcf_reqid });
          return resp;
        } catch (fallbackErr) {
          lastErr = fallbackErr;
        }
      }
      const failureClass = classifyFailure(lastErr);
      this.trace?.emit({ agent, action: "chat_nightshift", lane, routed_model: model, ms: Date.now() - started, status: "degraded", retry_count: this.retries, output_summary: lastErr instanceof Error ? lastErr.message.slice(0, 200) : undefined, failure_class: failureClass, max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS });
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
    } finally {
      this.release();
    }
  }

  /** Classified health probe.
   *  - `online`      → provider up and the model emitted a tool call (or we recovered JSON from text)
   *  - `format_miss` → HTTP 200 but neither tool_calls nor extractable JSON (the model is responding; its output just doesn't match the probe schema). This is **not** an outage and the eval health gate treats it as healthy with a warning.
   *  - `auth_error`  → 401/403 after the proxy-token fallback already ran
   *  - `provider_error` → 5xx, `_empty_response`, timeout, or /models offline
   *  Downstream callers only treat `provider_error` and `auth_error` as unhealthy. */
  async probe(): Promise<{ status: "online" | "format_miss" | "auth_error" | "provider_error"; detail?: string; routed_model?: string; receipt_id?: string }> {
    const conn = await this.testConnection();
    if (conn === "unauthorized") return { status: "auth_error", detail: "Nightshift /models returned 401/403 after proxy-token refresh" };
    if (conn === "offline") return { status: "provider_error", detail: "Nightshift /models offline" };
    // At this point /models said we are online. One small chat probe decides
    // between `online` (tool call or recoverable JSON came back), `format_miss`
    // (non-empty prose that doesn't fit our schema — the model is alive but
    // our tool landed on text) and `provider_error` (5xx, timeout, or HTTP 200
    // with no tool_calls AND no prose — the empty-cache / provider_deadline
    // failure mode that Night 3 misread as "model up"). No forced tool_choice:
    // we offer one tool and let the model decide, mirroring how `callTool`
    // now runs its real agent prompts.
    try {
      const resp = await this.chat({
        messages: [{ role: "user", content: "Probe: reply with ok=true via submit_probe." }],
        tools: [{ type: "function", function: { name: "submit_probe", description: "Probe tool.", parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } } }],
        lane: "fast",
        // Runtime 1.4 floor is 2000; a smaller probe budget guarantees a 502.
        maxTokens: 2000,
        agent: "probe",
        routeFallback: false,
      });
      const call = resp.toolCalls.find((c) => c.name === "submit_probe");
      if (call) return { status: "online", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id };
      if (extractJsonObject(resp.text)) return { status: "online", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, detail: "recovered probe JSON from text" };
      if (!resp.text || resp.text.trim().length === 0) {
        // HTTP 200 with no tool call AND no prose — the provider is answering
        // but with nothing. Night 3 shipped this as "format_miss / provider up";
        // it is not. Count it as a provider error so the eval health gate
        // retries and the sweep's provider_failures counter stays honest.
        return { status: "provider_error", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, detail: `provider replied HTTP 200 with no tool_calls and no text${fromExactCache(resp) ? " (served from exact cache)" : ""}` };
      }
      // The provider answered HTTP 200 with real prose. The model is up; our
      // schema just did not land. `format_miss` keeps the eval moving — the
      // orchestrator's `tool_call_recovered_from_text` and repair-retry paths
      // handle the same shape on real prompts.
      return { status: "format_miss", routed_model: resp.model, receipt_id: resp.receipt?.receipt_id, detail: `provider responded with prose (${resp.text.length} chars) instead of invoking submit_probe` };
    } catch (err) {
      const msg = (err as Error).message || String(err);
      if (/\b(401|403|unauthori[sz]ed)\b/i.test(msg)) return { status: "auth_error", detail: msg.slice(0, 200) };
      return { status: "provider_error", detail: msg.slice(0, 200) };
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
    // We deliberately do NOT pass `tool_choice`. Forcing the named tool_choice
    // reliably produced 45 s `provider_deadline` 502s against Nemotron Super
    // VL on 22 Oct 2026 (4/4 forced calls failed, 3/4 unforced succeeded under
    // identical prompts). The adapter now trusts the model to invoke the one
    // tool we offer; if it answers with prose we recover a JSON object from
    // the text, and if that also fails we send one short repair turn.
    const lane = opts.lane ?? "deep";
    const resp = await this.chat({ messages: opts.messages, lane, tools: [tool], maxTokens: opts.maxTokens, agent: opts.agent });
    let args: Record<string, unknown> | undefined = resp.toolCalls.find((c) => c.name === opts.toolName)?.arguments;
    if (!args) {
      const extracted = extractJsonObject(resp.text);
      if (extracted) {
        this.trace?.emit({ agent: opts.agent ?? "model", action: "tool_call_recovered_from_text", lane: resp.lane, status: "ok", output_summary: `recovered ${opts.toolName} from text (${resp.text.length} chars)` });
        args = extracted;
      }
    }
    let finalResp = resp;
    if (!args) {
      // Repair retry: nudge the model to invoke the tool. Still no tool_choice —
      // the goal is to let the model emit a correctly-shaped call, not to force
      // a shape the provider's tool_call_format stage can't fit into the deadline.
      const repairMessages: NightshiftMessage[] = [
        ...opts.messages,
        ...(resp.text ? [{ role: "assistant", content: resp.text } as NightshiftMessage] : []),
        { role: "user", content: `Call \`${opts.toolName}\` now with the arguments. Reply only via that function.` },
      ];
      this.trace?.emit({ agent: opts.agent ?? "model", action: "tool_call_repair_retry", lane: resp.lane, status: "ok", output_summary: `no tool call on first attempt; retrying with a repair user turn (text ${resp.text.length} chars)` });
      finalResp = await this.chat({ messages: repairMessages, lane, tools: [tool], maxTokens: opts.maxTokens, agent: opts.agent });
      args = finalResp.toolCalls.find((c) => c.name === opts.toolName)?.arguments;
      if (!args) args = extractJsonObject(finalResp.text);
    }
    if (!args) throw new Error(`Nightshift tool call "${opts.toolName}" missing from response`);
    const value = opts.parse(args);
    return { value, receipt: finalResp.receipt, model: finalResp.model, latencyMs: finalResp.latencyMs, retryCount: finalResp.retryCount, raw: finalResp };
  }

  private ensureNoThink(messages: NightshiftMessage[]): NightshiftMessage[] {
    if (messages.length === 0 || messages[0]!.role !== "system") {
      return [{ role: "system", content: "/no_think" }, ...messages];
    }
    const [first, ...rest] = messages;
    if (first!.content.trim().startsWith("/no_think")) return messages;
    return [{ role: "system", content: `/no_think\n${first!.content}` }, ...rest];
  }

  private async callOnce(args: { messages: NightshiftMessage[]; lane: "deep" | "fast"; model: string; tools?: NightshiftTool[]; maxTokens: number; temperature?: number; abortSignal?: AbortSignal }): Promise<NightshiftResponse> {
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
      // `tool_choice` is intentionally never sent — see callTool/probe comments.
      const doFetch = async () => this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...this.baseHeaders(true), "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      let res = await doFetch();
      // Token source fallback: if the ENV-sourced token is rejected (401/403) and
      // we have not tried the proxy-token file yet in this process, re-read it and
      // retry once with the fresh value. Explicit tokens are not auto-refreshed —
      // the caller is in charge there. We never log or print the token itself.
      if ((res.status === 401 || res.status === 403) && !this.proxyTokenRefreshed && this.tokenSource === "env") {
        const refresh = this.readProxyToken();
        this.proxyTokenRefreshed = true;
        if (refresh && refresh !== this.token) {
          this.token = refresh;
          this.tokenSource = "proxy-token-file";
          this.trace?.emit({ agent: "nightshift", action: "token_refresh", status: "ok", output_summary: `env token rejected (${res.status}); switched to proxy-token-file` });
          res = await doFetch();
        }
      }
      const bodyText = await res.text();
      // Capture upstream correlation ids regardless of success. Bug reports to
      // NVIDIA / Nightshift otherwise require us to guess which provider call
      // was failing from a timestamp.
      const requestIds = extractRequestIds(res.headers);
      if (!res.ok) {
        let detail = bodyText;
        try { const parsed = JSON.parse(bodyText); detail = parsed?.error?.message ?? detail; } catch { /* raw */ }
        requestIds.meterless_detail = typeof detail === "string" ? detail.slice(0, 200) : undefined;
        if (this.trace) {
          this.trace.emit({ agent: "nightshift", action: "upstream_error", status: "degraded", output_summary: `HTTP ${res.status}`, http_status: res.status, x_request_id: requestIds.x_request_id, nvcf_reqid: requestIds.nvcf_reqid, meterless_detail: requestIds.meterless_detail });
        }
        throw new Error(`Nightshift HTTP ${res.status}: ${detail}`);
      }
      const parsed = JSON.parse(bodyText) as {
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name: string; arguments: string } }> }; finish_reason?: string }>;
        meterless?: MeterlessReceipt;
        usage?: { completion_tokens?: number; output_tokens?: number };
      };
      const firstChoice = parsed.choices?.[0];
      const choice = firstChoice?.message;
      const text = choice?.content ?? "";
      const toolCalls = (choice?.tool_calls ?? []).map((c) => {
        let argsObj: Record<string, unknown> = {};
        try { argsObj = JSON.parse(c.function?.arguments ?? "{}") as Record<string, unknown>; } catch { argsObj = {}; }
        return { id: c.id, name: c.function?.name ?? "", arguments: argsObj };
      });
      const finishReason = firstChoice?.finish_reason;
      const completionTokens = Number(parsed.usage?.completion_tokens ?? parsed.usage?.output_tokens ?? parsed.meterless?.usage?.output_tokens ?? 0) || undefined;
      const resp: NightshiftResponse = {
        text,
        toolCalls,
        receipt: parsed.meterless,
        rawStatus: res.status,
        latencyMs: Date.now() - started,
        retryCount: 0,
        model: parsed.meterless?.routed_model ?? parsed.meterless?.winning_route?.model ?? args.model,
        lane: args.lane,
        finishReason,
        completionTokens,
      };
      resp.cacheHit = fromExactCache(resp);
      if (requestIds.x_request_id || requestIds.nvcf_reqid) resp.requestIds = requestIds;
      // Classify "max_tokens_hit" explicitly: the budget cut the response short
      // (finish_reason === "length") AND no tool call survived. If text came
      // back truncated, we still let callers try to extract from text — but if
      // nothing landed, this is NOT a provider outage, it's a budget bug.
      if (finishReason === "length" && toolCalls.length === 0 && (!text || text.trim().length === 0)) {
        throw new Error(`Nightshift max_tokens_hit (HTTP 200, finish_reason=length, max_tokens=${args.maxTokens}, completion_tokens=${completionTokens ?? "?"}) — budget truncated the response before any content survived`);
      }
      return resp;
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
    // Night 3 shipped 11 empty samples because recordSample accepted anything
    // with HTTP 200. An empty response (no tool_calls, no text) replayed in
    // SAMPLE_MODE looks like a provider outage to the orchestrator and poisons
    // every subsequent `scripts/record_sample.ts` for the same case. We now
    // refuse to persist those: the record step either sees the real response
    // (because callAttempt busted the cache and retried) or the live step
    // throws, and the recorder learns to re-run the case.
    if (isEmptyResponse(resp)) return;
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
  return resolveRuntimeToken().token;
}

/** Resolve the Nightshift runtime token and remember the source so operators and
 *  judges can see where it came from in the trace (env variable or the
 *  Nightshift-installed proxy-token file). The token value itself is never
 *  logged or persisted outside this process. */
export function resolveRuntimeToken(): { token: string; source: "env" | "proxy-token-file" | "none" } {
  const envToken = process.env.METERLESS_RUNTIME_TOKEN;
  if (envToken && envToken.trim() && envToken !== "rt-local") return { token: envToken.trim(), source: "env" };
  const proxy = readProxyTokenFile();
  if (proxy) return { token: proxy, source: "proxy-token-file" };
  return { token: "", source: "none" };
}

function readProxyTokenFile(): string {
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

/** Extract the first balanced JSON object from a text blob. Used to recover a
 *  tool call when the upstream model returns prose containing JSON instead of
 *  invoking the forced tool. Returns the parsed object or undefined. */
export function extractJsonObject(text: string): Record<string, unknown> | undefined {
  if (!text) return undefined;
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          const parsed = JSON.parse(slice);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch { return undefined; }
        return undefined;
      }
    }
  }
  return undefined;
}

function chatDigest(messages: NightshiftMessage[], tools: NightshiftTool[] | undefined, lane: "deep" | "fast"): string {
  const normalised = JSON.stringify({ lane, tools: tools?.map((t) => t.function.name) ?? [], messages: messages.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })) });
  return createHash("sha256").update(normalised).digest("hex").slice(0, 16);
}

/** HTTP 200 but neither a tool call nor any prose — the empty-reply shape
 *  Nemotron Super VL emits when its tool_call_format phase times out or the
 *  exact cache replays a poisoned entry. Treated as a provider failure. */
export function isEmptyResponse(resp: NightshiftResponse): boolean {
  return (!resp.text || resp.text.trim().length === 0) && resp.toolCalls.length === 0;
}

/** Nightshift's receipt reports both `cache.status: "exact"` and
 *  `cache.from_cache: true` when the response was replayed from the exact
 *  prompt→response cache. Either marker is enough to trigger the cache-bust
 *  retry. */
export function fromExactCache(resp: NightshiftResponse): boolean {
  const c = resp.receipt?.cache as { status?: unknown; from_cache?: unknown } | undefined;
  if (!c) return false;
  if (c.from_cache === true || String(c.from_cache ?? "").toLowerCase() === "true") return true;
  if (String(c.status ?? "").toLowerCase() === "exact") return true;
  return false;
}

/** Append a cache-busting token to the LAST USER message (adding one if there
 *  is no user turn yet). Verified against the local Nightshift engine on
 *  23 Oct 2026: the exact-prompt cache key ignores the system turn and the
 *  model id, so a nonce on the system turn (what DAY3 shipped) does not
 *  change the cache key. The user turn is what busts the key. The semantic
 *  intent of the prompt is unchanged — the token is a bracketed sentinel. */
export function withCacheBuster(messages: NightshiftMessage[], runId: string): NightshiftMessage[] {
  const token = `[cache_bust ${runId} ${Date.now().toString(36)}]`;
  return appendNonceToLastUser(messages, token);
}

/** Append `[run:<nonce>]` (or any token) to the LAST user turn. Used by both
 *  withCacheBuster and the per-chat per-run nonce path. If there is no user
 *  turn, a new one is appended. Exported for unit tests. */
export function appendNonceToLastUser(messages: NightshiftMessage[], nonceToken: string): NightshiftMessage[] {
  const token = /^\[.+\]$/.test(nonceToken) ? nonceToken : `[run:${nonceToken}]`;
  const idx = (() => { for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.role === "user") return i; return -1; })();
  if (idx < 0) return [...messages, { role: "user", content: token }];
  const next = messages.slice();
  const u = next[idx]!;
  next[idx] = { ...u, content: `${u.content}\n${token}` };
  return next;
}

function newRunStamp(): string { return `anon-${Math.random().toString(36).slice(2, 10)}`; }

/** Extract Nightshift / Nemotron correlation ids from a Response's headers.
 *  Nightshift forwards NVIDIA's `nvcf-reqid` and sets its own `x-request-id`
 *  on every chat/completions reply. We also pull Meterless's own `meterless`
 *  detail header when present so error traces are self-contained. */
export function extractRequestIds(headers: Headers): { x_request_id?: string; nvcf_reqid?: string; meterless_detail?: string } {
  const out: { x_request_id?: string; nvcf_reqid?: string; meterless_detail?: string } = {};
  const x = headers.get("x-request-id") ?? headers.get("x-request-id".toUpperCase());
  if (x) out.x_request_id = x;
  const n = headers.get("nvcf-reqid") ?? headers.get("x-nvcf-reqid") ?? headers.get("nvcf-request-id");
  if (n) out.nvcf_reqid = n;
  const m = headers.get("meterless") ?? headers.get("meterless-detail");
  if (m) out.meterless_detail = m;
  return out;
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
