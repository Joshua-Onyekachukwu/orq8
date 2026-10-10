-- 0053 — agent_jobs.locked_at is nullable again: 0048 tightened the wrong column.
--
-- 0048 set `locked_at` NOT NULL with a now() default, explaining that "the
-- drizzle lineage (packages/db/src/schema.ts agent_jobs) declares them NOT NULL
-- with defaults". That premise is true for run_at and false for locked_at:
--
--   packages/db/src/schema.ts:649   lockedAt: timestamp('locked_at', { withTimezone: true })
--   0038_agent_jobs.sql:15          locked_at timestamp with time zone,
--
-- Neither lineage declares it NOT NULL, and neither gives it a default. What
-- both the schema and apps/api/src/services/jobs.ts describe is the opposite of
-- a required column: NULL is the *normal* value, "not currently locked". jobs.ts
-- writes `locked_at = null` on every terminal transition:
--
--   skipJob         status = 'done',                 locked_at = null
--   completeJob     status = 'done',                 locked_at = null
--   deadLetterJob   status = 'dead',                 locked_at = null
--   failJob         status = 'dead' | 'pending',     locked_at = null
--   reapStaleJobs   status = 'pending' (requeue),    locked_at = null
--   retryJob        drizzle .set({ lockedAt: null })
--
-- and JOB_COLUMNS states the contract in one line: "locked_at is the start while
-- the job runs and is cleared on completion".
--
-- Under the NOT NULL, every one of those statements raises
-- `null value in column "locked_at" violates not-null constraint`. The queue can
-- therefore make no progress at all: claimJob sets status='running' and
-- locked_at=now(), and the only writes that could move that row out of 'running'
-- are the six above — including the reaper that exists to rescue exactly this
-- case. The first job claimed after 0048 wedges the queue permanently.
--
-- Production has not been hit only because agent_jobs is empty there: the queue
-- has done no real work since the column was tightened.
--
-- The integration suites have been reporting this since 0048.
-- test/agent-jobs.integration.test.ts, approval-gated-work and task-tools fail
-- with "expected 'done'/'dead', received 'running'" — 9 tests across 3 files —
-- and were read as stale tests. They are the assertion that is right: the same
-- writes fail identically with and without 0052 applied, so this is not drift
-- introduced by the backports.
--
-- Why the parity tool could not see it: scripts/lineage-parity.ts diffs
-- production against a database built from these same migrations. A migration
-- that contradicts the *other* lineage — packages/db, which the API and its
-- tests actually import — is identical on both sides, so it is invisible.
-- 0048 was a change to the supabase lineage, justified from the drizzle one, and
-- nothing checked the claim.
--
-- Both halves of the locked_at change are reverted here, restoring exact parity
-- with packages/db and 0038:
--   * drop the NOT NULL — the six writes above become legal again.
--   * drop the default  — an unclaimed row must read NULL, not now(). With the
--     default, jobsHealth.startedAt (JOB_COLUMNS.startedAt = locked_at) reported
--     a start time for jobs that had never been claimed.
-- run_at keeps the NOT NULL and default 0048 gave it: both lineages declare that
-- one not-null with a default (schema.ts:648, `.notNull().defaultNow()`).
--
-- Guarded both ways, so it is a no-op once applied, a no-op on a database that
-- never got 0048, and never rewrites a row.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'agent_jobs'
       and column_name = 'locked_at'
       and is_nullable = 'NO'
  ) then
    alter table public.agent_jobs alter column locked_at drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'agent_jobs'
       and column_name = 'locked_at'
       and column_default is not null
  ) then
    alter table public.agent_jobs alter column locked_at drop default;
  end if;
end $$;
