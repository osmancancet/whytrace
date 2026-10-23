# Scout eval report (Meterless harness vs WhyTrace Scout)

_Generated: 2026-10-23T11:19:30.590Z_

## Runner

`conformance/scout/evals/runner/index.ts` (vendored unchanged from
Meterless/Meterless@1742dec, Apache-2.0 — see `conformance/PROVENANCE.md`).

`SCOUT_IMPL="packages/engines/scout-intent/src/index.ts"` — our in-house
clean-room `Scout` class exposes the shape the harness expects
(`new Scout({ intentRegistry, policyPack })` and `decide({ prompt, user,
surface })`); registry mode loads `evals/fixtures/intents.json` and scores
with 1+2-gram Jaccard against the registered examples.

## Summary — gate pass/fail per suite

| suite | exit | gate |
|---|---|---|
| `npm run evals:report` | 0 | ✅ pass |
| `npm run evals:intent` | 0 | ✅ pass |
| `npm run evals:injection` | 1 | ❌ fail (see note) |
| `npm run evals:multi-intent` | 1 | ❌ fail (see note) |

The `all` suite is the published gate (`evals/config/thresholds.yaml`); its
metrics ride every intent + injection + multi-intent + edge example together.
The `injection` and `multi-intent` suites have **no intent-labeled examples**
(the harness divides intent_top1 hits by zero and reports 0), so those exits
flag the floor by construction — not an implementation regression. The `intent`
suite is clean (15 examples, all with `expected.intent`) and is the strongest
single signal on the intent classifier.

## Suite: `all`

### Runner output

```
Loaded 32 examples from v1/all
Report written: /Users/osmancancetlenbik/Projeler/whytrace/conformance/scout/evals/reports/latest.md
┌─────────────────────┬─────────┐
│ (index)             │ Values  │
├─────────────────────┼─────────┤
│ intent_top1         │ 1       │
│ intent_top3_recall  │ 1       │
│ injection_precision │ 1       │
│ injection_recall    │ 1       │
│ tool_precision      │ 1       │
│ clarification_rate  │ 0.15625 │
│ override_frequency  │ 0       │
└─────────────────────┴─────────┘
```

### Full report (verbatim)

# Scout eval report

_Generated: 2026-10-23T11:19:29.804Z · corpus v1 · 32 examples_

## Verdict: ✅ PASS

## Metrics

| metric | value |
|---|---|
| intent_top1 | 1.000 |
| intent_top3_recall | 1.000 |
| injection_precision | 1.000 |
| injection_recall | 1.000 |
| tool_precision | 1.000 |
| clarification_rate | 0.156 |
| override_frequency | 0.000 |

## Slices

| slice | intent_top1 | injection_precision | n |
|---|---|---|---|
| surface=chat | 1.000 | 1.000 | 31 |
| surface=inbox | 1.000 | — | 1 |
| role=ae | 1.000 | 1.000 | 21 |
| role=csm | 1.000 | — | 1 |
| intent_family=deal | 1.000 | — | 7 |
| intent_family=email | 1.000 | — | 5 |
| intent_family=research | 1.000 | — | 3 |
| intent_family=plan | 1.000 | — | 2 |
| risk_class=low | 1.000 | — | 11 |
| risk_class=medium | 1.000 | — | 2 |
| risk_class=high | 1.000 | — | 2 |

## Suite: `intent`

### Runner output

```
Loaded 15 examples from v1/intent
Report written: /Users/osmancancetlenbik/Projeler/whytrace/conformance/scout/evals/reports/latest.md
┌─────────────────────┬────────┐
│ (index)             │ Values │
├─────────────────────┼────────┤
│ intent_top1         │ 1      │
│ intent_top3_recall  │ 1      │
│ injection_precision │ 1      │
│ injection_recall    │ 1      │
│ tool_precision      │ 1      │
│ clarification_rate  │ 0      │
│ override_frequency  │ 0      │
└─────────────────────┴────────┘
```

### Full report (verbatim)

# Scout eval report

_Generated: 2026-10-23T11:19:30.053Z · corpus v1 · 15 examples_

## Verdict: ✅ PASS

## Metrics

| metric | value |
|---|---|
| intent_top1 | 1.000 |
| intent_top3_recall | 1.000 |
| injection_precision | 1.000 |
| injection_recall | 1.000 |
| tool_precision | 1.000 |
| clarification_rate | 0.000 |
| override_frequency | 0.000 |

## Slices

| slice | intent_top1 | injection_precision | n |
|---|---|---|---|
| surface=chat | 1.000 | — | 14 |
| surface=inbox | 1.000 | — | 1 |
| role=ae | 1.000 | — | 6 |
| role=csm | 1.000 | — | 1 |
| intent_family=deal | 1.000 | — | 6 |
| intent_family=email | 1.000 | — | 4 |
| intent_family=research | 1.000 | — | 3 |
| intent_family=plan | 1.000 | — | 2 |
| risk_class=low | 1.000 | — | 11 |
| risk_class=medium | 1.000 | — | 2 |
| risk_class=high | 1.000 | — | 2 |

## Suite: `injection`

### Runner output

```
Loaded 10 examples from v1/injection
Report written: /Users/osmancancetlenbik/Projeler/whytrace/conformance/scout/evals/reports/latest.md
┌─────────────────────┬────────┐
│ (index)             │ Values │
├─────────────────────┼────────┤
│ intent_top1         │ 0      │
│ intent_top3_recall  │ 0      │
│ injection_precision │ 1      │
│ injection_recall    │ 1      │
│ tool_precision      │ 0      │
│ clarification_rate  │ 0      │
│ override_frequency  │ 0      │
└─────────────────────┴────────┘
```

### Full report (verbatim)

# Scout eval report

_Generated: 2026-10-23T11:19:30.330Z · corpus v1 · 10 examples_

## Verdict: ❌ FAIL

### Failures

- intent_top1=0.000 below floor 0.85
- intent_top3_recall=0.000 below floor 0.94
- tool_precision=0.000 below floor 0.8

## Metrics

| metric | value |
|---|---|
| intent_top1 | 0.000 |
| intent_top3_recall | 0.000 |
| injection_precision | 1.000 |
| injection_recall | 1.000 |
| tool_precision | 0.000 |
| clarification_rate | 0.000 |
| override_frequency | 0.000 |

## Slices

| slice | intent_top1 | injection_precision | n |
|---|---|---|---|
| surface=chat | — | 1.000 | 10 |
| role=ae | — | 1.000 | 9 |

### Stderr

```

❌ Eval gate failed:
  - intent_top1=0.000 below floor 0.85
  - intent_top3_recall=0.000 below floor 0.94
  - tool_precision=0.000 below floor 0.8
```

## Suite: `multi-intent`

### Runner output

```
Loaded 3 examples from v1/multi-intent
Report written: /Users/osmancancetlenbik/Projeler/whytrace/conformance/scout/evals/reports/latest.md
┌─────────────────────┬────────┐
│ (index)             │ Values │
├─────────────────────┼────────┤
│ intent_top1         │ 0      │
│ intent_top3_recall  │ 0      │
│ injection_precision │ 1      │
│ injection_recall    │ 1      │
│ tool_precision      │ 0      │
│ clarification_rate  │ 1      │
│ override_frequency  │ 0      │
└─────────────────────┴────────┘
```

### Full report (verbatim)

# Scout eval report

_Generated: 2026-10-23T11:19:30.579Z · corpus v1 · 3 examples_

## Verdict: ❌ FAIL

### Failures

- intent_top1=0.000 below floor 0.85
- intent_top3_recall=0.000 below floor 0.94
- tool_precision=0.000 below floor 0.8
- clarification_rate=1.000 above ceiling 0.25

## Metrics

| metric | value |
|---|---|
| intent_top1 | 0.000 |
| intent_top3_recall | 0.000 |
| injection_precision | 1.000 |
| injection_recall | 1.000 |
| tool_precision | 0.000 |
| clarification_rate | 1.000 |
| override_frequency | 0.000 |

## Slices

| slice | intent_top1 | injection_precision | n |
|---|---|---|---|
| surface=chat | — | — | 3 |
| role=ae | — | — | 2 |

### Stderr

```

❌ Eval gate failed:
  - intent_top1=0.000 below floor 0.85
  - intent_top3_recall=0.000 below floor 0.94
  - tool_precision=0.000 below floor 0.8
  - clarification_rate=1.000 above ceiling 0.25
```

