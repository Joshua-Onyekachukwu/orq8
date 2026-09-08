-- 0018: Strategy → Objective → Key Result chain
-- The missing layer above Goals that connects company strategy to execution.
--
-- Strategy: company-level strategic direction (e.g., "Reach $1M ARR in 18 months")
-- Objective: measurable outcomes that advance the strategy (e.g., "Launch enterprise tier")
-- Key Results: quantifiable milestones within an objective (e.g., "Close 5 enterprise deals")
-- Initiatives: multi-task projects that advance key results

-- ── Strategies ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.strategies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',  -- draft | active | completed | archived
  priority    TEXT NOT NULL DEFAULT 'high',     -- low | normal | high | critical
  time_horizon TEXT,                           -- quarterly | annual | 18month | custom
  start_date  TIMESTAMPTZ,
  target_date TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategies_org_id_idx ON public.strategies(org_id);
CREATE INDEX IF NOT EXISTS strategies_org_status_idx ON public.strategies(org_id, status);

-- ── Objectives ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.objectives (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active',  -- draft | active | completed | archived
  priority    TEXT NOT NULL DEFAULT 'high',
  progress    INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  owner_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  start_date  TIMESTAMPTZ,
  target_date TIMESTAMPTZ,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS objectives_org_id_idx ON public.objectives(org_id);
CREATE INDEX IF NOT EXISTS objectives_strategy_id_idx ON public.objectives(strategy_id);
CREATE INDEX IF NOT EXISTS objectives_org_status_idx ON public.objectives(org_id, status);

-- ── Key Results ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.key_results (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'on_track',  -- on_track | at_risk | behind | completed | failed
  metric_type  TEXT NOT NULL DEFAULT 'numeric',    -- numeric | boolean | milestone
  metric_start NUMERIC,
  metric_target NUMERIC,
  metric_current NUMERIC,
  unit         TEXT,                               -- e.g., "$", "deals", "users", "%"
  progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  confidence   INTEGER NOT NULL DEFAULT 80 CHECK (confidence >= 0 AND confidence <= 100),
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS key_results_org_id_idx ON public.key_results(org_id);
CREATE INDEX IF NOT EXISTS key_results_objective_id_idx ON public.key_results(objective_id);

-- ── Initiatives ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.initiatives (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  strategy_id   UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  objective_id  UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  key_result_id UUID REFERENCES public.key_results(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'active',  -- proposed | active | completed | paused | archived
  priority      TEXT NOT NULL DEFAULT 'high',
  progress      INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  owner_agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  estimated_hours NUMERIC,
  actual_hours   NUMERIC,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS initiatives_org_id_idx ON public.initiatives(org_id);
CREATE INDEX IF NOT EXISTS initiatives_objective_id_idx ON public.initiatives(objective_id);
CREATE INDEX IF NOT EXISTS initiatives_key_result_id_idx ON public.initiatives(key_result_id);

-- ── Link tasks to initiatives ───────────────────────────────────────────────

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS initiative_id UUID REFERENCES public.initiatives(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_initiative_id_idx ON public.tasks(initiative_id) WHERE initiative_id IS NOT NULL;

-- ── Updated-at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION strategies_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS strategies_set_updated_at ON public.strategies;
CREATE TRIGGER strategies_set_updated_at
  BEFORE UPDATE ON public.strategies
  FOR EACH ROW EXECUTE FUNCTION strategies_set_updated_at();

CREATE OR REPLACE FUNCTION objectives_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS objectives_set_updated_at ON public.objectives;
CREATE TRIGGER objectives_set_updated_at
  BEFORE UPDATE ON public.objectives
  FOR EACH ROW EXECUTE FUNCTION objectives_set_updated_at();

CREATE OR REPLACE FUNCTION key_results_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS key_results_set_updated_at ON public.key_results;
CREATE TRIGGER key_results_set_updated_at
  BEFORE UPDATE ON public.key_results
  FOR EACH ROW EXECUTE FUNCTION key_results_set_updated_at();

CREATE OR REPLACE FUNCTION initiatives_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS initiatives_set_updated_at ON public.initiatives;
CREATE TRIGGER initiatives_set_updated_at
  BEFORE UPDATE ON public.initiatives
  FOR EACH ROW EXECUTE FUNCTION initiatives_set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation" ON public.strategies USING (org_id = current_setting('app.current_org_id')::UUID);
CREATE POLICY "org_isolation" ON public.objectives USING (org_id = current_setting('app.current_org_id')::UUID);
CREATE POLICY "org_isolation" ON public.key_results USING (org_id = current_setting('app.current_org_id')::UUID);
CREATE POLICY "org_isolation" ON public.initiatives USING (org_id = current_setting('app.current_org_id')::UUID);
