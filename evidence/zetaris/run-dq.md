# RUN DQ TABLE output — all six USL entities

_Captured 24 Oct 2026 against the local Zetaris install (`zetaris-driver-1` at `http://localhost:8888/api/v1.0`). Regenerate with:_

```bash
npx tsx evidence/zetaris/run-dq.ts
```

Each row is a Zetaris DQ-rule result straight from the REST response. `type` is the rule class ("Primary Key Constraint" / "Foreign Key Constraint"); `name` is the column; `total_record` / `valid_record` / `invalid_record` are the row counts Zetaris itself reports.

| table | rule name | rule type | total | valid | invalid |
|---|---|---|---:|---:|---:|
| identity        | upn        | Primary Key Constraint | 465  | 465  | 0 |
| signin_event    | event_id   | Primary Key Constraint | 6053 | 6053 | 0 |
| signin_event    | upn        | Foreign Key Constraint | 6053 | 5902 | **151** |
| mail_event      | event_id   | Primary Key Constraint | 142  | 142  | 0 |
| mail_event      | upn        | Foreign Key Constraint | 142  | 142  | 0 |
| device          | device_id  | Primary Key Constraint | 53   | 53   | 0 |
| vulnerability   | cve_id     | Primary Key Constraint | 1754 | 1754 | 0 |
| vpn_session     | session_id | Primary Key Constraint | 35   | 35   | 0 |
| vpn_session     | upn        | Foreign Key Constraint | 35   | 35   | 0 |

**One rule fails on purpose.** `signin_event.upn FK → identity.upn` returns 151 invalid rows. This is the alias-UPN noise seeded in `scripts/zetaris_bootstrap.ts` (`14 sign-ins for an alias UPN "dyilmaz@aegean.edu" not in identity`, plus the hb-* alias rows that the eval tables also surface). A finding that rests on rows from `signin_event` for an UPN with failing FK DQ gets a `limitation[]` line and a −0.1 confidence penalty via `packages/agents/src/dq.ts`. The invariant: a DQ failure never silently sinks a verdict — it is attached to the Report and the Risk Gate.

## Custom DQ checks (application-side, not shown above)

Five custom checks live in `packages/agents/src/dq.ts` and run alongside `RUN DQ TABLE`:

| name | table | predicate |
|---|---|---|
| `valid_upn`         | identity        | `upn LIKE '%@aegean.edu'` + regex sanity |
| `ts_not_null`       | signin_event    | `ts IS NOT NULL` |
| `known_result`      | signin_event    | `result IN ('success','failure','mfa_denied','mfa_approved')` |
| `vpn_session_order` | vpn_session     | `ts_end >= ts_start` (fails on 12 rows in the dev seed by design — see case-003) |
| `asset_seen_recent` | device          | `last_seen > CURRENT_DATE - INTERVAL '365 day'` |

Each application-side check is executed through the same Zetaris adapter at investigation time; the result lands on the Report's `dq[]` field with `{table, rule, valid, invalid, scope, sql_id}`.
