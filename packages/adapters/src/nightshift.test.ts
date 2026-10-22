// Unit tests for the Nightshift adapter. No live runtime required.
import { describe, it, expect } from "vitest";
import { Nightshift } from "./index.ts";

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
