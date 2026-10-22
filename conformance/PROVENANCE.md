# Conformance runners — provenance

Files in this directory (`world-model/runner.ts`, `hmem/runner.ts`,
`hmem/vectors/vectors.json`, `markovian/runner.ts`, `LICENSE`) are
**vendored unchanged** from Meterless/Meterless at commit
`1742dec56a66e58eef9dda2d2b865823758ca8cd` (2026-10-19), licensed
Apache-2.0. The licence text is in `conformance/LICENSE`.

Upstream: https://github.com/Meterless/Meterless

Our in-house engines live under `packages/engines/{world-model,hmem,markovian}`
and are clean-room TypeScript implementations written from the upstream
`AGENTS.md` specifications in each engine folder. The runners import them
by file URL via the environment variables `WORLD_MODEL_IMPL`, `HMEM_IMPL`
and `MARKOVIAN_IMPL`, which `scripts/run_conformance.mjs` sets.
