// Unit tests for the Nightshift adapter. No live runtime required.
import { describe, it, expect } from "vitest";
import { Nightshift } from "./index.ts";
import { extractJsonObject } from "./nightshift.ts";

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

  it("still throws when neither tool_calls nor extractable JSON is present", async () => {
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
