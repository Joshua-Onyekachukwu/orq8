-- 0019: Decision Memory — learn from every organizational decision
--
-- Unlike company_decisions (knowledge graph), this table captures the full
-- decision lifecycle: what was decided, why, what alternatives existed,
-- what was expected, what actually happened, and whether it was validated.

CREATE TABLE IF NOT EXISTS public.decisions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  decision_type         TEXT NOT NULL DEFAULT 'operational',  -- strategic | operational | hiring | resource_allocation | technical | partnership | product | marketing | financial
  status                TEXT NOT NULL DEFAULT 'active',       -- pending | active | validated | reversed | archived
  confidence            TEXT NOT NULL DEFAULT 'medium',       -- high | medium | low

  -- Who decided
  decision_maker_type   TEXT NOT NULL DEFAULT 'user',         -- user | agent
  decision_maker_id     UUID,                                 -- user id or agent id
  decision_maker_name   TEXT,                                 -- denormalized for display

  -- What was decided
  what_was_decided      TEXT NOT NULL,                        -- the actual decision
  rationale             TEXT,                                  -- why this decision was made
  alternatives          JSONB NOT NULL DEFAULT '[]',          -- [{name, reason_rejected}]
  evidence              JSONB NOT NULL DEFAULT '[]',          -- [{source, type, summary}]
  assumptions           JSONB NOT NULL DEFAULT '[]',          -- [string assumptions made]

  -- Expected vs actual
  expected_outcome      TEXT,
  actual_outcome        TEXT,                                  -- filled in after execution
  outcome_filed_at      TIMESTAMPTZ,

  -- Learning
  reversal_conditions   JSONB NOT NULL DEFAULT '[]',          -- [string conditions that would undo this]
  lessons_learned       TEXT,                                  -- post-mortem insight

  -- Links to other entities
  strategy_id           UUID REFERENCES public.strategies(id) ON DELETE SET NULL,
  objective_id          UUID REFERENCES public.objectives(id) ON DELETE SET NULL,
  task_id               UUID REFERENCES public.tasks(id) ON DELETE SET NULL,

  -- Timestamps
  decided_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_org_id_idx ON public.decisions(org_id);
CREATE INDEX IF NOT EXISTS decisions_org_type_idx ON public.decisions(org_id, decision_type);
CREATE INDEX IF NOT EXISTS decisions_org_status_idx ON public.decisions(org_id, status);
CREATE INDEX IF NOT EXISTS decisions_strategy_idx ON public.decisions(strategy_id) WHERE strategy_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS decisions_objective_idx ON public.decisions(objective_id) WHERE objective_id IS NOT NULL;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION decisions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS decisions_set_updated_at ON public.decisions;
CREATE TRIGGER decisions_set_updated_at
  BEFORE UPDATE ON public.decisions
  FOR EACH ROW EXECUTE FUNCTION decisions_set_updated_at();

-- RLS
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON public.decisions USING (org_id = current_setting('app.current_org_id')::UUID);
