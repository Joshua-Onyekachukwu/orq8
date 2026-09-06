-- Engineering workspace: repositories, branches, files, commits, PRs, sandbox runs.
-- All engineering entities are org-scoped and user-scoped where authorship matters.
CREATE TABLE IF NOT EXISTS repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  full_name text NOT NULL,
  owner text NOT NULL,
  default_branch text NOT NULL,
  description text,
  private boolean NOT NULL DEFAULT false,
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  provider_ref_id text,
  languages jsonb DEFAULT '[]',
  framework_summary text,
  files_count integer NOT NULL DEFAULT 0,
  size_bytes integer,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repositories_org_idx ON repositories(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS repositories_org_provider_ref_idx
  ON repositories(org_id, provider_id, provider_ref_id);

CREATE TABLE IF NOT EXISTS repository_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  ahead integer NOT NULL DEFAULT 0,
  behind integer NOT NULL DEFAULT 0,
  last_commit_at timestamptz,
  last_sync_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branches_repository_idx ON repository_branches(repository_id);

CREATE TABLE IF NOT EXISTS repository_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  path text NOT NULL,
  branch text NOT NULL,
  sha text,
  size_bytes integer NOT NULL DEFAULT 0,
  language text,
  is_binary boolean NOT NULL DEFAULT false,
  indexed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repository_files_repository_idx ON repository_files(repository_id);
CREATE UNIQUE INDEX IF NOT EXISTS repository_files_repo_branch_path_idx
  ON repository_files(repository_id, branch, path);

-- Soft storage for file contents. Large files are best-effort; the sandbox calls
-- the provider API to fetch authoritative contents on demand.
CREATE TABLE IF NOT EXISTS repository_file_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL REFERENCES repository_files(id) ON DELETE CASCADE,
  body bytea NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT now()
);

-- Repository events: a lightweight audit/log of what ORQ8 did with the import.
CREATE TABLE IF NOT EXISTS repo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL,
  actor_id uuid,
  summary text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS repo_events_org_idx ON repo_events(org_id);

-- Sandbox runs: hermetic execution records. The real execution happens in an
-- isolated worker; the record here tracks state, budget, logs, and result.
CREATE TABLE IF NOT EXISTS sandbox_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS sandbox_runs_org_idx ON sandbox_runs(org_id);
CREATE INDEX IF NOT EXISTS sandbox_runs_repository_idx ON sandbox_runs(repository_id);

-- Engineering PRs proposed by agents.
CREATE TABLE IF NOT EXISTS repository_prs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS repository_prs_repository_idx ON repository_prs(repository_id);

-- Engineering task — extends the existing task shape with repository context.
CREATE TABLE IF NOT EXISTS engineering_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
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
  pr_id uuid REFERENCES repository_prs(id) ON DELETE SET NULL,
  qa_result jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engineering_tasks_org_idx ON engineering_tasks(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS engineering_tasks_task_idx ON engineering_tasks(task_id)
  WHERE task_id IS NOT NULL;

-- Integrations registry + OAuth state.
CREATE TABLE IF NOT EXISTS integration_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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

CREATE UNIQUE INDEX IF NOT EXISTS integration_providers_org_name_idx ON integration_providers(org_id, name);

-- OAuth credentials: stored hashed/encrypted. The raw token is held only
-- transiently during exchange and never returned to clients.
CREATE TABLE IF NOT EXISTS integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  credential_type text NOT NULL,
  encrypted_secret bytea,
  public_ref text,
  token_expires_at timestamptz,
  scopes jsonb,
  refresh_token_hash bytea,
  refresh_token_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_credentials_provider_idx ON integration_credentials(provider_id);

-- Capability permissions: per integration, which capabilities are available.
CREATE TABLE IF NOT EXISTS integration_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  capability text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  approval_required_for jsonb, -- e.g. ['send_email', 'merge_pr']
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_capabilities_provider_capability_idx
  ON integration_capabilities(provider_id, capability);

-- Agent integration access scoping (which agent may use which integration/capability).
CREATE TABLE IF NOT EXISTS agent_integration_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES integration_providers(id) ON DELETE CASCADE,
  capabilities jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_integration_access_org_agent_idx
  ON agent_integration_access(org_id, agent_id);

-- Simulation: explicit artifact table, never touches live org state.
CREATE TABLE IF NOT EXISTS simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS simulations_org_idx ON simulations(org_id);

-- PostHog: a lightweight event log so we can assert analytics actually fired
-- even before the client SDK is observed. This is complement to PostHog, not
-- a replacement; we still want PostHog for platform analytics.
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  user_id uuid,
  event_name text NOT NULL,
  properties jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_org_idx ON analytics_events(org_id);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events(event_name);

-- Verify tables created
SELECT
  table_name,
  (SELECT count(*)::text || ' columns'::text
   FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = t.table_name)::text AS column_count
FROM (VALUES
  ('repositories'),
  ('repository_branches'),
  ('repository_files'),
  ('repository_file_contents'),
  ('repo_events'),
  ('sandbox_runs'),
  ('repository_prs'),
  ('engineering_tasks'),
  ('integration_providers'),
  ('integration_credentials'),
  ('integration_capabilities'),
  ('agent_integration_access'),
  ('simulations'),
  ('analytics_events')
) AS t(table_name)
ORDER BY t.table_name;
