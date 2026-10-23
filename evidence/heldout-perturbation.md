# WhyTrace perturbation robustness — 2026-10-23T22:46:40.423Z

N=3 deterministic label-preserving variants per dev case (7 cases → 21 runs, A0 only). See `scripts/perturb.ts` for the transforms.

Headline: 18/21 variants verdict the same as the label (86%). Flips: 3.

## Per-case stability

| case | expected | variants | stable | flipped |
|---|---|---|---|---|
| case-001 | contain | 3 | 3 | 0 |
| case-002 | benign | 3 | 3 | 0 |
| case-003 | escalate | 3 | 3 | 0 |
| case-004 | contain | 3 | 0 | 3 |
| case-005 | benign | 3 | 3 | 0 |
| case-006 | monitor | 3 | 3 | 0 |
| case-007 | contain | 3 | 3 | 0 |

## All runs

| case | variant | upn | expected | verdict | ok | conf | rounds | SQL | model | s | decided_by | run_id | trace |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| case-001 | p1 | pert1.d.yilmaz@aegean.edu | contain | contain | ✅ | 0.94 | 3 | 25 | 5 | 130.3 | model+policy | mvljbjiv_5ccd800059 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljbjiv_5ccd800059/trace.jsonl` |
| case-001 | p2 | pert2.d.yilmaz@aegean.edu | contain | contain | ✅ | 0.94 | 1 | 20 | 3 | 106.7 | model+policy | mvljec1s_18f485c8f5 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljec1s_18f485c8f5/trace.jsonl` |
| case-001 | p3 | pert3.d.yilmaz@aegean.edu | contain | contain | ✅ | 0.94 | 1 | 20 | 3 | 65.6 | model+policy | mvljgmf0_450cf1549b | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljgmf0_450cf1549b/trace.jsonl` |
| case-002 | p1 | pert1.prof.kaya@aegean.edu | benign | benign | ✅ | 0.85 | 2 | 25 | 4 | 86.6 | model+policy | mvlji0zw_9d3855d0ee | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlji0zw_9d3855d0ee/trace.jsonl` |
| case-002 | p2 | pert2.prof.kaya@aegean.edu | benign | benign | ✅ | 0.85 | 2 | 19 | 4 | 134.2 | model+policy | mvljjvt1_839e2df523 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljjvt1_839e2df523/trace.jsonl` |
| case-002 | p3 | pert3.prof.kaya@aegean.edu | benign | benign | ✅ | 0.85 | 2 | 22 | 4 | 83.5 | model+policy | mvljmre4_1768f01e19 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljmre4_1768f01e19/trace.jsonl` |
| case-003 | p1 | pert1.s.demir@aegean.edu | escalate | escalate | ✅ | 0.51 | 2 | 21 | 4 | 91.4 | model+policy | mvljojul_e728759cb0 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljojul_e728759cb0/trace.jsonl` |
| case-003 | p2 | pert2.s.demir@aegean.edu | escalate | escalate | ✅ | 0.51 | 2 | 23 | 4 | 94.5 | model+policy | mvljqici_c9dd66202b | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljqici_c9dd66202b/trace.jsonl` |
| case-003 | p3 | pert3.s.demir@aegean.edu | escalate | escalate | ✅ | 0.51 | 2 | 22 | 4 | 70.7 | model+policy | mvljsja5_f357a09272 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljsja5_f357a09272/trace.jsonl` |
| case-004 | p1 | pert1.m.aslan@aegean.edu | contain | escalate | ❌ | 0.65 | 1 | 12 | 3 | 84.3 | model+policy | mvlju1sr_8ce56e365c | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlju1sr_8ce56e365c/trace.jsonl` |
| case-004 | p2 | pert2.m.aslan@aegean.edu | contain | escalate | ❌ | 0.65 | 1 | 13 | 3 | 48.1 | model+policy | mvljvuud_9add535c5f | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljvuud_9add535c5f/trace.jsonl` |
| case-004 | p3 | pert3.m.aslan@aegean.edu | contain | escalate | ❌ | 0.65 | 1 | 12 | 3 | 59.5 | model+policy | mvljwvx9_3e8ee20c70 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljwvx9_3e8ee20c70/trace.jsonl` |
| case-005 | p1 | pert1.e.oz@aegean.edu | benign | benign | ✅ | 0.85 | 1 | 14 | 3 | 50.3 | model+policy | mvljy5v3_8cf2a29c87 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljy5v3_8cf2a29c87/trace.jsonl` |
| case-005 | p2 | pert2.e.oz@aegean.edu | benign | benign | ✅ | 0.85 | 1 | 14 | 3 | 55.5 | model+policy | mvljz8o7_84f496bb2a | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljz8o7_84f496bb2a/trace.jsonl` |
| case-005 | p3 | pert3.e.oz@aegean.edu | benign | benign | ✅ | 0.85 | 1 | 14 | 3 | 48.0 | model+policy | mvlk0fhk_594055b275 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk0fhk_594055b275/trace.jsonl` |
| case-006 | p1 | pert1.b.cetin@aegean.edu | monitor | monitor | ✅ | 0.7 | 1 | 17 | 3 | 33.7 | model+policy | mvlk1gii_9eff7fcf5d | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk1gii_9eff7fcf5d/trace.jsonl` |
| case-006 | p2 | pert2.b.cetin@aegean.edu | monitor | monitor | ✅ | 0.7 | 1 | 16 | 3 | 50.3 | model+policy | mvlk26j4_1e9ce1d6f6 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk26j4_1e9ce1d6f6/trace.jsonl` |
| case-006 | p3 | pert3.b.cetin@aegean.edu | monitor | monitor | ✅ | 0.7 | 1 | 18 | 3 | 89.0 | model+policy | mvlk39d5_5bcf451de9 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk39d5_5bcf451de9/trace.jsonl` |
| case-007 | p1 | pert1.a.sahin@aegean.edu | contain | contain | ✅ | 0.87 | 1 | 15 | 3 | 47.5 | model+policy | mvlk562q_3ba39001e5 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk562q_3ba39001e5/trace.jsonl` |
| case-007 | p2 | pert2.a.sahin@aegean.edu | contain | contain | ✅ | 0.87 | 1 | 15 | 3 | 30.9 | model+policy | mvlk66qo_0a8cf3394a | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk66qo_0a8cf3394a/trace.jsonl` |
| case-007 | p3 | pert3.a.sahin@aegean.edu | contain | contain | ✅ | 0.76 | 1 | 10 | 3 | 36.3 | model+policy | mvlk6ulj_a0e41c84b0 | `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlk6ulj_a0e41c84b0/trace.jsonl` |

## Flips

- `case-004-p1` (pert1.m.aslan@aegean.edu): expected **contain**, got **escalate**. Trace: `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvlju1sr_8ce56e365c/trace.jsonl`.
- `case-004-p2` (pert2.m.aslan@aegean.edu): expected **contain**, got **escalate**. Trace: `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljvuud_9add535c5f/trace.jsonl`.
- `case-004-p3` (pert3.m.aslan@aegean.edu): expected **contain**, got **escalate**. Trace: `/Users/osmancancetlenbik/Projeler/whytrace/logs/mvljwvx9_3e8ee20c70/trace.jsonl`.
