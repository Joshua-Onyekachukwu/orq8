-- docs/80 Phase 0 — credit ledger + queue guardrails.
--
-- Two guards, both idempotent:
--
--   1. The ledger vocabulary is constrained BEFORE new types are written, so a
--      typo cannot quietly create a sixth kind of money movement. The list
--      matches docs/80 §3.1 (usage | purchase | grant | promotional | refund |
--      reversal | adjustment | expiration | rollover | reservation_release).
--      Only the first four values are written today, so existing data passes.
--
--   2. agent_jobs had no RLS at all (0014 created the table only). It joins the
--      service-role-only tables (like job_runs in 0033): RLS enabled + forced,
--      no client policies — jobs are written and claimed by the API/worker only.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_type_check'
  ) THEN
    ALTER TABLE credit_transactions
      ADD CONSTRAINT credit_transactions_type_check
      CHECK (type IN (
        'usage', 'purchase', 'grant', 'promotional', 'refund',
        'reversal', 'adjustment', 'expiration', 'rollover',
        'reservation_release'
      ));
  END IF;
END $$;

ALTER TABLE agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_jobs FORCE ROW LEVEL SECURITY;
