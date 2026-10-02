-- docs/77 P0 — credit accounting integrity (parity with packages/db/migrations/0015).
-- Supabase lineage: same columns and indexes. RLS is unchanged — credit tables
-- carry select-only org policies (see 0033_rls_hardening.sql); all writes go
-- through the API.

ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS provider_cost_usd numeric(14, 8);
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS task_id uuid;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_org_idem_idx
  ON public.credit_transactions (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.credit_balances GROUP BY org_id, period_start HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS credit_balances_org_period_unique
      ON public.credit_balances (org_id, period_start);
  END IF;
END $$;
