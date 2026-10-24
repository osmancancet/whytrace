# WhyTrace evaluation — 2026-10-24T01:42:36.226Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_bxwigh0m).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-24T01:16:04.576Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 15/24 ok · model-backed 24/24 · infra_unavailable 0/24 · false contain 0 · false benign 0 · degraded runs 8/24 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 41.1 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hb-01 | contain | 1 | contain | ✅ | 0.85 | 1 | 16 | 3 | 67.4 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpjrdu_7d58451545 |
| hb-02 | monitor | 1 | escalate | ❌ | 0.65 | 1 | 12 | 3 | 30.1 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpl7dj_763a12ea02 |
| hb-03 | benign | 1 | benign | ✅ | 0.7 | 1 | 10 | 3 | 37.0 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlplunf_49fb2c017f |
| hb-04 | escalate | 1 | escalate | ✅ | 0.63 | 1 | 14 | 3 | 44.1 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpmn84_5effa81569 |
| hb-05 | contain | 1 | escalate | ❌ | 0.63 | 1 | 17 | 3 | 28.9 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpnla2_fa60938708 |
| hb-06 | benign | 1 | benign | ✅ | 0.7 | 1 | 9 | 3 | 29.3 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpo7lj_606e2f1eed |
| hb-07 | monitor | 1 | escalate | ❌ | 0.65 | 1 | 30 | 3 | 41.2 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpou92_f98a28a135 |
| hb-08 | escalate | 1 | escalate | ✅ | 0.7 | 1 | 12 | 3 | 43.0 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlppq31_bf04fed3fd |
| hb-01 | contain | 2 | contain | ✅ | 0.85 | 1 | 15 | 3 | 38.8 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpqna1_8cac0abce4 |
| hb-02 | monitor | 2 | escalate | ❌ | 0.65 | 1 | 12 | 3 | 34.9 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlprh77_319251e35b |
| hb-03 | benign | 2 | benign | ✅ | 0.75 | 1 | 11 | 3 | 39.3 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlps86j_86d4b49c38 |
| hb-04 | escalate | 2 | escalate | ✅ | 0.63 | 1 | 15 | 3 | 30.2 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpt2i1_b02ee92db3 |
| hb-05 | contain | 2 | escalate | ❌ | 0.63 | 1 | 16 | 3 | 26.7 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlptptq_e623c54efd |
| hb-06 | benign | 2 | benign | ✅ | 0.8 | 2 | 16 | 4 | 69.4 | 1 | 3/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpuafl_78a53deb62 |
| hb-07 | monitor | 2 | escalate | ❌ | 0.65 | 1 | 30 | 3 | 41.1 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpvs04_94f110749d |
| hb-08 | escalate | 2 | escalate | ✅ | 0.7 | 1 | 13 | 3 | 30.3 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpwnq5_d8fcbbfc70 |
| hb-01 | contain | 3 | contain | ✅ | 0.85 | 2 | 26 | 4 | 43.0 | 1 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpxb3v_582e99bed3 |
| hb-02 | monitor | 3 | escalate | ❌ | 0.65 | 1 | 12 | 3 | 36.2 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpy8bp_71cdc52c0f |
| hb-03 | benign | 3 | benign | ✅ | 0.75 | 1 | 10 | 3 | 34.5 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpz0bc_cca4f62eac |
| hb-04 | escalate | 3 | escalate | ✅ | 0.63 | 1 | 15 | 3 | 53.4 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlpzqxf_a97c01854c |
| hb-05 | contain | 3 | escalate | ❌ | 0.63 | 1 | 15 | 3 | 77.7 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq0w6b_2e84c337f8 |
| hb-06 | benign | 3 | benign | ✅ | 0.7 | 1 | 11 | 3 | 88.5 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq2k5l_99d7ef2125 |
| hb-07 | monitor | 3 | escalate | ❌ | 0.75 | 1 | 8 | 3 | 59.2 | 0 | 2/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq4ggu_3af4bed415 |
| hb-08 | escalate | 3 | escalate | ✅ | 0.7 | 2 | 22 | 4 | 63.7 | 2 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq5q77_07a5a5cd02 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 18/24 ok · model-backed n/a · infra_unavailable 0/24 · false contain 6 · false benign 0 · degraded runs 0/24 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 0.5 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hb-01 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq73eq_1764b79532 |
| hb-02 | monitor | 1 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7478_8dc0526f60 |
| hb-03 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.7 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq74me_c8a5a7149e |
| hb-04 | escalate | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7554_ce511902b1 |
| hb-05 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.3 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq75i5_675e3d3053 |
| hb-06 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq76i9_e7769899ae |
| hb-07 | monitor | 1 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq76u8_f7e465acb1 |
| hb-08 | escalate | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq775r_5289522c74 |
| hb-01 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq77je_9d87333a07 |
| hb-02 | monitor | 2 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7802_4ccb839077 |
| hb-03 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq78cg_645b667ad7 |
| hb-04 | escalate | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq78o5_ef09271a54 |
| hb-05 | contain | 2 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.0 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq78zw_601849801e |
| hb-06 | benign | 2 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.8 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq79rb_55585b99bc |
| hb-07 | monitor | 2 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7aej_2e788de374 |
| hb-08 | escalate | 2 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7apd_2593aaa124 |
| hb-01 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7b17_db5e94bbcb |
| hb-02 | monitor | 3 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 0.6 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7bcz_de73f5b12b |
| hb-03 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7bsm_b95497803f |
| hb-04 | escalate | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7c41_043065a54c |
| hb-05 | contain | 3 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7cfk_18c6e8d576 |
| hb-06 | benign | 3 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7cqx_a7a6715f64 |
| hb-07 | monitor | 3 | monitor | ✅ | 0.6 | 0 | 2 | 0 | 1.2 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7d2r_239d5e3c70 |
| hb-08 | escalate | 3 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | n/a | 0 | rules_only | - | no | 0 | - | mvlq7dza_d57678fd89 |

## M0 — model-only (Nemotron alone, no tools, no critic, no risk gate)

Judged 17/24 ok · model-backed 24/24 · infra_unavailable 0/24 · false contain 2 · false benign 2 · degraded runs 3/24 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 15.7 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| hb-01 | contain | 1 | contain | ✅ | 0.95 | 0 | 2 | 1 | 5.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq7edu_c5505d9ba8 |
| hb-02 | monitor | 1 | monitor | ✅ | 0.6 | 0 | 2 | 1 | 9.8 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq7idv_7a93910406 |
| hb-03 | benign | 1 | benign | ✅ | 0.87 | 0 | 2 | 1 | 47.4 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq7pyw_de00824d54 |
| hb-04 | escalate | 1 | contain | ❌ | 0.82 | 0 | 2 | 1 | 57.3 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq8qic_4a9be841b1 |
| hb-05 | contain | 1 | contain | ✅ | 1 | 0 | 2 | 1 | 32.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlq9yq1_b638c586ca |
| hb-06 | benign | 1 | escalate | ❌ | 1 | 0 | 2 | 1 | 24.9 | 0 | 1/1 | 0 | model_only | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqanm9_41593399d0 |
| hb-07 | monitor | 1 | benign | ❌ | 1 | 0 | 2 | 1 | 8.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqb6sw_b2670df005 |
| hb-08 | escalate | 1 | escalate | ✅ | 0.7 | 0 | 2 | 1 | 34.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqbdg6_f166df0daa |
| hb-01 | contain | 2 | contain | ✅ | 0.95 | 0 | 2 | 1 | 6.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqc3xi_9b4cda9a7d |
| hb-02 | monitor | 2 | monitor | ✅ | 0.72 | 0 | 2 | 1 | 38.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqc8z1_b4c7b7a1f0 |
| hb-03 | benign | 2 | benign | ✅ | 0.92 | 0 | 2 | 1 | 5.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqd2ux_d7c460e944 |
| hb-04 | escalate | 2 | monitor | ❌ | 0.6 | 0 | 2 | 1 | 40.2 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqd76t_4a0ef10164 |
| hb-05 | contain | 2 | contain | ✅ | 0.9 | 0 | 2 | 1 | 15.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqe283_0f1dd44d4f |
| hb-06 | benign | 2 | escalate | ❌ | 0.65 | 0 | 2 | 1 | 14.6 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqee0d_5cffe4d8e8 |
| hb-07 | monitor | 2 | benign | ❌ | 0.92 | 0 | 2 | 1 | 17.3 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqepax_160e286d6d |
| hb-08 | escalate | 2 | escalate | ✅ | 0.65 | 0 | 2 | 1 | 12.5 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqf2nr_ba57b32596 |
| hb-01 | contain | 3 | contain | ✅ | 0.95 | 0 | 2 | 1 | 9.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqfcbe_ce48571b6c |
| hb-02 | monitor | 3 | monitor | ✅ | 0.7 | 0 | 2 | 1 | 16.9 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqfjkl_ea23cd7f11 |
| hb-03 | benign | 3 | benign | ✅ | 0.95 | 0 | 2 | 1 | 18.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqfwmc_2fe782e589 |
| hb-04 | escalate | 3 | contain | ❌ | 0.8 | 0 | 2 | 1 | 15.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqgaih_0e4b70039a |
| hb-05 | contain | 3 | contain | ✅ | 0.92 | 0 | 2 | 1 | 15.0 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqgmn4_ee6f1d3060 |
| hb-06 | benign | 3 | benign | ✅ | 0.85 | 0 | 2 | 1 | 7.4 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqgy8s_5d93514228 |
| hb-07 | monitor | 3 | monitor | ✅ | 0.82 | 0 | 2 | 1 | 8.7 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqh3x6_c684b26747 |
| hb-08 | escalate | 3 | escalate | ✅ | 0.7 | 0 | 2 | 1 | 27.1 | 0 | 1/1 | 0 | model_only | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlqhamk_14a3f973f2 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
