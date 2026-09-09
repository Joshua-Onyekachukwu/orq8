-- 0017: Organization templates, workforce tracking, and agent lifecycle
--
-- Adds:
--   - department_templates: reusable department blueprint catalog
--   - team_templates: reusable team blueprint catalog
--   - Agent lifecycle states and workload tracking
--   - Cross-department support assignments
--   - Staffing coverage indicators per department/team

-- ─── Department Templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.department_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  description     text,
  mission         text,
  functions       jsonb NOT NULL DEFAULT '[]',      -- recommended functions
  roles           jsonb NOT NULL DEFAULT '[]',      -- recommended roles/capabilities
  teams           jsonb NOT NULL DEFAULT '[]',      -- recommended team names + descriptions
  typical_goals   jsonb NOT NULL DEFAULT '[]',      -- suggested goals
  kpis            jsonb NOT NULL DEFAULT '[]',      -- suggested KPIs
  industry        text,                             -- NULL = universal
  org_size        text,                             -- solo | small | growing | enterprise; NULL = any
  is_system       boolean NOT NULL DEFAULT true,    -- system-provided vs user-created
  created_by      uuid,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dtemplates_org_idx ON public.department_templates(org_id);
CREATE INDEX IF NOT EXISTS dtemplates_slug_idx ON public.department_templates(slug);

-- ─── Team Templates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  description     text,
  mission         text,
  responsibilities jsonb NOT NULL DEFAULT '[]',
  required_capabilities jsonb NOT NULL DEFAULT '[]',
  recommended_roles    jsonb NOT NULL DEFAULT '[]',
  kpis            jsonb NOT NULL DEFAULT '[]',
  department_slug text,                            -- recommended parent department
  industry        text,
  is_system       boolean NOT NULL DEFAULT true,
  created_by      uuid,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ttemplates_org_idx ON public.team_templates(org_id);

-- ─── Department enhancements ─────────────────────────────────────────────
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS mission text;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS functions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.department_templates(id) ON DELETE SET NULL;
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS staffing_data jsonb NOT NULL DEFAULT '{}';

-- ─── Team enhancements ──────────────────────────────────────────────────
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS mission text;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS responsibilities jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.team_templates(id) ON DELETE SET NULL;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS staffing_data jsonb NOT NULL DEFAULT '{}';

-- ─── Agent lifecycle + workload tracking ─────────────────────────────────
-- Expand lifecycle beyond active|paused|archived
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'active'
  CHECK (lifecycle_state IN ('draft','active','paused','restricted','under_review','reassigned','retiring','retired','archived'));
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS primary_role text;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS support_roles jsonb NOT NULL DEFAULT '[]';  -- secondary responsibilities
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS support_departments jsonb NOT NULL DEFAULT '[]';  -- cross-dept support
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS support_teams jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS workload_hours numeric(6,2) NOT NULL DEFAULT 0;  -- current assigned hours/week
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS capacity_hours numeric(6,2) NOT NULL DEFAULT 40;  -- max hours/week
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS utilization_pct numeric(5,2) NOT NULL DEFAULT 0;  -- computed: workload/capacity
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS performance_score numeric(5,2);  -- 0-100
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS retired_at timestamptz;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS promotion_history jsonb NOT NULL DEFAULT '[]';

-- ─── Seed system department templates ────────────────────────────────────
INSERT INTO public.department_templates (name, slug, description, mission, functions, roles, teams, typical_goals, kpis, industry, org_size) VALUES
('Engineering', 'engineering', 'Software development, infrastructure, and technical operations',
  'Build and maintain the technical products, infrastructure, and systems that power the company.',
  '["frontend_development","backend_development","api_development","testing","code_review","deployment","infrastructure","security","devops"]',
  '["software_engineer","devops_engineer","qa_engineer","security_engineer","platform_engineer","tech_lead"]',
  '[{"name":"Frontend","description":"User interfaces and client-side"},{"name":"Backend","description":"APIs, services, and server-side"},{"name":"Platform","description":"Infrastructure, CI/CD, DevOps"},{"name":"QA","description":"Testing and quality assurance"}]',
  '["Ship product features","Maintain system reliability","Reduce technical debt","Improve developer velocity"]',
  '["deploy_frequency","lead_time","mttr","change_failure_rate"]',
  NULL, NULL
),
('Product', 'product', 'Product strategy, design, and management',
  'Define what to build, why, and in what order. Translate business goals into product outcomes.',
  '["product_strategy","user_research","feature_prioritization","roadmap_management","design","prototyping","data_analysis"]',
  '["product_manager","product_designer","product_analyst","ux_researcher"]',
  '[{"name":"Product Management","description":"Strategy, roadmap, prioritization"},{"name":"Product Design","description":"UX, UI, and design systems"}]',
  '["Define product roadmap","Improve user adoption","Validate product-market fit","Optimize conversion"]',
  '["user_adoption","feature_usage","nps","retention_rate"]',
  NULL, NULL
),
('Marketing', 'marketing', 'Brand, demand generation, content, and growth',
  'Generate awareness, demand, and growth. Turn business goals into marketing outcomes.',
  '["brand_management","content_marketing","seo","social_media","paid_acquisition","email_marketing","analytics","growth"]',
  '["marketing_manager","content_writer","seo_specialist","growth_marketer","social_media_manager","marketing_analyst"]',
  '[{"name":"Content","description":"Blog, social, email content"},{"name":"Growth","description":"SEO, paid, acquisition"},{"name":"Brand","description":"Brand, PR, partnerships"}]',
  '["Increase brand awareness","Generate qualified leads","Improve conversion rates","Build content engine"]',
  '["lead_generation","conversion_rate","cac","brand_awareness"]',
  NULL, NULL
),
('Sales', 'sales', 'Revenue generation, pipeline management, and customer acquisition',
  'Generate revenue through pipeline management, prospecting, and deal execution.',
  '["prospecting","pipeline_management","deal_execution","proposal_creation","contract_management","revenue_operations"]',
  '["sales_manager","account_executive","sales_development_rep","sales_ops"]',
  '[{"name":"SDR","description":"Prospecting and lead qualification"},{"name":"Account Executive","description":"Deal closing and relationship"},{"name":"Revenue Ops","description":"Pipeline analytics and tools"}]',
  '["Close new deals","Expand existing accounts","Improve win rate","Reduce sales cycle"]',
  '["revenue","win_rate","pipeline_velocity","deal_size"]',
  NULL, NULL
),
('Customer Success', 'customer_success', 'Customer retention, onboarding, and growth',
  'Ensure customers achieve their desired outcomes. Drive retention, expansion, and advocacy.',
  '["customer_onboarding","success_planning","health_monitoring","expansion","retention","advocacy","support_escalation"]',
  '["customer_success_manager","onboarding_specialist","support_agent"]',
  '[{"name":"Onboarding","description":"New customer activation"},{"name":"Success","description":"Ongoing relationship and growth"},{"name":"Support","description":"Issue resolution and help"}]',
  '["Improve onboarding completion","Reduce churn","Increase expansion revenue","Build customer advocacy"]',
  '["retention_rate","nrr","time_to_value","csat"]',
  NULL, NULL
),
('Finance', 'finance', 'Financial planning, accounting, and operations',
  'Manage financial planning, reporting, and operations. Ensure fiscal health and compliance.',
  '["financial_planning","accounting","budgeting","forecasting","revenue_recognition","compliance","cash_flow_management"]',
  '["financial_analyst","accountant","controller","fp_and_a"]',
  '[{"name":"FP&A","description":"Planning, analysis, forecasting"},{"name":"Accounting","description":"Bookkeeping, reporting, compliance"}]',
  '["Maintain accurate financials","Manage cash flow","Optimize spending","Ensure compliance"]',
  '["burn_rate","runway","gross_margin","operating_ratio"]',
  NULL, NULL
),
('Operations', 'operations', 'Business processes, vendor management, and efficiency',
  'Optimize internal processes, manage vendors, and ensure operational efficiency.',
  '["process_optimization","vendor_management","project_management","workflow_automation","quality_management","compliance"]',
  '["operations_manager","project_manager","process_analyst","vendor_manager"]',
  '[{"name":"Business Ops","description":"Processes, efficiency, analytics"},{"name":"Program Management","description":"Cross-functional project delivery"}]',
  '["Optimize key processes","Reduce operational costs","Improve delivery speed","Automate manual work"]',
  '["process_efficiency","cost_savings","delivery_time","automation_rate"]',
  NULL, NULL
),
('Data & Analytics', 'data_analytics', 'Data infrastructure, analytics, and business intelligence',
  'Transform raw data into actionable insights. Build the analytical foundation for decision-making.',
  '["data_engineering","analytics","business_intelligence","data_governance","reporting","machine_learning"]',
  '["data_analyst","data_engineer","bi_analyst","data_scientist"]',
  '[{"name":"Analytics","description":"Reporting, dashboards, insights"},{"name":"Data Engineering","description":"Pipelines, infrastructure, quality"}]',
  '["Build analytics foundation","Improve data-driven decisions","Create self-serve reporting","Ensure data quality"]',
  '["data_freshness","report_accuracy","query_performance","data_coverage"]',
  NULL, NULL
)
ON CONFLICT DO NOTHING;

-- ─── Seed system team templates ──────────────────────────────────────────
INSERT INTO public.team_templates (name, slug, description, mission, responsibilities, required_capabilities, recommended_roles, kpis, department_slug) VALUES
('Frontend Engineering', 'frontend-engineering', 'User interfaces and client-side development',
  'Build and maintain exceptional user interfaces and client-side experiences.',
  '["ui_development","component_library","responsive_design","accessibility","performance_optimization","testing"]',
  '["react","typescript","css","html","testing","accessibility"]',
  '["frontend_engineer","ui_developer","ux_engineer"]',
  '["page_load_time","accessibility_score","component_coverage","ui_bugs"]',
  'engineering'
),
('Backend Engineering', 'backend-engineering', 'APIs, services, and server-side development',
  'Build and maintain robust APIs, services, and server-side systems.',
  '["api_development","database_design","service_architecture","security","performance","monitoring"]',
  '["nodejs","typescript","sql","api_design","security","performance"]',
  '["backend_engineer","api_developer","systems_engineer"]',
  '["api_reliability","response_time","uptime","security_incidents"]',
  'engineering'
),
('Platform Engineering', 'platform-engineering', 'Infrastructure, CI/CD, and developer tooling',
  'Build and maintain the infrastructure, deployment pipelines, and developer experience.',
  '["infrastructure","ci_cd","monitoring","incident_response","developer_tools","cost_optimization"]',
  '["infrastructure","kubernetes","terraform","monitoring","security"]',
  '["platform_engineer","devops_engineer","sre"]',
  '["deployment_frequency","mttr","infrastructure_cost","developer_satisfaction"]',
  'engineering'
),
('Content Marketing', 'content-marketing', 'Content creation, editorial, and distribution',
  'Create valuable content that attracts, engages, and converts the target audience.',
  '["blog_writing","social_content","email_content","seo_content","video_content","editorial_planning"]',
  '["writing","seo","content_strategy","social_media","analytics"]',
  '["content_writer","seo_specialist","content_strategist","social_media_manager"]',
  '["content_output","organic_traffic","engagement_rate","lead_generation"]',
  'marketing'
),
('Growth Marketing', 'growth-marketing', 'Acquisition, conversion, and optimization',
  'Drive user acquisition, activation, and conversion through data-driven experimentation.',
  '["paid_acquisition","conversion_optimization","a_b_testing","funnel_analysis","attribution","growth_experiments"]',
  '["analytics","experimentation","paid_ads","optimization","data_analysis"]',
  '["growth_marketer","performance_marketer","conversion_optimizer"]',
  '["cac","conversion_rate","growth_rate","experiment_velocity"]',
  'marketing'
)
ON CONFLICT DO NOTHING;

-- ─── Agent lifecycle index ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS agents_lifecycle_idx ON public.agents(org_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS agents_utilization_idx ON public.agents(org_id, utilization_pct);
