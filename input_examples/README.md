# Input examples — alerts an analyst would hand WhyTrace

Each file is a single alert JSON. Point the agent at one with
`npm run investigate <case_id>` (or `--input input_examples/<case_id>.json`).

- `case-001.json` … `case-007.json` — the dev-set alerts used during
  development; their matching reports are under `output_examples/`.
- `ho-01.json` … `ho-08.json` — DAY6 held-out set. The labels were authored
  blind by a separate analyst (see `notes/HOLDOUT_CASES.md`); their eval
  evidence lives in `evidence/heldout.md`.

Format is intentionally thin — the agents pull everything else they need
from Zetaris. The alert names the account, the arrival channel, a short
free-text symptom, and the UTC time the ticket was raised.
