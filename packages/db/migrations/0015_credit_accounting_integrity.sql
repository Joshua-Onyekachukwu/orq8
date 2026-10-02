-- docs/77 P0 — credit accounting integrity.
--
-- Three bugs this closes:
--   1. Concurrent spends wrote absolute values read before the update, so two
--      parallel charges could land one debit in the balance while writing two
--      ledger rows (lost update). Fixed in code with SQL increments; this
--      migration makes the ledger carried-attribution possible so charges are
--      auditable per provider/model/task/agent.
--   2. Retried settlements (worker retries, webhook replays) could charge twice.
--      `idempotency_key` + a partial unique index makes the second write a
--      no-op instead of a second debit.
--   3. Concurrent balance creation could insert two rows for one org/period.
--      The unique index below makes that impossible (created only when the
--      existing data is already clean, so a dirty dev DB is not bricked).

ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS provider_cost_usd numeric(14, 8);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS agent_id uuid;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS task_id uuid;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS job_id uuid;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- One charge per (org, idempotency_key). Partial: legacy rows have no key.
CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_org_idem_idx
  ON credit_transactions (org_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One balance row per (org, period). Guarded by a DO block so an existing
-- duplicate (created by the old race) does not abort the migration; the
-- reconcile endpoint reports the drift in that case.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM credit_balances GROUP BY org_id, period_start HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS credit_balances_org_period_unique
      ON credit_balances (org_id, period_start);
  END IF;
END $$;
