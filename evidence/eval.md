# WhyTrace evaluation — 2026-10-23T04:39:10.641Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_2ryj5t7o).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-23T03:35:13.673Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 17/21 ok · model-backed 20/21 · infra_unavailable 0/21 · false contain 0 · false benign 0 · degraded runs 18/21 · provider_failures 2 · cached model calls 0 · failure classes: provider_error=2 · median time 131.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.91 | 1 | 17 | 3 | 173.9 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkf2ux8_7a2faac34f |
| case-002 | benign | 1 | escalate | ❌ | 0.65 | 3 | 25 | 5 | 251.0 | 4 | 5/5 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkf6l3i_e308eca4d6 |
| case-003 | escalate | 1 | escalate | ✅ | 0.41 | 2 | 22 | 4 | 213.9 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfbyqy_bc9c727349 |
| case-004 | contain | 1 | contain | ✅ | 0.85 | 1 | 25 | 13 | 166.5 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfgjs3_3d462b34b8 |
| case-005 | benign | 1 | benign | ✅ | 0.85 | 1 | 13 | 3 | 131.6 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfk48t_dccfdd6bc3 |
| case-006 | monitor | 1 | monitor | ✅ | 0.7 | 1 | 17 | 3 | 50.1 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfmxsg_5eb2e76928 |
| case-007 | contain | 1 | contain | ✅ | 0.87 | 1 | 12 | 3 | 67.4 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfo0fe_aed1dbe07d |
| case-001 | contain | 2 | contain | ✅ | 0.94 | 1 | 18 | 3 | 85.3 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfpgfk_1073f871b9 |
| case-002 | benign | 2 | escalate | ❌ | 0.65 | 2 | 25 | 4 | 185.1 | 4 | 3/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfra9z_981f15aacb |
| case-003 | escalate | 2 | escalate | ✅ | 0.51 | 2 | 19 | 4 | 127.3 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfv951_d892f43290 |
| case-004 | contain | 2 | contain | ✅ | 0.85 | 1 | 25 | 13 | 162.3 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkfxzc4_d7a4503d81 |
| case-005 | benign | 2 | benign | ✅ | 0.75 | 1 | 10 | 3 | 226.5 | 2 | 2/3 | 0 | model+policy | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvkg1gjg_57f8faaeb7 |
| case-006 | monitor | 2 | monitor | ✅ | 0.7 | 1 | 17 | 3 | 105.8 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkg6bcn_892006a3b0 |
| case-007 | contain | 2 | contain | ✅ | 0.81 | 1 | 10 | 3 | 36.3 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkg8kzq_29375e9547 |
| case-001 | contain | 3 | contain | ✅ | 0.94 | 1 | 19 | 3 | 147.0 | 1 | 2/3 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvkg9d0s_c8ef773aa5 |
| case-002 | benign | 3 | escalate | ❌ | 0.65 | 2 | 25 | 4 | 323.6 | 4 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgciha_75d0958fb8 |
| case-003 | escalate | 3 | escalate | ✅ | 0.51 | 2 | 22 | 4 | 197.5 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgjg5z_c368cfdcb7 |
| case-004 | contain | 3 | contain | ✅ | 0.85 | 1 | 25 | 13 | 76.8 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgnokm_2da2ecb974 |
| case-005 | benign | 3 | benign | ✅ | 0.85 | 1 | 14 | 3 | 101.6 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgpbtc_0d130567ca |
| case-006 | monitor | 3 | monitor | ✅ | 0.7 | 1 | 17 | 3 | 63.2 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgri85_298e05ef49 |
| case-007 | contain | 3 | escalate | ❌ | 0.7 | 1 | 9 | 3 | 48.5 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgsv1a_a9c96d0838 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 9/21 ok · model-backed n/a · infra_unavailable 0/21 · false contain 3 · false benign 3 · degraded runs 0/21 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgtwgk_5b4fb880f0 |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 1.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgtx7d_b84932100d |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgtyjy_a34c5937f5 |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgtyyo_aa666ad433 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgtzdr_8192299755 |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgtzrc_68d9f6cd89 |
| case-007 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu0ta_3f96cb86a3 |
| case-001 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu1ab_ddf29f6f98 |
| case-002 | benign | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu1o4_f61d8da1ba |
| case-003 | escalate | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu21p_ea6057c4f7 |
| case-004 | contain | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu2id_d775888c8c |
| case-005 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 1.1 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu3nd_4a0bd09aef |
| case-006 | monitor | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu4iq_4e3362a4f6 |
| case-007 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu4z7_1a2cc7b19a |
| case-001 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu5cl_8d22efa3c3 |
| case-002 | benign | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 1.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu5ru_4f89ebfb01 |
| case-003 | escalate | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu70u_2aff5971d4 |
| case-004 | contain | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu7gc_623b0ed3dd |
| case-005 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu7um_38e3bf5b70 |
| case-006 | monitor | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu888_8966261ce1 |
| case-007 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvkgu8mo_4aac9b6c45 |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 11/21 ok · model-backed 21/21 · infra_unavailable 0/21 · false contain 3 · false benign 3 · degraded runs 1/21 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 12.1 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.97 | 0 | 2 | 1 | 12.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgu9tq_ce3ac5575d |
| case-002 | benign | 1 | monitor | ❌ | 0.7 | 0 | 2 | 1 | 28.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgujjg_1981af491a |
| case-003 | escalate | 1 | contain | ❌ | 0.92 | 0 | 2 | 1 | 14.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgv5je_590e8ef969 |
| case-004 | contain | 1 | contain | ✅ | 0.92 | 0 | 2 | 1 | 7.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgvh29_135811a3e4 |
| case-005 | benign | 1 | monitor | ❌ | 0.68 | 0 | 2 | 1 | 63.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgvmqm_79193d54c8 |
| case-006 | monitor | 1 | benign | ❌ | 0.8 | 0 | 2 | 1 | 12.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgwzw0_a6b9db8d99 |
| case-007 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 11.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgx97i_d380bbdc6a |
| case-001 | contain | 2 | contain | ✅ | 0.95 | 0 | 2 | 1 | 11.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgxi9i_6c1760d422 |
| case-002 | benign | 2 | monitor | ❌ | 0.68 | 0 | 2 | 1 | 30.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgxqqr_d64c9a6dc9 |
| case-003 | escalate | 2 | contain | ❌ | 0.92 | 0 | 2 | 1 | 10.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgydye_5ad5d8cc4e |
| case-004 | contain | 2 | contain | ✅ | 0.95 | 0 | 2 | 1 | 6.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgylon_0e41e50be3 |
| case-005 | benign | 2 | benign | ✅ | 0.88 | 0 | 2 | 1 | 5.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgyr12_d6a7bd2302 |
| case-006 | monitor | 2 | benign | ❌ | 1 | 0 | 2 | 1 | 6.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgyv1b_3029874390 |
| case-007 | contain | 2 | contain | ✅ | 0.97 | 0 | 2 | 1 | 9.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgz09w_189b8dd19b |
| case-001 | contain | 3 | contain | ✅ | 0.97 | 0 | 2 | 1 | 10.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgz7ey_d84c911a08 |
| case-002 | benign | 3 | monitor | ❌ | 0.7 | 0 | 2 | 1 | 37.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkgzfoq_1545b52b65 |
| case-003 | escalate | 3 | contain | ❌ | 0.92 | 0 | 2 | 1 | 19.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkh08nt_90379b799b |
| case-004 | contain | 3 | contain | ✅ | 0.92 | 0 | 2 | 1 | 6.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkh0nz4_b192d52537 |
| case-005 | benign | 3 | benign | ✅ | 0.8 | 0 | 2 | 1 | 29.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkh0sza_095693dfa2 |
| case-006 | monitor | 3 | benign | ❌ | 1 | 0 | 2 | 1 | 13.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkh1fth_02ab9b709b |
| case-007 | contain | 3 | contain | ✅ | 0.95 | 0 | 2 | 1 | 56.9 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvkh1qe6_afd6be559b |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 22 | 4 | 106.0 |
| warm | escalate | 2 | 2 | 21 | 4 | 193.9 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
