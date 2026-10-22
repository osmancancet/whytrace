// `npm run eval:adversarial` — planted-false-claim test.
//
// Takes the recorded "healthy" reports (output_examples/case-00*.json), injects
// ≥ 40 deliberately false sentences across 6 categories into the Investigator's
// finding list, and asks the Critic + validateReport() to catch them. The
// check needs no model — the Critic runs its own Zetaris queries (against the
// FakeZetaris fixture) and validateReport reads the recorded queries.jsonl.
// Writes evidence/adversarial.md with per-category caught/total.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve as resolvePath } from "node:path";
import { critique } from "../packages/agents/src/critic.ts";
import { FakeZetaris } from "../packages/agents/src/testing/fake-zetaris.ts";
import { validateReport, type QueryLogRecord } from "../packages/agents/src/validate.ts";
import type { FindingT, Report } from "../packages/agents/src/schema.ts";

type PlantCategory = "wrong_ip" | "wrong_count" | "wrong_time" | "invented_cve" | "wrong_user" | "unsupported_causal";

type PlantResult = { category: PlantCategory; caught_by: "validator" | "critic" | "none"; reason: string };

function latestReport(caseId: string): Report | undefined {
  const dir = resolvePath("output_examples");
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((f) => f.startsWith(`${caseId}-`) && f.endsWith(".json")).sort();
  const latest = files[files.length - 1];
  if (!latest) return undefined;
  return JSON.parse(readFileSync(join(dir, latest), "utf8")) as Report;
}

function makeFalseFinding(category: PlantCategory, i: number, baseUpn: string, realSqlId: string): FindingT {
  const id = `FP${i}`;
  const base: Omit<FindingT, "kind" | "claim" | "attack" | "facts" | "sql_ids" | "row_refs"> = {
    id,
    hypothesis_id: "H-adv",
    status: "LIKELY",
    confidence: 0.8,
    entity_ids: [`account:idp:${baseUpn}`],
    dq_flags: [],
  };
  switch (category) {
    case "wrong_ip": {
      // Phishing delivery claim with a sender_domain that was never seen in the mail log.
      return { ...base, kind: "phish_delivery", claim: `Phishing-suspect mail delivered from fake-${i}.co`, sql_ids: [realSqlId], row_refs: [`${realSqlId}#0`], attack: ["T1566.002"], facts: { upn: baseUpn, sender_domain: `fake-${i}.co` } };
    }
    case "wrong_count": {
      // MFA fatigue claim with a count that will not reproduce (0/0 on re-query).
      return { ...base, kind: "mfa_fatigue", claim: `MFA fatigue: ${99 + i} denies before 2 approvals`, sql_ids: [realSqlId], row_refs: [`${realSqlId}#0`], attack: ["T1621"], facts: { upn: `nobody${i}@aegean.edu`, denies: 99 + i, approves: 2 } };
    }
    case "wrong_time": {
      // Impossible-travel claim naming event ids that don't resolve.
      return { ...base, kind: "impossible_travel", claim: `Impossible travel at ${new Date().toISOString()}`, sql_ids: [realSqlId], row_refs: [`${realSqlId}#0`], attack: ["T1078.004"], facts: { upn: baseUpn, from_event: `evt_fake_from_${i}`, to_event: `evt_fake_to_${i}`, minutes: 10 } };
    }
    case "invented_cve": {
      // KEV exposure that cites an appliance not in inventory.
      return { ...base, kind: "kev_exposure", claim: `Appliance fake-edge-${i} firmware exposed to CVE-9999-${i}`, sql_ids: [realSqlId], row_refs: [`${realSqlId}#0`], attack: ["T1190"], facts: { upn: baseUpn, appliance_id: `fake-edge-${i}` } };
    }
    case "wrong_user": {
      // forward_rule naming an event id that doesn't match any row for this user.
      return { ...base, kind: "forward_rule", claim: `Inbox forwarding rule for a different user via fake rule ${i}`, sql_ids: [realSqlId], row_refs: [`${realSqlId}#0`], attack: ["T1114.003"], facts: { upn: `attacker${i}@aegean.edu`, event_id: `r:fake-${i}` } };
    }
    case "unsupported_causal": {
      // Pure claim with no sql_id → validateReport drops it.
      return { ...base, kind: "custom_narrative", claim: `Unsupported causal claim #${i}: the account was taken over because of ${i}`, sql_ids: [], row_refs: [], attack: ["T1078"], facts: { upn: baseUpn } };
    }
  }
}

async function planted(report: Report, perCategory = 7): Promise<PlantResult[]> {
  const log: QueryLogRecord[] = []; // reconstruct from report.findings' sql_ids
  const sqlIds = [...new Set(report.findings.flatMap((f) => f.sql_ids))];
  for (const sid of sqlIds) log.push({ sql_id: sid, rows: 10, status: "ok" });
  const realSql = sqlIds[0] ?? "aaaaaaaaaaaa";
  const results: PlantResult[] = [];
  const z = new FakeZetaris();

  const categories: PlantCategory[] = ["wrong_ip", "wrong_count", "wrong_time", "invented_cve", "wrong_user", "unsupported_causal"];
  for (const cat of categories) {
    for (let i = 0; i < perCategory; i++) {
      const f = makeFalseFinding(cat, i, report.case_id === "case-001" ? "d.yilmaz@aegean.edu" : report.case_id === "case-002" ? "prof.kaya@aegean.edu" : "s.demir@aegean.edu", realSql);
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
      results.push({ category: cat, caught_by: caughtBy, reason: reason.slice(0, 200) });
    }
  }
  return results;
}

async function main() {
  const cases = ["case-001", "case-002", "case-003"];
  const perCategory = 7; // 6 × 7 × 3 = 126 plants, well over the ≥ 40 floor
  const perCase: Record<string, PlantResult[]> = {};
  for (const c of cases) {
    const r = latestReport(c);
    if (!r) {
      console.log(`[adv] no recorded report for ${c}, skipping`);
      continue;
    }
    perCase[c] = await planted(r, perCategory);
    console.log(`[adv] ${c}: ${perCase[c]!.length} plants, caught ${perCase[c]!.filter((x) => x.caught_by !== "none").length}`);
  }

  // Aggregate.
  const total: Record<PlantCategory, { total: number; caught_validator: number; caught_critic: number; miss: number }> = {
    wrong_ip: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    wrong_count: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    wrong_time: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    invented_cve: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    wrong_user: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
    unsupported_causal: { total: 0, caught_validator: 0, caught_critic: 0, miss: 0 },
  };
  for (const rs of Object.values(perCase)) {
    for (const p of rs) {
      total[p.category].total += 1;
      if (p.caught_by === "validator") total[p.category].caught_validator += 1;
      else if (p.caught_by === "critic") total[p.category].caught_critic += 1;
      else total[p.category].miss += 1;
    }
  }
  const grandTotal = Object.values(total).reduce((a, c) => a + c.total, 0);
  const grandCaught = Object.values(total).reduce((a, c) => a + c.caught_validator + c.caught_critic, 0);

  const stamp = new Date().toISOString();
  const md: string[] = [
    `# WhyTrace — adversarial planted-claim evaluation (${stamp})`, "",
    `Deterministic test. Takes the latest recorded report for each of ${cases.join(", ")}, injects ${perCategory} false findings per category per case, and runs them through the Critic + validateReport() without a model.`, "",
    `**Headline: ${grandCaught}/${grandTotal} planted false claims were caught (${((grandCaught / grandTotal) * 100).toFixed(1)}%).**`, "",
    "| category | total | caught by validator | caught by critic | missed |", "|---|---|---|---|---|",
    ...(Object.entries(total) as Array<[PlantCategory, (typeof total)[PlantCategory]]>).map(([c, s]) => `| ${c} | ${s.total} | ${s.caught_validator} | ${s.caught_critic} | ${s.miss} |`), "",
    "## Example rejections", "",
  ];
  for (const [c, rs] of Object.entries(perCase)) {
    md.push(`### ${c}`, "");
    const sample = rs.filter((x) => x.caught_by !== "none").slice(0, 6);
    for (const s of sample) md.push(`- **${s.category}** → caught by ${s.caught_by}: ${s.reason}`);
    const missed = rs.filter((x) => x.caught_by === "none");
    if (missed.length) {
      md.push("", `Missed (${missed.length}):`, "");
      for (const m of missed.slice(0, 6)) md.push(`- **${m.category}** — ${m.reason || "(no reason)"}`);
    }
    md.push("");
  }
  mkdirSync(resolvePath("evidence"), { recursive: true });
  writeFileSync(resolvePath("evidence", "adversarial.md"), md.join("\n"));
  console.log(`wrote evidence/adversarial.md — ${grandCaught}/${grandTotal} caught`);
}

main().catch((err) => { console.error(err); process.exit(1); });
