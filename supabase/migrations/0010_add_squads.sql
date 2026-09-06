-- 0010 — Cross-agent squads (F13)
-- Named groups of AI employees working a shared objective, backed by the
-- delegation orchestrator for execution. Org-scoped with the standard
-- org-member RLS policy. Idempotent.

CREATE TABLE IF NOT EXISTS public.squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  parent_task_id uuid REFERENCES public.tasks(id),
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS squads_org_idx ON public.squads(org_id);
CREATE INDEX IF NOT EXISTS squads_status_idx ON public.squads(org_id, status);

ALTER TABLE public.squads ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'squads_org_member') THEN
    CREATE POLICY squads_org_member ON public.squads
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = squads.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = squads.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.squad_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  squad_id uuid NOT NULL REFERENCES public.squads(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS squad_agents_org_squad_idx ON public.squad_agents(org_id, squad_id);
CREATE UNIQUE INDEX IF NOT EXISTS squad_agents_squad_agent_unique ON public.squad_agents(squad_id, agent_id);

ALTER TABLE public.squad_agents ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'squad_agents_org_member') THEN
    CREATE POLICY squad_agents_org_member ON public.squad_agents
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = squad_agents.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = squad_agents.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;