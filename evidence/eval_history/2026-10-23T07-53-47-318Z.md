# WhyTrace evaluation — 2026-10-23T07:53:47.318Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_0ireefgv).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-23T05:25:30.888Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 19/21 ok · model-backed 18/21 · infra_unavailable 0/21 · false contain 0 · false benign 0 · degraded runs 21/21 · provider_failures 8 · cached model calls 0 · failure classes: empty_response=1 provider_error=7 · median time 217.0 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.94 | 1 | 20 | 3 | 120.3 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkj0osq_5f1daba032 |
| case-002 | benign | 1 | benign | ✅ | 0.85 | 3 | 25 | 5 | 272.7 | 5 | 5/5 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkj39og_8284837089 |
| case-003 | escalate | 1 | escalate | ✅ | 0.51 | 2 | 23 | 4 | 137.2 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkj9446_476637012c |
| case-004 | contain | 1 | contain | ✅ | 0.85 | 1 | 25 | 13 | 115.6 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkjc214_1b3a8533b2 |
| case-005 | benign | 1 | benign | ✅ | 0.85 | 1 | 13 | 3 | 56.1 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkjej9d_4e055d5526 |
| case-006 | monitor | 1 | monitor | ✅ | 0.7 | 2 | 25 | 4 | 231.9 | 3 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkjfqky_478a93b80a |
| case-007 | contain | 1 | contain | ✅ | 0.87 | 1 | 14 | 3 | 59.2 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkjkphm_8e3d69448d |
| case-001 | contain | 2 | contain | ✅ | 0.94 | 1 | 20 | 3 | 238.7 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkjlz5r_f38477798a |
| case-002 | benign | 2 | benign | ✅ | 0.85 | 3 | 25 | 5 | 274.6 | 5 | 4/5 | 0 | model+policy | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvkjr3bw_26d6fb3482 |
| case-003 | escalate | 2 | escalate | ✅ | 0.51 | 2 | 21 | 4 | 315.1 | 0 | 3/4 | 0 | model+policy | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvkjwz75_45174f42a9 |
| case-004 | contain | 2 | contain | ✅ | 0.85 | 1 | 25 | 13 | 80.6 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkk3qcj_344fd04e4a |
| case-005 | benign | 2 | benign | ✅ | 0.85 | 1 | 12 | 3 | 83.3 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkk5gjg_f57c12ee32 |
| case-006 | monitor | 2 | escalate | ❌ | 0.6 | 1 | 14 | 3 | 302.9 | 2 | 2/3 | 0 | model+policy | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvkk78ut_eb57ab05c8 |
| case-007 | contain | 2 | contain | ✅ | 0.87 | 1 | 14 | 3 | 53.7 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkkdqma_852996e19b |
| case-001 | contain | 3 | contain | ✅ | 0.94 | 1 | 19 | 3 | 217.0 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkkew2e_91c11c3815 |
| case-002 | benign | 3 | benign | ✅ | 0.85 | 2 | 25 | 4 | 167.6 | 5 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkkjjhq_c2f563ca98 |
| case-003 | escalate | 3 | escalate | ✅ | 0.41 | 2 | 22 | 4 | 1683.8 | 0 | 3/4 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvkkn4tt_b7d96e575d |
| case-004 | contain | 3 | contain | ✅ | 0.75 | 1 | 23 | 13 | 1426.6 | 0 | 10/13 | 0 | policy_fallback | provider_error:2 empty_response:1 | yes | 3 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvkln840_86b0b5a1e6 |
| case-005 | benign | 3 | escalate | ❌ | 0.5 | 1 | 0 | 1 | 1371.4 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvkmhswc_0852047066 |
| case-006 | monitor | 3 | monitor | ✅ | 0.7 | 1 | 18 | 3 | 143.2 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknb73k_15549cd5cd |
| case-007 | contain | 3 | contain | ✅ | 0.87 | 1 | 13 | 3 | 238.1 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkne9mv_2a66d9f0e4 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 9/21 ok · model-backed n/a · infra_unavailable 0/21 · false contain 3 · false benign 3 · degraded runs 0/21 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.3 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjddl_6313be095d |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjedv_44a849293d |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.9 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjet4_12047298f1 |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjgag_01d021e4e9 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjgq2_a844f0838f |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjh45_26282b0f47 |
| case-007 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjhju_b87a55ab7f |
| case-001 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjhxu_bbbb292eec |
| case-002 | benign | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjj3o_d5b284efb5 |
| case-003 | escalate | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjjk9_817e4d85a2 |
| case-004 | contain | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjjye_751425a25c |
| case-005 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjkce_fce64f344a |
| case-006 | monitor | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjkq8_e2fb73cbcb |
| case-007 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjlyd_51cfe91f0b |
| case-001 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjmgs_63d5b4842c |
| case-002 | benign | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjmvg_8b5e1a8177 |
| case-003 | escalate | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjnad_3c4f5fdcdd |
| case-004 | contain | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjnpa_33056cd915 |
| case-005 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjos0_56346f93e2 |
| case-006 | monitor | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjp7c_258a789560 |
| case-007 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvknjpl3_803bb323ed |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 13/21 ok · model-backed 20/21 · infra_unavailable 0/21 · false contain 3 · false benign 2 · degraded runs 9/21 · provider_failures 1 · cached model calls 0 · failure classes: provider_error=1 · median time 21.1 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.97 | 0 | 2 | 1 | 10.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknjq0r_8b17ab4185 |
| case-002 | benign | 1 | escalate | ❌ | 0.5 | 0 | 2 | 0 | 240.3 | 0 | 0/1 | 0 | model_only | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvknjxu3_c9020430af |
| case-003 | escalate | 1 | contain | ❌ | 0.9 | 0 | 2 | 1 | 10.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknp39v_df899dfab0 |
| case-004 | contain | 1 | contain | ✅ | 0.92 | 0 | 2 | 1 | 10.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknpbq7_6bdc88737b |
| case-005 | benign | 1 | benign | ✅ | 1 | 0 | 2 | 1 | 33.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknpjs9_508896ca8d |
| case-006 | monitor | 1 | benign | ❌ | 1 | 0 | 2 | 1 | 11.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknq9oy_d2887d5f3b |
| case-007 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 8.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknqij6_da96571697 |
| case-001 | contain | 2 | contain | ✅ | 0.95 | 0 | 2 | 1 | 21.1 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknqoxp_ddd1433a65 |
| case-002 | benign | 2 | monitor | ❌ | 0.72 | 0 | 2 | 1 | 36.0 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknr582_f430de855a |
| case-003 | escalate | 2 | contain | ❌ | 0.85 | 0 | 2 | 1 | 39.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknrwzk_6a0693c7f8 |
| case-004 | contain | 2 | contain | ✅ | 0.92 | 0 | 2 | 1 | 6.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknsrjg_3d41c37ca8 |
| case-005 | benign | 2 | benign | ✅ | 1 | 0 | 2 | 1 | 20.7 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknsw6t_355bc35cc4 |
| case-006 | monitor | 2 | monitor | ✅ | 0.7 | 0 | 2 | 1 | 24.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkntc61_829d78c5d4 |
| case-007 | contain | 2 | contain | ✅ | 0.92 | 0 | 2 | 1 | 23.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkntung_ecd331c2ad |
| case-001 | contain | 3 | contain | ✅ | 0.97 | 0 | 2 | 1 | 35.9 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknud01_6f25e58bc4 |
| case-002 | benign | 3 | monitor | ❌ | 0.7 | 0 | 2 | 1 | 13.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknv4o9_3ebfc5f5bb |
| case-003 | escalate | 3 | contain | ❌ | 0.92 | 0 | 2 | 1 | 34.9 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknveyx_e5014eb3f3 |
| case-004 | contain | 3 | contain | ✅ | 0.92 | 0 | 2 | 1 | 104.1 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknw5w0_7cd517ef8b |
| case-005 | benign | 3 | benign | ✅ | 1 | 0 | 2 | 1 | 10.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvknye6z_357bfdfce4 |
| case-006 | monitor | 3 | benign | ❌ | 0.8 | 0 | 2 | 1 | 78.2 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvknym2o_08735fd766 |
| case-007 | contain | 3 | contain | ✅ | 0.95 | 0 | 2 | 1 | 19.0 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvko0adn_7c7f736ad7 |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 23 | 4 | 256.5 |
| warm | escalate | 2 | 2 | 20 | 4 | 107.7 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
