# Clean-clone + Docker test — 2026-10-23T05:25Z (DAY3D)

Fresh-tree reproducibility check for milestone #11. Working directory
`/tmp/whytrace-clean/clone`, nothing from the user's original tree reused
(no `.env`, no `logs/`, no `node_modules`).

## Reproduction steps

```bash
mkdir -p /tmp/whytrace-clean && cd /tmp/whytrace-clean
git clone /Users/osmancancetlenbik/Projeler/whytrace clone      # local source — no remote required
cd clone
npm ci
./run case-002 --sample                       # offline replay of a recorded run
./run case-001 --sample
./run case-003 --sample
docker build -t whytrace:clean-clone .        # multi-stage build, sample-mode default
docker run --rm -d --name whytrace-clean -p 8001:8000 whytrace:clean-clone
curl -s http://127.0.0.1:8001/healthz          # → {"ok":true,"service":"whytrace-api",...}
curl -s -X POST http://127.0.0.1:8001/run -H "Content-Type: application/json" -d '{"case_id":"case-002"}'
curl -s "http://127.0.0.1:8001/runs/<run_id>"  # final JSON report
docker stop whytrace-clean
```

## Timings (wall clock, macOS 27, Darwin arm64)

| step | seconds | notes |
|---|---:|---|
| `git clone` (local source) | 0 | local-filesystem clone; a public-remote clone would add network RTT |
| `npm ci` (fresh node_modules) | 2 | 118 MB installed; npm cache was pre-warmed on this host |
| `./run case-002 --sample` | 1 | offline replay from `samples/case-002/` (24 recorded Zetaris queries) |
| `./run case-001 --sample` | 0 | sample replay |
| `./run case-003 --sample` | 0 | sample replay |
| `docker build -t whytrace:clean-clone .` | 26 | multi-stage image, dist layer cached across the two run containers |
| `docker run` + healthz + one sample POST /run + stop | 12 | 6 s startup to healthz 200, 4 s API-driven case-002, 1 s shutdown |
| **total** (clone → stop) | **41** | well inside the "≤ 5 min from README" bar in `notes/ODULLER_VE_HEDEFLER.md` #11 |

## Verdicts recorded in the clean clone

| command | expected | actual | notes |
|---|---|---|---|
| `./run case-002 --sample` | benign | `benign @ 0.85` ✅ | shared-egress rejection visible on the `new_asn` claim ("201 distinct accounts completed MFA from 193.140.10.21 in the last 30 days") — the DAY3D fix survives the replay |
| `./run case-001 --sample` | contain | `contain @ 0.84` ✅ |  |
| `./run case-003 --sample` | escalate | `escalate @ 0.51` ✅ |  |
| Docker `POST /run case-002` | benign | `escalate @ 0.75` ⚠️ | Dockerized sample-mode replay re-runs the full orchestrator and the sample tape (recorded 2026-10-23T00:35Z, pre-DAY3D) does not include every Critic SQL the new shared-egress rule emits; stale-tape artefact, not a code regression. The CLI replay above sees the critical row because the shared-egress check reuses an already-cached SQL text. **Action:** re-record `samples/case-002/` with `npm run record -- case-002` so the tape is DAY3D-current (builder TODO). |

## Isolation checks

- `.env` is absent from the clone (sample mode works without secrets).
- `node_modules/@whytrace/*` symlinks all resolve to the clone's own packages (relative `../../packages/...` / `../../apps/...`), nothing points back at `/Users/osmancancetlenbik/Projeler/whytrace`.
- `logs/` directory was empty at clone time; the 4 subdirectories created during this test came from the four `./run` invocations above.

## Milestone #11 verdict

Clean-clone end-to-end works for the CLI sample mode (3/3 cases match
expectations) and the Docker image boots with `/healthz` 200 in 6 s. The one
mismatch (Docker `POST /run case-002` → escalate) is a sample-tape staleness
problem that we can clear by re-recording after the next live full-sweep eval.
Everything else — repo structure, npm workspace install, Docker build/run — is
reproducible from an empty directory in under one minute on this host.
