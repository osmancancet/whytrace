import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunTrace } from "@whytrace/adapters";
import { buildWindows, parseSuspects, runSprayMarkovian } from "./markovian-sweep.ts";
import { FindingIds } from "./investigator.ts";
import { FakeZetaris } from "./testing/fake-zetaris.ts";
import { FakeNightshift } from "./testing/fake-nightshift.ts";

describe("buildWindows", () => {
  it("splits a 20-minute spray into bounded windows", () => {
    const w = buildWindows("2026-10-18T02:00:00Z", "2026-10-18T02:20:00Z");
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w.length).toBeLessThanOrEqual(24);
    expect(w[0]!.from).toBe("2026-10-18T02:00:00.000Z");
  });

  it("returns at least one window for a degenerate range", () => {
    const w = buildWindows("2026-10-18T02:00:00Z", "2026-10-18T02:00:00Z");
    expect(w.length).toBe(1);
  });
});

describe("parseSuspects", () => {
  it("extracts upns from SUSPECT lines and sums counts", () => {
    const s = parseSuspects("SUSPECT:a@x.edu count=3\nSUSPECT:b@x.edu\nSUSPECT:a@x.edu count=2");
    expect(s.get("a@x.edu")).toBe(5);
    expect(s.get("b@x.edu")).toBe(1);
    expect(s.size).toBe(2);
  });
});

describe("runSprayMarkovian", () => {
  it("walks each window, accumulates victims and writes a measured-token log", async () => {
    const logsRoot = mkdtempSync(join(tmpdir(), "whytrace-mkv-test-"));
    const trace = new RunTrace({ logsRoot });
    const zetaris = new FakeZetaris(undefined, trace);
    const nightshift = new FakeNightshift();
    const ids = new FindingIds();
    const result = await runSprayMarkovian(
      { zetaris, nightshift, trace },
      {
        caseId: "case-004",
        upn: "m.aslan@aegean.edu",
        ip: "185.213.44.9",
        firstTs: "2026-10-18T02:00:00Z",
        lastTs: "2026-10-18T02:20:00Z",
        memoryContext: "- travel pattern lesson",
      },
      ids,
    );
    expect(result.windows.length).toBeGreaterThanOrEqual(2);
    expect(result.measuredTokensIn + result.measuredTokensOut).toBeGreaterThan(0);
    expect(result.run.tokenLabel).toBe("measured");
    expect(result.run.chunks.length).toBe(result.windows.length);
    expect(result.modelCalls).toBe(result.windows.length);
    expect(existsSync(join(trace.rootDir, "markovian.json"))).toBe(true);
    const summary = JSON.parse(readFileSync(join(trace.rootDir, "markovian.json"), "utf8"));
    expect(summary.engine).toBe("meterless-markovian");
    expect(summary.tokenLabel).toBe("measured");
    expect(Array.isArray(summary.per_step)).toBe(true);
  });
});
