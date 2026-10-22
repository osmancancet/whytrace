# WhyTrace evaluation — 2026-10-22T16:02:42.097Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: online (probe routed_model=nvidia/nemotron-3.5-super-vl-120b-a12b, receipt=rcpt_req_a8zwdu7g).

## A0 — full system

Judged 2/6 ok · infra_unavailable 0/6 · false contain 1 · false benign 0 · degraded runs 6/6 · provider_failures 8 · median time 537.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | escalate | ❌ | 0.9 | 1 | 17 | 8 | 544.5 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvjolc2r_dd689c503e |
| case-002 | benign | 1 | benign | ✅ | 0.75 | 2 | 14 | 4 | 227.3 | 3 | yes | 1 | nemotron-3.5-super-vl-120b-a12b | mvjox07v_bc7d20e8fb |
| case-003 | escalate | 1 | escalate | ✅ | 0.5 | 2 | 10 | 4 | 234.2 | 0 | yes | 0 | nemotron-3.5-super-vl-120b-a12b | mvjp1vmm_bfd05907b9 |
| case-004 | contain | 1 | escalate | ❌ | 0.85 | 1 | 19 | 13 | 404.5 | 0 | yes | 2 | nemotron-3.5-super-vl-120b-a12b | mvjp6wbe_479e8d0724 |
| case-005 | benign | 1 | escalate | ❌ | 0.85 | 1 | 8 | 1 | 537.4 | 0 | yes | 3 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvjpfkf4_207725f2c6 |
| case-006 | monitor | 1 | contain | ❌ | 0.91 | 1 | 22 | 6 | 602.5 | 0 | yes | 1 | nemotron-3.5-super-vl-120b-a12b, nemotron-3.5-lightning-30b-a3b | mvjpr32g_3c03da6390 |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 2/6 ok · infra_unavailable 0/6 · false contain 1 · false benign 1 · degraded runs 0/6 · provider_failures 0 · median time 0.5 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 0.8 | 0 | no | 0 | - | mvjq3zxt_605de129f8 |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.5 | 0 | no | 0 | - | mvjq40jj_7a6ff48001 |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 1.3 | 0 | no | 0 | - | mvjq40w4_44b12c992f |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvjq41xm_703e88b919 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjq426x_dcd31915dc |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvjq42gv_6299f32698 |

## A3 — memory cold vs warm (case-003)

| memory | verdict | lessons recalled | rounds | SQL | model | s |
|---|---|---|---|---|---|---|
| cold | escalate | 0 | 2 | 10 | 4 | 17.1 |
| warm | escalate | 1 | 2 | 10 | 4 | 198.2 |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
