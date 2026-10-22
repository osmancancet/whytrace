// Scripted stand-in for the Nightshift client, used only by unit tests.
import type { VerdictT } from "../schema.ts";

type Msg = { role: string; content: string };
export type FakePlan = { hypotheses: Array<{ id: string; label: string }>; steps: Array<{ hypothesis_id: string; query_name: string; params?: Record<string, string>; why: string }> };

export class FakeNightshift {
  readonly calls: Array<{ tool: string; messages: Msg[] }> = [];
  constructor(private readonly script: {
    plan?: (round: number, user: string) => FakePlan;
    risk?: (evidence: string) => { decision: VerdictT; confidence: number; rationale: string };
    note?: () => Record<string, unknown>;
    failTools?: string[];
  } = {}) {}

  async callTool<T>(opts: { messages: Msg[]; toolName: string; parse: (a: Record<string, unknown>) => T }): Promise<{ value: T; model: string; latencyMs: number; retryCount: number; receipt?: { receipt_id?: string }; raw: never }> {
    this.calls.push({ tool: opts.toolName, messages: opts.messages });
    if (this.script.failTools?.includes(opts.toolName)) throw new Error(`Nightshift 502: simulated failure for ${opts.toolName}`);
    const user = opts.messages[opts.messages.length - 1]?.content ?? "";
    let args: Record<string, unknown>;
    if (opts.toolName === "submit_plan") {
      const round = /^Round (\d+)/.exec(user) ? Number(/^Round (\d+)/.exec(user)![1]) : 1;
      args = (this.script.plan ?? defaultPlan)(round, user) as unknown as Record<string, unknown>;
    } else if (opts.toolName === "submit_risk") {
      args = (this.script.risk ?? (() => ({ decision: "escalate", confidence: 0.6, rationale: "fake" })))(user);
    } else {
      args = this.script.note?.() ?? { summary: "Fake note citing F1.", actions: [{ action: "Revoke sessions", attack: ["T1078.004"] }, { action: "Review evidence", attack: [] }], limitations: [], not_checked: ["travel calendar not connected"] };
    }
    return { value: opts.parse(args), model: "nvidia/nemotron-fake", latencyMs: 1, retryCount: 0, receipt: { receipt_id: `rcpt_${this.calls.length}` }, raw: undefined as never };
  }
}

export function defaultPlan(round: number): FakePlan {
  if (round > 1) return { hypotheses: [{ id: "H1", label: "follow-up" }], steps: [{ hypothesis_id: "H1", query_name: "vpn_sessions_for", why: "check VPN" }] };
  return {
    hypotheses: [{ id: "H1", label: "phishing → takeover" }, { id: "H2", label: "travel / benign" }],
    steps: ["mail_chain", "clicks_for", "rules_for", "mfa_fatigue", "new_asn", "signins_for", "signin_count_by_country"].map((q) => ({ hypothesis_id: q === "signin_count_by_country" ? "H2" : "H1", query_name: q, why: `check ${q}` })),
  };
}
