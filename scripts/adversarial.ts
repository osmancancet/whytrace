// `npm run eval:adversarial` — planted-false-claim test, DAY3B edition.
//
// Takes the recorded "healthy" reports (output_examples/case-00*.json), reads
// the FakeZetaris fixture tables, and plants deliberately false findings whose
// values are plausible NEAR-MISSES drawn from the actual data:
//   - wrong_ip         : a real IP from the same /24 OR another real sign-in IP from the fixture
//   - wrong_count      : the real count ±1 and ±10 % (two plants per case)
//   - wrong_time       : the real event shifted by 5–90 minutes
//   - invented_cve     : a real KEV CVE for an unrelated product (not Ivanti Connect Secure)
//   - wrong_user       : another real UPN from the directory (not the alerting UPN)
//   - unsupported_causal : a plausible causal link that does not have an sql_id supporting it
//
// Deterministic (seeded). Reports whatever catch rate falls out, honestly,
// per category and lists the misses. The Critic + validateReport() checks are
// code — no model is called. Writes evidence/adversarial.md.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { critique } from "../packages/agents/src/critic.ts";
import { FakeZetaris, fixtureTables, type Row } from "../packages/agents/src/testing/fake-zetaris.ts";
import { validateReport, type QueryLogRecord } from "../packages/agents/src/validate.ts";
import type { FindingT, Report } from "../packages/agents/src/schema.ts";

type PlantCategory = "wrong_ip" | "wrong_count" | "wrong_time" | "invented_cve" | "wrong_user" | "unsupported_causal";

type PlantResult = { category: PlantCategory; caught_by: "validator" | "critic" | "none"; reason: string; plant_detail: string };

/** Mulberry32 — deterministic 32-bit PRNG. Seeded with a stable integer so
 *  the test produces the same plants across runs; swap the seed only when
 *  the fixture changes materially. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function choice<T>(rng: () => number, arr: T[]): T { return arr[Math.floor(rng() * arr.length) % arr.length]!; }
function shiftIso(iso: string, minutes: number): string {
  const t = new Date(iso.replace(" ", "T").replace(/\.0$/, "") + "Z").getTime();
  return new Date(t + minutes * 60_000).toISOString().replace("T", " ").replace("Z", "") + ".0";
}
function parentNet(ip: string): string {
  const parts = ip.split(".");
  if (parts.length !== 4) return ip;
  return parts.slice(0, 3).join(".");
}
function neighbourInSlashTwentyFour(rng: () => number, ip: string): string {
  const octets = ip.split(".");
  if (octets.length !== 4) return ip;
  const base = Number(octets[3] ?? "1") || 1;
  const delta = Math.max(1, Math.floor(rng() * 20) + 1);
  const next = ((base + delta) % 254) + 1;
  return `${octets.slice(0, 3).join(".")}.${next}`;
}

function latestReport(caseId: string): Report | undefined {
  const dir = resolvePath("output_examples");
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((f) => f.startsWith(`${caseId}-`) && f.endsWith(".json")).sort();
  const latest = files[files.length - 1];
  if (!latest) return undefined;
  return JSON.parse(readFileSync(join(dir, latest), "utf8")) as Report;
}

type PlantContext = {
  rng: () => number;
  upn: string;
  realSqlId: string;
  tables: ReturnType<typeof fixtureTables>;
  // Pre-computed menus of plausible near-miss values for this case.
  realIps: string[];        // IPs seen in the fixture (any UPN) — used for wrong_ip
  attackerIp: string;       // the real attacker IP cited by this case's report, if any
  otherUpns: string[];      // other real UPNs in the directory, not the alerting UPN
  signinsForUpn: Row[];     // sign-in rows for this UPN sorted by ts
  mailRulesForUpn: Row[];   // forward_rule rows for this UPN
  realDeliveries: Row[];    // phish_suspect deliveries anywhere in the fixture
  realCount: number;        // a representative "real" count (e.g. SIS success count) for this case
};

function makeContext(caseId: string, report: Report, rng: () => number): PlantContext {
  const tables = fixtureTables();
  const upn = report.case_id === "case-001" ? "d.yilmaz@aegean.edu"
    : report.case_id === "case-002" ? "prof.kaya@aegean.edu"
    : report.case_id === "case-003" ? "s.demir@aegean.edu"
    : "d.yilmaz@aegean.edu";
  const realIps = [...new Set(tables.signin_event.map((r) => String(r.ip ?? "")).filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip)))];
  const attackerIp = (() => {
    for (const f of report.findings) {
      const ip = f.facts?.ip;
      if (typeof ip === "string" && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip;
    }
    return realIps[0] ?? "";
  })();
  const otherUpns = tables.identity.map((r) => String(r.upn)).filter((u) => u !== upn);
  const signinsForUpn = tables.signin_event.filter((r) => r.upn === upn).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const mailRulesForUpn = tables.mail_event.filter((r) => r.upn === upn && r.kind === "rule" && r.verdict === "forward");
  const realDeliveries = tables.mail_event.filter((r) => r.kind === "delivery" && r.verdict === "phish_suspect");
  // Representative "real" count — pick an SIS success count if the alerting
  // report has a bulk_sis finding; otherwise fall back to the sign-in count.
  const bulk = report.findings.find((f) => f.kind === "bulk_sis");
  const realCount = Number(bulk?.facts?.events ?? signinsForUpn.length) || signinsForUpn.length || 10;
  const sqlIds = [...new Set(report.findings.flatMap((f) => f.sql_ids))];
  const realSqlId = sqlIds[0] ?? "aaaaaaaaaaaa";
  // Discard unused by TS strict mode
  void rng;
  return { rng, upn, realSqlId, tables, realIps, attackerIp, otherUpns, signinsForUpn, mailRulesForUpn, realDeliveries, realCount };
}

/** Build a plant that uses a plausible near-miss value drawn from `ctx`. The
 *  `variant` encodes near-miss sub-shapes so wrong_count can be ±1 and ±10 %
 *  without needing extra categories. */
function makeFalseFinding(category: PlantCategory, i: number, variant: number, ctx: PlantContext): { finding: FindingT; detail: string } {
  const id = `FP${category}-${i}`;
  const base: Omit<FindingT, "kind" | "claim" | "attack" | "facts" | "sql_ids" | "row_refs"> = {
    id,
    hypothesis_id: "H-adv",
    status: "LIKELY",
    confidence: 0.8,
    entity_ids: [`account:idp:${ctx.upn}`],
    dq_flags: [],
  };
  switch (category) {
    case "wrong_ip": {
      // Half the plants use a neighbour IP in the same /24 as the attacker IP;
      // the other half use another real sign-in IP from the fixture (a totally
      // different ASN but still a real IP). Both are plausible — a human
      // skim-read would not spot "the IP is wrong".
      const ip = variant % 2 === 0
        ? neighbourInSlashTwentyFour(ctx.rng, ctx.attackerIp)
        : choice(ctx.rng, ctx.realIps.filter((x) => x !== ctx.attackerIp));
      const detail = `wrong_ip near-miss: claim cites ${ip} (parent /24=${parentNet(ip)}; real attacker IP ${ctx.attackerIp})`;
      return {
        finding: { ...base, kind: "password_spray", claim: `Password spray from ${ip}: ≥10 accounts failed and ${ctx.upn} then succeeded`, sql_ids: [ctx.realSqlId], row_refs: [`${ctx.realSqlId}#0`], attack: ["T1110.003"], facts: { upn: ctx.upn, ip } },
        detail,
      };
    }
    case "wrong_count": {
      // Four near-miss shapes: real+1, real-1, real+10%, real-10%. The ±1 case
      // is the hardest — the Critic has to actually re-count, not just check "> 0".
      const n = ctx.realCount;
      const shaped = variant % 4 === 0 ? n + 1
        : variant % 4 === 1 ? Math.max(1, n - 1)
        : variant % 4 === 2 ? Math.round(n * 1.1)
        : Math.max(1, Math.round(n * 0.9));
      const detail = `wrong_count near-miss: claim cites ${shaped} (real ≈ ${n}; delta=${(shaped - n > 0 ? "+" : "") + (shaped - n)})`;
      // Shape as a bulk_sis claim so the Critic has to re-count SIS successes.
      return {
        finding: { ...base, kind: "bulk_sis", claim: `Bulk SIS access from ${ctx.attackerIp}: ${shaped} successful SIS events in 60 min`, sql_ids: [ctx.realSqlId], row_refs: [`${ctx.realSqlId}#0`], attack: ["T1213"], facts: { upn: ctx.upn, ip: ctx.attackerIp, events: shaped } },
        detail,
      };
    }
    case "wrong_time": {
      // Shift a real sign-in by 5–90 min and claim an impossible travel from
      // it. Both event ids will NOT resolve on re-query, but the ts and shape
      // of the claim look plausible.
      const first = ctx.signinsForUpn[0];
      const anchor = first ? String(first.ts) : "2026-10-14 06:00:00.0";
      const shiftMin = 5 + Math.floor(ctx.rng() * 85);
      const shifted = shiftIso(anchor, variant % 2 === 0 ? shiftMin : -shiftMin);
      // Use event ids that look right but do not exist — adversarial typo in a trailing digit.
      const realEvt = ctx.signinsForUpn.find((r) => String(r.event_id).startsWith("evt_"))?.event_id ?? "evt_000001";
      const altEvt = `${String(realEvt).slice(0, -1)}${(Number(String(realEvt).slice(-1)) + 1) % 10}`;
      const detail = `wrong_time near-miss: shifted anchor by ${shiftMin > 0 ? "+" : ""}${shiftMin} min; event_ids ${realEvt}→${altEvt} (one real-looking, both unresolvable together)`;
      return {
        finding: { ...base, kind: "impossible_travel", claim: `Impossible travel for ${ctx.upn} at ${shifted}`, sql_ids: [ctx.realSqlId], row_refs: [`${ctx.realSqlId}#0`], attack: ["T1078.004"], facts: { upn: ctx.upn, from_event: `${String(realEvt).replace("evt_", "evt_x")}`, to_event: altEvt, minutes: shiftMin } },
        detail,
      };
    }
    case "invented_cve": {
      // Real KEV CVE *for an unrelated product*. The fixture's vulnerability
      // table only contains Ivanti Connect Secure; we plant an unrelated real
      // CVE and claim an appliance in the inventory is exposed to it.
      const unrelatedCves = [
        { cve: "CVE-2024-3400", product: "Palo Alto GlobalProtect" }, // real KEV
        { cve: "CVE-2024-21762", product: "Fortinet FortiOS SSL VPN" },
        { cve: "CVE-2023-27997", product: "Fortinet FortiOS SSL VPN" },
        { cve: "CVE-2022-1388", product: "F5 BIG-IP iControl REST" },
      ];
      const pick = unrelatedCves[variant % unrelatedCves.length]!;
      const detail = `invented_cve near-miss: cites real KEV ${pick.cve} (${pick.product}) but applied to appliance_id=vpn-edge-01 (Ivanti Connect Secure in the fixture)`;
      return {
        // facts carry the planted cve id so the Critic has something concrete
        // to re-check against the KEV table. A real investigator finding of
        // this shape would also name the CVE in facts.
        finding: { ...base, kind: "kev_exposure", claim: `VPN appliance vpn-edge-01 exposed to ${pick.cve} (${pick.product})`, sql_ids: [ctx.realSqlId], row_refs: [`${ctx.realSqlId}#0`], attack: ["T1190"], facts: { upn: ctx.upn, appliance_id: "vpn-edge-01", cve_claim: pick.cve } },
        detail,
      };
    }
    case "wrong_user": {
      // Plant a forwarding rule facts bag that cites a REAL other UPN's
      // event id — but the alerting user is the current UPN. The Critic
      // re-queries by UPN and should find that no matching row for this
      // upn exists (or that the row forwards internally if it exists).
      const otherUpn = choice(ctx.rng, ctx.otherUpns);
      const otherRule = ctx.tables.mail_event.find((r) => r.kind === "rule" && r.verdict === "forward" && r.upn === otherUpn);
      const otherEvt = otherRule ? String(otherRule.event_id) : "r:rule-unknown";
      const detail = `wrong_user near-miss: cites the forwarding rule ${otherEvt} belonging to ${otherUpn} but attributes it to ${ctx.upn}`;
      return {
        finding: { ...base, kind: "forward_rule", claim: `Inbox forwarding rule to external address created by ${ctx.upn} via API`, sql_ids: [ctx.realSqlId], row_refs: [`${ctx.realSqlId}#0`], attack: ["T1114.003"], facts: { upn: ctx.upn, event_id: otherEvt } },
        detail,
      };
    }
    case "unsupported_causal": {
      // Plausible but unproven causal link — the claim reads naturally but
      // the sql_ids list is empty, so validateReport() must drop it. This
      // tests the "no evidence, no narrative" guarantee.
      const narratives = [
        `the account was taken over because ${ctx.upn} clicked a phishing link on their personal device`,
        `the ${ctx.upn} session on the VPN appliance was hijacked because of a cookie replay from a nearby cafe`,
        `the forwarding rule was pre-provisioned by the attacker during an earlier reconnaissance phase`,
        `the MFA fatigue burst was triggered by an insider sharing credentials with a third party`,
      ];
      const narr = narratives[variant % narratives.length]!;
      const detail = `unsupported_causal near-miss: narrative is plausible but no sql_id supports it`;
      return {
        finding: { ...base, kind: "custom_narrative", claim: narr, sql_ids: [], row_refs: [], attack: ["T1078"], facts: { upn: ctx.upn } },
        detail,
      };
    }
  }
}

async function planted(report: Report, perCategory = 7): Promise<PlantResult[]> {
  // Seed derives from the case id so each case is deterministic across runs,
  // but different cases do not share plant values.
  const seed = Array.from(report.case_id).reduce((a, c) => (a * 131 + c.charCodeAt(0)) >>> 0, 2026_10_23);
  const rng = makeRng(seed);
  const ctx = makeContext(report.case_id, report, rng);
  const log: QueryLogRecord[] = [];
  const sqlIds = [...new Set(report.findings.flatMap((f) => f.sql_ids))];
  for (const sid of sqlIds) log.push({ sql_id: sid, rows: 10, status: "ok" });
  const results: PlantResult[] = [];
  const z = new FakeZetaris();

  const categories: PlantCategory[] = ["wrong_ip", "wrong_count", "wrong_time", "invented_cve", "wrong_user", "unsupported_causal"];
  for (const cat of categories) {
    for (let i = 0; i < perCategory; i++) {
      const { finding: f, detail } = makeFalseFinding(cat, i, i, ctx);
      // Phase 1 — Critic independent re-query.
      let caughtBy: "validator" | "critic" | "none" = "none";
      let reason = "";
      try {
        const c = await critique(z, [f]);
        if (c.rejected.length) { caughtBy = "critic"; reason = c.rejected[0]!.reason; }
      } catch (err) {
        reason = `critic error: ${(err as Error).message}`;
      }
      // Phase 2 — if Critic approved (or needs_more), run validateReport.
      if (caughtBy === "none") {
        const draft: Report = { ...report, findings: [...report.findings, f] };
        const { report: validated, issues } = validateReport(draft, log);
        if (!validated.findings.some((x) => x.id === f.id)) {
          caughtBy = "validator";
          reason = issues.find((i) => i.item === f.id)?.reason ?? "dropped by validator";
        }
      }
      results.push({ category: cat, caught_by: caughtBy, reason: reason.slice(0, 240), plant_detail: detail });
    }
  }
  return results;
}

async function main() {
  const cases = ["case-001", "case-002", "case-003"];
  const perCategory = 7; // 6 × 7 × 3 = 126 plants
  const perCase: Record<string, PlantResult[]> = {};
  for (const c of cases) {
    const r = latestReport(c);
    if (!r) { console.log(`[adv] no recorded report for ${c}, skipping`); continue; }
    perCase[c] = await planted(r, perCategory);
    console.log(`[adv] ${c}: ${perCase[c]!.length} plants, caught ${perCase[c]!.filter((x) => x.caught_by !== "none").length}`);
  }

  const total: Record<PlantCategory, { total: number; caught_validator: number; caught_critic: number; miss: number }> = {
    wrong_ip: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    wrong_count: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    wrong_time: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    invented_cve: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    wrong_user: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    unsupported_causal: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
  };
  for (const rs of Object.values(perCase)) for (const p of rs) {
    total[p.category].total += 1;
    if (p.caught_by === "validator") total[p.category].caught_validator += 1;
    else if (p.caught_by === "critic") total[p.category].caught_critic += 1;
    else total[p.category].miss += 1;
  }
  const grandTotal = Object.values(total).reduce((a, c) => a + c.total, 0);
  const grandCaught = Object.values(total).reduce((a, c) => a + c.caught_validator + c.caught_critic, 0);

  const stamp = new Date().toISOString();
  const md: string[] = [
    `# WhyTrace — adversarial planted-claim evaluation (${stamp})`, "",
    `Deterministic. For each of ${cases.join(", ")} we take the latest recorded report, build ${perCategory} plants per category from values drawn out of the real fixture (neighbouring /24 IPs, real-count ±1 and ±10 %, time shifts of 5–90 min, real KEV CVEs for unrelated products, real other-UPN event ids, plausible-but-unsupported narratives), and run the plants through the Critic + validateReport() without a model.`, "",
    `**Headline: ${grandCaught}/${grandTotal} planted false claims were caught (${((grandCaught / grandTotal) * 100).toFixed(1)}%).**`, "",
    "| category | total | caught by validator | caught by critic | missed |",
    "|---|---|---|---|---|",
    ...(Object.entries(total) as Array<[PlantCategory, (typeof total)[PlantCategory]]>).map(([c, s]) => `| ${c} | ${s.total} | ${s.caught_validator} | ${s.caught_critic} | ${s.miss} |`),
    "",
    "## Example rejections and misses", "",
  ];
  for (const [c, rs] of Object.entries(perCase)) {
    md.push(`### ${c}`, "");
    const sample = rs.filter((x) => x.caught_by !== "none").slice(0, 6);
    for (const s of sample) md.push(`- **${s.category}** → caught by ${s.caught_by}: ${s.plant_detail}; critic/validator said: ${s.reason}`);
    const missed = rs.filter((x) => x.caught_by === "none");
    if (missed.length) {
      md.push("", `Missed (${missed.length}):`, "");
      for (const m of missed) md.push(`- **${m.category}** — ${m.plant_detail}`);
    }
    md.push("");
  }
  mkdirSync(resolvePath("evidence"), { recursive: true });
  writeFileSync(resolvePath("evidence", "adversarial.md"), md.join("\n"));
  console.log(`wrote evidence/adversarial.md — ${grandCaught}/${grandTotal} caught`);
}

main().catch((err) => { console.error(err); process.exit(1); });
