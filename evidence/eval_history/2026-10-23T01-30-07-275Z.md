# WhyTrace evaluation — 2026-10-23T01:30:07.275Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_0oym1d9g).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-23T00:39:03.289Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 15/21 ok · model-backed 21/21 · infra_unavailable 0/21 · false contain 0 · false benign 2 · degraded runs 14/21 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 84.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.94 | 1 | 20 | 3 | 131.6 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk8sarg_e3b8db2052 |
| case-002 | benign | 1 | escalate | ❌ | 0.65 | 2 | 22 | 4 | 202.6 | 3 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk8v4ai_af01380a64 |
| case-003 | escalate | 1 | escalate | ✅ | 0.51 | 2 | 21 | 4 | 84.4 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk8zgni_58bc41e783 |
| case-004 | contain | 1 | contain | ✅ | 0.85 | 1 | 25 | 13 | 66.8 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk919r8_06dc350128 |
| case-005 | benign | 1 | benign | ✅ | 0.85 | 1 | 13 | 3 | 39.0 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk92pb1_fb4747f5bb |
| case-006 | monitor | 1 | monitor | ✅ | 0.7 | 1 | 17 | 3 | 55.6 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk93jeh_b7a636c427 |
| case-007 | contain | 1 | escalate | ❌ | 0.65 | 1 | 9 | 3 | 42.6 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk94qat_00a987edc8 |
| case-001 | contain | 2 | contain | ✅ | 0.94 | 1 | 20 | 3 | 100.6 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk95n61_06972687f1 |
| case-002 | benign | 2 | escalate | ❌ | 0.65 | 2 | 20 | 4 | 169.1 | 3 | 3/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk97srw_459f9d802d |
| case-003 | escalate | 2 | escalate | ✅ | 0.51 | 2 | 22 | 4 | 96.7 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9bf8i_15fd7801d5 |
| case-004 | contain | 2 | contain | ✅ | 0.85 | 1 | 25 | 13 | 57.5 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9dhvk_dd126ae263 |
| case-005 | benign | 2 | benign | ✅ | 0.85 | 1 | 13 | 3 | 112.9 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9eq86_f7c2668a4d |
| case-006 | monitor | 2 | monitor | ✅ | 0.7 | 1 | 17 | 3 | 118.6 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9h5dk_8d55db6277 |
| case-007 | contain | 2 | benign | ❌ | 0.75 | 1 | 8 | 3 | 49.1 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9jovl_3a23d7b0b0 |
| case-001 | contain | 3 | contain | ✅ | 0.94 | 1 | 20 | 3 | 69.0 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9kqq9_85253509d4 |
| case-002 | benign | 3 | escalate | ❌ | 0.65 | 2 | 25 | 4 | 143.0 | 4 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9m7yt_b0a547be5b |
| case-003 | escalate | 3 | escalate | ✅ | 0.51 | 2 | 22 | 4 | 190.4 | 0 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9paa3_b461e10f46 |
| case-004 | contain | 3 | contain | ✅ | 0.85 | 1 | 25 | 13 | 72.4 | 0 | 13/13 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9td7b_e8216a68d3 |
| case-005 | benign | 3 | benign | ✅ | 0.85 | 1 | 13 | 3 | 169.7 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9ux1k_903f21a665 |
| case-006 | monitor | 3 | monitor | ✅ | 0.7 | 1 | 18 | 3 | 66.1 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9yjzw_dd9177b318 |
| case-007 | contain | 3 | benign | ❌ | 0.75 | 1 | 9 | 3 | 33.7 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvk9zyyx_6bee7c8614 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 6/21 ok · model-backed n/a · infra_unavailable 0/21 · false contain 3 · false benign 6 · degraded runs 0/21 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.6 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 2.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0oy1_49336aa315 |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.9 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0qx3_6e3dfea251 |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0rlj_2b6f3bd396 |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0s2w_3383757f85 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0sj1_fd1d799eeb |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.9 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0t10_8b0a4d2bbb |
| case-007 | contain | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.2 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0uiy_5b453219ae |
| case-001 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0vhk_39c86bb848 |
| case-002 | benign | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0vyp_4a52b6869e |
| case-003 | escalate | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0wcy_b51a010646 |
| case-004 | contain | 2 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0wts_a7829c4ea9 |
| case-005 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0xeh_2e9ffb48f2 |
| case-006 | monitor | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0xtx_77b7573feb |
| case-007 | contain | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0y9j_c55773f615 |
| case-001 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0zfb_e0f24c0eac |
| case-002 | benign | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka0zz5_edc2e7e68c |
| case-003 | escalate | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka10cs_231c7d0cc3 |
| case-004 | contain | 3 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka10ql_24a7e20160 |
| case-005 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka114g_8a4ff9bb07 |
| case-006 | monitor | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka11p1_ca17ff5665 |
| case-007 | contain | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvka123g_c6e71f6357 |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 10/21 ok · model-backed 21/21 · infra_unavailable 0/21 · false contain 2 · false benign 3 · degraded runs 1/21 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 13.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 12.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka12gn_b8996fe5f7 |
| case-002 | benign | 1 | escalate | ❌ | 1 | 0 | 2 | 1 | 17.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka1brw_7279eca34a |
| case-003 | escalate | 1 | contain | ❌ | 0.85 | 0 | 2 | 1 | 25.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka1paf_e6fa02351a |
| case-004 | contain | 1 | contain | ✅ | 0.92 | 0 | 2 | 1 | 33.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka297i_5561fc2b98 |
| case-005 | benign | 1 | benign | ✅ | 1 | 0 | 2 | 1 | 12.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka2zeb_c4dded9e1c |
| case-006 | monitor | 1 | benign | ❌ | 0.9 | 0 | 2 | 1 | 8.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka39al_93e9ddc64b |
| case-007 | contain | 1 | escalate | ❌ | 0.8 | 0 | 2 | 1 | 12.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka3fyx_768a19a837 |
| case-001 | contain | 2 | contain | ✅ | 1 | 0 | 2 | 1 | 28.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka3pqn_cd716d539a |
| case-002 | benign | 2 | monitor | ❌ | 0.7 | 0 | 2 | 1 | 171.9 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvka4bwk_9907cbc892 |
| case-003 | escalate | 2 | contain | ❌ | 0.92 | 0 | 2 | 1 | 8.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka80ii_49375b6fee |
| case-004 | contain | 2 | contain | ✅ | 0.95 | 0 | 2 | 1 | 14.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka86w7_84f534d8ec |
| case-005 | benign | 2 | benign | ✅ | 0.82 | 0 | 2 | 1 | 15.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka8i3d_91eba58f96 |
| case-006 | monitor | 2 | benign | ❌ | 0.8 | 0 | 2 | 1 | 21.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka8ua9_beb1ba13ba |
| case-007 | contain | 2 | escalate | ❌ | 0.6 | 0 | 2 | 1 | 9.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka9azk_ee53c10362 |
| case-001 | contain | 3 | contain | ✅ | 0.97 | 0 | 2 | 1 | 9.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka9if2_e014892f23 |
| case-002 | benign | 3 | monitor | ❌ | 1 | 0 | 2 | 1 | 13.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvka9q28_28ff9e0c86 |
| case-003 | escalate | 3 | escalate | ✅ | 1 | 0 | 2 | 1 | 11.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkaa0k0_285bdb78f7 |
| case-004 | contain | 3 | contain | ✅ | 0.95 | 0 | 2 | 1 | 8.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkaa9rn_45bc9eb931 |
| case-005 | benign | 3 | benign | ✅ | 0.78 | 0 | 2 | 1 | 22.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkaag1d_7f10a1d313 |
| case-006 | monitor | 3 | benign | ❌ | 1 | 0 | 2 | 1 | 13.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkaaxpd_3d8ca4f204 |
| case-007 | contain | 3 | escalate | ❌ | 0.7 | 0 | 2 | 1 | 6.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvkab815_e83364091b |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 22 | 4 | 77.0 |
| warm | escalate | 2 | 2 | 22 | 4 | 146.1 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
