# WhyTrace evaluation — 2026-10-23T02:48:24.146Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_buv467kd).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-23T01:34:11.378Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 5/7 ok · model-backed 7/7 · infra_unavailable 0/7 · false contain 0 · false benign 1 · degraded runs 6/7 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 125.9 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.94 | 1 | 20 | 3 | 125.9 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkar7as_e645da8d57 |
| case-002 | benign | 1 | escalate | ❌ | 0.65 | 2 | 22 | 4 | 185.5 | 3 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkatwfi_c3020fe324 |
| case-003 | escalate | 1 | escalate | ✅ | 0.51 | 2 | 21 | 4 | 130.4 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkaxvlz_01e016e371 |
| case-004 | contain | 1 | contain | ✅ | 0.85 | 1 | 25 | 13 | 68.0 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkb0o7y_138099808c |
| case-005 | benign | 1 | benign | ✅ | 0.85 | 1 | 14 | 3 | 42.6 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkb24q8_27d510efaf |
| case-006 | monitor | 1 | monitor | ✅ | 0.7 | 1 | 17 | 3 | 131.7 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkb31kn_d040b6312c |
| case-007 | contain | 1 | benign | ❌ | 0.75 | 1 | 10 | 3 | 45.0 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkb5v6r_3e60c30468 |

## A1 — no Critic re-query

Judged 1/7 ok · model-backed 7/7 · infra_unavailable 0/7 · false contain 0 · false benign 1 · degraded runs 5/7 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 161.7 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.6 | 2 | 25 | 14 | 322.4 | 0 | 14/14 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkb6tw5_de5232aa37 |
| case-002 | benign | 1 | escalate | ❌ | 0.6 | 3 | 25 | 12 | 301.0 | 0 | 12/12 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbdqnq_e294f810cb |
| case-003 | escalate | 1 | escalate | ✅ | 0.5 | 2 | 17 | 4 | 161.7 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbk6xk_b7246cdaae |
| case-004 | contain | 1 | escalate | ❌ | 0.6 | 1 | 20 | 13 | 57.6 | 0 | 13/13 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbnnqw_56072c6521 |
| case-005 | benign | 1 | escalate | ❌ | 0.6 | 1 | 19 | 13 | 211.0 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbow5s_7b1ac95660 |
| case-006 | monitor | 1 | escalate | ❌ | 0.6 | 1 | 20 | 13 | 130.9 | 0 | 13/13 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbtezl_f6a525e526 |
| case-007 | contain | 1 | benign | ❌ | 0.75 | 1 | 9 | 3 | 80.5 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbw80p_26871c2b8b |

## A2 — no DQ signal

Judged 5/7 ok · model-backed 7/7 · infra_unavailable 0/7 · false contain 0 · false benign 1 · degraded runs 4/7 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 97.3 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.94 | 1 | 17 | 3 | 117.7 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkbxy54_6058600e39 |
| case-002 | benign | 1 | escalate | ❌ | 0.65 | 3 | 25 | 5 | 228.0 | 4 | 5/5 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkc0gzb_f0466c8f46 |
| case-003 | escalate | 1 | escalate | ✅ | 0.73 | 2 | 19 | 4 | 97.3 | 0 | 4/4 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkc5cwy_86644e2d8e |
| case-004 | contain | 1 | contain | ✅ | 0.85 | 1 | 24 | 13 | 63.2 | 0 | 13/13 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkc7fz3_9eb8c8e83c |
| case-005 | benign | 1 | benign | ✅ | 0.85 | 1 | 10 | 3 | 71.6 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkc8spr_43df6b21c1 |
| case-006 | monitor | 1 | monitor | ✅ | 0.7 | 1 | 15 | 3 | 57.3 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcac05_00034bdb99 |
| case-007 | contain | 1 | benign | ❌ | 0.75 | 1 | 7 | 3 | 100.7 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcbk76_c9fa66f273 |

## A4 — single agent (no Critic, no DQ, no memory)

Judged 1/7 ok · model-backed 7/7 · infra_unavailable 0/7 · false contain 0 · false benign 1 · degraded runs 5/7 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 118.5 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.6 | 1 | 17 | 13 | 248.7 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcdpvh_b51a188690 |
| case-002 | benign | 1 | escalate | ❌ | 0.6 | 2 | 25 | 13 | 98.6 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcj1tj_5803526ccd |
| case-003 | escalate | 1 | escalate | ✅ | 0.7 | 2 | 15 | 4 | 87.4 | 0 | 4/4 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcl5wz_7522e30cf8 |
| case-004 | contain | 1 | escalate | ❌ | 0.6 | 1 | 17 | 13 | 38.9 | 0 | 13/13 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcn1e0_ed3b3a81d8 |
| case-005 | benign | 1 | escalate | ❌ | 0.6 | 1 | 16 | 13 | 174.7 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcnvdv_96763ef5d5 |
| case-006 | monitor | 1 | escalate | ❌ | 0.6 | 1 | 17 | 13 | 209.9 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcrm7a_e9f56864b9 |
| case-007 | contain | 1 | benign | ❌ | 0.75 | 1 | 6 | 3 | 118.5 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcw45u_56c15ea63c |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 2/7 ok · model-backed n/a · infra_unavailable 0/7 · false contain 1 · false benign 2 · degraded runs 0/7 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.5 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcynlu_2ca978274a |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcyoe6_3b341a3b57 |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcyoss_694bf5a0fa |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.9 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcypyu_4fd427e3ac |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcyqnu_db9995647f |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcyr2h_1ddd479e60 |
| case-007 | contain | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkcyrg3_7d59a232e4 |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 3/7 ok · model-backed 7/7 · infra_unavailable 0/7 · false contain 1 · false benign 1 · degraded runs 1/7 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 13.0 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.97 | 0 | 2 | 1 | 11.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcyrss_5066d42c60 |
| case-002 | benign | 1 | escalate | ❌ | 0.78 | 0 | 2 | 1 | 71.9 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkcz09x_7b348016af |
| case-003 | escalate | 1 | contain | ❌ | 0.9 | 0 | 2 | 1 | 10.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkd0jrg_b7b4fd3f4c |
| case-004 | contain | 1 | contain | ✅ | 0.9 | 0 | 2 | 1 | 13.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkd0rka_c01046bcfd |
| case-005 | benign | 1 | benign | ✅ | 0.82 | 0 | 2 | 1 | 33.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkd11mr_9bfcb39c77 |
| case-006 | monitor | 1 | benign | ❌ | 0.82 | 0 | 2 | 1 | 10.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkd1re5_86445d7a36 |
| case-007 | contain | 1 | escalate | ❌ | 0.78 | 0 | 2 | 1 | 33.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkd1zgr_74683abd1f |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 22 | 4 | 122.3 |
| warm | escalate | 2 | 2 | 18 | 4 | 249.8 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
