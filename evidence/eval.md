# WhyTrace evaluation — 2026-10-22T17:48:47.767Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: format_miss accepted — provider is up, model responded with prose (provider responded with prose (0 chars) instead of invoking submit_probe).

Terminal status: `format_miss`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-22T16:47:48.391Z | format_miss | nvidia/nemotron-3.5-super-vl-120b-a12b | provider responded with prose (0 chars) instead of invoking submit_probe |

## A0 — full system

Judged 12/18 ok · infra_unavailable 0/18 · false contain 0 · false benign 0 · degraded runs 18/18 · provider_failures 13 · median time 190.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.75 | 1 | 13 | 3 | 264.9 | 1 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjry9pk_77e86ef404 |
| case-002 | benign | 1 | benign | ✅ | 0.85 | 2 | 18 | 4 | 371.5 | 3 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjs3y4x_8bd4e7e9e2 |
| case-003 | escalate | 1 | escalate | ✅ | 0.5 | 2 | 11 | 4 | 113.6 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvjsbwt8_63806c21b5 |
| case-004 | contain | 1 | escalate | ❌ | 0.85 | 1 | 22 | 13 | 179.8 | 0 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjsechk_0330b8008d |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 1 | 10 | 3 | 350.3 | 2 | yes | 2 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjsi78l_750f0cf31f |
| case-006 | monitor | 1 | escalate | ❌ | 0.6 | 1 | 13 | 3 | 99.7 | 2 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjsppj5_81e33a4309 |
| case-001 | contain | 2 | contain | ✅ | 0.75 | 1 | 13 | 3 | 113.1 | 1 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjsrui0_640f9c37aa |
| case-002 | benign | 2 | benign | ✅ | 0.75 | 2 | 15 | 4 | 215.9 | 3 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjsu9qy_0fcd21f93e |
| case-003 | escalate | 2 | escalate | ✅ | 0.51 | 2 | 18 | 4 | 313.8 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjsywbb_578f9a8047 |
| case-004 | contain | 2 | escalate | ❌ | 0.85 | 1 | 22 | 13 | 190.4 | 0 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjt5mgz_5472ac0a81 |
| case-005 | benign | 2 | benign | ✅ | 0.75 | 1 | 10 | 3 | 201.9 | 2 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjt9pct_22a839d218 |
| case-006 | monitor | 2 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 159.5 | 2 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjte15g_cfde2dece1 |
| case-001 | contain | 3 | contain | ✅ | 0.75 | 1 | 13 | 3 | 44.6 | 1 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjthg9j_5de0ba8a2f |
| case-002 | benign | 3 | benign | ✅ | 0.75 | 2 | 15 | 4 | 149.8 | 3 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjtieq7_2f0f27ba89 |
| case-003 | escalate | 3 | escalate | ✅ | 0.5 | 2 | 11 | 4 | 3.8 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjtlmcq_fccf404ae9 |
| case-004 | contain | 3 | escalate | ❌ | 0.85 | 1 | 25 | 13 | 443.8 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjtlp9x_d92d7137b7 |
| case-005 | benign | 3 | benign | ✅ | 0.75 | 1 | 10 | 3 | 156.3 | 2 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvjtv7pi_dbc9c88f67 |
| case-006 | monitor | 3 | escalate | ❌ | 0.7 | 1 | 13 | 3 | 227.1 | 2 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjtykbq_fc53e39562 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 6/18 ok · infra_unavailable 0/18 · false contain 3 · false benign 3 · degraded runs 0/18 · provider_failures 0 · median time 0.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.0 | 0 | no | 0 | - | mvju3fk2_50f90df975 |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3gc7_ba93fdb04e |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3gnq_13bf0f792f |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.9 | 0 | no | 0 | - | mvju3h00_fd7c324c5a |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.8 | 0 | no | 0 | - | mvju3ify_2b70605e0f |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3j12_1802a72802 |
| case-001 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3jc2_1eb18ecce3 |
| case-002 | benign | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvju3jme_93719482b3 |
| case-003 | escalate | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3jvt_96fa13b09c |
| case-004 | contain | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvju3k5o_d084a95558 |
| case-005 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3kf2_00cd13a06c |
| case-006 | monitor | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3krf_be6c761d99 |
| case-001 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3l38_89db12557b |
| case-002 | benign | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvju3ldp_52b7793a9f |
| case-003 | escalate | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3lmy_eed4c2b11c |
| case-004 | contain | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvju3lxf_cd3550310e |
| case-005 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvju3m70_d1bf4f4d5d |
| case-006 | monitor | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvju3mh3_9489fd568e |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 11 | 4 | 4.2 |
| warm | escalate | 1 | 2 | 11 | 4 | 4.7 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
