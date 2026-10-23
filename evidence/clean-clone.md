# Clean-clone + Docker test — 2026-10-23T08:55Z (DAY3E)

Fresh-tree reproducibility check for milestone #11. Working directory
`/tmp/whytrace-clean/clone`, nothing from the user's original tree reused
(no `.env`, no `logs/`, no `node_modules`). Repeated after DAY3E — the
Dockerfile now carries `samples/` into the runtime image and the sample tapes
were re-recorded from fresh, model-backed live runs.

## Reproduction steps

```bash
mkdir -p /tmp/whytrace-clean && cd /tmp/whytrace-clean
git clone /Users/osmancancetlenbik/Projeler/whytrace clone      # local source — no remote required
cd clone
npm ci
./run case-002 --sample                       # offline replay of a recorded run
./run case-001 --sample
./run case-003 --sample
./run case-007 --sample
docker build -t whytrace:day3e-clean .        # multi-stage build, sample-mode default
docker run --rm -d --name whytrace-day3e -p 8003:8000 whytrace:day3e-clean
curl -s http://127.0.0.1:8003/healthz          # → {"ok":true,"service":"whytrace-api",...}
# POST one run per case, GET final report
curl -s -X POST http://127.0.0.1:8003/run -H "Content-Type: application/json" -d '{"case_id":"case-002"}'
curl -s "http://127.0.0.1:8003/runs/<run_id>"
docker stop whytrace-day3e
```

## Timings (wall clock, macOS 27, Darwin arm64)

| step | seconds | notes |
|---|---:|---|
| `git clone` (local source) | 0 | local-filesystem clone; a public-remote clone would add network RTT |
| `npm ci` (fresh node_modules) | 3 | 118 MB installed; npm cache was pre-warmed on this host |
| `./run case-002 --sample` | 0 | offline replay from `samples/case-002/` (27 recorded Zetaris queries) |
| `./run case-001 --sample` | 0 | sample replay |
| `./run case-003 --sample` | 0 | sample replay |
| `./run case-007 --sample` | 0 | sample replay |
| `docker build -t whytrace:day3e-clean .` | 10 | multi-stage image, cache warm on this host from DAY3D |
| `docker run` + healthz + four sample POST /run + stop | 15 | 2 s startup to healthz 200, ~3 s per case |
| **total** (clone → stop) | **28** | well inside the "≤ 5 min from README" bar in `notes/ODULLER_VE_HEDEFLER.md` #11 |

## Verdicts recorded in the clean clone

CLI sample replay:

| command | expected | actual | notes |
|---|---|---|---|
| `./run case-002 --sample` | benign | `benign @ 0.85` ✅ | DAY3D shared-egress rejection visible on the `new_asn` claim ("201 distinct accounts completed MFA from 193.140.10.21 in the last 30 days"); DAY3E re-recorded tape carries the new SQL variants |
| `./run case-001 --sample` | contain | `contain @ 0.94` ✅ | model-backed `model+policy` |
| `./run case-003 --sample` | escalate | `escalate @ 0.51` ✅ | tape recorded during a `policy_fallback` run (risk-gate model declined to answer with DQ-conflict content — tracked in DAY3E builder TODOs) |
| `./run case-007 --sample` | contain | `contain @ 0.86` ✅ | Scout Intent prompt-injection panel fires 12 attempts on the recorded run |

Dockerized `POST /run` against `whytrace:day3e-clean` (sample mode, no network, no `.env`):

| case | expected | actual | notes |
|---|---|---|---|
| `case-001` | contain | `contain @ 0.94 (model+policy)` ✅ |  |
| `case-002` | benign | `benign @ 0.85 (model+policy)` ✅ | **DAY3D shared-egress fix survives through the Dockerized orchestrator** — the stale-tape artefact flagged in the previous DAY3D run is resolved |
| `case-003` | escalate | `escalate @ 0.51 (policy_fallback)` ✅ | risk-gate model error replayed from the recorded tape; verdict still matches the label |
| `case-007` | contain | `contain @ 0.86 (model+policy)` ✅ |  |

## Dockerfile change (DAY3E)

The previous build stage copied `apps/`, `packages/`, `services/` and
`scripts/` but **not** `samples/`, and the runtime stage then created an empty
`samples/` directory. The DAY3D clean-clone report flagged this as a stale-tape
artefact; it was in fact a *missing* tape, so every sample-mode `POST /run`
inside the container fell through to live mode, failed without `.env`
credentials and ended at `policy_fallback → escalate`. The Dockerfile now:

- adds `COPY samples/ ./samples/` to the build stage so the tapes ship with the image;
- removes `samples` from the runtime `mkdir -p` list so it is sourced from the build stage, not blanked.

With that change, the Docker verdicts above match the CLI sample-mode verdicts
exactly, which is what milestone #11 requires.

## Isolation checks

- `.env` is absent from the clone (sample mode works without secrets).
- `node_modules/@whytrace/*` symlinks all resolve to the clone's own packages (relative `../../packages/...` / `../../apps/...`), nothing points back at `/Users/osmancancetlenbik/Projeler/whytrace`.
- `logs/` directory was empty at clone time; the 4 subdirectories created during this test came from the four `./run` invocations above.

## Milestone #11 verdict

Clean-clone end-to-end works for both the CLI sample mode (4/4 cases match
expectations) and the Dockerized API (4/4 cases match expectations) in under
30 s on this host. The DAY3D "stale-tape" caveat is cleared: samples are
re-recorded against the DAY3D shared-egress + `mfa_fatigue` coverage paths and
the Dockerfile now carries them, so a judge building from a fresh clone sees
the same verdicts as the local CLI.
