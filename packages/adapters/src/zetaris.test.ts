// Unit tests for the Zetaris adapter. No live server required.
import { describe, it, expect } from "vitest";
import { Zetaris, typeRows, sqlId } from "./index.ts";

describe("typeRows", () => {
  it("casts numeric columns and keeps strings", () => {
    const { rows, columns } = typeRows({
      headers: ["event_id", "ts", "mfa_prompt_count"],
      data: [["evt_000001", "2026-10-14 06:52:00.0", "3"]],
      total: 1,
    });
    expect(columns).toEqual(["event_id", "ts", "mfa_prompt_count"]);
    expect(rows[0]!.mfa_prompt_count).toBe(3);
    expect(rows[0]!.event_id).toBe("evt_000001");
    expect(rows[0]!.ts).toBe("2026-10-14 06:52:00.0");
  });

  it("maps string nulls to null", () => {
    const { rows } = typeRows({ headers: ["device_id"], data: [["null"]], total: 1 });
    expect(rows[0]!.device_id).toBeNull();
  });
});

describe("sqlId", () => {
  it("ignores whitespace differences", () => {
    expect(sqlId("SELECT 1")).toBe(sqlId("SELECT   1 "));
    expect(sqlId("SELECT 1")).toHaveLength(12);
  });
});

describe("Zetaris retries", () => {
  it("retries on 5xx and succeeds", async () => {
    let calls = 0;
    const fetchFn = (async (_url: string | URL | Request, _init?: RequestInit) => {
      calls++;
      if (calls === 1) return new Response("boom", { status: 503 }) as unknown as Response;
      return new Response(JSON.stringify({ headers: ["a"], data: [["1"]], total: 1 }), { status: 200 });
    }) as unknown as typeof fetch;
    const z = new Zetaris({ fetchFn, apiKey: "k", retries: 2, timeoutMs: 1000 });
    const r = await z.runSql("SELECT a FROM t");
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(r.rows[0]!.a).toBe(1);
  });

  it("does not retry on 4xx", async () => {
    let calls = 0;
    const fetchFn = (async () => { calls++; return new Response(JSON.stringify({ msg: "parse error" }), { status: 400 }); }) as unknown as typeof fetch;
    const z = new Zetaris({ fetchFn, apiKey: "k", retries: 2 });
    await expect(z.runSql("bad sql")).rejects.toThrow(/Zetaris 400/);
    expect(calls).toBe(1);
  });
});
