# WhyTrace

> **Evidence-backed account-compromise investigator for university IT.** A planner → investigator ↔ critic → risk-gate → reporter loop reads four fragmented data sources in place through **Zetaris**, cites the exact query and rows behind every claim, and routes to a human when the signal does not stand up to re-query.

Built for the **Open Agent Hackathon 2026 — Track 02 "The Agent That Can Explain Why"** by Osman Can Çetlenbik (CyberCBU, Manisa Celal Bayar University). Development was done in Cursor.

## TL;DR

- **User:** one analyst in a university SOC, with Entra ID + a mail gateway + an asset CMDB + CISA KEV and no time to copy-paste across them.
- **Problem:** phishing → account takeover is the most common incident; a wrong *benign* leaks student records, a wrong *contain* locks a lecturer out mid-exam.
- **Verdicts:** `contain | monitor | benign | escalate` — each with a confidence number, timeline, and a defensible rationale.
- **Evidence chain:** every finding links to a `sql_id` the Critic re-queried independently; nothing is "the model said so".
- **Sponsor stack:** [Zetaris](https://zetaris.com) (Unified Semantic Layer over four sources), [Meterless](https://meterless.ai) (World Model, H-MEM, Markovian engines + Nightshift provider), [NVIDIA Nemotron](https://developer.nvidia.com/blog/accelerate-ai-development-with-the-nvidia-nemotron-open-models/) (Super VL 120B + Lightning 30B lanes), Cursor (development environment).

## The problem

Universities run on disconnected systems: identity in Entra, mail in a gateway, assets in a CMDB spreadsheet, vulnerabilities in CISA KEV. Analysts triage account-compromise tickets by context-switching between five consoles for an hour per case. KVKK/GDPR often forbid centralising the raw PII into a SIEM, so "query in place" is a hard constraint, not a nice-to-have. WhyTrace answers each ticket with a defensible verdict in minutes and keeps every row where it was.

## Quick start

Prerequisites: Docker, Node 22, [Meterless Nightshift](https://meterless.ai) installed locally (only required for the live pipeline; sample mode needs neither).

```bash
# Clone, install, start Zetaris + Postgres + mail-gateway containers.
npm install
npm run services:up
npm run bootstrap:zetaris     # idempotent: registers 4 sources + builds the USL
cp .env.example .env          # fill in local Postgres password; leave METERLESS_RUNTIME_TOKEN empty to use Nightshift's proxy-token file

# Investigate one case from the CLI (writes to logs/<run_id>/):
npm run investigate -- case-002

# Open the analyst console at http://localhost:5173 and the API at http://localhost:8000:
npm run dev
```

**Zero-dependency replay with the Docker image.** The default image boots the API in `SAMPLE_MODE=true` so a judge can run it with no keys, no local containers and no Nightshift:

```bash
docker build -t whytrace .
docker run -p 8000:8000 whytrace     # → http://localhost:8000/healthz
```

**Shell wrapper for the CLI.** `./run <case-id> [--sample]` is a thin wrapper around `npm run investigate`; `--sample` sets `SAMPLE_MODE=true` so the adapters replay from `samples/<case>/` instead of hitting Zetaris or Nightshift. Samples are only present for cases we have deliberately recorded (see [Sample mode](#sample-mode)); a case without a `samples/<case>/` directory in a clean clone cannot replay yet.

## How a verdict is earned

```
   Analyst alert
        │
     Planner (deep)                             H-MEM recall (cross-case lessons)
        │
   Investigator (fast) ──runs named SQL──> Zetaris USL
        │
     Critic (code) ──reruns its OWN SQL──> same USL
        │  rejects claims that fail re-query
        │  loops back to Planner up to 3 rounds
     DQ (scoped data-quality checks on the touched tables)
        │
     Risk Gate (code policy + deep-lane opinion)
        │  code is the guard rail; the model can disagree but cannot
        │  turn weak evidence into "contain" or confirmed abuse into "benign"
     Reporter (deep)
        │  summary + ATT&CK-mapped recommendations
        │
   validateReport ──enforces evidence contract (every claim cites a real sql_id)
```

- **Named-query catalogue:** the Planner picks from a fixed set of parameterised queries. No free-form SQL from a model ever hits Zetaris.
- **Independent Critic re-query:** every draft finding is re-tested with a different SQL from the Critic's own code, promoting it to CONFIRMED or rejecting it with a reason the analyst sees.
- **Deterministic fallbacks:** if a model step is unavailable, a code policy still produces a verdict on complete chains, with the degraded step named in `limitations[]` and the confidence lowered by 0.1.
- **Default coverage is a code rule.** Before Risk Gate, the orchestrator runs any missing default queries (mail, identity, spray-source, inbox rules) so a glitchy Planner cannot leave coverage incomplete.
- **`not_checked[]`** names what *could not* be verified in this run (travel calendar, EDR process events, …) rather than silently assuming it.

## Architecture

```
Analyst UI (React) ──SSE──┐
CLI investigate ──────────┤
POST /run (Fastify) ──────┴─> Orchestrator (bounded state machine)
                                 │ shared state  → Meterless World Model (evidence graph + provenance)
                                 │ cross-case     → Meterless H-MEM (episodic + semantic lessons)
                                 │ long log sweep → Meterless Markovian (bounded chunks, measured tokens)
   ┌──────────────┬──────────────┼──────────────┬───────────────┐
 Planner    Investigator   Evidence Critic   Risk Gate      Reporter
 (deep)     (fast)          (fast; own SQL)   (deep)         (deep)
                                 │
                   Zetaris REST  /sql-editor/sqls/run
    ┌──────────────┬────────────┬──────────────────┬──────────────────┐
auth_pg          MAILGW         FILES              KEV
(Postgres)       (REST mock)    (CSV in Zetaris)   (CISA public JSON)
```

The four sources are joined in one Unified Semantic Layer: `lightning.metastore.whytrace.security_usl` with tables `identity`, `signin_event`, `mail_event`, `device`, `vulnerability`, `vpn_session` and five DQ rules. Agents query the USL first; raw sources are reached only when the Critic needs to go behind an aggregate.

## Sponsor technology

| Where | What | Evidence |
|---|---|---|
| Zetaris | USL across 4 sources + 5 DQ rules | `scripts/zetaris_bootstrap.ts` registers sources; `packages/agents/src/sql-catalogue.ts` is the only entry point for SQL; traces log every `sql_id`. |
| Meterless engines | World Model, H-MEM, Markovian | `packages/engines/*` + conformance in `conformance/*` (29/29 passing). Audit JSONL per run in `logs/<run_id>/`. |
| Meterless Nightshift | Provider for all model calls | `packages/adapters/src/nightshift.ts` — `/no_think`, max_tokens ≥ 2000, 180 s timeout, 2/4/8 s retries, route fallback deep→fast, proxy-token fallback on 401. Every call writes `receipt_id` and `routed_model` to the trace. |
| NVIDIA Nemotron (via Nightshift) | Super VL 120B (deep) + Lightning 30B (fast) | `routed_model` from each response's `meterless` receipt is surfaced in the UI (model chip) and recorded in `evidence/eval.md`. |
| Cursor | Development environment | Commits authored by the builder; all AI-authored work happens inside the editor during the build window. |

## Evaluation

Run `npm run eval -- --runs 3 --ablations` for the full matrix (A0 full · A1 no Critic · A2 no DQ · A3 memory cold/warm · A4 single-agent · B0 rules-only baseline), or `npm run eval -- --runs 1 --baseline` for a quick A0 + B0 sweep. The optional `--wait-healthy <minutes>` flag (default 10) controls how long the eval waits for Nightshift to come back if the health gate reports `provider_error` or `auth_error`.

**Classified health gate.** Before every eval run we probe Nightshift and classify the result:

- `online` — the model returned a tool call (or we recovered JSON from the response text). Full A0 proceeds.
- `format_miss` — HTTP 200 but prose instead of a tool call. The model is up; it just skipped our schema. The eval proceeds with a logged warning, because the orchestrator's `tool_call_recovered_from_text` path handles this on real prompts.
- `provider_error` — 5xx, `_empty_response`, or timeout. A0 rows are marked `infra_unavailable` and not counted against accuracy; `B0` runs anyway.
- `auth_error` — 401/403 after the proxy-token fallback has already run. Same treatment as `provider_error`.

Every probe attempt (time, class, routed model) is written into the eval snapshot, so a judge can see exactly what the provider did during the sweep.

**The latest live sweep is in `evidence/eval.md`.** The B0 baseline is a classic Entra-style rules-only system (impossible travel by centroid distance, new ASN, MFA deny burst, external forwarding rule) — the story is that WhyTrace solves cases B0 cannot (case-002 "benign faculty travel" where B0 over-contains, case-003 "KEV-vulnerable appliance" where B0 under-reacts) because of the USL cross-source join, the Critic's independent re-query, and H-MEM.

## Analyst feedback loop

The verdict card in the console has **Confirm / Reject** actions. A `POST /runs/:id/feedback` writes a lesson into H-MEM with `origin: user_correction`, confidence `≥ 0.9`, and the `analyst-confirmed` tag — later runs cite it in the `[MEMORY CONTEXT]` block the Planner reads. Per-finding Confirm/Reject stores the pattern (or demotes it) too. Audit log in `logs/audit/feedback.jsonl`.

## Resilience & degraded-provider behaviour

Nightshift is a real provider under real load; the Day-2A and Day-2B evaluations caught upstream 502s, `_empty_response` errors and timeouts.

- **Tool-call recovery:** when the model returns prose instead of invoking the forced tool, the adapter extracts a JSON object from the text and continues. Traced as `tool_call_recovered_from_text`.
- **Route fallback:** after exhausting the deep-lane retries, the adapter retries once on the fast lane (same Nemotron, lower TTFT). Traced as `chat_nightshift_fallback`; the UI shows a `↷ route fallback` badge.
- **Serialised deep lane:** adapter concurrency defaults to 1 so stacked deep calls through the same Nightshift proxy do not amplify upstream 5xx storms.
- **Bounded prompts:** Reporter and Risk-Gate payloads are capped (12 findings, 10 rejected claims, 240 chars per claim, ~8 kB total).
- **Policy stands on complete chains.** If a model step is degraded but the deterministic policy is confident (non-escalate, no DQ conflict, core sources checked, confidence ≥ 0.7 after a −0.1 humility penalty), the verdict stands with a limitation line. Otherwise the case escalates to a human.
- **Token precedence:** `METERLESS_RUNTIME_TOKEN` wins when set and non-empty; if it is empty or rejected with 401/403, the adapter reads Nightshift's proxy-token file (`~/Library/Application Support/ai.meterless.runtime/proxy-token` on macOS, `~/.config/ai.meterless.runtime/proxy-token` elsewhere) and retries once. Only the *source* is logged, never the value.

## Demo cases

| id | scenario | expected |
|---|---|---|
| case-001 | Payroll phishing → click → MFA fatigue → new ASN → inbox-forward rule → bulk SIS access | `contain` |
| case-002 | Faculty travelling abroad, known device, VPN from the university appliance, no phishing | `benign` (Critic rejects a premature "impossible travel" claim) |
| case-003 | Lab-admin sign-in via a VPN appliance whose firmware matches a KEV-listed CVE | `escalate` |
| case-004 | Password spray against 60+ accounts, one success — Markovian sweeps the full roster | `contain` |
| case-005 | New inbox forwarding rule reported for a user with weak context | `benign` or `escalate` depending on the Critic's call |
| case-006 | Sign-in from a new device with weak contextual evidence | `monitor` |

## Logs & traces

Every run writes to `logs/<run_id>/`:

- `trace.jsonl` — one line per agent event (sql_id, routed_model, latency, retry count, status).
- `queries.jsonl` — append-only record of every SQL that hit Zetaris, with its `sql_id`.
- `world-model-audit.jsonl` — the engine's record of every finding, hypothesis and entity.
- `markovian.json` + `markovian-history/` — the long-sweep chunk journal.

Replay a recorded run deterministically with `SAMPLE_MODE=true`. The server exposes an SSE stream at `GET /runs/:id/stream` for the live console; the final JSON report goes to `output_examples/`.

## Sample mode

Sample mode replays a *previously recorded* investigation without touching Zetaris or Nightshift. It is how a judge exercises the full agent stack from a clean clone without the local Docker setup or a Nightshift account.

- **Where samples live.** Tracked under `samples/<case-id>/{zetaris,nightshift}/`. The adapters read from this directory when `SAMPLE_MODE=true` and a `caseId` is passed (both the CLI and the API do this).
- **How to record a sample.** `npm run record -- <case-id>` runs the orchestrator end-to-end against the live stack, writes every Zetaris result and Nightshift response under `samples/<case-id>/`, and scrubs Bearer tokens, Meterless `rt-*` tokens, `/Users/<name>` paths and UUIDs before anything is written to disk. A `samples/<case-id>/provenance.json` records the originating run id, verdict, confidence and routed models.
- **How to replay.** `SAMPLE_MODE=true npm run investigate -- <case-id>` or `./run <case-id> --sample`. The adapter reads the recorded responses from disk and the full orchestrator pipeline (planner, investigator, critic, risk gate, reporter) runs on them. The CLI banner clearly labels the run as "Replay recorded run".
- **Guard-rail test.** `scripts/samples.test.ts` is part of the regular test suite and fails if any file in `samples/` contains a Bearer token, an `rt-*` runtime token, a `/Users/*` path or a `/home/*` path.

## Data & licences

- Synthetic data generator in `services/postgres-seed/` + `data/`. The Turkish phishing corpus is from the builder's Kaggle dataset (CC BY-NC-SA 4.0).
- CISA KEV is public domain.
- Meterless engines are Apache-2.0, attributed in `packages/engines/*/LICENSE`.
- Nothing in this repo contains real university PII or working credentials.

## Limitations

- The Critic cannot verify what Zetaris did not ingest: travel calendars, EDR process events, physical access logs. These show up in `not_checked[]`.
- Password-spray noise rejection is heuristic. The Critic rejects a spray claim when the source IP's failures are ≥90 % from shared-NAT ASNs (campus / consumer-ISP) or span more than 24 h. This handles case-005/006 campus-IP background noise honestly, but a determined attacker on a shared-NAT ASN who still bursts in minutes could slip through — see `packages/agents/src/critic.ts` for the exact rule and tune `SHARED_NAT_ASNS` and `SPRAY_BURST_WINDOW_HOURS` for your environment.
- The Markovian long-sweep caps at 24 time-windowed chunks (`markovian-sweep.ts`); very long campaigns would need an extension.
- B0 is a deliberately simple rules-only baseline; it is not meant to be competitive, only to make the "why rules alone fail" case concrete.
- Sample mode only replays cases we have recorded. A case without a `samples/<case>/` directory on a clean clone will not run in `SAMPLE_MODE=true`; record it with `npm run record -- <case>` against a healthy stack first.

## AI disclosure

Runtime models are **NVIDIA Nemotron** (`nemotron-3.5-super-vl-120b-a12b` for deep lanes, `nemotron-3.5-lightning-30b-a3b` for fast lanes), served exclusively through **Meterless Nightshift**. The deck narration voice is synthetic. All development was done in **Cursor**.

## Entry points

- CLI: `npm run investigate -- <case-id>` or `./run <case-id> [--sample]`
- API: `npm run dev` → `POST /run`, SSE `GET /runs/:id/stream`
- Docker: `docker build -t whytrace . && docker run -p 8000:8000 whytrace` (sample mode by default)
- Data: `npm run services:up` + `npm run bootstrap:zetaris`
- Conformance: `npm run conformance`
- Evaluation: `npm run eval -- --runs 1 --baseline [--wait-healthy <minutes>]`
- Record: `npm run record -- <case-id>` (write `samples/<case-id>/`)
