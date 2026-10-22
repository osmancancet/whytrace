# WhyTrace evaluation — 2026-10-22T19:43:14.421Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: format_miss accepted — provider is up, model responded with prose (provider responded with prose (0 chars) instead of invoking submit_probe).

Terminal status: `format_miss`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-22T18:06:45.970Z | format_miss | nvidia/nemotron-3.5-super-vl-120b-a12b | provider responded with prose (0 chars) instead of invoking submit_probe |

## A0 — full system

Judged 4/6 ok · infra_unavailable 0/6 · false contain 0 · false benign 0 · degraded runs 6/6 · provider_failures 1 · median time 70.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.75 | 1 | 13 | 3 | 70.4 | 1 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjurt91_f3c72a68db |
| case-002 | benign | 1 | benign | ✅ | 0.75 | 2 | 15 | 4 | 4.3 | 3 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjutbmi_1fad0d67a8 |
| case-003 | escalate | 1 | escalate | ✅ | 0.5 | 2 | 11 | 4 | 4.2 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjutewu_29eafda9c4 |
| case-004 | contain | 1 | escalate | ❌ | 0.75 | 1 | 22 | 13 | 45.2 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjuti5y_7e6ba95684 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 1 | 10 | 3 | 197.2 | 2 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjuuh2t_41d0969ead |
| case-006 | monitor | 1 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 76.6 | 2 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjuyp97_c803181f2c |

## A1 — no Critic re-query

Judged 1/6 ok · infra_unavailable 0/6 · false contain 0 · false benign 0 · degraded runs 6/6 · provider_failures 4 · median time 484.2 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.6 | 1 | 16 | 13 | 224.7 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjv0cd3_b512a22998 |
| case-002 | benign | 1 | escalate | ❌ | 0.6 | 2 | 18 | 13 | 558.2 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvjv55s1_4807dec61c |
| case-003 | escalate | 1 | escalate | ✅ | 0.4 | 2 | 8 | 4 | 108.9 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjvh4gp_fb773860e9 |
| case-004 | contain | 1 | escalate | ❌ | 0.6 | 1 | 16 | 13 | 112.5 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjvjggx_40e874ac96 |
| case-005 | benign | 1 | escalate | ❌ | 0.7 | 1 | 9 | 6 | 484.2 | 0 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjvlvbd_7f4f0bea5d |
| case-006 | monitor | 1 | escalate | ❌ | 0.7 | 1 | 16 | 13 | 578.2 | 0 | yes | 2 | nemotron-3.5-super-vl-120b-a12b | mvjvw8xh_bd00d78c79 |

## A2 — no DQ signal

Judged 4/6 ok · infra_unavailable 0/6 · false contain 0 · false benign 0 · degraded runs 6/6 · provider_failures 1 · median time 200.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.75 | 1 | 11 | 3 | 315.7 | 1 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjw8n34_e9f17f74ce |
| case-002 | benign | 1 | benign | ✅ | 0.75 | 2 | 12 | 4 | 5.3 | 3 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjwfeoy_2c4c537fec |
| case-003 | escalate | 1 | escalate | ✅ | 0.7 | 2 | 8 | 4 | 243.7 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjwfir5_a34664e17b |
| case-004 | contain | 1 | escalate | ❌ | 0.75 | 1 | 20 | 13 | 6.4 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjwkqtv_7858a7f6c3 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 1 | 8 | 3 | 200.6 | 2 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjwkvrd_c14d27ac64 |
| case-006 | monitor | 1 | escalate | ❌ | 0.7 | 1 | 11 | 3 | 5.1 | 2 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjwp6k2_f00f270cdd |

## A4 — single agent (no Critic, no DQ, no memory)

Judged 1/6 ok · infra_unavailable 0/6 · false contain 0 · false benign 0 · degraded runs 6/6 · provider_failures 10 · median time 439.1 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.6 | 1 | 14 | 13 | 361.1 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjwpagk_506cb9b809 |
| case-002 | benign | 1 | escalate | ❌ | 0.7 | 2 | 15 | 13 | 438.9 | 0 | yes | 2 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvjwx14e_bf8316cf8a |
| case-003 | escalate | 1 | escalate | ✅ | 0.7 | 2 | 5 | 4 | 440.8 | 0 | yes | 2 | nemotron-3.5-super-vl-120b-a12b | mvjx6frl_9289e54f50 |
| case-004 | contain | 1 | escalate | ❌ | 0.7 | 1 | 14 | 13 | 248.6 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjxfvw5_bbfdc1abff |
| case-005 | benign | 1 | escalate | ❌ | 0.7 | 1 | 8 | 3 | 592.3 | 0 | yes | 3 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjxl7ph_eb91891169 |
| case-006 | monitor | 1 | escalate | ❌ | 0.6 | 1 | 14 | 13 | 439.1 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjxxwpx_7a828aa771 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 2/6 ok · infra_unavailable 0/6 · false contain 1 · false benign 1 · degraded runs 0/6 · provider_failures 0 · median time 0.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.6 | 0 | no | 0 | - | mvjy7bk2_98b40fec31 |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 2.3 | 0 | no | 0 | - | mvjy7cs4_66f34c145f |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | no | 0 | - | mvjy7ek3_457828156d |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjy7f0g_db21c0fd03 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjy7fcv_3f8f91a02c |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjy7foi_b96b646b9c |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 11 | 4 | 5.0 |
| warm | escalate | 1 | 2 | 11 | 4 | 6.1 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
