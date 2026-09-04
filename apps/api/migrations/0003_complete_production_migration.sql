-- ============================================================
-- ORQ8 Complete Production Migration
-- Run this in Supabase SQL Editor to bring production DB in sync
-- with the Drizzle schema. All statements use IF NOT EXISTS
-- so they are safe to re-run.
-- ============================================================

-- 1. Add platform_role to users (admin gate)
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'user';

-- 2. Create departments table
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  description text,
  head text,
  budget integer,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS departments_org_idx ON departments(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_org_name_idx ON departments(org_id, name);

-- 3. Add missing columns to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS weekly_cost integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tasks_completed integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tasks_failed integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS credits_used integer NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS current_task text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS authority jsonb NOT NULL DEFAULT '{"canCreateTasks":true,"canExecuteTasks":true,"canAccessCompanyInfo":true,"canCommunicateExternally":false,"canModifyResources":false,"spendingLimitCents":0,"requiresApprovalFor":["financial_commitments","external_communications","irreversible_actions","high_impact_decisions"],"forbiddenActions":[]}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS agents_dept_idx ON agents(department_id);

-- 4. Create goals table (if not exists)
CREATE TABLE IF NOT EXISTS goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  progress integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'normal',
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_org_idx ON goals(org_id);
CREATE INDEX IF NOT EXISTS goals_due_date_idx ON goals(due_date);

-- 5. Create tasks table (if not exists)
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  goal_id uuid REFERENCES goals(id),
  agent_id uuid REFERENCES agents(id),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  priority text NOT NULL DEFAULT 'normal',
  due_date timestamptz,
  cost integer NOT NULL DEFAULT 0,
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_org_idx ON tasks(org_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks(org_id, status);
CREATE INDEX IF NOT EXISTS tasks_agent_idx ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON tasks(org_id, priority);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date);

-- 6. Create approvals table (if not exists)
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  agent_id uuid REFERENCES agents(id),
  action text NOT NULL,
  description text,
  cost integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_org_idx ON approvals(org_id);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON approvals(org_id, status);

-- 7. Create activity_events table (if not exists)
CREATE TABLE IF NOT EXISTS activity_events (
  bigserial_id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  agent_id uuid REFERENCES agents(id),
  task_id uuid REFERENCES tasks(id),
  type text NOT NULL,
  summary text NOT NULL,
  reason text,
  cost integer NOT NULL DEFAULT 0,
  department text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_org_idx ON activity_events(org_id, occurred_at);
CREATE INDEX IF NOT EXISTS activity_events_agent_idx ON activity_events(agent_id);

-- 8. Create company_memory table (if not exists)
CREATE TABLE IF NOT EXISTS company_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  category text NOT NULL,
  content text NOT NULL,
  source text,
  agent_id uuid REFERENCES agents(id),
  task_id uuid REFERENCES tasks(id),
  importance integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_memory_org_idx ON company_memory(org_id);
CREATE INDEX IF NOT EXISTS company_memory_category_idx ON company_memory(org_id, category);

-- 9. Create notifications table (if not exists)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_org_created_idx ON notifications(org_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_org_read_idx ON notifications(org_id, read);

-- 10. Create onboarding_states table (if not exists)
CREATE TABLE IF NOT EXISTS onboarding_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  org_id uuid NOT NULL REFERENCES organizations(id),
  step text NOT NULL DEFAULT 'organization',
  organization jsonb,
  constitution jsonb,
  agent_selections jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_states_user_idx ON onboarding_states(user_id);
CREATE INDEX IF NOT EXISTS onboarding_states_org_idx ON onboarding_states(org_id);

-- 11. Create files table (if not exists)
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  key text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  bucket text NOT NULL DEFAULT 'orq8-files',
  uploaded_by uuid REFERENCES users(id),
  agent_id uuid REFERENCES agents(id),
  task_id uuid REFERENCES tasks(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_org_idx ON files(org_id);
CREATE INDEX IF NOT EXISTS files_key_idx ON files(key);

-- 12. Create subscriptions table (if not exists)
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  plan text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'active',
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  included_credits integer NOT NULL DEFAULT 0,
  max_agents integer NOT NULL DEFAULT 3,
  stripe_subscription_id text,
  cancel_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON subscriptions(org_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

-- 13. Create credit_balances table (if not exists)
CREATE TABLE IF NOT EXISTS credit_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  included_credits integer NOT NULL DEFAULT 0,
  purchased_credits integer NOT NULL DEFAULT 0,
  used_credits integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_balances_org_period_idx ON credit_balances(org_id, period_start);

-- 14. Create credit_transactions table (if not exists)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL,
  amount integer NOT NULL,
  description text,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_transactions_org_idx ON credit_transactions(org_id, created_at);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON credit_transactions(org_id, type);

-- 15. Create credit_alerts table (if not exists)
CREATE TABLE IF NOT EXISTS credit_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  type text NOT NULL,
  threshold integer NOT NULL,
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  email_sent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS credit_alerts_org_idx ON credit_alerts(org_id, sent_at);
CREATE INDEX IF NOT EXISTS credit_alerts_type_idx ON credit_alerts(org_id, type);

-- 16. Create password_reset_tokens table (if not exists)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON password_reset_tokens(token_hash);

-- 17. Create login_lockouts table (if not exists)
CREATE TABLE IF NOT EXISTS login_lockouts (
  email text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_lockouts_locked_idx ON login_lockouts(locked_until);

-- 18. Create waitlist_signups table (if not exists)
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  role text,
  source text NOT NULL DEFAULT 'landing',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_idx ON waitlist_signups(email);

-- 19. Create waitlist_emails table (if not exists)
CREATE TABLE IF NOT EXISTS waitlist_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_id uuid NOT NULL REFERENCES waitlist_signups(id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text NOT NULL,
  to_email text NOT NULL,
  to_name text,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_emails_due_idx ON waitlist_emails(status, scheduled_at);

-- 20. Create notification_preferences table (if not exists)
CREATE TABLE IF NOT EXISTS notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  in_app_approvals boolean NOT NULL DEFAULT true,
  in_app_tasks boolean NOT NULL DEFAULT true,
  in_app_agent boolean NOT NULL DEFAULT true,
  in_app_credits boolean NOT NULL DEFAULT true,
  in_app_system boolean NOT NULL DEFAULT true,
  email_approvals boolean NOT NULL DEFAULT false,
  email_tasks boolean NOT NULL DEFAULT false,
  email_agent boolean NOT NULL DEFAULT false,
  email_credits boolean NOT NULL DEFAULT true,
  email_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_org_idx ON notification_preferences(org_id);

-- 21. Create agent_memory table (for per-agent learning)
CREATE TABLE IF NOT EXISTS agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  agent_id uuid NOT NULL REFERENCES agents(id),
  category text NOT NULL DEFAULT 'context',
  content text NOT NULL,
  importance integer NOT NULL DEFAULT 5,
  task_id uuid REFERENCES tasks(id),
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_memory_org_agent_idx ON agent_memory(org_id, agent_id);
CREATE INDEX IF NOT EXISTS agent_memory_category_idx ON agent_memory(org_id, agent_id, category);
CREATE INDEX IF NOT EXISTS agent_memory_importance_idx ON agent_memory(org_id, importance DESC);
