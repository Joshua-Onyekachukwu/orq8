-- ORQ8 — Production migration: webhook events, event rules, connector outcomes,
-- executive briefings, and pgvector embeddings on company_memory.
-- Run in Supabase SQL Editor BEFORE deploying new API code.
-- Safe to run multiple times (IF NOT EXISTS on everything).

-- ============================================================
-- 0. pgvector extension (built into Supabase; self-hosted image ships it)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 1. webhook_events — durable event ingestion (outbox pattern)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  title text,
  external_event_id text,
  payload jsonb NOT NULL DEFAULT '{}',
  headers jsonb NOT NULL DEFAULT '{}',
  correlation_id text,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS webhook_events_org_status_idx ON public.webhook_events(org_id, status);
CREATE INDEX IF NOT EXISTS webhook_events_provider_idx ON public.webhook_events(provider, received_at);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_org_provider_ext_idx
  ON public.webhook_events(org_id, provider, external_event_id)
  WHERE external_event_id IS NOT NULL;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'webhook_events_org_member') THEN
    CREATE POLICY webhook_events_org_member ON public.webhook_events
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = webhook_events.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = webhook_events.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 2. event_rules — company-scoped declarative rules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.event_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  event_type text NOT NULL,
  action text NOT NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  task_title_template text,
  requires_approval boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_rules_org_idx ON public.event_rules(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS event_rules_org_provider_type_idx
  ON public.event_rules(org_id, provider, event_type);

ALTER TABLE public.event_rules ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'event_rules_org_member') THEN
    CREATE POLICY event_rules_org_member ON public.event_rules
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = event_rules.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = event_rules.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'event_rules_set_updated_at') THEN
    CREATE TRIGGER event_rules_set_updated_at
      BEFORE UPDATE ON public.event_rules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================
-- 3. connector_outcomes — structured connector action results
-- ============================================================
CREATE TABLE IF NOT EXISTS public.connector_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  provider_id uuid REFERENCES public.integration_providers(id) ON DELETE SET NULL,
  provider text NOT NULL,
  capability text NOT NULL,
  action text NOT NULL,
  provider_resource_id text,
  provider_url text,
  status text NOT NULL,
  summary text,
  result jsonb,
  error text,
  requires_approval boolean NOT NULL DEFAULT false,
  approval_id uuid REFERENCES public.approvals(id) ON DELETE SET NULL,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connector_outcomes_org_idx ON public.connector_outcomes(org_id, created_at);
CREATE INDEX IF NOT EXISTS connector_outcomes_agent_idx ON public.connector_outcomes(agent_id);
CREATE INDEX IF NOT EXISTS connector_outcomes_task_idx ON public.connector_outcomes(task_id);

ALTER TABLE public.connector_outcomes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'connector_outcomes_org_member') THEN
    CREATE POLICY connector_outcomes_org_member ON public.connector_outcomes
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = connector_outcomes.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = connector_outcomes.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 4. briefings — idempotent daily/weekly executive briefings
-- ============================================================
CREATE TABLE IF NOT EXISTS public.briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  content jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'generated',
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefings_org_created_idx ON public.briefings(org_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS briefings_org_kind_period_idx
  ON public.briefings(org_id, kind, period_start);

ALTER TABLE public.briefings ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'briefings_org_member') THEN
    CREATE POLICY briefings_org_member ON public.briefings
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = briefings.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = briefings.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

-- ============================================================
-- 5. company_memory.embedding — pgvector semantic column (ADR-012, 768-dim default)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_memory' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE public.company_memory ADD COLUMN embedding vector(768);
    CREATE INDEX company_memory_embedding_idx ON public.company_memory
      USING hnsw (embedding vector_cosine_ops);
  END IF;
END $$;