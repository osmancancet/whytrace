# Generalisation check — held-out cases + perturbation robustness (DAY6)

> All seven dev cases were authored by this project and the system was tuned against them. A judge can fairly call 19/21 overfitted. This document is the honest answer: an independent set of eight blind cases, plus 21 label-preserving perturbations of the dev set.

## FREEZE point (recorded before any change in this session)

- `git rev-parse HEAD` → **`98d8117b91de0e33277c4425de0fb38d28040915`**
- `git diff --stat HEAD` → **empty** (clean working tree at freeze)
- From this freeze until the held-out + perturbation results are written and committed, allowed edit surface is: `services/postgres-seed/**`, `services/mailgw/__fixtures__/**`, `data/**` CSVs, `scripts/zetaris_bootstrap.ts` data rows, `scripts/eval.ts` case-selection + perturbation, `input_examples/**`, `evidence/**`, `notes/**`.
  Disallowed: anything under `packages/agents`, `packages/adapters`, `packages/engines`, prompts/thresholds/policy rules, Scout packs.
- Freeze audit (packages/ diff vs freeze commit) is appended at the END of this file.

## Blind labels

Labels for ho-01…ho-08 are frozen in `notes/HOLDOUT_CASES.md` and were authored before any code was written for them. They are never changed here.

## 1. Seeding — ho-01 … ho-08

Added strictly as data in `services/postgres-seed/src/holdout.ts` (opt-in `withHoldout:true`), reseeded via `npm run seed` + `npm run bootstrap:zetaris -- --apply` (both idempotent). The seed-stability test still proves cases 001–007 + background noise are byte-identical to the pre-DAY6 fixture — the holdout rows strictly append.

| case | expected | expressible | sign-in / mail / vpn (Zetaris) | notes |
|---|---|---|---|---|
| ho-01 | contain | yes | 156 / 3 / 0 | AiTM: 1 phish, 1 click, 1 rule; OVH + DigitalOcean rows have `device_id=null` |
| ho-02 | benign | yes | 144 / 0 / 1 | VPN session `vpn-ho02-5521` on patched `vpn-edge-02` + dev-lab-ce-07 inside the window |
| ho-03 | contain | yes | 107 / 2 / 0 | 6 failures → SMS-approved from Datacamp + forward to proton.me + concurrent legit sign-in |
| ho-04 | escalate | yes | 148 / 2 / 0 | lookalike IBAN phish (no click) + first-ever rule hiding bank/IBAN mail from home IP |
| ho-05 | monitor | yes | 111 / 0 / 0 | one evening on M247 Europe (RO) on known laptop, bracketed by home Superonline IP |
| ho-06 | benign | yes | 582 / 0 / 0 | 220-event SIS morning + Istanbul-geolocating Turkcell phone; registration-period baseline 180 rows (volume trimmed below 200-row query cap, see footnote) |
| ho-07 | escalate | yes | 453 / 0 / 0 | 38 nightly DigitalOcean portal baseline + 10-17 same IP hits SIS/mail for the first time |
| ho-08 | monitor | yes | 130 / 2 / 0 | KYK scholarship phish delivered + clicked; follow-up sign-ins match baseline |

Device rows (12 total) populate `security_usl.device` for the 12 ho device IDs. `vpn-edge-01` / `vpn-edge-02` are reused as-is (not overwritten) per the HOLDOUT_CASES.md note.

Footnote on ho-06: `signins_for` returns at most `DEFAULT_LIMIT=200` rows (`packages/adapters/src/zetaris.ts`). The HOLDOUT_CASES.md spec implies 180–260 SIS events/day during the registration window; we seed 180 rows across 2026-09-15 → 09-26 (~20/day) so one query can see both the registration-period volume and the 2026-10-09 incident. The *pattern* the analyst wanted — current-day volume comparable to a prior registration window — is preserved; the literal 180–260/day is not. If this changes behaviour (benign vs contain), we call it out in step 4.

Alert files for each case live in `input_examples/ho-01.json` … `input_examples/ho-08.json`.


## 2. Held-out eval — single run

- Command: `npm run eval -- --cases ho-01,ho-02,ho-03,ho-04,ho-05,ho-06,ho-07,ho-08 --runs 3 --baseline --wait-healthy 120`
- Accept condition: `cached model calls ~= 0` (independent samples, not replays).
- Rerun policy: a run with `infra_unavailable` MAY be reseeded once, with reason noted in the row.

(filled in once step 2 completes)

## 3. Perturbation robustness — 7 dev cases × 3 variants (A0 only)

- Deterministic transforms per variant (seed = `20261023 + variant_index`):
  - new UPN (user + display name), new identity row;
  - timestamp shift by a whole number of days inside the eval window;
  - attacker IPs/ASNs replaced with other plausible hosting ASNs;
  - benign travel city/country replaced with another plausible one (keep ISP consistent).
- Baseline campus/home ISP IPs are kept, labels unchanged by construction.

(filled in once step 3 completes)

## 4. Side-by-side result

(filled in once steps 2 and 3 finish — dev set / held-out / perturbation)

## 5. FREEZE audit (last)

(filled in at the end of the session)
