// Orchestrator-side Scout integration: scan every untrusted string that could
// reach a model prompt (mail-rule target/detail, user_agent, device_name, sign-in
// subject, VPN client string) and either quarantine or block it before the
// Risk Gate / Reporter see it.
//
// What is "untrusted" here: anything that an external actor controls. Numbers,
// SQL ids, our own schema values and the UPN format are trusted. The function
// returns a list of per-finding guard results so the Report / orchestrator can
// surface them as `prompt_injection_attempt` entries.
import { Scout, type ScoutDecision } from "@whytrace/scout-intent";
import type { FindingT } from "./schema.ts";

export type ScoutGateResult = {
  mergedRisk: ScoutDecision["risk"]["level"];
  attempts: Array<{ finding_id: string; field: string; policy: string; ruleId: string; reason: string; match: string }>;
  /** Fields that must be quarantined before they land in a prompt. */
  quarantined: Array<{ finding_id: string; field: string; quarantinedText: string }>;
  /** Fields that triggered a block-tier intent — the orchestrator should
   *  refuse to pass these through at all. */
  blocked: Array<{ finding_id: string; field: string; reason: string }>;
};

function extractUntrustedFields(f: FindingT): Record<string, string> {
  const out: Record<string, string> = {};
  const facts = f.facts ?? {};
  // Mail rule fields.
  if (typeof facts.target === "string") out.mail_rule_target = facts.target;
  if (typeof facts.detail === "string") out.mail_rule_detail = facts.detail;
  if (typeof facts.via === "string") out.mail_rule_via = facts.via;
  if (typeof facts.name === "string") out.mail_rule_name = facts.name;
  if (typeof facts.subject === "string") out.mail_subject = facts.subject;
  if (typeof facts.sender_domain === "string") out.mail_sender_domain = facts.sender_domain;
  // Sign-in fields: user_agent and ASN name are attacker-controlled strings.
  if (typeof facts.user_agent === "string") out.user_agent = facts.user_agent;
  if (typeof facts.asn_org === "string") out.asn_org = facts.asn_org;
  // Device name: trusted inventory but still a free-text string.
  if (typeof facts.device_id === "string") out.device_name = facts.device_id;
  // The claim text itself can carry an injection phrase if it quotes an
  // attacker-controlled field verbatim; keep it in scope.
  if (typeof f.claim === "string") out.finding_claim = f.claim;
  return out;
}

export function runScoutGate(scout: Scout, findings: FindingT[], surface = "orchestrator"): ScoutGateResult {
  const attempts: ScoutGateResult["attempts"] = [];
  const quarantined: ScoutGateResult["quarantined"] = [];
  const blocked: ScoutGateResult["blocked"] = [];
  let merged: ScoutDecision["risk"]["level"] = "allow";
  for (const f of findings) {
    const fields = extractUntrustedFields(f);
    const r = scout.scanFields(fields, surface);
    for (const [field, dec] of Object.entries(r.perField)) {
      for (const g of dec.guards) attempts.push({ finding_id: f.id, field, policy: g.policy, ruleId: g.ruleId, reason: g.reason, match: g.match });
      if (dec.risk.level === "quarantine" && dec.quarantinedText) quarantined.push({ finding_id: f.id, field, quarantinedText: dec.quarantinedText });
      if (dec.risk.level === "block") blocked.push({ finding_id: f.id, field, reason: dec.risk.reasons.join("; ") });
    }
    if (r.mergedRisk === "block") merged = "block";
    else if (r.mergedRisk === "quarantine" && merged !== "block") merged = "quarantine";
  }
  return { mergedRisk: merged, attempts, quarantined, blocked };
}

/** Replace every untrusted string in a finding with its Scout-quarantined form,
 *  so a downstream prompt that cites `facts.detail` or `facts.user_agent` sees
 *  the fenced data block instead of the raw attacker text. Returns a NEW
 *  finding object; the original is untouched. */
export function sanitizeFinding(f: FindingT, gate: ScoutGateResult): FindingT {
  const quarantines = gate.quarantined.filter((q) => q.finding_id === f.id);
  if (!quarantines.length) return f;
  const facts = { ...f.facts };
  let claim = f.claim;
  for (const q of quarantines) {
    const map: Record<string, keyof typeof facts | "finding_claim"> = {
      mail_rule_target: "target", mail_rule_detail: "detail", mail_rule_via: "via", mail_rule_name: "name",
      mail_subject: "subject", mail_sender_domain: "sender_domain",
      user_agent: "user_agent", asn_org: "asn_org", device_name: "device_id", finding_claim: "finding_claim",
    };
    const factKey = map[q.field];
    if (factKey === "finding_claim") claim = q.quarantinedText;
    else if (factKey && typeof facts[factKey] === "string") facts[factKey] = q.quarantinedText;
  }
  return { ...f, claim, facts };
}
