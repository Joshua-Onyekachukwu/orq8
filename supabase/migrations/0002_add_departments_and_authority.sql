-- ORQ8 — Production migration: add departments table + agent authority columns
-- Run this in Supabase SQL Editor BEFORE deploying new API code
-- Safe to run multiple times (IF NOT EXISTS on everything)

-- ============================================================
-- 1. Create departments table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  head text,
  budget integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS departments_org_idx ON public.departments(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_org_name_idx ON public.departments(org_id, name);

-- ============================================================
-- 2. Add new columns to agents table (safe — IF NOT EXISTS)
-- ============================================================

-- department_id: FK to departments (nullable for unassigned agents)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'department_id'
  ) THEN
    ALTER TABLE public.agents ADD COLUMN department_id uuid REFERENCES public.departments(id);
    CREATE INDEX agents_dept_idx ON public.agents(department_id);
  END IF;
END $$;

-- authority: JSONB column for explicit permission profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'authority'
  ) THEN
    ALTER TABLE public.agents ADD COLUMN authority jsonb NOT NULL DEFAULT '{
      "canCreateTasks": true,
      "canExecuteTasks": true,
      "canAccessCompanyInfo": true,
      "canCommunicateExternally": false,
      "canModifyResources": false,
      "spendingLimitCents": 0,
      "requiresApprovalFor": ["financial_commitments", "external_communications", "irreversible_actions", "high_impact_decisions"],
      "forbiddenActions": []
    }';
  END IF;
END $$;

-- capabilities: JSONB array of capability strings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agents' AND column_name = 'capabilities'
  ) THEN
    ALTER TABLE public.agents ADD COLUMN capabilities jsonb NOT NULL DEFAULT '[]';
  END IF;
END $$;

-- ============================================================
-- 3. Enable RLS on departments
-- ============================================================
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Org members can manage departments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'departments_org_member'
  ) THEN
    CREATE POLICY departments_org_member ON public.departments
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = departments.org_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.org_id = departments.org_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 4. Add updated_at trigger for departments
-- ============================================================
CREATE TRIGGER departments_set_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
