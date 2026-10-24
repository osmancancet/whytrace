# Blind set hb-01 … hb-08 — v2 FREEZE and run

> The hb-* cases were authored by a separate analyst agent that saw neither
> the DAY7 lesson implementations nor the dev-case patterns. v2 (DAY7
> lessons L1-L6 + faithfulness honesty companions) is the system under
> test; the hb-* set is the only honest measure of its generalisation.

## FREEZE point

- `git rev-parse HEAD` at the start of the hb-* run → **`2b28af2056b12dc6e63d6018a4053fabb8c7699e`**
- Allowed edit surface after the freeze: `services/postgres-seed/**`,
  `data/**`, `input_examples/**`, `evidence/**`, `notes/**`,
  `scripts/eval.ts` (case-lookup wiring only — same carve-out DAY6 used).
  The product-code freeze is enforced by the audit at the end of this file.
- `services/postgres-seed/src/scenarios.ts` was extended to add two new
  enum values: `app: "hr" | "imap"` (the IdP already carries these
  tags; the dev-set enum had been hiding them) and `type: "tablet"` for
  hb-06. These are data-schema changes, not product-logic changes.
  `services/postgres-seed/src/schema.sql`'s `app CHECK` was widened in
  lockstep. No `packages/**` file was touched.

## Blind labels

Labels for hb-01 … hb-08 are frozen in `notes/HOLDOUT_CASES_B.md` and were
authored before any code change in this package. They are not touched here.

## 1. Seeding — hb-01 … hb-08

Added strictly as data in `services/postgres-seed/src/holdout_b.ts` (opt-in
`withHoldoutB:true`), reseeded via `npm run seed` + Zetaris MAILGW cache
refresh (UNCACHE + CACHE on `deliveries`, `clicks`, `rules`). Dev-set +
ho-set hashes are preserved because hb-* rows are strictly appended.

| case | expected | expressible | sign-in rows / mail rows / vpn rows (Zetaris) | notes |
|---|---|---|---|---|
| hb-01 | contain | yes | 16 / 1 / 0 | dormant Library account + Contabo VPS + API forward to protonmail + HR/SIS harvest; mfa_method=none |
| hb-02 | monitor | yes | 240+ / 0 / 0 | ~240 weekday campus kiosk successes + one 198.51.100 TTNET home sign-in; no mailbox activity |
| hb-03 | benign | yes | ~165 / 80 / 0 | documented IT-admin bulk rule push (42 internal folder-move rules), precedent on 2026-09-15 (38 rules) |
| hb-04 | escalate | yes* | ~85 / 0 / 0 | duplicate event id + 14 null-network HR rows on an unregistered device. *Carve-outs: the second row of the duplicate is suffixed `-dup` to satisfy the Postgres `event_id` PRIMARY KEY (per HOLDOUT_CASES_B note); the 14 null-network rows carry `ip=''` because `ip` is `NOT NULL` in Postgres — the "network fields missing" semantics are visible via the DQ rule rather than NULLs |
| hb-05 | contain | yes | ~140 / 1 / 0 | legacy IMAP from DigitalOcean NL + Hetzner DE, null device, zero prompts, 27 rows; API delete rule for password/security mail |
| hb-06 | benign | yes | ~130 / 0 / 0 | faculty travel to Athens on new unmanaged tablet corroborated by managed phone from the same Greek IP 7 min earlier |
| hb-07 | monitor | yes | ~77 / 0 / 0 | 17 failures from 6 rotating hosting ASNs over 6 days, zero success from attacker infrastructure |
| hb-08 | escalate | yes | ~440 / 1 / 0 | legitimate device + home IP + TOTP throughout, but OWA rule forwards student-list mail to a personal Gmail and 115 off-hours SIS sessions over 2 nights |

Device inventory for hb-* (14 rows) populates `security_usl.device`. The
unregistered device `DEV-H04-X` is intentionally NOT in the inventory —
hb-04 hinges on it.

## 2. Blind eval — classification and reruns

- Command (24 Oct ~04:16 TR, Mac awake with `caffeinate -i`):
  `npm run eval -- --cases hb-01,hb-02,hb-03,hb-04,hb-05,hb-06,hb-07,hb-08 --runs 3 --baseline --wait-healthy 120 --out evidence/heldout-b-eval.md`.
- Health gate online on the first probe; all 24 A0 rows + 24 B0 rows + 24
  M0 rows (72 total) ran model-backed where applicable with `cached = 0`
  and no `provider_error`. **No infra-fail reruns were needed.**
- A pre-run (before the resolveCase hb-wiring edit was applied) failed on
  "Unknown case: hb-01" for A0 and defaulted B0 / M0 to "expected ?" — it
  is retained in the raw folder but **not** counted in the headline.

## 3. Headlines

| variant | ok | FC | FB | model-backed | median time |
|---|---|---|---|---|---|
| **A0 v2 (full)** | **15/24 (62.5%)** | **0** | **0** | 24/24 | 41.1 s |
| B0 (rules-only) | **18/24 (75%)** | 6 | 0 | n/a | 0.5 s |
| M0 (model-only) | 17/24 (70.8%) | 2 | 2 | 24/24 | 15.7 s |

Per-case A0 v2 verdicts (3 runs each, 24 total):

| case | expected | A0 v2 | ok | note |
|---|---|---|---|---|
| hb-01 | contain | contain ×3 | 3/3 | L1 (admin+none) / L3 fires on the dormant-account chain + forward rule |
| hb-02 | monitor | escalate ×3 | 0/3 | over-escalate: null-device off-campus on an mfa=none kiosk account; no L-rule downgrades it |
| hb-03 | benign | benign ×3 | 3/3 | 42-rule internal-folder push correctly cleared (rules target internal folder, not external) |
| hb-04 | escalate | escalate ×3 | 3/3 | the duplicate-event + unregistered-device evidence conflict escalates on policy's DQ branch |
| hb-05 | contain | escalate ×3 | 0/3 | L3 did not promote the IMAP burst to abuse — the `WhyMail-IMAP/2.3` UA does not match `NON_INTERACTIVE_UA`, but the user is NOT concurrently active during the attack (user's row is 5 h later, outside the L3 window) so the abuse-promotion gate declines |
| hb-06 | benign | benign ×3 | 3/3 | the managed phone from the identical Greek IP 7 min earlier dissolves the "new tablet" alert |
| hb-07 | monitor | escalate ×3 | 0/3 | over-escalate: 17 failures from hosting ASNs trip the "signals without abuse chain" branch even though 0 succeeded — the policy has no "pure-failure spray against one UPN" → monitor path |
| hb-08 | escalate | escalate ×3 | 3/3 | the OWA forward to gmail + 115 SIS successes satisfies 1 abuse + 1 access = partial chain → escalate (the "cannot separate insider from takeover" judgment the HB spec called for) |

### Honest commentary — B0 (rules-only) beats A0 v2 on this blind set

Numerically **B0 scores 18/24 vs A0 v2's 15/24**, so B0 is ahead on the
hb-* measure. But the error shapes still differ:

- A0 v2 has **zero false contains** on hb-*. It never locks a real user
  out of the system. B0 wrongly contains hb-04 and hb-08 three times
  each (6 false contains in total): both are ambiguous cases where
  "escalate for a human to decide" is the right verdict.
- A0 v2 has **zero false benigns**. B0 has zero too; M0 has two.
- A0 v2's three misses are all **over-escalations** (expected
  monitor / contain, got escalate):
  - hb-02 — the "campus-only kiosk account used once from a residential
    IP" pattern looks like a password-reuse attempt to a policy that only
    sees null-device + off-campus + mfa=none. The HOLDOUT_CASES_B spec
    explicitly flagged this as a sanity-bound trap: an analyst would
    rotate and watch, not contain. L5 (regression guard) doesn't help
    because there's no phish; a new "shared-kiosk / weak-signal baseline
    break" rule would.
  - hb-05 — the attacker's IMAP burst happens *while the user is asleep*,
    not concurrently; L3's "concurrent legit session within ±120 min"
    doesn't fire. Our policy sees `new_asn` + a delete rule and
    escalates; the data-faithful call is `contain` (TOTP bypassed via
    legacy IMAP). A new "legacy-auth protocol never used before + API
    delete rule for security mail → abuse chain" would push A0 to
    contain.
  - hb-07 — 17 failures from 6 ASNs over 6 days against one UPN. The
    Investigator's `password_spray` detector needs **multiple victims**
    (≥10 distinct UPNs), so it never fires. The policy sees nothing
    strong but a few `new_asn` findings and escalates on the
    "weak-signal" branch. A new "many hosting-ASN failures against one
    UPN without success → monitor" would push this to monitor.
- B0's shape is riskier for an analyst: it silently contains both of
  hb-04 (ambiguous dupe-id evidence) and hb-08 (insider-or-takeover),
  locking out a real user in each case. A0 v2 escalates both for human
  review. B0 benefits from scoring "rules fire = contain" literally.

M0 (model-only) tells us that **Nemotron alone, without our Critic / Risk
Gate pipeline, lands at 17/24** on this blind set but with 2 false contains
+ 2 false benigns — the agent architecture still prevents the worst-shape
mistakes.

### Three-column generalisation story

| | **dev set (7, 1 run)** | **seen held-out ho (8, 1 run)** | **blind hb (8, 3 runs = 24)** |
|---|---|---|---|
| **A0 v1 (DAY6 full)** | 19/21 (90.5%) · FC 0 · FB 0 | 12/24 (50%) · FC 0 · FB 3 | — |
| **A0 v2 (DAY7 full)** | **7/7 (100%)** · FC 0 · FB 0 | **7/8 (87.5%)** · FC 0 · FB 0 | **15/24 (62.5%)** · FC 0 · FB 0 |
| B0 (rules-only) | 3/7 (43%) · FC 1 · FB 1 | 5/8 (63%) · FC 1 · FB 2 | 18/24 (75%) · FC 6 · FB 0 |
| M0 (model-only) | 4/7 (57%) · FC 2 · FB 1 | 3/8 (38%) · FC 2 · FB 2 | 17/24 (71%) · FC 2 · FB 2 |

(FC = false contain = said contain when expected ≠ contain. FB = false
benign. The v1 dev number uses the DAY6 21-run perturbation sweep from
`evidence/heldout.md`; the v2 columns are from the DAY7 runs in
`evidence/day7-regression.md` and `evidence/heldout-b-eval.md`.)

**Headline: v2 clears v1 on dev + seen-held-out (6 cases fixed, 1
regression bounded by data), but B0 still beats v2 on the blind
set 18/24 vs 15/24.** The L1-L6 lessons address the specific over-
escalation shapes we had seen; the hb-* set surfaces three new shapes
(shared-kiosk weak signal, legacy-protocol-with-asleep-user,
single-UPN hosting-ASN failures) that no DAY7 lesson covers. See
`notes/HOLDOUT_B_LESSONS.md` for candidate rules.

v2 still beats B0 on **error shape**: zero false contains on hb-*
(vs B0's six), zero false benigns on dev + ho + hb (vs B0's three
across the three sets). The agent architecture's job — never
wrongly lock a real user, never silently clear a real attack — is
intact.

## 4. FREEZE audit (last)

- `git rev-parse HEAD` at end of session → _(filled in by the final
  commit after this file)_
- `git diff --stat 2b28af2056b12dc6e63d6018a4053fabb8c7699e -- packages/`
  → **(empty)** — no file under `packages/agents`, `packages/adapters`
  or `packages/engines` was changed between the v2 freeze and the hb-*
  run. The system under test for hb-* is byte-identical to the freeze
  commit.
- The full `git diff --stat 2b28af2056b12dc6e63d6018a4053fabb8c7699e`
  for this hb-* phase touches only: `services/postgres-seed/**` (new
  `holdout_b.ts` + enum/schema widening + seed-wiring), `data/**`
  (regenerated CSV + mailgw snapshots), `input_examples/hb-*.json`,
  `evidence/**` (this file + eval raw + eval-history snapshot),
  `notes/**` (DAY7_REPORT.md + HOLDOUT_B_LESSONS.md), and
  `scripts/eval.ts` (case-lookup wiring only — same carve-out DAY6
  used, documented in evidence/heldout.md).
