-- 0020: Agent Templates — role catalog for AI employees
-- Provides a catalog of pre-defined agent roles that founders can use
-- to quickly hire AI employees with appropriate capabilities.

create table if not exists public.agent_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  category text not null default 'general',
  description text,
  role text not null,
  capabilities jsonb not null default '[]'::jsonb,
  suggested_autonomy text not null default 'execute_with_approval',
  suggested_department_slug text,
  suggested_team_slug text,
  typical_tasks jsonb not null default '[]'::jsonb,
  required_tools jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_templates_status_check check (status in ('active', 'archived')),
  constraint agent_templates_org_slug_unique unique (org_id, slug)
);

create index if not exists agent_templates_org_id_idx on public.agent_templates(org_id);
create index if not exists agent_templates_category_idx on public.agent_templates(category);
create index if not exists agent_templates_system_idx on public.agent_templates(is_system) where is_system = true;

-- Updated_at trigger
create trigger agent_templates_set_updated_at
  before update on public.agent_templates
  for each row execute function public.set_updated_at();

-- RLS
alter table public.agent_templates enable row level security;
alter table public.agent_templates force row level security;

create policy agent_templates_select on public.agent_templates
  for select using (
    is_system = true
    or org_id in (select org_id from public.memberships where user_id = auth.uid())
  );

create policy agent_templates_insert on public.agent_templates
  for insert with check (
    org_id in (select org_id from public.memberships where user_id = auth.uid())
  );

create policy agent_templates_update on public.agent_templates
  for update using (
    org_id in (select org_id from public.memberships where user_id = auth.uid())
  );

create policy agent_templates_delete on public.agent_templates
  for delete using (
    org_id in (select org_id from public.memberships where user_id = auth.uid())
  );

-- ── Real uniqueness for system rows ─────────────────────────────────
-- The (org_id, slug) unique constraint above cannot dedupe system rows:
-- org_id is NULL and Postgres treats NULLs as distinct. This partial index
-- is both the actual guard and the conflict target the seed below infers.
-- Declared here (not only in 0024) so a fresh database converges in one
-- pass: 0020's seed needs the index to exist when its inserts run.
create unique index if not exists agent_templates_system_slug_unique
  on public.agent_templates (slug)
  where is_system = true and org_id is null;

-- ── Seed system agent templates ──────────────────────────────────────

insert into public.agent_templates (name, slug, category, description, role, capabilities, suggested_autonomy, suggested_department_slug, typical_tasks, required_tools, is_system) values
-- Engineering
('Frontend Engineer', 'frontend-engineer', 'engineering', 'Builds and maintains user interfaces, components, and client-side logic.', 'Frontend Engineer', '["react","typescript","css","ui-design","component-development"]', 'execute_with_approval', 'engineering', '["Build UI component","Fix CSS issue","Implement responsive layout","Review PR"]', '["github"]', true),
('Backend Engineer', 'backend-engineer', 'engineering', 'Builds and maintains server-side logic, APIs, and database operations.', 'Backend Engineer', '["nodejs","typescript","postgresql","api-design","database"]', 'execute_with_approval', 'engineering', '["Implement API endpoint","Fix database query","Add migration","Write test"]', '["github"]', true),
('DevOps Engineer', 'devops-engineer', 'engineering', 'Manages infrastructure, deployments, CI/CD, and operational reliability.', 'DevOps Engineer', '["docker","ci-cd","monitoring","infrastructure","deployment"]', 'execute_with_approval', 'engineering', '["Deploy service","Fix CI pipeline","Set up monitoring","Scale infrastructure"]', '["github"]', true),
('QA Engineer', 'qa-engineer', 'engineering', 'Ensures product quality through testing, bug detection, and quality processes.', 'QA Engineer', '["testing","quality-assurance","automation","bug-detection"]', 'execute_with_approval', 'engineering', '["Write test suite","Run regression tests","File bug report","Review test coverage"]', '["github"]', true),

-- Marketing
('Content Marketer', 'content-marketer', 'marketing', 'Creates and manages content strategy, blog posts, and marketing copy.', 'Content Marketer', '["content-strategy","copywriting","seo","blog-writing","social-media"]', 'execute_with_approval', 'marketing', '["Write blog post","Create social content","Optimize for SEO","Draft newsletter"]', '[]', true),
('SEO Specialist', 'seo-specialist', 'marketing', 'Optimizes website and content for search engine visibility and ranking.', 'SEO Specialist', '["seo","keyword-research","technical-seo","analytics","content-optimization"]', 'execute_with_approval', 'marketing', '["Audit SEO performance","Research keywords","Optimize page","Fix technical SEO"]', '[]', true),
('Growth Marketer', 'growth-marketer', 'marketing', 'Drives user acquisition, conversion optimization, and growth experiments.', 'Growth Marketer', '["growth","analytics","a-b-testing","conversion","acquisition"]', 'execute_with_approval', 'marketing', '["Design growth experiment","Analyze conversion funnel","Set up A/B test","Review metrics"]', '[]', true),

-- Sales
('Sales Development Rep', 'sales-dev-rep', 'sales', 'Qualifies leads, manages outreach, and books meetings for the sales team.', 'Sales Development Rep', '["lead-qualification","outreach","crm","email","scheduling"]', 'execute_with_approval', 'sales', '["Qualify lead","Send outreach email","Book meeting","Update CRM"]', '[]', true),
('Account Executive', 'account-executive', 'sales', 'Manages deal pipeline, conducts demos, and closes deals.', 'Account Executive', '["deal-management","demo","negotiation","proposal","closing"]', 'execute_with_approval', 'sales', '["Prepare proposal","Conduct demo","Follow up on deal","Negotiate terms"]', '[]', true),

-- Customer Success
('Customer Success Manager', 'customer-success-manager', 'customer-success', 'Ensures customer satisfaction, manages relationships, and drives retention.', 'Customer Success Manager', '["customer-management","retention","onboarding","support","relationship"]', 'execute_with_approval', 'customer-success', '["Onboard new customer","Check satisfaction","Resolve escalation","Review usage"]', '[]', true),
('Support Agent', 'support-agent', 'customer-success', 'Handles customer inquiries, resolves issues, and provides product support.', 'Support Agent', '["customer-support","troubleshooting","communication","documentation"]', 'observe', 'customer-success', '["Respond to ticket","Troubleshoot issue","Update knowledge base","Escalate bug"]', '[]', true),

-- Finance
('Financial Analyst', 'financial-analyst', 'finance', 'Analyzes financial data, creates reports, and provides budget recommendations.', 'Financial Analyst', '["financial-analysis","reporting","budgeting","modeling","analytics"]', 'execute_with_approval', 'finance', '["Create financial report","Analyze budget","Forecast revenue","Review expenses"]', '[]', true),

-- Operations
('Operations Manager', 'operations-manager', 'operations', 'Manages workflows, processes, and operational efficiency.', 'Operations Manager', '["workflow","process-optimization","project-management","coordination"]', 'execute_with_approval', 'operations', '["Optimize workflow","Coordinate project","Review processes","Manage vendors"]', '[]', true),

-- Product
('Product Manager', 'product-manager', 'product', 'Defines product strategy, prioritizes features, and coordinates cross-functional teams.', 'Product Manager', '["product-strategy","roadmap","prioritization","user-research","analytics"]', 'execute_with_approval', 'product', '["Define feature spec","Prioritize backlog","Review analytics","Coordinate launch"]', '[]', true),
('UX Designer', 'ux-designer', 'product', 'Designs user experiences, creates wireframes, and conducts usability research.', 'UX Designer', '["ux-design","wireframing","usability","figma","user-research"]', 'execute_with_approval', 'product', '["Design wireframe","Conduct user research","Create prototype","Review usability"]', '[]', true),

-- Data
('Data Analyst', 'data-analyst', 'data', 'Analyzes data, builds dashboards, and provides actionable insights.', 'Data Analyst', '["data-analysis","sql","visualization","statistics","reporting"]', 'execute_with_approval', 'data', '["Analyze dataset","Build dashboard","Run query","Create report"]', '[]', true),
('ML Engineer', 'ml-engineer', 'data', 'Builds and deploys machine learning models and data pipelines.', 'ML Engineer', '["machine-learning","python","data-pipelines","model-training","deployment"]', 'execute_with_approval', 'data', '["Train model","Deploy pipeline","Evaluate performance","Debug model"]', '[]', true),

-- Executive
('Executive Assistant', 'executive-assistant', 'executive', 'Manages scheduling, communications, and administrative tasks for leadership.', 'Executive Assistant', '["scheduling","communication","organization","prioritization"]', 'execute_with_approval', null, '["Manage calendar","Draft email","Organize files","Prepare briefing"]', '[]', true)
on conflict (slug) where is_system = true and org_id is null do nothing;
