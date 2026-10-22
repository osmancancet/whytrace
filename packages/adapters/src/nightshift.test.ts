// Unit tests for the Nightshift adapter. No live runtime required.
import { describe, it, expect } from "vitest";
import { Nightshift } from "./index.ts";
import { classifyFailure, extractJsonObject, extractRequestIds, fromExactCache, isEmptyResponse, withCacheBuster } from "./nightshift.ts";

describe("Nightshift.testConnection", () => {
  it("returns online when /models lists meterless/*", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] }), { status: 200 })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t" });
    expect(await n.testConnection()).toBe("online");
  });

  it("returns unauthorized on 401", async () => {
    const fetchFn = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "wrong" });
    expect(await n.testConnection()).toBe("unauthorized");
  });

  it("returns offline when server unreachable", async () => {
    const fetchFn = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t" });
    expect(await n.testConnection()).toBe("offline");
  });

  it("falls back to the proxy-token file on 401 at /models too, so the eval health gate recovers from a stale env token", async () => {
    let callN = 0;
    const fetchFn = (async () => {
      callN += 1;
      if (callN === 1) return new Response("unauthorized", { status: 401 });
      return new Response(JSON.stringify({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "stale-env", tokenSource: "env", readProxyToken: () => "fresh-proxy" });
    expect(await n.testConnection()).toBe("online");
    expect(callN).toBe(2);
    expect(n.getTokenSource()).toBe("proxy-token-file");
  });
});

describe("Nightshift.chat", () => {
  it("prepends /no_think and reads a tool call", async () => {
    let seenBody: string | undefined;
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      seenBody = (init?.body as string);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "", tool_calls: [{ id: "tc1", function: { name: "submit_verdict", arguments: JSON.stringify({ verdict: "benign", confidence: 0.8 }) } }] } }],
        meterless: { receipt_id: "rec1", routed_model: "nvidia/nemotron-3.5-lightning-30b-a3b", phases: [] },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.callTool({
      messages: [{ role: "user", content: "decide" }],
      toolName: "submit_verdict",
      schema: { type: "object", properties: { verdict: { type: "string" }, confidence: { type: "number" } }, required: ["verdict", "confidence"] },
      parse: (args) => args as { verdict: string; confidence: number },
      lane: "fast",
    });
    expect(JSON.parse(seenBody ?? "{}").messages[0]).toEqual({ role: "system", content: "/no_think" });
    expect(r.value.verdict).toBe("benign");
    expect(r.model).toContain("nvidia/nemotron");
    expect(r.receipt?.receipt_id).toBe("rec1");
  });

  it("never sends a tool_choice field (callTool offers one tool and trusts the model to invoke it)", async () => {
    const seenBodies: unknown[] = [];
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      seenBodies.push(JSON.parse((init?.body as string) ?? "{}"));
      return new Response(JSON.stringify({
        choices: [{ message: { content: "", tool_calls: [{ id: "tc1", function: { name: "submit_verdict", arguments: JSON.stringify({ ok: true }) } }] } }],
        meterless: { receipt_id: "r", routed_model: "nvidia/nemotron-3.5-lightning-30b-a3b" },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    await n.callTool({ messages: [{ role: "user", content: "decide" }], toolName: "submit_verdict", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, parse: (a) => a, lane: "fast" });
    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0]).not.toHaveProperty("tool_choice");
  });

  it("never sends a tool_choice field on the health probe either", async () => {
    const seenBodies: unknown[] = [];
    const fetchFn = (async (u: string | URL | Request, init?: RequestInit) => {
      if (String(u).endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] }), { status: 200 });
      seenBodies.push(JSON.parse((init?.body as string) ?? "{}"));
      return new Response(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [{ id: "p", function: { name: "submit_probe", arguments: "{\"ok\":true}" } }] } }], meterless: { receipt_id: "r" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    await n.probe();
    expect(seenBodies).toHaveLength(1);
    expect(seenBodies[0]).not.toHaveProperty("tool_choice");
  });

  it("classifies HTTP 200 with no tool_calls AND empty text as a provider failure (empty_response)", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "", tool_calls: [] } }],
      meterless: { receipt_id: "e1", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b", cache: { status: "miss", from_cache: false } },
    }), { status: 200 })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    await expect(n.chat({ messages: [{ role: "user", content: "hi" }], lane: "fast", routeFallback: false })).rejects.toThrow(/empty_response/);
  });

  it("retries once with a cache-busting system turn when an exact-cache hit replayed an empty response", async () => {
    const seenBodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    let call = 0;
    const fetchFn = (async (_u: string | URL | Request, init?: RequestInit) => {
      call += 1;
      seenBodies.push(JSON.parse((init?.body as string) ?? "{}"));
      if (call === 1) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: "", tool_calls: [] } }],
          meterless: { receipt_id: "cached", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b", cache: { status: "exact", from_cache: true } },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "real answer", tool_calls: [] } }],
        meterless: { receipt_id: "fresh", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b", cache: { status: "miss", from_cache: false } },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.chat({ messages: [{ role: "user", content: "hi" }], lane: "fast", routeFallback: false });
    expect(call).toBe(2);
    expect(r.text).toBe("real answer");
    // The cache-busted call must carry the extra marker in the system turn so Nightshift's exact cache key differs.
    const bustedSystem = seenBodies[1]!.messages.find((m) => m.role === "system");
    expect(bustedSystem?.content ?? "").toMatch(/cache_bust/);
  });

  it("falls back from the deep lane to the fast lane after retries fail", async () => {
    const seenBodies: string[] = [];
    let callN = 0;
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      callN += 1;
      seenBodies.push(init?.body as string);
      // Fail on deep (meterless/auto) all 1 attempt (retries=0), succeed on fast.
      const body = JSON.parse((init?.body as string) ?? "{}");
      if (body.model === "meterless/auto") return new Response("deep down", { status: 502 });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "ok", tool_calls: [] } }],
        meterless: { receipt_id: "fast1", routed_model: "nvidia/nemotron-3.5-lightning-30b-a3b", phases: [] },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.chat({ messages: [{ role: "user", content: "please" }], lane: "deep", agent: "test" });
    expect(callN).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(seenBodies[seenBodies.length - 1]!).model).toBe("meterless/fast");
    expect(r.receipt?.receipt_id).toBe("fast1");
    expect(r.model).toContain("nvidia/nemotron");
  });

  it("skips route fallback when routeFallback=false", async () => {
    let callN = 0;
    const fetchFn = (async () => { callN += 1; return new Response("down", { status: 502 }); }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    await expect(n.chat({ messages: [{ role: "user", content: "hi" }], lane: "deep", routeFallback: false })).rejects.toThrow();
    expect(callN).toBe(1);
  });
});

describe("Nightshift trace emission (cache_hit + failure_class + request ids)", () => {
  it("marks cache_hit=true on the chat_nightshift trace event when the receipt says cache.from_cache=true", async () => {
    const { RunTrace } = await import("./trace.ts");
    const { readFileSync } = await import("node:fs");
    const { mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const trace = new RunTrace({ logsRoot: mkdtempSync(tmpdir() + "/wt-trace-cache-") });
    const fetchFn = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "hello", tool_calls: [] } }],
      meterless: { receipt_id: "r_cached", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b", cache: { status: "exact", from_cache: true } },
    }), { status: 200, headers: { "x-request-id": "req-xyz" } })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0, trace });
    await n.chat({ messages: [{ role: "user", content: "hi" }], lane: "fast", routeFallback: false });
    const line = readFileSync(trace.files().trace, "utf8").split("\n").find((l) => /"action":"chat_nightshift"/.test(l) && !/_fallback/.test(l));
    const ev = JSON.parse(line ?? "{}");
    expect(ev.cache_hit).toBe(true);
    expect(ev.x_request_id).toBe("req-xyz");
    expect(ev.status).toBe("ok");
  });

  it("marks failure_class on degraded chat_nightshift trace events (auth_error / timeout / provider_error / empty_response)", async () => {
    const { RunTrace } = await import("./trace.ts");
    const { readFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const trace = new RunTrace({ logsRoot: mkdtempSync(tmpdir() + "/wt-trace-fail-") });
    const fetchFn = (async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "caller", timeoutMs: 5000, retries: 0, trace });
    await expect(n.chat({ messages: [{ role: "user", content: "hi" }], lane: "fast", routeFallback: false })).rejects.toThrow();
    const line = readFileSync(trace.files().trace, "utf8").split("\n").find((l) => /"action":"chat_nightshift"/.test(l) && /degraded/.test(l));
    const ev = JSON.parse(line ?? "{}");
    expect(ev.failure_class).toBe("auth_error");
  });
});

describe("Nightshift.callTool recovery", () => {
  it("recovers a tool call from prose containing JSON when tool_calls is missing", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({
      // The upstream model returned prose with the arguments inline — no tool_calls array.
      choices: [{ message: { content: "I pick: {\"decision\":\"contain\",\"confidence\":0.9,\"rationale\":\"strong chain\"}" } }],
      meterless: { receipt_id: "rec2", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b", phases: [] },
    }), { status: 200 })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.callTool({
      messages: [{ role: "user", content: "decide" }],
      toolName: "submit_risk",
      schema: { type: "object", properties: { decision: { type: "string" }, confidence: { type: "number" } }, required: ["decision", "confidence"] },
      parse: (args) => args as { decision: string; confidence: number; rationale: string },
      lane: "deep",
    });
    expect(r.value.decision).toBe("contain");
    expect(r.value.confidence).toBe(0.9);
  });

  it("runs ONE repair retry (nudging the model to invoke the tool) before giving up", async () => {
    let call = 0;
    const seenBodies: Array<{ messages: Array<{ role: string; content: string }> }> = [];
    const fetchFn = (async (_u: string | URL | Request, init?: RequestInit) => {
      call += 1;
      seenBodies.push(JSON.parse((init?.body as string) ?? "{}"));
      if (call === 1) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: "I'll help you with that, let me think…" } }],
          meterless: { receipt_id: "r1", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b" },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: "", tool_calls: [{ id: "tc", function: { name: "submit_risk", arguments: JSON.stringify({ decision: "monitor", confidence: 0.72, rationale: "repair call" }) } }] } }],
        meterless: { receipt_id: "r2", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b" },
      }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.callTool({
      messages: [{ role: "user", content: "decide" }],
      toolName: "submit_risk",
      schema: { type: "object", properties: {}, required: [] },
      parse: (a) => a as { decision: string; confidence: number; rationale: string },
      lane: "deep",
    });
    expect(call).toBe(2);
    expect(r.value.decision).toBe("monitor");
    // The repair turn appends a short user message asking for the tool, and still does not send tool_choice.
    const repairMessages = seenBodies[1]!.messages;
    expect(repairMessages[repairMessages.length - 1]!.role).toBe("user");
    expect(repairMessages[repairMessages.length - 1]!.content).toMatch(/submit_risk/);
    expect(seenBodies[1]).not.toHaveProperty("tool_choice");
  });

  it("still throws when neither the first call, text recovery nor the repair retry produces a tool call", async () => {
    const fetchFn = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "no structured output here" } }],
      meterless: { receipt_id: "rec3", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b" },
    }), { status: 200 })) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    await expect(n.callTool({
      messages: [{ role: "user", content: "decide" }],
      toolName: "submit_risk",
      schema: { type: "object", properties: {}, required: [] },
      parse: (a) => a,
      lane: "deep",
    })).rejects.toThrow(/missing from response/);
  });
});

describe("Nightshift token source fallback", () => {
  it("falls back to the proxy-token file on a 401 when the env token is rejected", async () => {
    let callN = 0;
    const seenTokens: string[] = [];
    const fetchFn = (async (_url: string | URL | Request, init?: RequestInit) => {
      callN += 1;
      const auth = (init?.headers as Record<string, string> | undefined)?.["Authorization"] ?? "";
      seenTokens.push(auth);
      if (callN === 1) return new Response("unauthorized", { status: 401 });
      return new Response(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [{ id: "x", function: { name: "submit_probe", arguments: "{\"ok\":true}" } }] } }], meterless: { receipt_id: "r1" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "stale-env-token", tokenSource: "env", readProxyToken: () => "fresh-proxy-token", timeoutMs: 5000, retries: 0 });
    expect(n.getTokenSource()).toBe("env");
    const r = await n.callTool({ messages: [{ role: "user", content: "p" }], toolName: "submit_probe", schema: { type: "object", properties: {}, required: [] }, parse: (a) => a, lane: "fast" });
    expect(callN).toBe(2);
    expect(seenTokens[0]).toContain("stale-env-token");
    expect(seenTokens[1]).toContain("fresh-proxy-token");
    expect(n.getTokenSource()).toBe("proxy-token-file");
    expect(r.receipt?.receipt_id).toBe("r1");
  });

  it("does not auto-refresh explicit tokens — the caller is in charge there", async () => {
    let callN = 0;
    const fetchFn = (async () => { callN += 1; return new Response("unauthorized", { status: 401 }); }) as unknown as typeof fetch;
    const refresh = () => "would-not-use-me";
    const n = new Nightshift({ fetchFn, token: "caller-provided", readProxyToken: refresh, timeoutMs: 5000, retries: 0 });
    await expect(n.chat({ messages: [{ role: "user", content: "hi" }], lane: "fast", routeFallback: false })).rejects.toThrow(/HTTP 401/);
    expect(callN).toBe(1);
    expect(n.getTokenSource()).toBe("explicit");
  });

  it("gives up after one proxy-token refresh — no retry loops on repeated 401s", async () => {
    let callN = 0;
    const fetchFn = (async () => { callN += 1; return new Response("unauthorized", { status: 401 }); }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "env-tok", tokenSource: "env", readProxyToken: () => "proxy-tok", timeoutMs: 5000, retries: 0 });
    await expect(n.chat({ messages: [{ role: "user", content: "hi" }], lane: "fast", routeFallback: false })).rejects.toThrow(/HTTP 401/);
    expect(callN).toBe(2);
    expect(n.getTokenSource()).toBe("proxy-token-file");
  });
});

describe("Nightshift.probe classification", () => {
  const modelsOk = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const makeFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => (async (u: string | URL | Request, init?: RequestInit) => handler(String(u), init)) as unknown as typeof fetch;

  it("returns `online` when the probe tool call lands", async () => {
    const fetchFn = makeFetch((u) => {
      if (u.endsWith("/models")) return modelsOk({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] });
      return modelsOk({ choices: [{ message: { content: "", tool_calls: [{ id: "p1", function: { name: "submit_probe", arguments: "{\"ok\":true}" } }] } }], meterless: { receipt_id: "r1", routed_model: "nvidia/nemotron-3.5-lightning-30b-a3b" } });
    });
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("online");
    expect(r.routed_model).toContain("nvidia/nemotron");
  });

  it("returns `online` when the model wraps the tool payload in prose that still parses", async () => {
    const fetchFn = makeFetch((u) => {
      if (u.endsWith("/models")) return modelsOk({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] });
      return modelsOk({ choices: [{ message: { content: "I'll reply: {\"ok\":true}" } }], meterless: { receipt_id: "r2", routed_model: "nvidia/nemotron-3.5-lightning-30b-a3b" } });
    });
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("online");
    expect(r.detail).toMatch(/recovered probe JSON from text/);
  });

  it("returns `format_miss` when the provider is up but answers with prose only", async () => {
    const fetchFn = makeFetch((u) => {
      if (u.endsWith("/models")) return modelsOk({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] });
      return modelsOk({ choices: [{ message: { content: "I am ready to help." } }], meterless: { receipt_id: "r3", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b" } });
    });
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("format_miss");
    expect(r.routed_model).toContain("nvidia/nemotron");
  });

  it("returns `provider_error` when HTTP 200 carries no tool_calls AND no text (empty_response Night 3 misread as format_miss)", async () => {
    const fetchFn = makeFetch((u) => {
      if (u.endsWith("/models")) return modelsOk({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] });
      return modelsOk({ choices: [{ message: { content: "", tool_calls: [] } }], meterless: { receipt_id: "r_empty", routed_model: "nvidia/nemotron-3.5-super-vl-120b-a12b", cache: { status: "exact", from_cache: true } } });
    });
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("provider_error");
    expect(r.detail).toMatch(/no tool_calls.*no text/i);
  });

  it("returns `provider_error` on a 502", async () => {
    const fetchFn = makeFetch((u) => {
      if (u.endsWith("/models")) return modelsOk({ data: [{ id: "meterless/auto" }, { id: "meterless/fast" }] });
      return new Response("bad gateway", { status: 502 });
    });
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("provider_error");
    expect(r.detail).toMatch(/502/);
  });

  it("returns `auth_error` when /models stays 401 after a proxy-token refresh", async () => {
    const fetchFn = makeFetch(() => new Response("unauthorized", { status: 401 }));
    const n = new Nightshift({ fetchFn, token: "bad", tokenSource: "env", readProxyToken: () => "still-bad", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("auth_error");
  });

  it("returns `provider_error` when /models is unreachable", async () => {
    const fetchFn = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const n = new Nightshift({ fetchFn, token: "t", timeoutMs: 5000, retries: 0 });
    const r = await n.probe();
    expect(r.status).toBe("provider_error");
  });
});

describe("isEmptyResponse / fromExactCache / withCacheBuster", () => {
  const base = { rawStatus: 200, latencyMs: 1, retryCount: 0, model: "m", lane: "fast" as const };
  it("flags HTTP 200 responses with no tool_calls AND no text as empty", () => {
    expect(isEmptyResponse({ ...base, text: "", toolCalls: [] })).toBe(true);
    expect(isEmptyResponse({ ...base, text: "   ", toolCalls: [] })).toBe(true);
    expect(isEmptyResponse({ ...base, text: "something", toolCalls: [] })).toBe(false);
    expect(isEmptyResponse({ ...base, text: "", toolCalls: [{ name: "x", arguments: {} }] })).toBe(false);
  });
  it("reads the Nightshift receipt's cache.from_cache / cache.status field", () => {
    expect(fromExactCache({ ...base, text: "", toolCalls: [] })).toBe(false);
    expect(fromExactCache({ ...base, text: "", toolCalls: [], receipt: { cache: { status: "exact", from_cache: true } } })).toBe(true);
    expect(fromExactCache({ ...base, text: "", toolCalls: [], receipt: { cache: { status: "miss", from_cache: false } } })).toBe(false);
    expect(fromExactCache({ ...base, text: "", toolCalls: [], receipt: { cache: { status: "exact" } } })).toBe(true);
  });
  it("appends a cache_bust token to the first system turn (adds one when missing)", () => {
    const addedSystem = withCacheBuster([{ role: "user", content: "hi" }], "run-abc");
    expect(addedSystem[0]).toMatchObject({ role: "system" });
    expect(addedSystem[0]!.content).toMatch(/cache_bust run-abc/);
    const touchedSystem = withCacheBuster([{ role: "system", content: "/no_think\nhello" }, { role: "user", content: "hi" }], "run-abc");
    expect(touchedSystem[0]!.content).toMatch(/\/no_think\nhello/);
    expect(touchedSystem[0]!.content).toMatch(/cache_bust run-abc/);
    expect(touchedSystem[1]).toEqual({ role: "user", content: "hi" });
  });
});

describe("classifyFailure", () => {
  // Honest failure accounting (notes/DAY3_PROMPT.md step 9).
  it("classifies HTTP 401 / unauthorized as auth_error — our stale token, not NVIDIA's fault", () => {
    expect(classifyFailure(new Error("Nightshift HTTP 401: unauthorized"))).toBe("auth_error");
    expect(classifyFailure("HTTP 403 forbidden")).toBe("auth_error");
    expect(classifyFailure(new Error("unauthorized access"))).toBe("auth_error");
  });
  it("classifies abort / timeout as timeout — our client-side deadline, not an upstream outage", () => {
    expect(classifyFailure(new Error("The operation was aborted"))).toBe("timeout");
    expect(classifyFailure(new Error("ETIMEDOUT"))).toBe("timeout");
    expect(classifyFailure(new Error("fetch timeout after 180000 ms"))).toBe("timeout");
  });
  it("classifies empty_response as empty_response (HTTP 200 with nothing in it)", () => {
    expect(classifyFailure(new Error("Nightshift empty_response (HTTP 200, no tool_calls, no text)"))).toBe("empty_response");
    expect(classifyFailure(new Error("Nightshift empty_response after cache_bust (HTTP 200, no tool_calls, no text)"))).toBe("empty_response");
  });
  it("classifies tool-call misses as format_miss — provider was up, our schema just did not land", () => {
    expect(classifyFailure(new Error('Nightshift tool call "submit_risk" missing from response'))).toBe("format_miss");
    expect(classifyFailure(new Error("format_miss on repair retry"))).toBe("format_miss");
  });
  it("falls back to provider_error for 5xx / network — upstream genuinely failed", () => {
    expect(classifyFailure(new Error("Nightshift HTTP 502: bad gateway"))).toBe("provider_error");
    expect(classifyFailure(new Error("Nightshift HTTP 500: provider_deadline"))).toBe("provider_error");
    expect(classifyFailure(new Error("ECONNREFUSED"))).toBe("provider_error");
  });
});

describe("extractRequestIds", () => {
  it("pulls x-request-id, nvcf-reqid, and meterless from headers so bug reports are self-contained", () => {
    const h = new Headers({ "x-request-id": "req-abc", "nvcf-reqid": "nv-123", "meterless": "detail-ok" });
    expect(extractRequestIds(h)).toEqual({ x_request_id: "req-abc", nvcf_reqid: "nv-123", meterless_detail: "detail-ok" });
  });
  it("tolerates missing headers", () => {
    expect(extractRequestIds(new Headers({ "content-type": "application/json" }))).toEqual({});
  });
});

describe("extractJsonObject", () => {
  it("finds a balanced object inside prose", () => {
    const o = extractJsonObject("hello {\"a\":1,\"b\":{\"c\":2}} world");
    expect(o).toEqual({ a: 1, b: { c: 2 } });
  });
  it("tolerates escaped quotes inside strings", () => {
    const o = extractJsonObject('{"msg":"he said \\"hi\\""}');
    expect(o).toEqual({ msg: 'he said "hi"' });
  });
  it("returns undefined on no object", () => { expect(extractJsonObject("no json here")).toBeUndefined(); });
  it("returns undefined on malformed JSON", () => { expect(extractJsonObject("{bad json}")).toBeUndefined(); });
});
