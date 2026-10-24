# WhyTrace evaluation — 2026-10-24T00:56:40.490Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_hmjjd15j).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-24T00:28:54.923Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 14/15 ok · model-backed 15/15 · infra_unavailable 0/15 · false contain 0 · false benign 0 · degraded runs 9/15 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 54.0 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.94 | 1 | 20 | 3 | 70.4 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlnv40e_00883a5657 |
| case-002 | benign | 1 | benign | ✅ | 0.85 | 2 | 29 | 4 | 79.6 | 6 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlnwmbn_8b1c692f6a |
| case-003 | escalate | 1 | escalate | ✅ | 0.51 | 2 | 23 | 4 | 86.5 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlnybse_c4b46d35d5 |
| case-004 | contain | 1 | contain | ✅ | 0.85 | 1 | 27 | 13 | 78.0 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo06jh_fb2536cc37 |
| case-005 | benign | 1 | benign | ✅ | 0.85 | 1 | 13 | 3 | 51.8 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo1uqv_ddebb9b50d |
| case-006 | monitor | 1 | monitor | ✅ | 0.7 | 1 | 18 | 3 | 31.6 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo2yq9_68384b072d |
| case-007 | contain | 1 | contain | ✅ | 0.87 | 1 | 15 | 3 | 34.0 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo3n57_190d7858e8 |
| ho-01 | contain | 1 | contain | ✅ | 0.77 | 1 | 18 | 3 | 46.3 | 3 | 2/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo4ddf_1c9265ac03 |
| ho-02 | benign | 1 | benign | ✅ | 0.85 | 3 | 27 | 5 | 188.0 | 2 | 5/5 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo5d3e_bc018da0ff |
| ho-03 | contain | 1 | contain | ✅ | 0.78 | 1 | 15 | 3 | 35.7 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlo9e5m_5a892b12e2 |
| ho-04 | escalate | 1 | escalate | ✅ | 0.7 | 1 | 11 | 3 | 45.0 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvloa5ri_177fc31dd0 |
| ho-05 | monitor | 1 | escalate | ❌ | 0.63 | 2 | 26 | 4 | 54.0 | 1 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlob4ir_3979f28f47 |
| ho-06 | benign | 1 | benign | ✅ | 0.85 | 1 | 14 | 3 | 163.1 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvloca6e_1955db1770 |
| ho-07 | escalate | 1 | escalate | ✅ | 0.5 | 1 | 15 | 3 | 60.2 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlofs14_11b4f0ab6a |
| ho-08 | monitor | 1 | monitor | ✅ | 0.8 | 1 | 10 | 3 | 30.7 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvloh2i6_1253871d2a |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 8/15 ok · model-backed n/a · infra_unavailable 0/15 · false contain 2 · false benign 3 · degraded runs 0/15 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.5 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohq93_967d8185da |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohquw_60b0b1056c |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohr8b_79c33864d8 |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohsb9_a8a9e9bb32 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohsou_9b17caeb6d |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvloht0n_bd2661be06 |
| case-007 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohtci_7e8a5ca8cb |
| ho-01 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.3 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohtop_8eade49316 |
| ho-02 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohupq_84b7541b28 |
| ho-03 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohv2w_fe1297eef8 |
| ho-04 | escalate | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohvgh_f5ebe25f9b |
| ho-05 | monitor | 1 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohvso_5767bc749c |
| ho-06 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 1.3 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohw7b_e320d7c9fe |
| ho-07 | escalate | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohx80_1681122fd4 |
| ho-08 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlohxmq_c28c41a0a2 |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 7/15 ok · model-backed 15/15 · infra_unavailable 0/15 · false contain 3 · false benign 3 · degraded runs 4/15 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 14.3 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 11.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlohxyk_a5ba827184 |
| case-002 | benign | 1 | monitor | ❌ | 1 | 0 | 2 | 1 | 22.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvloi6ra_e0a73e240e |
| case-003 | escalate | 1 | contain | ❌ | 0.92 | 0 | 2 | 1 | 52.0 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvloinw5_7cdfe13074 |
| case-004 | contain | 1 | contain | ✅ | 0.92 | 0 | 2 | 1 | 6.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlojs1o_a840c5b459 |
| case-005 | benign | 1 | benign | ✅ | 1 | 0 | 2 | 1 | 15.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlojwpe_9c5661a4c2 |
| case-006 | monitor | 1 | benign | ❌ | 0.85 | 0 | 2 | 1 | 8.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlok8nc_e58dbf6f3a |
| case-007 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 5.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlokez4_f4235852b4 |
| ho-01 | contain | 1 | contain | ✅ | 0.9 | 0 | 2 | 1 | 14.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlokjbt_6a8b12bf87 |
| ho-02 | benign | 1 | monitor | ❌ | 0.7 | 0 | 2 | 1 | 13.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlokuc2_958a991e0d |
| ho-03 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 19.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlol4f7_7157d347ad |
| ho-04 | escalate | 1 | benign | ❌ | 0.8 | 0 | 2 | 1 | 59.6 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlolj90_df73908082 |
| ho-05 | monitor | 1 | contain | ❌ | 0.93 | 0 | 2 | 1 | 12.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlomt98_95e1b455bb |
| ho-06 | benign | 1 | benign | ✅ | 1 | 0 | 2 | 1 | 5.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlon2yi_17c0f6783d |
| ho-07 | escalate | 1 | contain | ❌ | 0.82 | 0 | 2 | 1 | 76.5 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlon76w_3cf68a7858 |
| ho-08 | monitor | 1 | benign | ❌ | 0.78 | 0 | 2 | 1 | 41.3 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvloou78_d083ccf21c |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 24 | 4 | 64.8 |
| warm | escalate | 1 | 2 | 24 | 4 | 87.9 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
