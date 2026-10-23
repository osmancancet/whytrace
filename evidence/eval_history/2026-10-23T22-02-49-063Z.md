# WhyTrace evaluation — 2026-10-23T22:02:49.063Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_xtqv9ekx).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-23T13:42:38.106Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 8/24 ok · model-backed 6/24 · infra_unavailable 0/24 · false contain 0 · false benign 3 · degraded runs 24/24 · provider_failures 20 · cached model calls 0 · failure classes: provider_error=20 · median time 1361.8 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ho-01 | contain | 1 | escalate | ❌ | 0.65 | 1 | 16 | 3 | 149.0 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvl0rzml_8eef390698 |
| ho-02 | benign | 1 | benign | ✅ | 0.85 | 3 | 24 | 5 | 316.2 | 2 | 4/5 | 0 | model+policy | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvl0v6m0_329c2e9476 |
| ho-03 | contain | 1 | contain | ✅ | 0.78 | 1 | 14 | 3 | 154.7 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvl11ymy_cc3a891464 |
| ho-04 | escalate | 1 | escalate | ✅ | 0.8 | 2 | 20 | 4 | 260.9 | 1 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvl159zp_2cdde94eac |
| ho-05 | monitor | 1 | escalate | ❌ | 0.63 | 1 | 14 | 3 | 164.7 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvl1avbc_030ad877cd |
| ho-06 | benign | 1 | benign | ✅ | 0.75 | 1 | 13 | 3 | 360.2 | 2 | 2/3 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvl1eeg2_12c3fe94e0 |
| ho-07 | escalate | 1 | benign | ❌ | 0.8 | 1 | 13 | 3 | 113.1 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvl1m4fd_97399c5b1a |
| ho-08 | monitor | 1 | escalate | ❌ | 0.65 | 1 | 11 | 3 | 396.4 | 0 | 2/3 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvl1ojqa_f30e59ebf5 |
| ho-01 | contain | 2 | escalate | ❌ | 0.65 | 1 | 12 | 3 | 1361.8 | 1 | 1/3 | 0 | policy_fallback | provider_error:2 | yes | 2 | nemotron-3.5-lightning-30b-a3b, nemotron-3.5-super-vl-120b-a12b | mvl1x1ll_1952591e4d |
| ho-02 | benign | 2 | escalate | ❌ | 0.75 | 1 | 5 | 1 | 2002.8 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl2q8ew_182180348d |
| ho-03 | contain | 2 | escalate | ❌ | 0.75 | 1 | 7 | 1 | 1039.7 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl3x5s8_914595db85 |
| ho-04 | escalate | 2 | escalate | ✅ | 0.8 | 1 | 6 | 1 | 1936.8 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl4jg1o_51ae008574 |
| ho-05 | monitor | 2 | escalate | ❌ | 0.7 | 1 | 6 | 1 | 1785.1 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl5oyid_4649c4d8bc |
| ho-06 | benign | 2 | benign | ✅ | 0.75 | 1 | 9 | 1 | 2572.5 | 2 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl6r7xd_37e2a697bb |
| ho-07 | escalate | 2 | benign | ❌ | 0.7 | 1 | 8 | 1 | 1048.4 | 1 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl8acxo_4e40bfcbfb |
| ho-08 | monitor | 2 | escalate | ❌ | 0.8 | 1 | 6 | 1 | 2055.3 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvl8wtwv_52428fde5d |
| ho-01 | contain | 3 | escalate | ❌ | 0.75 | 1 | 10 | 1 | 1607.6 | 1 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvla4vrv_f292d5a3f7 |
| ho-02 | benign | 3 | escalate | ❌ | 0.75 | 1 | 5 | 1 | 2032.0 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvlb3c9e_42dc205be9 |
| ho-03 | contain | 3 | escalate | ❌ | 0.75 | 1 | 7 | 1 | 588.9 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvlcaw6s_1a2c0f5b93 |
| ho-04 | escalate | 3 | escalate | ✅ | 0.8 | 1 | 6 | 1 | 1984.0 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvlcnimt_9d87bd91c6 |
| ho-05 | monitor | 3 | escalate | ❌ | 0.7 | 1 | 6 | 1 | 1672.5 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvldu1i4_2ab66dd311 |
| ho-06 | benign | 3 | benign | ✅ | 0.75 | 1 | 9 | 1 | 3134.3 | 2 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvletw2c_17bc4f930a |
| ho-07 | escalate | 3 | benign | ❌ | 0.7 | 1 | 8 | 1 | 1520.5 | 1 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvlgp2i2_e02484ebb1 |
| ho-08 | monitor | 3 | escalate | ❌ | 0.8 | 1 | 6 | 1 | 985.3 | 0 | 0/1 | 0 | policy_fallback | provider_error:1 | yes | 1 | nemotron-3.5-lightning-30b-a3b | mvlhlnpi_1be03e13fc |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 15/24 ok · model-backed n/a · infra_unavailable 0/24 · false contain 3 · false benign 6 · degraded runs 0/24 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.8 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ho-01 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6s0k_5e38305fa1 |
| ho-02 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 1.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6t41_cfe19b9fbf |
| ho-03 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 3.3 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6tx1_5ec6e4e36b |
| ho-04 | escalate | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 1.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6wh7_1e274dcd5f |
| ho-05 | monitor | 1 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6x8c_8ed2556d7e |
| ho-06 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6xu1_38a70eb0f2 |
| ho-07 | escalate | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6ydg_5c11e23426 |
| ho-08 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 1.3 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli6zrh_a572029d1a |
| ho-01 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli70rc_0490e7a8fc |
| ho-02 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli71bm_919730ac08 |
| ho-03 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli71sy_b3ff03cf3d |
| ho-04 | escalate | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 3.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli72e1_fb5bc219a1 |
| ho-05 | monitor | 2 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli74q9_b575a828ea |
| ho-06 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli75ak_ea60a9a9f0 |
| ho-07 | escalate | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli75um_b475e0ad22 |
| ho-08 | monitor | 2 | benign | ❌ | 0.75 | 0 | 2 | 0 | 2.2 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli76ga_cdd024b548 |
| ho-01 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli7861_55f0400f4c |
| ho-02 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli78s4_1dd21a9518 |
| ho-03 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli79ao_9789885ae7 |
| ho-04 | escalate | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli79tz_bea62722b4 |
| ho-05 | monitor | 3 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 2.9 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli7acw_7c9ac3ce85 |
| ho-06 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.9 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli7cmh_47d7f7c46b |
| ho-07 | escalate | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli7da5_017c91ef1a |
| ho-08 | monitor | 3 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvli7dsf_a39f8a9fd0 |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 12/24 ok · model-backed 24/24 · infra_unavailable 0/24 · false contain 7 · false benign 3 · degraded runs 4/24 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 23.7 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ho-01 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 12.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli7ebr_aa2368136c |
| ho-02 | benign | 1 | benign | ✅ | 0.8 | 0 | 2 | 1 | 25.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli7nxt_6b5a0e6ec6 |
| ho-03 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 8.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli87pl_c8ca7abdf6 |
| ho-04 | escalate | 1 | contain | ❌ | 0.75 | 0 | 2 | 1 | 25.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli8ehy_ed975dea33 |
| ho-05 | monitor | 1 | contain | ❌ | 0.8 | 0 | 2 | 1 | 31.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli8yd4_ff25ce1966 |
| ho-06 | benign | 1 | benign | ✅ | 0.92 | 0 | 2 | 1 | 5.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli9mgq_e83fadca1c |
| ho-07 | escalate | 1 | contain | ❌ | 0.9 | 0 | 2 | 1 | 15.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvli9qzg_d37f6d1654 |
| ho-08 | monitor | 1 | escalate | ❌ | 0.8 | 0 | 2 | 1 | 73.3 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlia39c_13fd55bad5 |
| ho-01 | contain | 2 | contain | ✅ | 0.92 | 0 | 2 | 1 | 15.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlibntz_1bd92f8ead |
| ho-02 | benign | 2 | benign | ✅ | 0.82 | 0 | 2 | 1 | 50.2 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlibzxf_bc9188a87f |
| ho-03 | contain | 2 | contain | ✅ | 0.95 | 0 | 2 | 1 | 9.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlid2nm_33538723d1 |
| ho-04 | escalate | 2 | benign | ❌ | 0.8 | 0 | 2 | 1 | 37.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlida5s_94efeb152c |
| ho-05 | monitor | 2 | contain | ❌ | 0.8 | 0 | 2 | 1 | 30.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlie39j_8cb41db652 |
| ho-06 | benign | 2 | benign | ✅ | 0.95 | 0 | 2 | 1 | 25.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlieqsi_e68ca92fb5 |
| ho-07 | escalate | 2 | contain | ❌ | 0.82 | 0 | 2 | 1 | 118.1 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlifaj8_5c17217d97 |
| ho-08 | monitor | 2 | escalate | ❌ | 1 | 0 | 2 | 1 | 45.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlihtmr_062c406b21 |
| ho-01 | contain | 3 | contain | ✅ | 0.93 | 0 | 2 | 1 | 15.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvliisld_a36bccced3 |
| ho-02 | benign | 3 | benign | ✅ | 0.8 | 0 | 2 | 1 | 19.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlij4ny_c9c2a2d3ff |
| ho-03 | contain | 3 | contain | ✅ | 0.95 | 0 | 2 | 1 | 9.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlijjyb_1adf0d8d6e |
| ho-04 | escalate | 3 | benign | ❌ | 0.85 | 0 | 2 | 1 | 79.5 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlijrbp_4a1f67748c |
| ho-05 | monitor | 3 | contain | ❌ | 0.82 | 0 | 2 | 1 | 22.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlilgnc_11957743ff |
| ho-06 | benign | 3 | benign | ✅ | 0.96 | 0 | 2 | 1 | 23.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlily6h_577a49477a |
| ho-07 | escalate | 3 | contain | ❌ | 0.85 | 0 | 2 | 1 | 19.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlimgfo_7c0b439c8f |
| ho-08 | monitor | 3 | benign | ❌ | 0.8 | 0 | 2 | 1 | 16.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlimvai_01dfc04686 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
