# WhyTrace

Evidence-backed investigator for university account compromise. Four disconnected sources — identity sign-in logs, mail-gateway events, asset inventory, CISA KEV — read in place through **Zetaris**. A planner → investigator ↔ critic → risk-gate → reporter loop produces a defensible verdict (`contain | monitor | benign | escalate`) where every claim links to the exact query and rows that support it.

Built for the **Open Agent Hackathon 2026 — Track 02 "The Agent That Can Explain Why"** by Osman Can Çetlenbik (CyberCBU, Manisa Celal Bayar University).

Development was done in Cursor. The primary AI runtime provider is **Meterless Nightshift**, which routes to **NVIDIA Nemotron** lanes. Three Meterless engines (World Model, H-MEM, Markovian) back the shared evidence graph, cross-case memory, and the long-log sweep.

> This README is a stub during the build window. The authoritative setup/usage docs land before submission.

## Status

Night of 22 Oct 2026 — Day-1 infrastructure scaffold in progress.

## Entry points

- CLI: `npm run investigate -- case-001`
- API: `npm run dev` → `POST /run`, SSE `GET /runs/:id/stream`
- Data: `npm run services:up` + `npm run bootstrap:zetaris`
- Conformance: `npm run conformance`
