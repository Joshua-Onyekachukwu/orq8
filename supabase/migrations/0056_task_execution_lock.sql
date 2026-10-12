-- 0056 — tasks.execution_lock: the claim token that fences a task row to the
-- run that owns it.
--
-- The defect this column exists for (docs/87 §5 item 15, found 2026-10-11):
-- an abandoned execution keeps writing to its own task row. The interactive
-- budget (ea-execution-budget.ts) races the pipeline against a wall-clock
-- slice; when the slice expires it returns the row to its honest `pending`
-- via convergeToPending — but NOTHING cancels the in-flight execution. The
-- zombie's `status: 'in_progress'` write (which happened ~six awaits in, after
-- the credit reservation) could land AFTER the convergence, and its terminal
-- write (`completed`/`failed`, with cost) landed unconditionally at the end of
-- executeTask. Two failure modes reached the founder:
--
--   - the row read `in_progress` (or later `completed`/charged) while the UI
--     said "deferred, 0 credits, re-run it" — the appears-to-hang state the
--     budget module exists to prevent;
--   - because the row was honestly `pending`, the founder could legitimately
--     RE-RUN a task the zombie was still executing: two runs, one row, two
--     charges.
--
-- The fix is a claim, not a longer sleep: executeTask mints a fresh uuid and
-- writes it together with the `in_progress` transition BEFORE the first
-- expensive await (the claim). Every later write that belongs to that run —
-- the estimate, the pre-execution blocks, the approval gates, and the terminal
-- status+cost write — is conditional on `execution_lock` still equaling the
-- run's token. The abandon path (convergeToPending), the orphan reaper and
-- retryTask clear the lock, which REVOKES the zombie: its remaining writes
-- match zero rows and it can charge nothing onto a row it no longer owns.
--
-- NULL means "not claimed" — the normal state for pending, completed and
-- cancelled rows, exactly as agent_jobs.locked_at's NULL means "not locked"
-- (0033/0053 established that precedent). Nullable, no default: an UPDATE
-- that forgets to set it leaves the previous claim intact, which fails safe.
--
-- Idempotent: `if not exists`, matching the lineage's re-runnable contract.

alter table public.tasks add column if not exists execution_lock uuid;

comment on column public.tasks.execution_lock is
  'Claim token of the run that owns the in_progress row. Owned writes are conditional on it; NULL revokes any in-flight run (abandon, reap, retry).';
