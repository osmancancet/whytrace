# Where A0 is wrong — every miss on the held-out sets

> This file is the honest committed record of every A0 miss on the held-out sets
> `ho-*` (seen) and `hb-*` (blind). It is derived from the committed per-row
> tables in [`evidence/heldout.md`](heldout.md),
> [`evidence/heldout-eval.md`](heldout-eval.md),
> [`evidence/heldout-eval-rerun.md`](heldout-eval-rerun.md),
> [`evidence/heldout-b.md`](heldout-b.md), and
> [`evidence/heldout-b-eval.md`](heldout-b-eval.md). Every "cause" is traced
> from the raw report under `evidence/eval_raw/`, never inferred.
>
> Scope: unique `(set, case)` A0 misses. A case appears here only if **≥ 1 run**
> was wrong on the model-backed count. All rows below were model-backed
> (`decided_by = model+policy`, no `provider_error`); the DAY6 infra-failed rows
> are excluded by the heldout.md rerun process. "Fixed in v2?" tracks the DAY7
> one-run regression ([`evidence/day7-regression.md`](day7-regression.md)) for
> `ho-*` and the DAY7 blind hb run for `hb-*` (v2 was never changed afterwards
> for hb — the hb set is the only honest measure of v2's generalisation; see
> the FREEZE audit in [`evidence/heldout-b.md`](heldout-b.md)).

## Held-out seen (ho-*) — A0 v1 (DAY6) misses

| case | expected | got (×runs) | model-backed? | one-line cause (from trace) | what it would take | fixed in v2? |
|---|---|---|---|---|---|---|
| ho-01 | contain | escalate ×3 | yes (3/3) | Right facts surfaced (null-device OVH + null-device DigitalOcean MFA approval + inbox rule hiding fatura/IBAN mail + concurrent on-campus sign-in). Risk Gate reads "no verified abuse chain yet" as hedging; no rule maps "null-device + zero-prompt + legit user active in parallel" to session-token replay. | L3 token-replay chain: promote null-device + zero-prompt + concurrent legit session to confirmed abuse, so the inbox-rule finding meets ≥2 abuse → contain. | **yes** (L3 implemented, 3/3 contain on DAY7 v2 one-run run) |
| ho-05 | monitor  | escalate ×3 | yes (3/3) | One-evening M247 Europe (RO) on the user's own managed laptop, bracketed by Superonline home IP on the same device 15 min earlier/later. A0 reads "impossible travel + non-baseline ASN + risk_flag=anonymous_ip" and escalates; no rule downgrades the chain when `device_id` is a known managed device on both sides. | L2 known-managed-device anomaly dissolver: downgrade impossible-travel when `device_id.managed=true` AND same `device_id` is present at both endpoints. | **no** — data expressibility carve-out: seed has `managed=false` on the ho-05 laptop, L2's "both sides are the user's own *managed* device" sanity bound (lifted straight from [`notes/HOLDOUT_LESSONS.md`](../notes/HOLDOUT_LESSONS.md)) honestly declines to fire. Relaxing L2 would make it fire on genuinely unmanaged devices in other scenarios too. Left honest. |
| ho-07 | escalate | benign ×3   | yes (3/3) | Critic's shared-egress rule (added DAY3D for case-002) rejects any password-spray hypothesis anchored on 193.140.10.9 (campus NAT, 188 MFA accounts in 30 d). Real signal — admin's long-baseline DigitalOcean portal IP suddenly reaching HR/SIS/mail at 02:47 — is never raised as a claim and never investigated. | L1 admin baseline-break IP: on `admin` + `mfa=none` accounts, raise an `app-usage change` claim when a long-baseline IP broadens to high-value apps (`hr`, `sis`, `mail`, `admin`). | **yes** (L1 implemented, chronological-walk prior-days baseline check — 3/3 escalate on DAY7 v2 one-run run) |
| ho-08 | monitor  | escalate ×3 | yes (3/3) | Phish delivered + clicked but no credential follow-up (no failures, no new ASN/country/device, no inbox rule, TOTP MFA). System escalates on "phish click = user interacted with threat"; no rule for "exposure signal without downstream signals = monitor". | L4 phish-exposure-only path: when `mail_event.click` or `delivery+phish_suspect` is present but the T-hour window after has no sign-in failures, no new ASN, no new device, no rule → `monitor` with an `exposure[]` block. | **yes** (L4 implemented + L4 raw-rule-count narrowing + L4 phish-exposure-only confidence floor; 3/3 monitor on DAY7 v2 one-run run) |

Summary: 4/8 unique ho cases were A0 v1 misses (DAY6, 12/24 at the row level). **DAY7 L1-L6 fixed 3 of 4** on the one-run v2 regression; the fourth (ho-05) stays honest about a data-expressibility limit. For the full DAY7 story see [`notes/DAY7_REPORT.md`](../notes/DAY7_REPORT.md) and the regression table in [`evidence/day7-regression.md`](day7-regression.md).

## Held-out blind (hb-*) — A0 v2 (DAY7) misses

| case | expected | got (×runs) | model-backed? | one-line cause (from trace) | what it would take | fixed? |
|---|---|---|---|---|---|---|
| hb-02 | monitor  | escalate ×3 | yes (3/3) | mfa=none shared-kiosk account used once from a residential Manisa IP; L4 phish-exposure path does not apply (no phish), L1 admin branch does not apply (role=staff shared), L3 token-replay does not apply (no concurrent legit session). Policy sees null-device + off-campus + mfa=none and escalates — the sanity-bound trap the hb spec called out. | LB-3 `shared_account_offcampus` draft at confidence 0.55: campus-only baseline + mfa=none / shared role + single off-campus with no follow-up → monitor + rotation action. | **no** — v2 is frozen at commit `2b28af2` for the blind measurement. Any fix lands in a future package or the written lesson in [`notes/HOLDOUT_B_LESSONS.md`](../notes/HOLDOUT_B_LESSONS.md). Writing a new lesson after seeing the blind set would turn hb into another training set. |
| hb-05 | contain  | escalate ×3 | yes (3/3) | IMAP burst happens **while the user is asleep**, not concurrently; L3's "concurrent legit session within ±120 min" window never fires. Policy sees `new_asn` + the delete rule and escalates; the data-faithful call is contain (TOTP bypassed via legacy IMAP app password). | LB-1 "legacy-auth protocol never used before" chain: for a UPN whose baseline `signin_event.app` set excludes a protocol (e.g. `imap`), ≥ 5 success rows on that protocol with `device_id IS NULL` AND `mfa_prompt_count = 0` → promote to post-auth abuse regardless of concurrent user activity. | **no** (same reason as hb-02 — v2 frozen for honest blind measurement). |
| hb-07 | monitor  | escalate ×3 | yes (3/3) | 17 failures from 6 hosting ASNs over 6 days against one UPN. Our `password_spray` detector needs multiple victims (≥ 10 distinct UPNs), so it never fires. Policy sees a few `new_asn` findings and escalates on the "weak-signal" branch — no path says "pure-failure stuffing against one UPN → monitor". | LB-2 `credential_stuffing_target` draft at confidence 0.5: failures from ≥ K distinct `asn_org` values over L days against one UPN with zero success → monitor + rotation action (attack T1110.004). | **no** (same reason). |

Summary: 3/8 unique hb cases were A0 v2 misses (9/24 at the row level). All three are over-escalations: the agent kicks ambiguous cases to a human rather than silently landing on the right label like the simple rules do. **A0 v2 has zero false contains and zero false benigns on hb-*** — the agent architecture never silently locks a real user out and never silently clears a real attack. B0 (rules-only) scores 18/24 on hb but with **6 false contains** (hb-04 and hb-08 three times each) and B0 silently locks the real user in those ambiguous cases.

## Error-shape invariant across all three sets

| set | A0 ok/n | A0 FC (false contain) | A0 FB (false benign) | B0 FC | B0 FB | M0 FC | M0 FB |
|---|---|---|---|---|---|---|---|
| dev (21)             | 19/21 | **0** | **0** | 3 | 3 | 3 | 2 |
| ho — seen (24, A0 v1) | 12/24 | **0** | 3 (ho-07) | 3 | 6 | 7 | 3 |
| hb — blind (24, A0 v2) | 15/24 | **0** | **0** | 6 | 0 | 2 | 2 |

(FC = said contain when expected ≠ contain. FB = said benign when expected ≠ benign. Numbers from `evidence/eval.md`, `evidence/heldout.md` and `evidence/heldout-b.md`.)

The v1 → v2 transition eliminated the three ho-07 false benigns (L1). Across the two held-out sets A0 has made **zero false contains and zero false benigns on v2**, while B0 and M0 kept making both kinds silently.
