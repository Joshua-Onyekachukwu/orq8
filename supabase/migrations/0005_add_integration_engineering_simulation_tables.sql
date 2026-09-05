-- ORQ8 — Production migration: integration, engineering, simulation & analytics tables.
-- Run this in Supabase SQL Editor BEFORE re-running 0004 (0004 references
-- integration_providers, which only existed in the drizzle-side migration until now).
-- Safe to run multiple times (IF NOT EXISTS on everything).
--
-- Source of truth: packages/db/src/schema.ts.
-- NOTE: integration_credentials.encrypted_secret is TEXT (base64 "v1:iv:tag:data"
-- from services/crypto.ts) — NOT the stale bytea from the drizzle-side artifact.

-- ============================================================
-- 1. Integrations foundation (needed by 0004's connector_outcomes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider text NOT NULL, -- github | gmail | linear | jira | ...
  status text NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | connected | error
  scopes jsonb,
  connected_at timestamptz,
  last_interaction_at timestamptz,
  error text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_providers_org_name_idx
  ON public.integration_providers(org_id, name);

CREATE TABLE IF NOT EXISTS public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  credential_type text NOT NULL,
  encrypted_secret text NOT NULL, -- AES-256-GCM payload from services/crypto.ts
  public_ref text,
  token_expires_at timestamptz,
  scopes jsonb,
  refresh_token_hash text,
  refresh_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_credentials_provider_idx
  ON public.integration_credentials(provider_id);

CREATE TABLE IF NOT EXISTS public.integration_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  approval_required_for jsonb, -- e.g. ['send_email', 'merge_pr']
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_capabilities_provider_capability_idx
  ON public.integration_capabilities(provider_id, capability);

CREATE TABLE IF NOT EXISTS public.agent_integration_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  capabilities jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_integration_access_org_agent_idx
  ON public.agent_integration_access(org_id, agent_id);

-- ============================================================
-- 2. Engineering workspace (repositories → branches/files/events/PRs/tasks/runs)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  full_name text NOT NULL,
  owner text NOT NULL,
  default_branch text NOT NULL,
  description text,
  private boolean NOT NULL DEFAULT false,
  provider_id uuid NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  provider_ref_id text,
  languages jsonb NOT NULL DEFAULT '[]',
  framework_summary text,
  files_count integer NOT NULL DEFAULT 0,
  size_bytes integer,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repositories_org_idx ON public.repositories(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS repositories_org_provider_ref_idx
  ON public.repositories(org_id, provider_id, provider_ref_id);

CREATE TABLE IF NOT EXISTS public.repository_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  ahead integer NOT NULL DEFAULT 0,
  behind integer NOT NULL DEFAULT 0,
  last_commit_at timestamptz,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branches_repository_idx ON public.repository_branches(repository_id);

CREATE TABLE IF NOT EXISTS public.repository_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path text NOT NULL,
  branch text NOT NULL,
  sha text,
  size_bytes integer NOT NULL DEFAULT 0,
  language text,
  is_binary boolean NOT NULL DEFAULT false,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repository_files_repository_idx ON public.repository_files(repository_id);
CREATE UNIQUE INDEX IF NOT EXISTS repository_files_repo_branch_path_idx
  ON public.repository_files(repository_id, branch, path);

CREATE TABLE IF NOT EXISTS public.repository_file_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES public.repository_files(id) ON DELETE CASCADE,
  body text NOT NULL, -- base64 for JSON transport (matches schema.ts)
  stored_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.repo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  summary text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repo_events_org_idx ON public.repo_events(org_id);

CREATE TABLE IF NOT EXISTS public.repository_prs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  provider_pr_number integer,
  provider_pr_url text,
  title text NOT NULL,
  body text,
  head_branch text NOT NULL,
  base_branch text NOT NULL,
  state text NOT NULL DEFAULT 'open', -- open | merged | closed | draft
  author_id uuid NOT NULL,
  author_type text NOT NULL,
  risk_assessment jsonb,
  status text NOT NULL DEFAULT 'pending_review', -- pending_review | approved | rejected | changes_requested | merged
  approval_id uuid,
  approved_by uuid,
  merged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repository_prs_repository_idx ON public.repository_prs(repository_id);

CREATE TABLE IF NOT EXISTS public.engineering_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  branch text NOT NULL,
  title text NOT NULL,
  description text,
  acceptance_criteria text,
  status text NOT NULL DEFAULT 'planning',
  assignee_id uuid NOT NULL,
  tests_summary jsonb,
  lint_summary jsonb,
  build_summary jsonb,
  diff_summary jsonb,
  pr_id uuid REFERENCES public.repository_prs(id) ON DELETE SET NULL,
  qa_result jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engineering_tasks_org_idx ON public.engineering_tasks(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS engineering_tasks_task_idx
  ON public.engineering_tasks(task_id) WHERE task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sandbox_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  branch text NOT NULL,
  command text NOT NULL,
  working_dir text NOT NULL,
  runner_env jsonb,
  state text NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | timeout | cancelled
  allocated_credits integer NOT NULL DEFAULT 0,
  used_credits integer NOT NULL DEFAULT 0,
  timeout_ms integer NOT NULL DEFAULT 120000,
  max_memory_mb integer NOT NULL DEFAULT 512,
  stdout text,
  stderr text,
  exit_code integer,
  result_summary text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sandbox_runs_org_idx ON public.sandbox_runs(org_id);
CREATE INDEX IF NOT EXISTS sandbox_runs_repository_idx ON public.sandbox_runs(repository_id);

-- ============================================================
-- 3. Simulation + analytics
-- ============================================================
CREATE TABLE IF NOT EXISTS public.simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  objective text,
  change_description text NOT NULL,
  proposed_departments jsonb,
  proposed_agents jsonb,
  projected_workload jsonb,
  projected_cost jsonb,
  projected_risk text, -- low | medium | high | critical
  bottlenecks jsonb,
  assumptions text[],
  metrics jsonb,
  recommendation text,
  state text NOT NULL DEFAULT 'draft', -- draft | proposed | reviewed | applied
  applied_at timestamptz,
  applied_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS simulations_org_idx ON public.simulations(org_id);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id),
  user_id uuid REFERENCES public.users(id),
  event_name text NOT NULL,
  properties jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_org_idx ON public.analytics_events(org_id);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON public.analytics_events(event_name);

-- ============================================================
-- 4. RLS — org-member policies (same shape as 0002/0003/0004)
-- ============================================================
-- Direct org_id tables
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'integration_providers', 'agent_integration_access', 'repositories', 'repo_events',
    'engineering_tasks', 'sandbox_runs', 'simulations'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = t || '_org_member') THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = %I.org_id AND m.user_id = auth.uid()))
         WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = %I.org_id AND m.user_id = auth.uid()))',
        t || '_org_member', t, t, t);
    END IF;
  END LOOP;
END $$;

-- analytics_events: org_id nullable — org-member policy denies null-org rows.
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'analytics_events_org_member') THEN
    CREATE POLICY analytics_events_org_member ON public.analytics_events
      FOR ALL TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = analytics_events.org_id AND m.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = analytics_events.org_id AND m.user_id = auth.uid())
      );
  END IF;
END $$;

-- Child tables (no org_id) — policy resolves through the parent
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'integration_credentials_org_member') THEN
    CREATE POLICY integration_credentials_org_member ON public.integration_credentials
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.integration_providers p ON p.org_id = m.org_id
          WHERE p.id = integration_credentials.provider_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.integration_providers p ON p.org_id = m.org_id
          WHERE p.id = integration_credentials.provider_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE public.integration_capabilities ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'integration_capabilities_org_member') THEN
    CREATE POLICY integration_capabilities_org_member ON public.integration_capabilities
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.integration_providers p ON p.org_id = m.org_id
          WHERE p.id = integration_capabilities.provider_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.integration_providers p ON p.org_id = m.org_id
          WHERE p.id = integration_capabilities.provider_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE public.repository_branches ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'repository_branches_org_member') THEN
    CREATE POLICY repository_branches_org_member ON public.repository_branches
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          WHERE r.id = repository_branches.repository_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          WHERE r.id = repository_branches.repository_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE public.repository_files ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'repository_files_org_member') THEN
    CREATE POLICY repository_files_org_member ON public.repository_files
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          WHERE r.id = repository_files.repository_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          WHERE r.id = repository_files.repository_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE public.repository_file_contents ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'repository_file_contents_org_member') THEN
    CREATE POLICY repository_file_contents_org_member ON public.repository_file_contents
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          JOIN public.repository_files f ON f.repository_id = r.id
          WHERE f.id = repository_file_contents.file_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          JOIN public.repository_files f ON f.repository_id = r.id
          WHERE f.id = repository_file_contents.file_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

ALTER TABLE public.repository_prs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'repository_prs_org_member') THEN
    CREATE POLICY repository_prs_org_member ON public.repository_prs
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          WHERE r.id = repository_prs.repository_id AND m.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.memberships m
          JOIN public.repositories r ON r.org_id = m.org_id
          WHERE r.id = repository_prs.repository_id AND m.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ============================================================
-- 5. updated_at triggers
-- ============================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'integration_providers', 'integration_credentials', 'repositories',
    'repository_prs', 'engineering_tasks', 'simulations'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = t || '_set_updated_at') THEN
      EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        t || '_set_updated_at', t);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 6. Verification
-- ============================================================
SELECT table_name, (
  SELECT count(*)::text || ' columns'
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = t.table_name
) AS column_count
FROM (VALUES
  ('integration_providers'), ('integration_credentials'), ('integration_capabilities'),
  ('agent_integration_access'), ('repositories'), ('repository_branches'),
  ('repository_files'), ('repository_file_contents'), ('repo_events'),
  ('repository_prs'), ('engineering_tasks'), ('sandbox_runs'),
  ('simulations'), ('analytics_events')
) AS t(table_name)
ORDER BY t.table_name;