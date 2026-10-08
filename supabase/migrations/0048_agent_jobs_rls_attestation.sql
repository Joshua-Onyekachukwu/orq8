-- 0048 — agent_jobs: RLS attestation + column parity with the drizzle lineage.
--
-- RLS itself landed in 0041 (docs/80 Phase 0): agent_jobs joined the
-- service-role-only tables — ENABLE + FORCE ROW LEVEL SECURITY, and NO client
-- policies, so only the API/worker (service role) touch the queue. That state
-- is asserted, not recreated, by scripts/rls-security-e2e.ts §3.7.
--
-- What this migration adds is column parity: 0038 created run_at/locked_at as
-- nullable while the drizzle lineage (packages/db/src/schema.ts agent_jobs)
-- declares them NOT NULL with defaults, and jobs.ts relies on `run_at <= now()`
-- and the stale-lock reaper reading `locked_at` — a NULL there would exclude
-- the row from claiming or reaping. Defaults only, so no existing row is
-- rewritten.
ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.agent_jobs
  ALTER COLUMN run_at SET DEFAULT now(),
  ALTER COLUMN locked_at SET DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_jobs' AND column_name = 'run_at' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.agent_jobs ALTER COLUMN run_at SET NOT NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_jobs' AND column_name = 'locked_at' AND is_nullable = 'NO'
  ) THEN
    -- Backfill the rare pre-existing NULL (a never-claimed job enqueued before
    -- 0041's sweep contract) before tightening the column.
    UPDATE public.agent_jobs SET locked_at = now() WHERE locked_at IS NULL;
    ALTER TABLE public.agent_jobs ALTER COLUMN locked_at SET NOT NULL;
  END IF;
END $$;
