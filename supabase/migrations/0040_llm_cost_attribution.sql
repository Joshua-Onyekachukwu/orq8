-- docs/77 P1 §5 — cost recording (parity with packages/db/migrations/0016).
-- Supabase lineage: same columns and indexes. RLS is unchanged — llm_performance
-- is written only by the API (the tracer) and carries no client policy.
--
-- See packages/db/migrations/0016_llm_cost_attribution.sql for why these exist:
-- the console was printing credits as dollars, and nothing recorded what a model
-- call actually cost, so margin was unknowable.

ALTER TABLE public.llm_performance ADD COLUMN IF NOT EXISTS provider_cost_usd numeric(14, 8) NOT NULL DEFAULT 0;
ALTER TABLE public.llm_performance ADD COLUMN IF NOT EXISTS credits_attributed integer NOT NULL DEFAULT 0;
ALTER TABLE public.llm_performance ADD COLUMN IF NOT EXISTS pricing_source text NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS llm_performance_provider_created_idx
  ON public.llm_performance (provider, created_at);

CREATE INDEX IF NOT EXISTS llm_performance_task_idx
  ON public.llm_performance (task_id);
