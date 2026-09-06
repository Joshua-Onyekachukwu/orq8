-- 0008 — Company Knowledge Graph + Decision Memory (F6)
-- Entities, relations and decisions, all org-scoped with the standard
-- org-member RLS policy. Pure additive; idempotent.

-- ── knowledge_entities ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_entities_org_type_idx ON public.knowledge_entities(org_id, type);
CREATE INDEX IF NOT EXISTS knowledge_entities_org_name_idx ON public.knowledge_entities(org_id, name);

ALTER TABLE public.knowledge_entities ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'knowledge_entities_org_member') THEN
    CREATE POLICY knowledge_entities_org_member ON public.knowledge_entities
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = knowledge_entities.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = knowledge_entities.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

-- ── knowledge_relations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES public.knowledge_entities(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_relations_org_from_idx ON public.knowledge_relations(org_id, from_entity_id);
CREATE INDEX IF NOT EXISTS knowledge_relations_org_to_idx ON public.knowledge_relations(org_id, to_entity_id);

ALTER TABLE public.knowledge_relations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'knowledge_relations_org_member') THEN
    CREATE POLICY knowledge_relations_org_member ON public.knowledge_relations
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = knowledge_relations.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = knowledge_relations.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

-- ── company_decisions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  context text,
  rationale text,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  outcome text,
  source text,
  actor_type text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS company_decisions_org_idx ON public.company_decisions(org_id);
CREATE INDEX IF NOT EXISTS company_decisions_org_created_idx ON public.company_decisions(org_id, created_at);

ALTER TABLE public.company_decisions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_decisions_org_member') THEN
    CREATE POLICY company_decisions_org_member ON public.company_decisions
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = company_decisions.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = company_decisions.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;