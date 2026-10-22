# WhyTrace — project brief for coding agents

Read this first, every session. Detailed, **verified** rules live in `.cursor/rules/` (`zetaris-data`, `meterless-engines`, `nightshift-runtime`, `evidence-contract`) — they are the source of truth — plus the local planning notes under `notes/`.

## What we are building
**WhyTrace** — an evidence-backed account-compromise investigator for university IT / security teams.
Track: **Open Agent Hackathon 2026 · Track 02 "The Agent That Can Explain Why"**. Solo builder: Osman Can Çetlenbik (CyberCBU, Manisa Celal Bayar University).

> We are building an agent that helps a university IT security analyst decide whether a flagged staff/student account is compromised by investigating four disconnected sources (identity sign-in logs, mail-gateway events, the asset inventory and the CISA KEV catalogue) in place through Zetaris, connecting the findings, and producing a verdict (**contain / monitor / benign / escalate**) where every claim links to the exact query and rows that support it.

Why it matters (Impact, 30 pts): universities run on fragmented systems, analysts are few, and phishing → account takeover is the most common incident. Triage takes hours of copy-pasting between consoles; a wrong "benign" lets an attacker read student records, a wrong "contain" locks a lecturer out mid-exam. WhyTrace produces a defensible decision in minutes and shows its work.

## Hard constraints (disqualification risks — never violate)
1. **Build window:** 22 Oct 2026 00:00 UTC → 27 Oct 23:45 UTC (TR 03:00 → 28 Oct 02:45). **No commit before the window opens.** Planning docs are fine; product code is not. Submit early (ties break on submission time).
2. **Zetaris** must be the data layer (runs locally in Docker). Every fact the agents use comes through Zetaris SQL.
3. **Meterless**: ≥1 engine implemented in a working feature with its conformance suite passing (we do World Model + H-MEM + Markovian), AND Meterless Nightshift is the primary model provider.
4. **Developed in Cursor.** The repository, commits, README, deck and video show Cursor as the development environment.
5. **NVIDIA Nemotron through Nightshift** does material work (DGX Spark award).
6. **No secrets anywhere** (code, logs, README, screenshots, video). `.env` is gitignored; `.env.example` has placeholders only.
7. **No hardcoded outputs or fabricated logs.** Sample mode replays *recorded real* results only.
8. **No tool fingerprints in the repo:** editor/assistant-specific config and memory files stay local (they are globally gitignored), no attribution trailers in commits or PRs, and code, comments, docs, commit messages, README, deck and video describe development as done in Cursor. Commit author is the builder only. The README's AI-disclosure section names only the *runtime* models (Nemotron via Nightshift).
9. Public GitHub repo with README (setup, usage, deps, data sources, limitations, sample mode), Dockerfile, `run` entry point, ≥3 input/output examples, JSONL traces in `logs/`.

## Architecture
```
Analyst UI (React, Vite) ──SSE──┐
CLI: npm run investigate ───────┤
POST /run (Fastify, 0.0.0.0) ───┴─> Orchestrator (state machine, bounded)
                                      │ shared state = Meterless World Model (evidence graph, provenance)
                                      │ cross-case memory = Meterless H-MEM
                                      │ long investigation = Meterless Markovian (bounded chunks)
   ┌──────────────┬──────────────────┼──────────────────┬───────────────┐
 Planner      Investigator      Evidence Critic       Risk Gate       Reporter
 (deep lane)  (fast lane, tools: (fast lane; re-runs   (deep lane;     (deep lane)
              zetaris.sql)       its own Zetaris query  escalate when
                                 to verify each claim)  confidence low)
                                      │
                        Zetaris REST /sql-editor/sqls/run
       ┌──────────────┬───────────────┬─────────────────┬──────────────┐
  auth_pg (Postgres   MAILGW (REST    FILES (Zetaris     KEV (CISA KEV
  JDBC: sign-ins,     mock service:   CSV: devices,      public JSON
  MFA, VPN)           deliveries,     owners, OS,        catalogue)
                      clicks, rules)  VPN appliance)
```
- **Unified Semantic Layer (USL) is central.** Zetaris told participants on 20 Oct that the USL "is a big hint" for judging. Register the four sources, then build one USL (e.g. `lightning.metastore.whytrace.security_usl`) with tables `identity`, `signin_event`, `mail_event`, `device`, `vulnerability` joined by user/device/IP keys, plus DQ rules (e.g. valid UPN, non-null timestamps). Agents query the USL first and drop to raw sources only to verify. Show the USL in the demo and deck.
- Loop: Planner → Investigator ↔ Critic (reject unsupported claim → re-plan/re-query, max 3 rounds) → Risk Gate (escalate to human if confidence < 0.7 or evidence conflict) → Reporter → Critic final check.
- Model calls: ONE injected `generator` → Nightshift (`METERLESS_BASE_URL`, token from `METERLESS_RUNTIME_TOKEN` or Nightshift's local `proxy-token` file). Routes: `meterless/auto` (deep steps) and `meterless/fast` (quick steps); Nightshift lanes map them to Nemotron Super VL / Lightning, and the actual model is read from each response's `meterless` receipt. Headers: `Authorization: Bearer`, `meterless-app: whytrace`, `meterless-scope: user`. Always `/no_think` + `max_tokens ≥ 2000`, prefer tool calling for structured output, 180 s timeout (official Runtime 1.4 contract), 3 retries with 2/4/8 s backoff, "Test connection" per the contract (see `nightshift-runtime` rule).
- Output JSON: `verdict`, `confidence`, `summary`, `findings[{claim, evidence_ids[], sql_ids[]}]`, `actions[]`, `limitations[]`, `trace_id`, `log_file`.
- Logs: `logs/<run_id>/trace.jsonl` (agent, action, input/output summary, target_agent, confidence, retry_count, status, sql_id), plus engine JSONL (world-model audit, hmem ledger, markovian history) and readable stdout.

## Demo cases (synthetic, realistic; all data lives in our own containers + public KEV)
1. `case-001` **Compromised**: phishing mail delivered + clicked → sign-in from new ASN/country 40 min later → MFA push fatigue (7 denies, 1 approve) → new inbox forwarding rule → bulk access. Expected: contain.
2. `case-002` **Benign**: lecturer abroad at a conference, known device, VPN from the university appliance, no phishing. Expected: benign (Critic must stop a premature "impossible travel" claim).
3. `case-003` **Escalate**: sign-in via the VPN appliance whose firmware matches a KEV-listed CVE, weak signals elsewhere. Expected: escalate to human.
Case 2 → case 3 demonstrates H-MEM: the lesson "conference travel + known device = benign pattern" is reused.

## Stack
TypeScript (Node 22, ESM, strict), Fastify, Zod, Vitest, React + Vite for the UI, Docker Compose for our data services (Postgres, mock mail-gateway); CSV files (asset inventory, Turkish phishing corpus) go into Zetaris' own file store via `docker cp`. Zetaris runs separately from `~/zetaris-platform` (compose project `zetaris`, network `zetaris_default`).

## Repository layout (target)
```
apps/api/            Fastify server, POST /run, GET /runs/:id/stream (SSE)
apps/web/            React analyst UI (case picker, live agent trace, evidence chain, report)
packages/agents/     planner, investigator, critic, risk-gate, reporter, orchestrator
packages/adapters/   zetaris.ts, nightshift.ts (generator), sample-mode replay
packages/engines/    world-model/, hmem/, markovian/ (Meterless, Apache-2.0, attributed)
services/            docker-compose.data.yml, postgres seed, mailgw mock, file-store CSVs
scripts/             zetaris_bootstrap.ts (idempotent source registration), record_sample.ts
data/sample/         seeds + recorded Zetaris results for SAMPLE_MODE
input_examples/ output_examples/ logs/ evidence/ docs/
```

## Working rules
- Small, reviewed commits with plain messages ("Add Zetaris adapter with retry"), author = builder.
- Every change keeps: `npm run typecheck`, `npm test`, `npm run conformance` green.
- Never print or log tokens/keys; mask in errors.
- Ask before destructive actions (dropping Zetaris objects, `docker compose down -v`).
- Prefer shipping a working end-to-end slice early, then deepen.
- Write user-facing docs in English; talk to the builder in Turkish.
