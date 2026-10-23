// Case definitions mirror notes/SCENARIOS.md. Timestamps are UTC and the
// generator uses seeded RNG so the data is byte-reproducible.

export type Role = "staff" | "student" | "faculty";
export type MfaMethod = "push" | "totp" | "sms";

export type IdentitySeed = {
  upn: string;
  display_name: string;
  role: Role;
  department: string;
  mfa_method: MfaMethod;
  home_country: string;
  manager_upn?: string;
  created_at: string;
};

export type SigninSeed = {
  event_id: string;
  ts: string;
  upn: string;
  result: "success" | "failure" | "mfa_denied" | "mfa_approved";
  ip: string;
  asn?: string;
  asn_org?: string;
  country?: string;
  city?: string;
  device_id?: string | null;
  user_agent?: string;
  app: "mail" | "lms" | "sis" | "vpn" | "portal";
  mfa_prompt_count?: number;
  risk_flag?: string;
  via_vpn_appliance?: string | null;
};

export type VpnSeed = {
  session_id: string;
  upn: string;
  ts_start: string;
  ts_end?: string | null;
  appliance_id: string;
  client_ip?: string;
  assigned_ip?: string;
};

export type MailDelivery = {
  message_id: string;
  ts: string;
  sender: string;
  sender_domain: string;
  recipient_upn: string;
  subject: string;
  verdict: "clean" | "spam" | "phish_suspect";
  url_count: number;
  spf: "pass" | "fail" | "neutral";
  dkim: "pass" | "fail" | "none";
  dmarc: "pass" | "fail" | "none";
};

export type MailClick = {
  click_id: string;
  ts: string;
  message_id: string;
  upn: string;
  url: string;
  url_domain: string;
  user_ip: string;
};

export type MailRule = {
  rule_id: string;
  ts: string;
  upn: string;
  action: "forward" | "delete" | "move";
  target: string;
  created_via: "owa" | "api" | "mobile";
  // Attacker-controlled free text (the rule's display name in the mail gateway).
  // Case-007 uses this to carry a prompt-injection payload that Scout Intent
  // must quarantine before any model prompt sees it. Optional for backward
  // compatibility with existing rows that have no name.
  name?: string;
};

export type AssetRow = {
  device_id: string;
  owner_upn: string;
  hostname: string;
  os: string;
  os_version: string;
  managed: boolean;
  last_seen: string;
  type: "laptop" | "desktop" | "phone" | "vpn_appliance";
  firmware: string;
  location: string;
};

export const CASES = {
  "case-001": { upn: "d.yilmaz@aegean.edu", expected: "contain" },
  "case-002": { upn: "prof.kaya@aegean.edu", expected: "benign" },
  "case-003": { upn: "s.demir@aegean.edu", expected: "escalate" },
  "case-004": { upn: "m.aslan@aegean.edu", expected: "contain" },
  "case-005": { upn: "e.oz@aegean.edu", expected: "benign" },
  "case-006": { upn: "b.cetin@aegean.edu", expected: "monitor" },
  "case-007": { upn: "a.sahin@aegean.edu", expected: "contain" },
} as const satisfies Record<string, { upn: string; expected: string }>;
