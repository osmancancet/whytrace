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

Status table (filled in after step 1 completes):

| case | expected | expressible | seeded rows (sign-in / mail / device / vpn) | zetaris verify |
|---|---|---|---|---|

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
