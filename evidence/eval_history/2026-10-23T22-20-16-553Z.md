# WhyTrace evaluation — 2026-10-23T22:20:16.553Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_3bj597ti).

Terminal status: `online`. 1 probe attempt(s):

| # | ts | status | routed_model | detail |
|---|---|---|---|---|
| 1 | 2026-10-23T22:04:18.436Z | online | nvidia/nemotron-3.5-super-vl-120b-a12b |  |

## A0 — full system

Judged 8/16 ok · model-backed 16/16 · infra_unavailable 0/16 · false contain 0 · false benign 2 · degraded runs 9/16 · provider_failures 0 · cached model calls 0 · failure classes: (none) · median time 60.7 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | model-backed | cached | decided_by | failure_classes | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ho-01 | contain | 1 | escalate | ❌ | 0.64 | 1 | 17 | 3 | 68.1 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlip56w_2cd7c71f25 |
| ho-02 | benign | 1 | benign | ✅ | 0.85 | 3 | 23 | 5 | 86.3 | 2 | 4/5 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvliqlpy_b98f0e76dc |
| ho-03 | contain | 1 | contain | ✅ | 0.78 | 2 | 24 | 4 | 87.3 | 1 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlisgbm_47c7f6d1ce |
| ho-04 | escalate | 1 | escalate | ✅ | 0.8 | 2 | 16 | 4 | 65.2 | 1 | 3/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvliuboz_99afe7f042 |
| ho-05 | monitor | 1 | escalate | ❌ | 0.63 | 1 | 13 | 3 | 29.5 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlivq09_38a5d8704d |
| ho-06 | benign | 1 | benign | ✅ | 0.85 | 1 | 14 | 3 | 38.6 | 2 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvliwcss_236e9a83a9 |
| ho-07 | escalate | 1 | benign | ❌ | 0.7 | 1 | 10 | 3 | 52.8 | 1 | 2/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlix6kn_11dd135152 |
| ho-08 | monitor | 1 | escalate | ❌ | 0.7 | 1 | 11 | 3 | 34.5 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvliybd9_2e0c05dc8e |
| ho-01 | contain | 2 | escalate | ❌ | 0.64 | 1 | 17 | 3 | 60.7 | 1 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvliz1zg_28fbc51e2f |
| ho-02 | benign | 2 | benign | ✅ | 0.8 | 2 | 15 | 4 | 78.3 | 1 | 3/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj0cvd_15de3e6c51 |
| ho-03 | contain | 2 | contain | ✅ | 0.78 | 1 | 15 | 3 | 36.1 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj21c9_5d4db9c673 |
| ho-04 | escalate | 2 | escalate | ✅ | 0.8 | 1 | 11 | 3 | 56.5 | 0 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj2t6m_fe1bd9c1f2 |
| ho-05 | monitor | 2 | escalate | ❌ | 0.63 | 1 | 13 | 3 | 40.6 | 0 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj40so_f3353ed0b3 |
| ho-06 | benign | 2 | benign | ✅ | 0.85 | 1 | 14 | 3 | 44.2 | 2 | 3/3 | 0 | model+policy | - | no | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj4w5t_f95693a311 |
| ho-07 | escalate | 2 | benign | ❌ | 0.8 | 1 | 13 | 3 | 102.1 | 1 | 3/3 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj5uan_f89e9fc21b |
| ho-08 | monitor | 2 | escalate | ❌ | 0.75 | 2 | 21 | 4 | 76.9 | 1 | 4/4 | 0 | model+policy | - | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvlj812y_4ebd09a200 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
