-- 0042 — docs/80 Phase 1: credit reservations (ledger v2).
-- Same statements as packages/db/migrations/0018, kept in parity for hosted
-- deployments, plus the member-select RLS policy that lineage carries.
--
-- A reservation is state, not money movement: no ledger row is written when it
-- is taken. It holds an estimate of a unit of work out of `available` until it
-- is settled (a `usage` row lands), released, or expired by the stale sweep.

ALTER TABLE public.credit_balances
  ADD COLUMN IF NOT EXISTS reserved_credits integer NOT NULL DEFAULT 0;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS estimated_credits integer;

CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  task_id uuid,
  job_id uuid,
  agent_id uuid,
  estimate_credits integer NOT NULL,
  settled_credits integer,
  status text DEFAULT 'active' NOT NULL,
  reason text,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_reservations_status_check'
  ) THEN
    ALTER TABLE public.credit_reservations
      ADD CONSTRAINT credit_reservations_status_check
      CHECK (status IN ('active', 'settled', 'released', 'expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_reservations_estimate_check'
  ) THEN
    ALTER TABLE public.credit_reservations
      ADD CONSTRAINT credit_reservations_estimate_check
      CHECK (estimate_credits >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS credit_reservations_org_status_idx
  ON public.credit_reservations (org_id, status);
CREATE INDEX IF NOT EXISTS credit_reservations_task_idx
  ON public.credit_reservations (task_id);
CREATE INDEX IF NOT EXISTS credit_reservations_expires_idx
  ON public.credit_reservations (expires_at)
  WHERE status = 'active';

ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_reservations FORCE ROW LEVEL SECURITY;

-- Members may read their org's reservations (the usage/estimate surfaces show
-- them); nobody may write them through a client role — there is deliberately no
-- INSERT/UPDATE policy, matching docs/80 §5.1. The service role writes them.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_reservations_member_select') THEN
    CREATE POLICY credit_reservations_member_select
      ON public.credit_reservations FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.org_id = credit_reservations.org_id AND m.user_id = auth.uid()
      ));
  END IF;
END $$;
