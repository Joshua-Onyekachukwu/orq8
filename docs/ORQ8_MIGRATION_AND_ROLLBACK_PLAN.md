# ORQ8 Migration & Rollback Plan — 2026-10-12

## Pending production migrations (status)

| File | Change | Prod state | Path |
|---|---|---|---|
| 0053–0055 | nullable fix, deals/tickets, RLS reclose | applied (verified live) | — |
| 0056 `execution_lock uuid` | additive, idempotent | **applied by hand today**, verified type `uuid` | ledger catches up when runner fixed |
| 0057 `execution_heartbeat_at timestamptz` | additive, idempotent | **applied by hand today**, verified type | same |

## Procedure used (repeatable while DB Migrate is broken)

1. Read-only probe first (`supabase-sql.mjs "select ... from information_schema..."`).
2. Apply with `node scripts/supabase-sql.mjs --file <migration> --write` (refuses non-SELECT without `--write`).
3. Re-probe to confirm the object + type. Never `--write` a non-idempotent file.

## Rollback

- 0056/0057 are nullable additive columns with no backfill and no code dependency for reads (writers tolerate absence; fence checks `execution_lock` equality which matches nothing when NULL — safe degraded mode). Rollback = `alter table tasks drop column` if ever needed; no data loss possible (columns carry only run-ephemeral tokens).
- Code rollback: `git revert` the fence commit; workers/API are stateless across deploys.
- Do NOT reset the database, drop tables, or rotate secrets as part of any migration.

## Remaining infra fixes (need founder/infra access, not code)

- Actions runner → Supabase pooler ECONNRESET (secret or network; failing since 09-27).
- `railway.json` (new, mirrors Dockerfile CMD) — confirm Railway service config unchanged in console.
