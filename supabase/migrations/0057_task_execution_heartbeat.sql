-- 0057 — tasks.execution_heartbeat_at: liveness for in-flight runs.
--
-- The orphan reaper (orphaned-executions.ts) judges death by 35 minutes of
-- silence on `updated_at`. That column only moves on WRITES, so a long honest
-- run — a big tool chain, a slow model, two LLM attempts with backoff — looks
-- exactly like a dead one: no write for 35 minutes, reaped mid-flight, marked
-- `failed`, while the real run is still going and will later fence-discard
-- (or worse, its terminal write lands first and the reap stomps a success).
--
-- The fix is a heartbeat, not a longer bound: executeTask stamps
-- `execution_heartbeat_at` with the claim and refreshes it while it owns the
-- row (reservation, pre-LLM, post-LLM, each tool round, plus a 60s timer
-- across the blocking LLM await). The reaper judges
-- `coalesce(execution_heartbeat_at, updated_at)` — a run that is still beating
-- is alive no matter how long it has been quiet on the write path; a row whose
-- heart stopped 35 minutes ago is dead even if something touched `updated_at`
-- since (the trigger forces `updated_at = now()` on ANY update).
--
-- Nullable, no default: NULL means "never claimed since this column existed"
-- (legacy rows, pending rows). All revocation paths (converge, reap, retry,
-- rejection-cancel, gate-expiry pause) clear it alongside execution_lock, and
-- the terminal write clears it with the status — a finished row has no pulse.
--
-- Idempotent: `if not exists`, matching the lineage's re-runnable contract.

alter table public.tasks add column if not exists execution_heartbeat_at timestamptz;

comment on column public.tasks.execution_heartbeat_at is
  'Liveness of the run holding execution_lock. Refreshed while the owner runs; the orphan reaper judges coalesce(execution_heartbeat_at, updated_at). NULL when no run is in flight.';

-- Backfill so pre-0057 rows keep the reaper semantics they had: last write.
update public.tasks
set execution_heartbeat_at = updated_at
where execution_heartbeat_at is null;
