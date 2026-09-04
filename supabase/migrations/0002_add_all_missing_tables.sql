-- ORQ8 — Complete missing tables migration
-- Creates all tables defined in Drizzle schema but missing from 0001_initial.sql
-- Safe to run multiple times (IF NOT EXISTS on everything)

-- ============================================================
-- 1. Subscriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS subscriptions_org_idx ON public.subscriptions(org_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON public.subscriptions(status);

-- ============================================================
-- 2. Credit Balances
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id),
  included_credits integer NOT NULL DEFAULT 0,
  purchased_credits integer NOT NULL DEFAULT 0,
  used_credits integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_balances_org_period_idx ON public.credit_balances(org_id, period_start);

-- ============================================================
-- 3. Credit Transactions
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount integer NOT NULL,
  description text,
  reference_id uuid,
  reference_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_transactions_org_idx ON public.credit_transactions(org_id, created_at);
CREATE INDEX IF NOT EXISTS credit_transactions_type_idx ON public.credit_transactions(org_id, type);

-- ============================================================
-- 4. Departments
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
-- 5. Agents (with department_id, authority, capabilities)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  department text,
  department_id uuid REFERENCES public.departments(id),
  status text NOT NULL DEFAULT 'active',
  weekly_cost integer NOT NULL DEFAULT 0,
  tasks_completed integer NOT NULL DEFAULT 0,
  tasks_failed integer NOT NULL DEFAULT 0,
  credits_used integer NOT NULL DEFAULT 0,
  current_task text,
  capabilities jsonb NOT NULL DEFAULT '[]',
  config jsonb NOT NULL DEFAULT '{}',
  authority jsonb NOT NULL DEFAULT '{
    "canCreateTasks": true,
    "canExecuteTasks": true,
    "canAccessCompanyInfo": true,
    "canCommunicateExternally": false,
    "canModifyResources": false,
    "spendingLimitCents": 0,
    "requiresApprovalFor": ["financial_commitments", "external_communications", "irreversible_actions", "high_impact_decisions"],
    "forbiddenActions": []
  }',
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agents_org_idx ON public.agents(org_id);
CREATE INDEX IF NOT EXISTS agents_status_idx ON public.agents(org_id, status);
CREATE INDEX IF NOT EXISTS agents_dept_idx ON public.agents(department_id);

-- ============================================================
-- 6. Goals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active',
  progress integer NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'normal',
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goals_org_idx ON public.goals(org_id);
CREATE INDEX IF NOT EXISTS goals_due_date_idx ON public.goals(due_date);

-- ============================================================
-- 7. Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.goals(id),
  agent_id uuid REFERENCES public.agents(id),
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
CREATE INDEX IF NOT EXISTS tasks_org_idx ON public.tasks(org_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON public.tasks(org_id, status);
CREATE INDEX IF NOT EXISTS tasks_agent_idx ON public.tasks(agent_id);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON public.tasks(org_id, priority);
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks(due_date);

-- ============================================================
-- 8. Approvals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id),
  action text NOT NULL,
  description text,
  cost integer NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'pending',
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_org_idx ON public.approvals(org_id);
CREATE INDEX IF NOT EXISTS approvals_status_idx ON public.approvals(org_id, status);

-- ============================================================
-- 9. Activity Events
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_events (
  id bigserial PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id),
  task_id uuid REFERENCES public.tasks(id),
  type text NOT NULL,
  summary text NOT NULL,
  reason text,
  cost integer NOT NULL DEFAULT 0,
  department text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_org_idx ON public.activity_events(org_id, occurred_at);
CREATE INDEX IF NOT EXISTS activity_events_agent_idx ON public.activity_events(agent_id);

-- ============================================================
-- 10. Credit Alerts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  threshold integer NOT NULL,
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  email_sent boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS credit_alerts_org_idx ON public.credit_alerts(org_id, sent_at);
CREATE INDEX IF NOT EXISTS credit_alerts_type_idx ON public.credit_alerts(org_id, type);

-- ============================================================
-- 11. Onboarding States
-- ============================================================
CREATE TABLE IF NOT EXISTS public.onboarding_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  step text NOT NULL DEFAULT 'organization',
  organization jsonb,
  constitution jsonb,
  agent_selections jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS onboarding_states_user_idx ON public.onboarding_states(user_id);
CREATE INDEX IF NOT EXISTS onboarding_states_org_idx ON public.onboarding_states(org_id);

-- ============================================================
-- 12. Password Reset Tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON public.password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_hash_idx ON public.password_reset_tokens(token_hash);

-- ============================================================
-- 13. Company Memory
-- ============================================================
CREATE TABLE IF NOT EXISTS public.company_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  content text NOT NULL,
  source text,
  agent_id uuid REFERENCES public.agents(id),
  task_id uuid REFERENCES public.tasks(id),
  importance integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_memory_org_idx ON public.company_memory(org_id);
CREATE INDEX IF NOT EXISTS company_memory_category_idx ON public.company_memory(org_id, category);

-- ============================================================
-- 14. Files
-- ============================================================
CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL,
  bucket text NOT NULL DEFAULT 'orq8-files',
  uploaded_by uuid REFERENCES public.users(id),
  agent_id uuid REFERENCES public.agents(id),
  task_id uuid REFERENCES public.tasks(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS files_org_idx ON public.files(org_id);
CREATE INDEX IF NOT EXISTS files_key_idx ON public.files(key);

-- ============================================================
-- 15. Notifications
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_org_created_idx ON public.notifications(org_id, created_at);
CREATE INDEX IF NOT EXISTS notifications_org_read_idx ON public.notifications(org_id, read);

-- ============================================================
-- 16. Login Lockouts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.login_lockouts (
  email text PRIMARY KEY,
  failed_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_lockouts_locked_idx ON public.login_lockouts(locked_until);

-- ============================================================
-- 17. RLS on all new tables
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Org-member policies for all business tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'agents_org_member') THEN
    CREATE POLICY agents_org_member ON public.agents FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = agents.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = agents.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'goals_org_member') THEN
    CREATE POLICY goals_org_member ON public.goals FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = goals.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = goals.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tasks_org_member') THEN
    CREATE POLICY tasks_org_member ON public.tasks FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = tasks.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = tasks.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'approvals_org_member') THEN
    CREATE POLICY approvals_org_member ON public.approvals FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = approvals.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = approvals.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'activity_events_org_member') THEN
    CREATE POLICY activity_events_org_member ON public.activity_events FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = activity_events.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = activity_events.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'departments_org_member') THEN
    CREATE POLICY departments_org_member ON public.departments FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = departments.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = departments.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'subscriptions_org_member') THEN
    CREATE POLICY subscriptions_org_member ON public.subscriptions FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = subscriptions.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = subscriptions.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_balances_org_member') THEN
    CREATE POLICY credit_balances_org_member ON public.credit_balances FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = credit_balances.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = credit_balances.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_transactions_org_member') THEN
    CREATE POLICY credit_transactions_org_member ON public.credit_transactions FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = credit_transactions.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = credit_transactions.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_org_member') THEN
    CREATE POLICY notifications_org_member ON public.notifications FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = notifications.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = notifications.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'company_memory_org_member') THEN
    CREATE POLICY company_memory_org_member ON public.company_memory FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = company_memory.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = company_memory.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'files_org_member') THEN
    CREATE POLICY files_org_member ON public.files FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = files.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = files.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'credit_alerts_org_member') THEN
    CREATE POLICY credit_alerts_org_member ON public.credit_alerts FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = credit_alerts.org_id AND m.user_id = auth.uid()))
      WITH CHECK (EXISTS (SELECT 1 FROM public.memberships m WHERE m.org_id = credit_alerts.org_id AND m.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'onboarding_states_own') THEN
    CREATE POLICY onboarding_states_own ON public.onboarding_states FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'password_reset_tokens_own') THEN
    CREATE POLICY password_reset_tokens_own ON public.password_reset_tokens FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ============================================================
-- 18. Updated_at triggers
-- ============================================================
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER credit_balances_set_updated_at BEFORE UPDATE ON public.credit_balances FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER agents_set_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_memory_set_updated_at BEFORE UPDATE ON public.company_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER files_set_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER onboarding_states_set_updated_at BEFORE UPDATE ON public.onboarding_states FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
