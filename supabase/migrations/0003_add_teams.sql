-- ORQ8 — Production migration: teams table + agent team assignment
-- Run this in Supabase SQL Editor BEFORE deploying new API code
-- Safe to run multiple times (IF NOT EXISTS on everything)

-- ============================================================
-- 1. Create teams table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  lead text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teams_org_idx ON public.teams(org_id);
CREATE INDEX IF NOT EXISTS teams_dept_idx ON public.teams(department_id);
CREATE UNIQUE INDEX IF NOT EXISTS teams_org_name_idx ON public.teams(org_id, name);

-- ============================================================
-- 2. Add team_id to agents (safe — guarded)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'team_id'
  ) THEN
    ALTER TABLE public.agents ADD COLUMN team_id uuid REFERENCES public.teams(id);
    CREATE INDEX agents_team_idx ON public.agents(team_id);
  END IF;
END $$;

-- ============================================================
-- 3. Enable RLS on teams — org members only (same policy shape as departments)
-- ============================================================
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'teams_org_member'
  ) THEN
    CREATE POLICY teams_org_member ON public.teams
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = teams.org_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = teams.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. updated_at trigger for teams
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'teams_set_updated_at'
  ) THEN
    CREATE TRIGGER teams_set_updated_at
      BEFORE UPDATE ON public.teams
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;