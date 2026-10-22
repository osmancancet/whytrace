# WhyTrace evaluation — 2026-10-22T13:55:07.022Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

## A0 — full system

Accuracy 1/6 · false contain 0 · false benign 0 · median time-to-verdict 190.1 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.9 | 1 | 21 | 3 | 190.6 | 0 | mvjjez5q_56a8a85342 |
| case-002 | benign | 1 | escalate | ❌ | 0.85 | 2 | 14 | 4 | 61.7 | 3 | mvjjj292_158515400e |
| case-003 | escalate | 1 | escalate | ✅ | 0.5 | 2 | 10 | 4 | 61.3 | 0 | mvjjkdue_0fb132ee8a |
| case-004 | contain | 1 | escalate | ❌ | 0.85 | 1 | 19 | 3 | 190.1 | 0 | mvjjlp43_c35664744b |
| case-005 | benign | 1 | escalate | ❌ | 0.85 | 1 | 18 | 3 | 189.6 | 0 | mvjjprs4_93e1009be0 |
| case-006 | monitor | 1 | escalate | ❌ | 0.91 | 1 | 23 | 3 | 190.1 | 0 | mvjjtu26_8d86c14768 |

## A1 — no Critic re-query

Accuracy 1/6 · false contain 0 · false benign 0 · median time-to-verdict 188.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.7 | 1 | 15 | 3 | 187.9 | 0 | mvjjxwre_b5a552d95c |
| case-002 | benign | 1 | escalate | ❌ | 0.7 | 2 | 17 | 4 | 203.5 | 0 | mvjk1xrl_282b34f52c |
| case-003 | escalate | 1 | escalate | ✅ | 0.5 | 2 | 7 | 4 | 59.0 | 0 | mvjk6as2_584627eb81 |
| case-004 | contain | 1 | escalate | ❌ | 0.7 | 1 | 15 | 3 | 187.9 | 0 | mvjk7kb1_eb35d0a808 |
| case-005 | benign | 1 | escalate | ❌ | 0.7 | 1 | 15 | 3 | 188.6 | 0 | mvjkblbm_f04160e8de |
| case-006 | monitor | 1 | escalate | ❌ | 0.7 | 1 | 15 | 3 | 188.6 | 0 | mvjkfmu9_94c3beff24 |

## A2 — no DQ signal

Accuracy 1/6 · false contain 0 · false benign 0 · median time-to-verdict 188.9 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.9 | 1 | 19 | 3 | 189.1 | 0 | mvjkjoco_b7bab81e51 |
| case-002 | benign | 1 | escalate | ❌ | 0.85 | 2 | 11 | 4 | 59.8 | 3 | mvjknqa6_cdf7db2bf0 |
| case-003 | escalate | 1 | escalate | ✅ | 0.7 | 2 | 7 | 4 | 58.7 | 0 | mvjkp0fj_e1f2437b9b |
| case-004 | contain | 1 | escalate | ❌ | 0.85 | 1 | 17 | 3 | 188.9 | 0 | mvjkq9r1_ac6b9dcb3f |
| case-005 | benign | 1 | escalate | ❌ | 0.85 | 1 | 16 | 3 | 188.8 | 0 | mvjkubi8_82c74a0315 |
| case-006 | monitor | 1 | escalate | ❌ | 0.91 | 1 | 21 | 3 | 190.6 | 0 | mvjkyd7i_a241174948 |

## A4 — single agent (no Critic, no DQ, no memory)

Accuracy 1/6 · false contain 0 · false benign 0 · median time-to-verdict 188.7 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 187.8 | 0 | mvjl2gbc_11dd20f8cb |
| case-002 | benign | 1 | escalate | ❌ | 0.7 | 2 | 14 | 4 | 202.8 | 0 | mvjl6h8a_4b27890a36 |
| case-003 | escalate | 1 | escalate | ✅ | 0.7 | 2 | 4 | 4 | 58.4 | 0 | mvjlatqj_271080b66a |
| case-004 | contain | 1 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 188.8 | 0 | mvjlc2t0_9b8d327fc9 |
| case-005 | benign | 1 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 188.7 | 0 | mvjlg4hl_8a24309fba |
| case-006 | monitor | 1 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 188.0 | 0 | mvjlk645_bf1ed7ecca |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 10 | 4 | 60.8 |
| warm | escalate | 1 | 2 | 10 | 4 | 62.1 |
