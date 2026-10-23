// Risk Gate. A code policy maps the Critic-approved findings to a decision;
// the deep-lane model is asked for its own decision + rationale. The policy is
// the guard rail: the model can never turn weak evidence into "contain" or
// confirmed abuse into "benign". Disagreement, low confidence, DQ conflict or
// a degraded model step all route the case to a human ("escalate").
import type { FindingT, VerdictT } from "./schema.ts";

// L3 — "T1550.004 Web Session Cookie" is the ATT&CK handle for a replayed
// session; HOLDOUT_LESSONS L3 explicitly promotes "null-device + zero-prompt
// + concurrent legit user" into the ABUSE bucket because it is a post-auth
// takeover primitive, not just a foothold.
export const ABUSE_TECHNIQUES = ["T1621", "T1114.003", "T1213", "T1110.003", "T1550.004"]; // post-authentication abuse
export const ACCESS_TECHNIQUES = ["T1566.002", "T1204.001", "T1078.004", "T1078"]; // initial access / foothold
// Phishing exposure signals that only prove the user *saw* the attack surface
// (click, phish_suspect delivery). HOLDOUT_LESSONS L4: if a click exists and
// no post-click signal (new_asn / new_device / rule / fatigue / bulk_sis /
// token_replay) survives in the follow-up window, the correct verdict is
// `monitor` with an `exposure[]` note — unless mfa_method=none, in which
// case the loss of a password is already compromise and the result is
// `escalate`. The subset is a strict subset of ACCESS_TECHNIQUES.
export const PHISH_EXPOSURE_TECHNIQUES = ["T1566.002", "T1204.001"];
export const EXPOSURE_TECHNIQUES = ["T1133", "T1190"];
export const ESCALATE_BELOW = 0.7;

export type PolicyInput = {
  findings: FindingT[]; // after Critic + DQ penalty
  rejectedCount: number;
  dqConflicts: string[];
  degraded: boolean;
  checkedSources: string[]; // e.g. ["signin_event","mail_event"]
  /** L4 — the alerting user's MFA method, from identity_for. `none` upgrades
   *  a clean-follow-up exposure from `monitor` to `escalate` because the loss
   *  of a password with no MFA is already compromise. Optional: the Risk Gate
   *  falls back to pre-L4 behaviour when the identity row is unavailable. */
  mfaMethod?: string | null;
};

export type PolicyDecision = { decision: VerdictT; confidence: number; reasons: string[]; escalate_reasons: string[]; exposure?: Array<{ finding_id: string; claim: string }> };

const has = (f: FindingT, set: string[]) => f.attack.some((t) => set.includes(t));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

export function policy(p: PolicyInput): PolicyDecision {
  const confirmed = p.findings.filter((f) => f.status === "CONFIRMED");
  const abuse = confirmed.filter((f) => has(f, ABUSE_TECHNIQUES));
  const access = confirmed.filter((f) => has(f, ACCESS_TECHNIQUES));
  const exposure = p.findings.filter((f) => has(f, EXPOSURE_TECHNIQUES) && (f.status === "CONFIRMED" || f.status === "LIKELY"));
  const weak = p.findings.filter((f) => f.status !== "CONFIRMED" && f.attack.length);
  // L4 — phish exposure that has not reached any post-authentication signal
  // yet. We identify "post-exposure" signals as access findings that are not
  // purely phish surface (i.e. T1078/T1078.004 but NOT T1566.002/T1204.001),
  // plus any abuse finding. If every confirmed access signal is pure phish
  // exposure AND no abuse / no exposure (KEV) survives, the chain is clean —
  // the user saw the bait, nothing happened downstream.
  const phishExposure = confirmed.filter((f) => has(f, PHISH_EXPOSURE_TECHNIQUES));
  const credentialAccess = confirmed.filter((f) => has(f, ACCESS_TECHNIQUES) && !has(f, PHISH_EXPOSURE_TECHNIQUES));
  const reasons: string[] = [];
  const esc: string[] = [];
  if (p.degraded) esc.push("a model step was degraded");
  if (p.dqConflicts.length) esc.push(...p.dqConflicts.map((c) => `evidence conflict: ${c}`));

  // Standalone takeover: a confirmed password-spray-then-success is already a
  // complete initial-access + valid-accounts chain (T1110.003 + T1078). The
  // Critic has independently re-counted the victims and verified the user's
  // success from the same IP; one such confirmed finding already means the
  // attacker is in. Promote it to contain if there is no DQ conflict.
  const sprayToTakeover = confirmed.filter((f) => f.kind === "password_spray");
  if (sprayToTakeover.length >= 1 && !p.dqConflicts.length) {
    const conf = r2(Math.min(0.95, mean(sprayToTakeover.map((f) => f.confidence))));
    reasons.push(`confirmed password-spray-then-success: Critic re-counted victims and verified sign-in as this user`);
    return { decision: conf < ESCALATE_BELOW ? "escalate" : "contain", confidence: conf, reasons, escalate_reasons: conf < ESCALATE_BELOW ? [...esc, `confidence ${conf} < ${ESCALATE_BELOW}`] : esc };
  }

  // contain: at least two independent confirmed abuse signals, or one abuse + confirmed access chain.
  if (abuse.length >= 2 || (abuse.length >= 1 && access.length >= 2)) {
    const conf = r2(Math.min(0.98, mean([...abuse, ...access].map((f) => f.confidence)) + 0.03 * (abuse.length + access.length - 2)));
    reasons.push(`${abuse.length} confirmed post-auth abuse signal(s) + ${access.length} confirmed access signal(s)`);
    if (p.dqConflicts.length && abuse.length < 3) return { decision: "escalate", confidence: conf, reasons, escalate_reasons: esc };
    return { decision: conf < ESCALATE_BELOW ? "escalate" : "contain", confidence: conf, reasons, escalate_reasons: conf < ESCALATE_BELOW ? [...esc, `confidence ${conf} < ${ESCALATE_BELOW}`] : esc };
  }

  if (exposure.length || abuse.length || access.length) {
    // L4 — "phish exposure without downstream signals" → `monitor` (or
    // `escalate` for mfa_method=none). The chain is clean when:
    //   • there is at least one confirmed phish-exposure finding,
    //   • no abuse finding survives,
    //   • no credential-use (non-phish) access finding survives,
    //   • no exposure (KEV) finding survives,
    //   • no DQ conflict blocks the policy.
    // The policy still carries an `exposure[]` list so the Reporter can
    // surface the click URL / sender domain in the Report. If mfa_method is
    // explicitly 'none', the loss of a password without MFA is already a
    // compromise → escalate instead of monitor.
    const mfa = (p.mfaMethod ?? "").toLowerCase();
    if (phishExposure.length && !abuse.length && !credentialAccess.length && !exposure.length && !p.dqConflicts.length) {
      const confBase = r2(Math.max(0.6, mean(phishExposure.map((f) => f.confidence)) - 0.05));
      const exposureNote = phishExposure.map((f) => ({ finding_id: f.id, claim: f.claim }));
      if (mfa === "none") {
        reasons.push(`phish exposure (${phishExposure.map((f) => f.id).join(",")}) on an account with mfa_method=none; the loss of a password without MFA is already compromise`);
        esc.push("mfa_method=none + phish click: password harvest without MFA is treated as compromise");
        return { decision: "escalate", confidence: Math.max(ESCALATE_BELOW, confBase), reasons, escalate_reasons: esc, exposure: exposureNote };
      }
      reasons.push(`phish exposure (${phishExposure.map((f) => f.id).join(",")}) with a clean follow-up window: no new ASN / device / rule / fatigue / bulk-SIS / token-replay signal survived`);
      return { decision: "monitor", confidence: confBase, reasons, escalate_reasons: esc, exposure: exposureNote };
    }
    if (exposure.length) reasons.push(`sign-in path touches an exposed asset (${exposure.map((f) => f.id).join(",")})`);
    if (abuse.length || access.length) reasons.push(`partial chain: ${abuse.length} abuse + ${access.length} access signal(s), not enough to contain`);
    esc.push("signals of compromise without a confirmed abuse chain");
    return { decision: "escalate", confidence: r2(Math.max(0.5, mean([...exposure, ...abuse, ...access].map((f) => f.confidence)))), reasons, escalate_reasons: esc };
  }

  if (weak.length) {
    reasons.push(`only unconfirmed signal(s): ${weak.map((f) => f.id).join(",")}`);
    return { decision: p.degraded ? "escalate" : "monitor", confidence: 0.7, reasons, escalate_reasons: esc };
  }

  // Nothing survived. Benign is only defensible if the core sources were actually checked.
  const core = ["signin_event", "mail_event"];
  const missing = core.filter((c) => !p.checkedSources.includes(c));
  if (missing.length) {
    esc.push(`core sources not checked: ${missing.join(", ")}`);
    return { decision: "escalate", confidence: 0.5, reasons: ["no surviving signal, but coverage incomplete"], escalate_reasons: esc };
  }
  reasons.push(`no compromise signal survived the Critic${p.rejectedCount ? ` (${p.rejectedCount} claim(s) rejected with explanations)` : ""}`);
  const conf = r2(0.75 + Math.min(0.1, 0.05 * p.rejectedCount));
  return { decision: p.degraded ? "escalate" : "benign", confidence: conf, reasons, escalate_reasons: esc };
}

/** True when the deterministic policy is confident enough that it is honest to
 *  stand on it alone — the chain is complete (core sources checked, no DQ
 *  conflict), the decision is itself non-escalate, and the confidence stays
 *  above the escalate threshold after a −0.1 humility penalty. Used by the
 *  orchestrator when a model step (planner, risk-gate, reporter) was degraded
 *  to decide whether to honour the policy or route to a human. */
export function canStandUnderDegrade(pol: PolicyDecision, p: { dqConflicts: string[]; checkedSources: string[] }): boolean {
  if (pol.decision === "escalate") return false;
  if (pol.escalate_reasons.length) return false;
  if (p.dqConflicts.length) return false;
  const core = ["signin_event", "mail_event"];
  if (core.some((c) => !p.checkedSources.includes(c))) return false;
  return pol.confidence - 0.1 >= ESCALATE_BELOW;
}

/** Model opinion from the Risk-Gate tool call. `cited_finding_ids` is new in
 *  DAY3C — the model is expected to list the ids (F1…) of findings that
 *  support its verdict so the gate can tell grounded from ungrounded dissent.
 *  Absent / empty = ungrounded. */
export type ModelOpinion = { decision: VerdictT; confidence: number; rationale: string; cited_finding_ids?: string[] };

/** Classification of the model's opinion against the Critic-confirmed set. */
export type DissentGrounding =
  | { kind: "agreed" }
  | { kind: "grounded_dissent"; cited_confirmed: string[]; cited_rejected: string[] }
  | { kind: "ungrounded_dissent"; cited_rejected: string[] }
  | { kind: "no_citations_dissent" };

/** Tell *grounded* dissent (model cites one or more CONFIRMED findings) apart
 *  from *ungrounded* dissent (model cites nothing, or only findings the
 *  Critic rejected). Exported for unit tests. */
export function classifyDissent(policyDecision: VerdictT, model: ModelOpinion, approvedFindingIds: string[], rejectedFindingIds: string[]): DissentGrounding {
  if (model.decision === policyDecision) return { kind: "agreed" };
  const cited = (model.cited_finding_ids ?? []).map((id) => id.trim()).filter(Boolean);
  if (!cited.length) return { kind: "no_citations_dissent" };
  const approvedSet = new Set(approvedFindingIds);
  const rejectedSet = new Set(rejectedFindingIds);
  const cited_confirmed = cited.filter((id) => approvedSet.has(id));
  const cited_rejected = cited.filter((id) => rejectedSet.has(id));
  if (cited_confirmed.length) return { kind: "grounded_dissent", cited_confirmed, cited_rejected };
  return { kind: "ungrounded_dissent", cited_rejected };
}

/** Combine the policy decision with the model's opinion.
 *  DAY3C: when the model dissents from the deterministic policy but cites only
 *  findings the Critic rejected (or none), the dissent is ungrounded — the
 *  policy verdict stands, confidence drops by 0.05 and a limitation line is
 *  returned on `escalate_reasons` so the Report records it (the Report class
 *  also moves these onto `limitations`). A dissent that cites at least one
 *  CONFIRMED finding is grounded and uses the pre-DAY3C behaviour. */
export function gate(
  pol: PolicyDecision,
  model?: ModelOpinion,
  options?: { approvedFindingIds?: string[]; rejectedFindingIds?: string[] },
): { decision: VerdictT; confidence: number; escalate_reasons: string[]; agreed: boolean; dissent?: DissentGrounding } {
  const escalate_reasons = [...pol.escalate_reasons];
  if (!model) return { decision: pol.decision, confidence: pol.confidence, escalate_reasons, agreed: false };
  const approvedFindingIds = options?.approvedFindingIds ?? [];
  const rejectedFindingIds = options?.rejectedFindingIds ?? [];
  const classification = classifyDissent(pol.decision, model, approvedFindingIds, rejectedFindingIds);
  const agreed = classification.kind === "agreed";
  let confidence = pol.confidence;
  let decision = pol.decision;
  if (!agreed) {
    const grounded = classification.kind === "grounded_dissent";
    if (!grounded) {
      // Ungrounded dissent: the model cited no findings, or cited only rejected
      // ones. Keep the policy verdict, nick confidence by 0.05, record the
      // reason. Never escalate on an ungrounded dissent alone.
      confidence = r2(Math.max(0, confidence - 0.05));
      escalate_reasons.push(`model dissent not grounded in confirmed evidence (model proposed ${model.decision}, evidence policy says ${pol.decision})`);
    } else {
      // Grounded dissent — the model is pointing at CONFIRMED findings the
      // policy has interpreted differently. Keep the pre-DAY3C behaviour:
      // -0.1 confidence and route the case to a human on disruptive /
      // dismissive edges.
      confidence = r2(Math.max(0, confidence - 0.1));
      escalate_reasons.push(`model proposed ${model.decision}, evidence policy says ${pol.decision}`);
      if (pol.decision === "contain" || pol.decision === "benign" || model.decision === "contain") {
        if (confidence < ESCALATE_BELOW) decision = "escalate";
      }
    }
  }
  if (decision !== "escalate" && confidence < ESCALATE_BELOW) { decision = "escalate"; escalate_reasons.push(`confidence ${confidence} < ${ESCALATE_BELOW}`); }
  return { decision, confidence, escalate_reasons, agreed, dissent: classification };
}
