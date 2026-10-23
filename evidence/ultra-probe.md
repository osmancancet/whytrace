# Nemotron Ultra probe — 2026-10-23T00:24:48.766Z

Listed 77 models at `METERLESS_BASE_URL`. Ultra-ish candidates:

- `nvidia/nemotron-3-ultra-550b-a55b`
- `nvidia/llama-3.1-nemotron-ultra-253b-v1`

## Probe results

- ⚠️ `nvidia/nemotron-3-ultra-550b-a55b` listed, but Nightshift routed the request to `nvidia/nemotron-3.5-super-vl-120b-a12b` — Ultra not reached on this install. 1033 ms, receipt=`rcpt_req_5ev2tnrz`
- ⚠️ `nvidia/llama-3.1-nemotron-ultra-253b-v1` listed, but Nightshift routed the request to `nvidia/nemotron-3.5-super-vl-120b-a12b` — Ultra not reached on this install. 736 ms, receipt=`rcpt_req_9sixii5p`

**Ultra not reached.** Nightshift accepts the Ultra id(s) `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/llama-3.1-nemotron-ultra-253b-v1` but the receipt reports `routed_model` ≠ requested — the proxy aliases them to `nvidia/nemotron-3.5-super-vl-120b-a12b` on this install. The Reporter stays on `meterless/auto` / Super VL.

## Wiring

No change is made automatically. If an Ultra lane is enabled later, set `METERLESS_REPORTER_MODEL=<id>` and re-run `npm run probe:ultra` to re-verify.