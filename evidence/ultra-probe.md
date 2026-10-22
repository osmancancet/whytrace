# Nemotron Ultra probe — 2026-10-22T20:42:15.181Z

Listed 77 models at `METERLESS_BASE_URL`. Ultra-ish candidates:

- `nvidia/nemotron-3-ultra-550b-a55b`
- `nvidia/llama-3.1-nemotron-ultra-253b-v1`

## Probe results

- ✅ `nvidia/nemotron-3-ultra-550b-a55b` — ok in 4481 ms, routed_model=`nvidia/nemotron-3.5-super-vl-120b-a12b`, receipt=`rcpt_req_p1hzwv3q`
- ✅ `nvidia/llama-3.1-nemotron-ultra-253b-v1` — ok in 268637 ms, routed_model=`nvidia/nemotron-3.5-super-vl-120b-a12b`, receipt=`rcpt_req_v8236g3r`

## Side-by-side Reporter summary (case-001 recorded findings)

### Super VL (deep lane default) (meterless/auto) — 21927 ms, routed_model=`nvidia/nemotron-3.5-super-vl-120b-a12b`

```
Verdict: contain (confidence 0.75). Compromised student account received phishing mail from aegean-edu.co (F1, T1566.002), followed by 38 SIS events in 60 min from 185.220.101.7 (F2, T1213), impossible travel Amsterdam→Manisa in 234 min (F3, T1078.004), and an API-created inbox forwarding rule to d.yilmaz.payroll@gmail.com (F5, T1114.003). Indicators show credential theft with persistent email exfiltration; immediate containment recommended.
```

Actions:

- Disable/remove inbox forwarding rule to d.yilmaz.payroll@gmail.com
- Reset credentials for affected student account and enforce MFA re-enrollment
- Block source IP 185.220.101.7 at perimeter/firewall
- Block or flag aegean-edu.co sender domain in email gateway
- Review and revoke suspicious SIS sessions/tokens; audit affected student records

### Ultra — failed: Nightshift HTTP 502: failed

## Wiring

Set `METERLESS_REPORTER_MODEL=nvidia/nemotron-3-ultra-550b-a55b` to route the Reporter call to Ultra. The Investigator path keeps using Super VL via `meterless/auto`.