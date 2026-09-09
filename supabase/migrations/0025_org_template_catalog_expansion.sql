-- 0025: Department template catalog expansion (organizational ecosystem P4).
--
-- The system catalog previously covered 8 departments (engineering, product,
-- marketing, sales, customer_success, finance, operations, data_analytics).
-- This migration completes the catalog with the remaining departments from
-- the organizational architecture, so the company-builder and the Executive
-- Agent can recommend the organization a company actually needs at every
-- stage instead of a fixed startup shape.
--
-- Stage guidance (org_size) follows the workforce maturity model:
--   Stage 1 (Idea)          → Executive, Product, Engineering, Marketing, Sales
--   Stage 2 (Early startup) → + Customer Success, Finance, Operations, Data
--   Stage 3 (Growing)       → + Customer Research, Legal, People, Research,
--                             Partnerships, Security
--   Stage 4 (Scaling)       → + IT, Communications, Revenue, Innovation,
--                             Program Mgmt, Company Knowledge, Workforce Mgmt,
--                             Quality
--   Stage 5 (Enterprise)    → + Strategy & Simulation
--
-- Roles listed in templates are CATALOG GUIDANCE for hiring recommendations —
-- no agents are created by this migration. Seeding is idempotent: the runner
-- re-applies every file on each deploy and slug_key is UNIQUE.
--
-- Legal note (deliberate, per governance requirements): the legal_compliance
-- template explicitly states it assists qualified human counsel and does not
-- replace licensed legal professionals.

INSERT INTO public.department_templates (name, slug, description, mission, functions, roles, teams, typical_goals, kpis, industry, org_size) VALUES

('Executive / CEO Office', 'executive_office',
 'Company-wide leadership, strategy, coordination, and founder support',
 'Lead company strategy, prioritization, and cross-department coordination; keep the founder in control with accurate, decision-ready information.',
 '["company_strategy","prioritization","executive_decisions","cross_department_coordination","company_health","risk_detection","opportunity_identification","executive_reporting","founder_support"]',
 '["chief_of_staff","chief_strategy_officer","chief_operating_officer","business_intelligence_analyst","executive_assistant","decision_support_agent"]',
 '[{"name":"Executive Strategy","description":"Strategy, market intelligence, scenario planning"},{"name":"Executive Operations","description":"Operations management, process optimization, execution monitoring"},{"name":"Executive Intelligence","description":"Company health, performance, risk and opportunity detection"},{"name":"Founder Support","description":"Briefings, research, decision support, work coordination"}]',
 '["Maintain company-wide alignment on priorities","Give the founder accurate decision-ready briefings","Detect risks and opportunities early","Shorten decision cycle time"]',
 '["goal_attainment","decision_cycle_time","briefing_coverage"]',
 NULL, 'Stage 1+ (Idea stage: lean executive support; deeper teams arrive with scale)'),

('Customer Research / Voice of Customer', 'customer_research',
 'Customer interviews, feedback analysis, and voice-of-customer intelligence',
 'Turn raw customer signals — interviews, feedback, complaints — into structured insight that flows into Product, Strategy, and the Company Brain.',
 '["customer_interviews","feedback_analysis","sentiment_analysis","voice_of_customer","churn_reason_analysis","feature_demand_analysis"]',
 '["customer_researcher","interview_agent","voc_analyst","sentiment_analyst","churn_reason_agent"]',
 '[{"name":"Customer Intelligence","description":"Interviews, research, sentiment"},{"name":"Voice of Customer","description":"Complaints, feature demand, churn reasons"}]',
 '["Build a structured voice-of-customer pipeline","Identify the top churn reasons with evidence","Feed validated customer insight into Product"]',
 '["interview_coverage","insight_adoption_rate","churn_reason_resolution"]',
 NULL, 'Stage 2+ (Early startup: first structured VOC pipeline; deepens with scale)'),

('Legal & Compliance', 'legal_compliance',
 'Legal operations, contracts, compliance, and risk support',
 'Support legal operations — contracts, policy, regulatory monitoring, risk — under qualified human counsel. Assists licensed professionals; does not replace them and does not act as autonomous legal representation.',
 '["legal_research","contract_review","clause_analysis","policy_drafting","regulatory_monitoring","privacy_compliance","legal_risk_assessment"]',
 '["legal_operations_manager","contract_analyst","compliance_analyst","regulatory_monitoring_agent","privacy_compliance_agent","legal_risk_analyst"]',
 '[{"name":"Legal Operations","description":"Research, drafting, document review"},{"name":"Contracts","description":"Review, clause analysis, negotiation support"},{"name":"Compliance","description":"Regulatory monitoring, policy, privacy"},{"name":"Risk","description":"Legal, business, regulatory, and contract risk"}]',
 '["Keep contracts reviewed with fast turnaround","Maintain policy and compliance currency","Surface legal risk before it materializes"]',
 '["contract_turnaround","compliance_findings","policy_currency"]',
 NULL, 'Stage 3+ (Growing company: contracts and compliance demand arrives; human counsel approval required)'),

('People / HR', 'people_hr',
 'Talent acquisition, people operations, performance, and learning',
 'Run people operations — hiring pipelines, onboarding, performance, skills, and learning — for the human and AI workforce.',
 '["talent_acquisition","candidate_screening","people_operations","performance_management","workforce_planning","learning_development"]',
 '["talent_acquisition_agent","people_operations_agent","performance_analyst","workforce_planning_agent","training_agent"]',
 '[{"name":"Talent","description":"Sourcing, screening, interview coordination"},{"name":"People Operations","description":"Onboarding, support, policy"},{"name":"Performance","description":"Goals, reviews, skills analysis"},{"name":"Learning","description":"Training, skills development, knowledge coaching"}]',
 '["Keep hiring pipelines healthy","Shorten onboarding time","Track skills against company needs"]',
 '["time_to_hire","onboarding_completion","skill_coverage"]',
 NULL, 'Stage 3+ (Growing company: hiring volume and people process demand arrives)'),

('Research & Intelligence', 'research_intelligence',
 'Market, competitive, and internal intelligence — feeds the Company Brain',
 'Produce decision-grade market, competitive, and internal intelligence; structured findings feed the Company Brain and decision processes.',
 '["market_research","market_sizing","trend_analysis","competitive_intelligence","pricing_intelligence","knowledge_management"]',
 '["market_researcher","industry_analyst","competitor_research_agent","pricing_intelligence_agent","knowledge_analyst"]',
 '[{"name":"Market Intelligence","description":"Market sizing, industry analysis, trends"},{"name":"Competitive Intelligence","description":"Competitor research, pricing and product intelligence"},{"name":"Internal Intelligence","description":"Company research, decision analysis, organizational insight"}]',
 '["Maintain a current competitive picture","Deliver market evidence for strategic decisions","Feed structured intelligence into the Company Brain"]',
 '["intelligence_freshness","decision_citation_rate","coverage_of_key_competitors"]',
 NULL, 'Stage 3+ (Growing company: strategic decisions begin needing dedicated research)'),

('Security & Trust', 'security_trust',
 'Cybersecurity, application security, identity, and AI governance',
 'Protect the company — threat detection, vulnerability analysis, access governance — and govern AI behavior itself: auditing agents, enforcing policy, preserving the audit trail.',
 '["threat_detection","vulnerability_analysis","security_monitoring","application_security","access_governance","ai_governance","audit"]',
 '["security_analyst","vulnerability_analyst","appsec_engineer","iam_agent","ai_governance_agent","audit_agent"]',
 '[{"name":"Cybersecurity","description":"Threat detection, monitoring, vulnerabilities"},{"name":"Application Security","description":"Code, dependency, and API security"},{"name":"Identity & Access","description":"IAM, access reviews, privilege monitoring"},{"name":"Trust & Governance","description":"AI governance, agent behavior audit, policy enforcement"}]',
 '["Reduce vulnerability exposure time","Keep access reviews current","Audit AI agent behavior continuously"]',
 '["mean_time_to_detect","vulnerability_aging","access_review_currency","audit_coverage"]',
 NULL, 'Stage 3+ (Growing company: customer and regulatory security expectations arrive)'),

('IT / Internal Technology', 'it_internal',
 'IT operations, systems administration, and internal tooling',
 'Run the company''s internal technology: provisioning, administration, monitoring, and the internal tools and integrations the organization depends on.',
 '["it_support","device_management","software_provisioning","systems_administration","internal_tools","integration_administration"]',
 '["it_manager","it_support_agent","systems_administrator","internal_tools_engineer","saas_administration_agent"]',
 '[{"name":"IT Operations","description":"Support, devices, provisioning"},{"name":"Systems Administration","description":"Infrastructure, configuration, monitoring"},{"name":"Internal Tools","description":"SaaS administration, integrations"}]',
 '["Resolve internal incidents quickly","Keep the SaaS stack documented and governed","Reduce manual internal ops work"]',
 '["incident_resolution_time","provisioning_time","tool_sprawl_index"]',
 NULL, 'Stage 4+ (Scaling company: internal tech complexity justifies a dedicated function)'),

('Corporate Communications', 'communications',
 'PR, investor relations, and executive communications',
 'Manage the company''s voice: press, media relations, investor updates, and executive communications — coordinated, accurate, and on-message.',
 '["public_relations","press_releases","media_relations","investor_updates","executive_communications","speechwriting","presentations"]',
 '["communications_manager","pr_agent","investor_relations_agent","executive_communications_agent","presentation_agent"]',
 '[{"name":"Communications","description":"PR, press, media relations"},{"name":"Investor Communications","description":"Updates, shareholder communications, investor research"},{"name":"Executive Communications","description":"Briefings, speeches, presentations"}]',
 '["Keep investor updates timely and accurate","Maintain a consistent public narrative","Support executives with decision-ready material"]',
 '["update_timeliness","message_consistency","media_response_time"]',
 NULL, 'Stage 4+ (Scaling company: public and investor communication volume arrives)'),

('Revenue & Monetization', 'revenue_monetization',
 'Pricing, packaging, and revenue optimization',
 'Own how the company earns: pricing strategy, packaging, revenue analysis, conversion, and monetization experimentation — evidence-first, with approval-gated changes.',
 '["pricing_strategy","packaging","revenue_analysis","conversion_analysis","expansion_revenue","monetization_experimentation"]',
 '["pricing_strategist","pricing_analyst","revenue_analyst","conversion_analyst","monetization_experiment_agent"]',
 '[{"name":"Pricing","description":"Strategy, packaging, analysis"},{"name":"Revenue Optimization","description":"Conversion, expansion, upsell"},{"name":"Experimentation","description":"Pricing and monetization experiments"}]',
 '["Ground pricing changes in experiment evidence","Grow expansion revenue share","Improve conversion at guarded risk"]',
 '["arpu","expansion_revenue_share","experiment_velocity","win_rate_delta"]',
 NULL, 'Stage 4+ (Scaling company: monetization complexity beyond simple plans)'),

('Innovation / R&D', 'innovation_rd',
 'Research, emerging technology scouting, and new product validation',
 'Explore what is next: technology scouting, AI research, idea generation, prototyping, and market validation — producing evidence, not just ideas.',
 '["technology_scouting","emerging_tech_analysis","ai_research","idea_generation","prototyping","experiment_management","market_validation"]',
 '["rd_researcher","technology_scout","ai_research_agent","innovation_strategist","experiment_manager","market_validation_agent"]',
 '[{"name":"Research","description":"R&D, technology scouting, emerging tech"},{"name":"Innovation","description":"Idea generation, prototyping, experiment management"},{"name":"Future Products","description":"Opportunity analysis, market validation"}]',
 '["Run validation experiments with clear kill criteria","Scout and assess emerging technologies on schedule","Feed validated opportunities into the roadmap"]',
 '["experiment_throughput","validation_rate","technology_scan_coverage"]',
 NULL, 'Stage 4+ (Scaling company: dedicated exploration capacity becomes affordable)'),

('Program & Project Management', 'program_management',
 'Program coordination, dependency management, and delivery tracking',
 'Connect strategy to execution: coordinate programs and projects, manage dependencies and risk, track milestones and delivery across departments.',
 '["program_coordination","dependency_management","project_planning","risk_tracking","milestone_tracking","release_coordination","delivery_analysis"]',
 '["program_manager","project_manager","dependency_manager","delivery_manager","release_coordinator"]',
 '[{"name":"Program Management","description":"Coordination, dependencies, program risk"},{"name":"Project Management","description":"Planning, coordination, project risk"},{"name":"Delivery","description":"Milestones, releases, delivery analysis"}]',
 '["Surface cross-department dependencies before they block work","Keep milestone dates honest","Reduce blocked-work aging"]',
 '["milestone_attainment","blocked_work_aging","dependency_resolution_time"]',
 NULL, 'Stage 4+ (Scaling company: cross-department work exceeds ad-hoc coordination)'),

('Company Brain / Knowledge', 'company_knowledge',
 'Knowledge management, decision intelligence, and organizational memory',
 'Curate the company''s institutional memory: knowledge, decision records, and the organizational graph — preserving what happened, why, what was decided, and what was learned.',
 '["knowledge_curation","document_analysis","knowledge_retrieval","decision_memory","decision_review","organizational_mapping","institutional_memory"]',
 '["knowledge_manager","knowledge_curator","decision_memory_agent","company_graph_agent","organizational_analyst"]',
 '[{"name":"Knowledge Management","description":"Curation, document analysis, retrieval"},{"name":"Decision Intelligence","description":"Decision memory, review, outcomes"},{"name":"Organizational Intelligence","description":"Company graph, relationships, institutional memory"}]',
 '["Make past decisions retrievable with their context","Keep the organizational graph current","Turn completed work into recorded lessons"]',
 '["decision_memory_coverage","knowledge_freshness","lesson_capture_rate"]',
 NULL, 'Stage 4+ (Scaling company: institutional memory outgrows individual heads)'),

('AI Workforce Management', 'workforce_management',
 'Workforce planning, agent operations, lifecycle, and economics',
 'Manage the AI workforce as a workforce: capacity planning, agent operations and health, lifecycle (hire → evaluate → retire), and the economics of AI versus human work.',
 '["workforce_planning","capacity_planning","agent_operations","agent_performance_analysis","agent_lifecycle_management","workforce_economics","cost_optimization"]',
 '["workforce_strategist","capacity_planner","agent_operations_manager","agent_performance_analyst","workforce_roi_analyst","cost_optimization_agent"]',
 '[{"name":"Workforce Planning","description":"Capacity, hiring recommendations, analysis"},{"name":"Agent Operations","description":"Performance, reliability, health monitoring"},{"name":"Agent Lifecycle","description":"Hiring, evaluation, promotion, retirement"},{"name":"Workforce Economics","description":"ROI, cost optimization, human-vs-AI analysis"}]',
 '["Answer whether another agent is needed, with evidence","Keep agent utilization in a healthy band","Retire or retrain consistently underperforming agents"]',
 '["utilization_band_adherence","recommendation_adoption_rate","cost_per_successful_task"]',
 NULL, 'Stage 4+ (Scaling company: agent count and cost need dedicated management)'),

('Quality & Assurance', 'quality_assurance',
 'Quality management, AI evaluation, and process assurance',
 'Measure whether work was actually good: output review against standards, agent/model/prompt evaluation, process auditing, and failure analysis — feeding workforce optimization.',
 '["quality_management","output_review","standards_enforcement","agent_evaluation","model_evaluation","prompt_evaluation","process_auditing","failure_analysis"]',
 '["quality_manager","output_reviewer","agent_evaluator","model_evaluator","process_auditor","failure_analysis_agent"]',
 '[{"name":"Quality","description":"Review, standards, analysis"},{"name":"AI Evaluation","description":"Agent, model, and prompt evaluation; benchmarks"},{"name":"Process Assurance","description":"Workflow audit, compliance audit, failure analysis"}]',
 '["Score important outputs against standards","Run evaluation benchmarks on a schedule","Turn failure analyses into process fixes"]',
 '["quality_score_coverage","benchmark_pass_rate","failure_recurrence_rate"]',
 NULL, 'Stage 4+ (Scaling company: quality measurement needs its own function)'),

('Strategy & Simulation', 'strategy_simulation',
 'Scenario planning, business simulation, and strategic forecasting',
 'Model the future before committing to it: scenario planning, forecasting, risk simulation, and company/workforce simulation — the analytical layer that feeds the company digital twin.',
 '["scenario_planning","forecasting","risk_simulation","business_simulation","workforce_simulation","competitive_scenarios","strategic_recommendations"]',
 '["scenario_planner","forecasting_agent","risk_simulation_agent","company_simulation_agent","strategic_forecasting_agent"]',
 '[{"name":"Scenario Planning","description":"Forecasting, Monte Carlo, risk simulation"},{"name":"Business Simulation","description":"Company, workforce, revenue, cost simulation"},{"name":"Strategic Intelligence","description":"Competitive scenarios, strategic recommendations"}]',
 '["Maintain living scenarios for major bets","Validate strategies by simulation before commitment","Quantify downside alongside upside"]',
 '["scenario_coverage","forecast_accuracy","simulation_adoption_in_decisions"]',
 NULL, 'Stage 5 (Enterprise: simulation pays for itself only at strategic scale)')

ON CONFLICT DO NOTHING;

-- ─── Tenant-correct uniqueness for dept/team templates ──────────────────
-- agent_templates already use the partial-index model (0024): system slugs
-- are globally unique, but org-scoped custom templates may reuse a system
-- slug or share slugs across orgs. Align dept/team templates to the same
-- model so any organization can create a custom "marketing" template without
-- colliding with another org's (or the system's) — a global unique slug made
-- multi-tenant template reuse impossible.
ALTER TABLE public.department_templates DROP CONSTRAINT IF EXISTS department_templates_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS department_templates_system_slug_unique
  ON public.department_templates (slug)
  WHERE is_system = true AND org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS department_templates_org_slug_unique
  ON public.department_templates (org_id, slug);

ALTER TABLE public.team_templates DROP CONSTRAINT IF EXISTS team_templates_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS team_templates_system_slug_unique
  ON public.team_templates (slug)
  WHERE is_system = true AND org_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS team_templates_org_slug_unique
  ON public.team_templates (org_id, slug);

-- ─── Stage guidance for the original 8 templates (§35) ───────────────────
-- 0017 seeded these with org_size NULL; backfill idempotently (re-runs are
-- guarded by the IS NULL predicate).
UPDATE public.department_templates SET org_size = 'Stage 1+ (Idea stage: core delivery function from day one)'
  WHERE slug = 'engineering' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 1+ (Idea stage: defining the product is the founding work)'
  WHERE slug = 'product' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 1+ (Idea stage: early demand generation)'
  WHERE slug = 'marketing' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 1+ (Idea stage: first revenue motion)'
  WHERE slug = 'sales' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 2+ (Early startup: arrives with first customers)'
  WHERE slug = 'customer_success' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 2+ (Early startup: arrives with real money to manage)'
  WHERE slug = 'finance' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 2+ (Early startup: process load justifies it)'
  WHERE slug = 'operations' AND is_system AND org_size IS NULL;
UPDATE public.department_templates SET org_size = 'Stage 2+ (Early startup: data begins driving decisions)'
  WHERE slug = 'data_analytics' AND is_system AND org_size IS NULL;
