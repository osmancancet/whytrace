// Risk Gate. A code policy maps the Critic-approved findings to a decision;
// the deep-lane model is asked for its own decision + rationale. The policy is
// the guard rail: the model can never turn weak evidence into "contain" or
// confirmed abuse into "benign". Disagreement, low confidence, DQ conflict or
// a degraded model step all route the case to a human ("escalate").
import type { FindingT, VerdictT } from "./schema.ts";

export const ABUSE_TECHNIQUES = ["T1621", "T1114.003", "T1213", "T1110.003"]; // post-authentication abuse
export const ACCESS_TECHNIQUES = ["T1566.002", "T1204.001", "T1078.004", "T1078"]; // initial access / foothold
export const EXPOSURE_TECHNIQUES = ["T1133", "T1190"];
export const ESCALATE_BELOW = 0.7;

export type PolicyInput = {
  findings: FindingT[]; // after Critic + DQ penalty
  rejectedCount: number;
  dqConflicts: string[];
  degraded: boolean;
  checkedSources: string[]; // e.g. ["signin_event","mail_event"]
};

export type PolicyDecision = { decision: VerdictT; confidence: number; reasons: string[]; escalate_reasons: string[] };

const has = (f: FindingT, set: string[]) => f.attack.some((t) => set.includes(t));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

export function policy(p: PolicyInput): PolicyDecision {
  const confirmed = p.findings.filter((f) => f.status === "CONFIRMED");
  const abuse = confirmed.filter((f) => has(f, ABUSE_TECHNIQUES));
  const access = confirmed.filter((f) => has(f, ACCESS_TECHNIQUES));
  const exposure = p.findings.filter((f) => has(f, EXPOSURE_TECHNIQUES) && (f.status === "CONFIRMED" || f.status === "LIKELY"));
  const weak = p.findings.filter((f) => f.status !== "CONFIRMED" && f.attack.length);
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

/** Combine the policy decision with the model's opinion. */
export function gate(pol: PolicyDecision, model?: { decision: VerdictT; confidence: number; rationale: string }): { decision: VerdictT; confidence: number; escalate_reasons: string[]; agreed: boolean } {
  const escalate_reasons = [...pol.escalate_reasons];
  if (!model) return { decision: pol.decision, confidence: pol.confidence, escalate_reasons, agreed: false };
  const agreed = model.decision === pol.decision;
  let confidence = pol.confidence;
  let decision = pol.decision;
  if (!agreed) {
    confidence = r2(Math.max(0, confidence - 0.1));
    escalate_reasons.push(`model proposed ${model.decision}, evidence policy says ${pol.decision}`);
    // Any disagreement about a disruptive or dismissive verdict goes to a human.
    if (pol.decision === "contain" || pol.decision === "benign" || model.decision === "contain") {
      if (confidence < ESCALATE_BELOW) decision = "escalate";
    }
  }
  if (decision !== "escalate" && confidence < ESCALATE_BELOW) { decision = "escalate"; escalate_reasons.push(`confidence ${confidence} < ${ESCALATE_BELOW}`); }
  return { decision, confidence, escalate_reasons, agreed };
}
