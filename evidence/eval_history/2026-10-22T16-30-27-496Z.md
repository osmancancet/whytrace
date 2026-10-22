# WhyTrace evaluation — 2026-10-22T16:30:27.496Z

Live runs against the local Zetaris USL and Meterless Nightshift (Nemotron lanes). Raw reports: `evidence/eval_raw/`.

Health gate: UNAVAILABLE: max backoff exhausted.

## A0 — full system

Judged 0/0 ok · infra_unavailable 6/6 · false contain 0 · false benign 0 · degraded runs 0/0 · provider_failures 0 · median time - s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | infra_unavailable (nightshift unavailable) | ⏸️ | 0 | 0 | 0 | 0 | 0.0 | 0 | yes | 0 | - | - |
| case-002 | benign | 1 | infra_unavailable (nightshift unavailable) | ⏸️ | 0 | 0 | 0 | 0 | 0.0 | 0 | yes | 0 | - | - |
| case-003 | escalate | 1 | infra_unavailable (nightshift unavailable) | ⏸️ | 0 | 0 | 0 | 0 | 0.0 | 0 | yes | 0 | - | - |
| case-004 | contain | 1 | infra_unavailable (nightshift unavailable) | ⏸️ | 0 | 0 | 0 | 0 | 0.0 | 0 | yes | 0 | - | - |
| case-005 | benign | 1 | infra_unavailable (nightshift unavailable) | ⏸️ | 0 | 0 | 0 | 0 | 0.0 | 0 | yes | 0 | - | - |
| case-006 | monitor | 1 | infra_unavailable (nightshift unavailable) | ⏸️ | 0 | 0 | 0 | 0 | 0.0 | 0 | yes | 0 | - | - |

## B0 — rules-only baseline (Entra-style thresholds)

Judged 2/6 ok · infra_unavailable 0/6 · false contain 1 · false benign 1 · degraded runs 0/6 · provider_failures 0 · median time 0.4 s

| case | expected | run | verdict | ok | conf | rounds | SQL | model | s | rejected | degraded | provider_failures | routed_models | run_id |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | contain | 1 | contain | ✅ | 0.8 | 0 | 2 | 0 | 1.7 | 0 | no | 0 | - | mvjrbvws_93c67f6d4e |
| case-002 | benign | 1 | contain | ❌ | 0.8 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjrbx73_dc12771257 |
| case-003 | escalate | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvjrbxh7_1949b61732 |
| case-004 | contain | 1 | monitor | ❌ | 0.6 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjrbxqo_7ee133be70 |
| case-005 | benign | 1 | benign | ✅ | 0.75 | 0 | 2 | 0 | 0.4 | 0 | no | 0 | - | mvjrby0m_93370b35f9 |
| case-006 | monitor | 1 | benign | ❌ | 0.75 | 0 | 2 | 0 | 0.3 | 0 | no | 0 | - | mvjrbyam_058d485e0b |

## Why rules-only (B0) is not enough

- case-002 (benign faculty travel): B0 fires on impossible travel + new ASN → `contain`. We check the known device + VPN appliance and the Critic reverses it.
- case-003 (vulnerable appliance): B0 has no KEV / DQ signal and settles for `monitor`. We escalate because the sign-in traverses `vpn-edge-01` whose firmware is in CISA KEV.
- B0 has no cross-case memory, so the lesson from case-002 cannot inform case-003 the next time.
