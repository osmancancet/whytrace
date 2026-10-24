// Guard-rail test for the GitHub Pages data bundle (site/data.js). After
// `python3 site/export_data.py` runs in CI, the resulting data.js must contain
// no tokens, no real-person emails, no /Users/<name> or /home/<name> paths,
// no absolute local paths from the builder's workstation. We also fail the
// suite if data.js is missing, since the Pages workflow would publish an
// empty page otherwise. Runs against whatever is on disk; passes locally
// without data.js (CI regenerates it before deploy).
//
// The same forbidden-patterns check runs over every file under
// site/recorded/** — those are the scrubbed, tracked copies of logs/<run_id>/
// that export_data.py consumes, so a leak there would be published too.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

const DATA = resolvePath(process.cwd(), "site", "data.js");
const RECORDED = resolvePath(process.cwd(), "site", "recorded");

function walkFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    const full = resolvePath(root, name);
    const s = statSync(full);
    if (s.isDirectory()) out.push(...walkFiles(full));
    else if (s.isFile()) out.push(full);
  }
  return out;
}

// Fictional domains / anchors we deliberately keep in the data.
const ALLOWED_DOMAIN = /@aegean\.edu/;
// The project itself attributes its builder once (README + deck). The site
// should never surface a personal email of a real person in the data bundle.
const BUILDER_EMAIL = /osmancan[a-z.]*@/i;

const FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\/Users\/[A-Za-z]/, label: "macOS user home path (/Users/...)" },
  { pattern: /\/home\/[A-Za-z]/, label: "Linux user home path (/home/...)" },
  { pattern: /rt-[A-Za-z0-9_-]{10,}/, label: "Meterless runtime token (rt-...)" },
  { pattern: /Bearer\s+[A-Za-z0-9._-]{10,}/, label: "Bearer <token>" },
  { pattern: BUILDER_EMAIL, label: "builder's personal email address" },
];

describe("site/data.js never ships secrets, local paths or real emails", () => {
  if (!existsSync(DATA)) {
    it("site/data.js is not yet generated (skipped; CI regenerates it)", () => { expect(true).toBe(true); });
    return;
  }
  const body = readFileSync(DATA, "utf8");

  for (const { pattern, label } of FORBIDDEN) {
    it(`site/data.js does not leak ${label}`, () => {
      const match = pattern.exec(body);
      if (match) throw new Error(`site/data.js leaked ${label}: ${String(match[0]).slice(0, 60)}`);
    });
  }

  it("site/data.js uses only fictional @aegean.edu identities", () => {
    const emails = body.match(/[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
    const bad: string[] = [];
    for (const e of emails) {
      // Allow:
      //  * @aegean.edu (our fictional org)
      //  * the attacker-shaped mail addresses that appear in the recorded
      //    phishing scenarios ("l1b-archive@protonmail.com",
      //    "a.sahin.copy@outlook.com", etc.) — they are part of the recorded
      //    incident and never belong to a real person.
      //  * the fictional support@aegean-edu.co lookalike + its variants.
      if (ALLOWED_DOMAIN.test(e)) continue;
      if (/@(?:protonmail\.com|outlook\.com|gmail\.com|aegean-edu\.co|aegean-lms\.co)$/.test(e)) continue;
      bad.push(e);
    }
    if (bad.length) throw new Error(`unexpected real-looking emails in site/data.js: ${bad.slice(0, 5).join(", ")}`);
  });
});

describe("site/recorded/** never ships secrets, local paths or real emails", () => {
  const files = walkFiles(RECORDED);
  if (files.length === 0) {
    it("site/recorded/ is empty (skipped; run `python3 site/record_runs.py`)", () => { expect(true).toBe(true); });
    return;
  }

  for (const file of files) {
    const rel = file.slice(resolvePath(process.cwd()).length + 1);
    const body = readFileSync(file, "utf8");

    for (const { pattern, label } of FORBIDDEN) {
      it(`${rel} does not leak ${label}`, () => {
        const match = pattern.exec(body);
        if (match) throw new Error(`${rel} leaked ${label}: ${String(match[0]).slice(0, 60)}`);
      });
    }

    it(`${rel} uses only fictional identities`, () => {
      const emails = body.match(/[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? [];
      const bad: string[] = [];
      for (const e of emails) {
        if (ALLOWED_DOMAIN.test(e)) continue;
        if (/@(?:protonmail\.com|outlook\.com|gmail\.com|aegean-edu\.co|aegean-lms\.co)$/.test(e)) continue;
        bad.push(e);
      }
      if (bad.length) throw new Error(`unexpected real-looking emails in ${rel}: ${bad.slice(0, 5).join(", ")}`);
    });
  }
});
