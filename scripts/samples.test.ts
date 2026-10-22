// Guard-rail test: a tracked `samples/` directory must never contain tokens,
// local paths or private hostnames. Vitest will fail the suite if any sampled
// file carries a Bearer token, an `rt-*` runtime token, a /Users/* path or a
// /home/* path. Runs against whatever is on disk — if `samples/` is empty, the
// test is a no-op and passes.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";

const ROOT = resolvePath(process.cwd(), "samples");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

const FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/Users\/[A-Za-z]/, label: "macOS user home path (/Users/...)" },
  { pattern: /\/home\/[A-Za-z]/, label: "Linux user home path (/home/...)" },
  { pattern: /rt-[A-Za-z0-9_-]{10,}/, label: "Meterless runtime token (rt-...)" },
  { pattern: /Bearer\s+[A-Za-z0-9._-]{10,}/, label: "Bearer <token>" },
];

describe("samples/ never ships secrets or local paths", () => {
  const files = walk(ROOT);
  if (!files.length) {
    it("has no tracked samples yet (skipped)", () => { expect(true).toBe(true); });
    return;
  }
  for (const file of files) {
    const relative = file.slice(ROOT.length + 1);
    const body = readFileSync(file, "utf8");
    for (const { pattern, label } of FORBIDDEN) {
      it(`${relative} does not leak ${label}`, () => {
        const match = pattern.exec(body);
        if (match) {
          throw new Error(`[${relative}] leaked ${label}: ${match[0].slice(0, 60)}`);
        }
      });
    }
  }
});
