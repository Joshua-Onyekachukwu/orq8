-- 0041 — docs/80 Phase 0: credit ledger + queue guardrails.
-- Same statements as packages/db/migrations/0017, kept in parity for hosted
-- deployments and applied idempotently either way.
--
--   1. Constrain the credit ledger vocabulary before new types are written
--      (docs/80 §3.1). Existing rows only use the first four values.
--   2. agent_jobs (0038) had no RLS; it joins the service-role-only tables
--      (like job_runs in 0033): RLS enabled + forced, no client policies.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_type_check'
  ) THEN
    ALTER TABLE public.credit_transactions
      ADD CONSTRAINT credit_transactions_type_check
      CHECK (type IN (
        'usage', 'purchase', 'grant', 'promotional', 'refund',
        'reversal', 'adjustment', 'expiration', 'rollover',
        'reservation_release'
      ));
  END IF;
END $$;

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_jobs FORCE ROW LEVEL SECURITY;
