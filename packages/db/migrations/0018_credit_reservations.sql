-- docs/80 Phase 1 — credit reservations (ledger v2).
--
-- Reserve → execute → settle/release. A reservation holds an estimate of the
-- credits a piece of work will cost before it runs, so the balance can never be
-- driven negative by concurrent long-running work. It is NOT a ledger row when
-- taken (that would double-count under expiry); the money movement lands once,
-- at settlement, as a `usage` row.
--
-- Additive and idempotent: the same statements ride in
-- supabase/migrations/0042 for the hosted lineage, and either order applies
-- cleanly.

ALTER TABLE credit_balances
  ADD COLUMN IF NOT EXISTS reserved_credits integer NOT NULL DEFAULT 0;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS estimated_credits integer;

CREATE TABLE IF NOT EXISTS credit_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid,
  job_id uuid,
  agent_id uuid,
  estimate_credits integer NOT NULL,
  settled_credits integer,
  -- active | settled | released | expired
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
    ALTER TABLE credit_reservations
      ADD CONSTRAINT credit_reservations_status_check
      CHECK (status IN ('active', 'settled', 'released', 'expired'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_reservations_estimate_check'
  ) THEN
    ALTER TABLE credit_reservations
      ADD CONSTRAINT credit_reservations_estimate_check
      CHECK (estimate_credits >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS credit_reservations_org_status_idx
  ON credit_reservations (org_id, status);
CREATE INDEX IF NOT EXISTS credit_reservations_task_idx
  ON credit_reservations (task_id);
-- The stale sweep scans only live reservations past their deadline.
CREATE INDEX IF NOT EXISTS credit_reservations_expires_idx
  ON credit_reservations (expires_at)
  WHERE status = 'active';

-- Reservations are written and settled by the API/worker only; a client may
-- read its own org's rows (a select policy lives in the supabase lineage,
-- alongside the other member-readable tables), never write them.
ALTER TABLE credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_reservations FORCE ROW LEVEL SECURITY;
