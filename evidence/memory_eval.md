# H-MEM memory evaluation — case-003 cold vs warm

Live runs against local Zetaris USL `lightning.metastore.whytrace.security_usl`
and Meterless Nightshift (NVIDIA Nemotron Super VL / Lightning). Raw reports:
`output_examples/case-003-mvjh1nsc_0e2cc7ba65.json` (cold),
`output_examples/case-003-mvjhanzl_61edf40da7.json` (warm).

The warm run shares one on-disk H-MEM state (`logs/hmem/`) with the preceding
case-002 run (`output_examples/case-002-mvjh9dy4_2b6ba2b9aa.json`). Case-002
produced four Critic rejections (ExchangeSync mail-sync, shared spray exit IP,
patched VPN firmware, VPN-explained MEO ASN) that each landed as a factual
lesson in H-MEM via `CaseMemory.learn`.

| memory | verdict | confidence | rounds | SQL calls | model calls | seconds | lessons recalled |
|---|---|---|---|---|---|---|---|
| cold  | escalate | 0.51 | 2 | 18 | 4 | 336.9 | 0 |
| warm  | escalate | 0.51 | 2 | 21 | 4 | 225.1 | 1 |

Lesson that H-MEM selected for the warm run (from H-MEM's ranked `.context`):

```
Rejected claim pattern (case-002): "VPN appliance vpn-edge-02 (firmware 22.7R2.8)
runs a product listed in CISA KEV ..." was wrong because firmware 22.7R2.8
already includes the fixes for the KEV entries we can version-check
(CVE-2025-22457, CVE-2025-0282). Verdict: escalate.
```

Memory with judgement, not reuse: the lesson that *version-checked firmware is
not an exposure signal* was recalled, but it does **not** apply to case-003
because `vpn-edge-01` is firmware `22.7R2.3`, which is **below** the fixed
versions. The orchestrator still produced a `kev_exposure` finding for the
unpatched appliance, the Critic re-queried and approved it (`CONFIRMED`), and
the Risk Gate escalated on exposure + DQ `vpn_session_order` conflict. The
lesson shaped reasoning without changing the verdict.

Context pulled into the Planner prompt was the single H-MEM `.context` block
(see Planner messages in `logs/mvjhanzl_61edf40da7/trace.jsonl`); it did not
suppress the follow-up `appliance_exposure({appliance_id:"vpn-edge-01"})` step
that confirmed the exposure.

Full H-MEM state at warm-run time: `logs/hmem/state.json` (6 records, mix of
rejected-claim lessons from case-002 and the episodic case-003 pattern from the
cold run), ledger: `logs/hmem/ledger.jsonl` (one entry per create/feedback).
