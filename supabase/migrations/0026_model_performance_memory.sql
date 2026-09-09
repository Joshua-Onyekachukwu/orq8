-- 0026: Model performance memory (§7, §32).
--
-- The llm-tracer records every call, but persists only human-readable summary
-- strings into activity_events — not queryable per model. This table gives
-- the routing layer real, structured history so recommendations are grounded
-- in measured data instead of fabricated performance numbers.
--
-- One row per completed LLM call (per org). Success rate, average latency and
-- average tokens per model are derived by aggregation — no invented metrics.

CREATE TABLE IF NOT EXISTS public.llm_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phase text NOT NULL,                -- intent_analysis | task_execution | context_build | memory_retrieval | fallback
  model text NOT NULL,
  provider text NOT NULL,
  agent_id uuid,
  task_id uuid,
  success boolean NOT NULL,
  error text,
  duration_ms integer,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  retry_attempt integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_performance_org_model_idx
  ON public.llm_performance (org_id, model, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_performance_org_created_idx
  ON public.llm_performance (org_id, created_at DESC);

-- Retention: prune rows older than 90 days (bounded storage; aggregates stay
-- meaningful over a rolling window). Idempotent — safe for the multi-pass
-- migration runner.
DELETE FROM public.llm_performance WHERE created_at < now() - interval '90 days';

ALTER TABLE public.llm_performance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'uid' AND n.nspname = 'auth') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'llm_performance' AND policyname = 'llm_performance_org_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY llm_performance_org_select ON public.llm_performance
        FOR SELECT USING (
          EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = llm_performance.org_id AND m.user_id = auth.uid())
        );
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'llm_performance' AND policyname = 'llm_performance_org_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY llm_performance_org_insert ON public.llm_performance
        FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = llm_performance.org_id AND m.user_id = auth.uid())
        );
    $policy$;
  END IF;
END $$;
