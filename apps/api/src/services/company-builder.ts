/**
 * ORQ8 Company Builder Service
 *
 * Turns a founder's idea or existing company into a structured understanding,
 * a proposed organization (departments + AI employees), and an operating plan
 * (goals + initial tasks) — then activates it through the real ORQ8 services.
 *
 * Flow:
 *   analyzeCompany()  → structured company understanding (Company Brain seed)
 *   generatePlan()    → proposed departments, AI employees, goals, tasks
 *   activateCompany() → creates everything through existing services
 *
 * Every LLM call has a deterministic rule-based fallback so the flow always
 * works, even with no provider key configured.
 */

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { chatJson } from './llm.js';
import * as deptService from './departments.js';
import * as agentsService from './agents.js';
import * as memoryService from './memory.js';
import { appendAudit } from './audit.js';
import { goals, tasks } from '@orq8/db';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CompanyAnalysis {
  companyName: string;
  description: string;
  industry: string;
  targetMarket: string;
  problem: string;
  solution: string;
  businessModel: string;
  stage: string;
  priorities: string[];
  risks: string[];
  existingSystems?: string[];
  // Structured entities — populated for existing companies (and whenever the
  // founder's input implies them). Each is kept as short, verifiable facts so
  // the Company Brain can reason about the org without storing raw text.
  products?: Array<{ name: string; purpose: string; status: string }>;
  customers?: Array<{ segment: string; useCase: string }>;
  team?: Array<{ role: string; department: string }>;
  technology?: Array<{ name: string; category: string }>;
  tools?: Array<{ name: string; category: string }>;
  website?: string;
  sourceType: 'idea' | 'existing';
  rawInput: string;
}

export interface ProposedAgent {
  name: string;
  role: string;
  department: string;
  responsibilities: string[];
  capabilities: string[];
  tools: string[];
}

export interface ProposedGoal {
  title: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface ProposedTask {
  title: string;
  description: string;
  goalIndex: number;
  agentRole: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface CompanyPlan {
  departments: { name: string; description: string }[];
  agents: ProposedAgent[];
  goals: ProposedGoal[];
  tasks: ProposedTask[];
  rationale: string;
}

export interface ActivationResult {
  departments: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string; role: string }>;
  goals: Array<{ id: string; title: string }>;
  tasks: Array<{ id: string; title: string }>;
  memoryCount: number;
}

// ─── Step 1: Company Analysis ───────────────────────────────────────────────

const ANALYSIS_SYSTEM_PROMPT = `You are the ORQ8 Executive Agent performing company discovery for a new founder.

Your job is to turn the founder's description of their idea or existing company into a precise, structured company understanding. Extract ONLY what the founder actually said or what is directly implied — never fabricate specifics the founder did not provide.

Return strict JSON with exactly this shape:
{
  "companyName": "short company/product name, or '' if not stated",
  "description": "one-paragraph description of what the company does",
  "industry": "industry sector",
  "targetMarket": "who the customers are, or '' if unknown",
  "problem": "the core problem being solved",
  "solution": "how the company solves it",
  "businessModel": "how it makes money, or 'TBD' if unknown",
  "stage": "idea | pre-seed | launched | growing | established (best guess from the description)",
  "website": "company/product website URL if mentioned, or ''",
  "priorities": ["2-5 near-term priorities implied or stated"],
  "risks": ["1-4 risks or unknowns implied or stated"],
  "existingSystems": ["tools/systems mentioned (website, repo, CRM, docs, etc.) or [] if none"],
  "products": [{ "name": "product/service", "purpose": "what it does", "status": "launched | in development | planned" }],
  "customers": [{ "segment": "customer type/segment", "useCase": "how they use it" }],
  "team": [{ "role": "person's role", "department": "department or ''" }],
  "technology": [{ "name": "language/framework/infrastructure", "category": "language | framework | database | infrastructure | api" }],
  "tools": [{ "name": "business tool", "category": "crm | communication | project_management | analytics | finance | marketing | development | support" }]
}

Rules:
- Extract ONLY entities the founder mentioned or that are directly implied. Never invent specifics.
- Leave arrays empty when nothing was stated.
- Keep entity names short and factual ("Next.js", "HubSpot", "Stripe").
- For an idea-stage company, products/customers/team/technology/tools will usually be empty or minimal.`;

/** Analyze a founder's raw input into a structured company understanding. */
export async function analyzeCompany(
  config: AppConfig,
  db: Db,
  orgId: string,
  input: { description: string; sourceType: 'idea' | 'existing' },
): Promise<CompanyAnalysis> {
  const userMessage = `Founder input (source: ${input.sourceType === 'idea' ? 'starting from an idea' : 'existing company'}):
"${input.description}"`;

  const llmResult = await chatJson<Partial<CompanyAnalysis>>(
    config,
    ANALYSIS_SYSTEM_PROMPT,
    userMessage,
    // Structured entity arrays (products/customers/team/technology/tools)
    // need headroom; a truncated response fails JSON parsing and silently
    // degrades to the rule-based fallback, losing the extraction.
    { temperature: 0.3, max_tokens: 3000 },
  );

  const analysis: CompanyAnalysis = llmResult
    ? {
        companyName: String(llmResult.companyName ?? '').trim(),
        description: String(llmResult.description ?? input.description).trim() || input.description,
        industry: String(llmResult.industry ?? 'General').trim() || 'General',
        targetMarket: String(llmResult.targetMarket ?? '').trim(),
        problem: String(llmResult.problem ?? '').trim(),
        solution: String(llmResult.solution ?? '').trim(),
        businessModel: String(llmResult.businessModel ?? 'TBD').trim() || 'TBD',
        stage: String(llmResult.stage ?? 'idea').trim() || 'idea',
        website: String(llmResult.website ?? '').trim() || undefined,
        priorities: Array.isArray(llmResult.priorities) ? llmResult.priorities.map(String).slice(0, 5) : [],
        risks: Array.isArray(llmResult.risks) ? llmResult.risks.map(String).slice(0, 4) : [],
        existingSystems: Array.isArray(llmResult.existingSystems) ? llmResult.existingSystems.map(String).slice(0, 8) : [],
        products: sanitizeEntities(llmResult.products, 'name', 6).map((p) => ({
          name: String(p.name ?? ''),
          purpose: String(p.purpose ?? '').trim(),
          status: String(p.status ?? '').trim() || 'launched',
        })),
        customers: sanitizeEntities(llmResult.customers, 'segment', 6).map((c) => ({
          segment: String(c.segment ?? ''),
          useCase: String(c.useCase ?? '').trim(),
        })),
        team: sanitizeEntities(llmResult.team, 'role', 8).map((t) => ({
          role: String(t.role ?? ''),
          department: String(t.department ?? '').trim(),
        })),
        technology: sanitizeEntities(llmResult.technology, 'name', 8).map((t) => ({
          name: String(t.name ?? ''),
          category: String(t.category ?? '').trim() || 'technology',
        })),
        tools: sanitizeEntities(llmResult.tools, 'name', 8).map((t) => ({
          name: String(t.name ?? ''),
          category: String(t.category ?? '').trim() || 'tool',
        })),
        sourceType: input.sourceType,
        rawInput: input.description,
      }
    : fallbackAnalysis(input.description, input.sourceType);

  // Seed the Company Brain with the structured understanding.
  await seedCompanyBrain(db, orgId, analysis);
  return analysis;
}

/** Deterministic fallback when the LLM is unavailable. */
function fallbackAnalysis(description: string, sourceType: 'idea' | 'existing'): CompanyAnalysis {
  const firstSentence = description.split(/[.!?\n]/).find((s) => s.trim().length > 0)?.trim() ?? description.slice(0, 120);
  return {
    companyName: '',
    description,
    industry: 'General',
    targetMarket: '',
    problem: 'To be validated — identify the core problem your customers face.',
    solution: firstSentence,
    businessModel: 'TBD',
    stage: sourceType === 'existing' ? 'launched' : 'idea',
    priorities: ['Define and validate the core value proposition', 'Establish the first working product/operating loop', 'Set measurable company goals'],
    risks: ['Market fit is unproven', 'Limited initial resources', 'Unknown competitive landscape'],
    existingSystems: sourceType === 'existing' ? ['To be confirmed'] : [],
    products: sourceType === 'existing' ? [{ name: firstSentence.slice(0, 60), purpose: '', status: 'launched' }] : [],
    customers: [],
    team: [],
    technology: [],
    tools: [],
    sourceType,
    rawInput: description,
  };
}

/**
 * Coerce an unknown entity array to a bounded list of objects whose key field
 * is a non-empty trimmed string. Extra fields are preserved as-is; mappers
 * coerce what they need.
 */
function sanitizeEntities(
  raw: unknown,
  keyField: string,
  max: number,
): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const item of raw.slice(0, max)) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const key = String(obj[keyField] ?? '').trim();
    if (!key) continue;
    out.push({ ...obj, [keyField]: key });
  }
  return out;
}

/** Write the analysis into company memory so the Executive Agent can use it. */
async function seedCompanyBrain(db: Db, orgId: string, analysis: CompanyAnalysis): Promise<void> {
  const facts: Array<{ category: 'fact' | 'decision' | 'context'; content: string; importance: number }> = [];

  if (analysis.companyName) {
    facts.push({ category: 'fact', content: `Company name: ${analysis.companyName}`, importance: 9 });
  }
  if (analysis.description) {
    facts.push({ category: 'fact', content: `Company description: ${analysis.description}`, importance: 8 });
  }
  if (analysis.industry) {
    facts.push({ category: 'fact', content: `Industry: ${analysis.industry}`, importance: 6 });
  }
  if (analysis.targetMarket) {
    facts.push({ category: 'fact', content: `Target market: ${analysis.targetMarket}`, importance: 7 });
  }
  if (analysis.problem) {
    facts.push({ category: 'context', content: `Core problem: ${analysis.problem}`, importance: 7 });
  }
  if (analysis.solution) {
    facts.push({ category: 'context', content: `Solution: ${analysis.solution}`, importance: 7 });
  }
  if (analysis.businessModel && analysis.businessModel !== 'TBD') {
    facts.push({ category: 'fact', content: `Business model: ${analysis.businessModel}`, importance: 6 });
  }
  if (analysis.stage) {
    facts.push({ category: 'fact', content: `Company stage: ${analysis.stage}`, importance: 5 });
  }
  for (const p of analysis.priorities) {
    facts.push({ category: 'decision', content: `Founder priority: ${p}`, importance: 6 });
  }
  for (const r of analysis.risks) {
    facts.push({ category: 'context', content: `Risk: ${r}`, importance: 5 });
  }
  for (const s of analysis.existingSystems ?? []) {
    facts.push({ category: 'fact', content: `Existing system/asset: ${s}`, importance: 6 });
  }
  if (analysis.website) {
    facts.push({ category: 'fact', content: `Website: ${analysis.website}`, importance: 5 });
  }
  for (const p of analysis.products ?? []) {
    facts.push({
      category: 'context',
      content: `Product: ${p.name} (${p.status || 'launched'}) — ${p.purpose || 'purpose not stated'}`,
      importance: 7,
    });
  }
  for (const c of analysis.customers ?? []) {
    facts.push({
      category: 'fact',
      content: `Customer segment: ${c.segment}${c.useCase ? ` — use case: ${c.useCase}` : ''}`,
      importance: 6,
    });
  }
  for (const t of analysis.team ?? []) {
    facts.push({
      category: 'fact',
      content: `Team: ${t.role}${t.department ? ` (${t.department})` : ''}`,
      importance: 5,
    });
  }
  for (const t of analysis.technology ?? []) {
    facts.push({
      category: 'fact',
      content: `Technology: ${t.name}${t.category && t.category !== 'technology' ? ` (${t.category})` : ''}`,
      importance: 5,
    });
  }
  for (const t of analysis.tools ?? []) {
    facts.push({
      category: 'fact',
      content: `Business tool: ${t.name}${t.category && t.category !== 'tool' ? ` (${t.category})` : ''}`,
      importance: 5,
    });
  }
  facts.push({ category: 'fact', content: `Founding source: started from ${analysis.sourceType === 'idea' ? 'an idea' : 'an existing company'}`, importance: 4 });

  for (const f of facts) {
    try {
      await memoryService.createMemory(db, {
        orgId,
        category: f.category,
        content: f.content,
        importance: f.importance,
        source: 'company_builder:onboarding',
      });
    } catch {
      // Memory seeding is best-effort — never block onboarding on it.
    }
  }
}

// ─── Step 2: Operating Plan Generation ──────────────────────────────────────

const PLAN_SYSTEM_PROMPT = `You are the ORQ8 Executive Agent helping a solo founder build their AI company.

Given the company analysis, propose the MINIMUM viable organization that company actually needs. A solo founder should NOT get 40 agents — propose only what is genuinely needed to start operating. Keep it lean: 3-6 departments at most, 1-2 agents per department, 3-5 initial goals, and 5-12 initial tasks.

Return strict JSON with exactly this shape:
{
  "rationale": "2-3 sentence explanation of why this org structure fits the company",
  "departments": [{ "name": "Executive", "description": "..." }],
  "agents": [
    {
      "name": "short agent name",
      "role": "role title, e.g. Market Researcher",
      "department": "must match a department name above",
      "responsibilities": ["2-4 bullets"],
      "capabilities": ["2-4 skills"],
      "tools": ["web_search", "write_document", "research_competitors"]
    }
  ],
  "goals": [
    { "title": "goal title", "description": "what success looks like", "priority": "high|normal|urgent" }
  ],
  "tasks": [
    {
      "title": "task title",
      "description": "what to do",
      "goalIndex": 0,
      "agentRole": "must match an agent role above",
      "priority": "high|normal|low"
    }
  ]
}

Rules:
- Always include exactly one Executive Agent (department "Executive").
- Every goalIndex must point to an existing goal. Every agentRole must match an existing agent role.
- Prefer agents like research, content, growth, engineering, operations, finance — whichever the analysis actually implies.
- Do not invent tools the ORQ8 registry does not have. Known tools: web_search, write_document, summarize_document, research_competitors, analyze_market, write_email, create_content, data_analysis, write_code, review_code, task_planning, delegate_task, memory_store, memory_retrieve.`;

export interface PlanInput {
  analysis: CompanyAnalysis;
}

/** Generate the proposed organization + operating plan. */
export async function generatePlan(
  config: AppConfig,
  db: Db,
  orgId: string,
  analysis: CompanyAnalysis,
): Promise<CompanyPlan> {
  const userMessage = JSON.stringify(analysis, null, 2);

  const llmResult = await chatJson<Partial<CompanyPlan>>(
    config,
    PLAN_SYSTEM_PROMPT,
    userMessage,
    { temperature: 0.3, max_tokens: 2500 },
  );

  const plan = llmResult ? sanitizePlan(llmResult, analysis) : fallbackPlan(analysis);
  return plan;
}

/** Validate + coerce LLM output into a well-formed CompanyPlan. */
function sanitizePlan(raw: Partial<CompanyPlan>, analysis: CompanyAnalysis): CompanyPlan {
  const departments = Array.isArray(raw.departments)
    ? raw.departments.slice(0, 6).map((d) => ({ name: String(d?.name ?? '').trim() || 'General', description: String(d?.description ?? '').trim() }))
    : [];

  // Ensure Executive always exists
  if (!departments.some((d) => d.name.toLowerCase() === 'executive')) {
    departments.unshift({ name: 'Executive', description: 'Leadership, coordination and strategic oversight.' });
  }

  const agentRoles = new Set<string>();
  const agents: ProposedAgent[] = (Array.isArray(raw.agents) ? raw.agents : [])
    .slice(0, 10)
    .map((a) => {
      const role = String(a?.role ?? '').trim();
      const dept = String(a?.department ?? '').trim();
      // Coerce department to an existing one (default Executive)
      const resolvedDept = departments.find((d) => d.name.toLowerCase() === dept.toLowerCase())?.name
        ?? (departments[0]?.name ?? 'Executive');
      if (role) agentRoles.add(role);
      return {
        name: String(a?.name ?? '').trim() || role || 'Agent',
        role,
        department: resolvedDept,
        responsibilities: Array.isArray(a?.responsibilities) ? a.responsibilities.map(String).slice(0, 4) : [],
        capabilities: Array.isArray(a?.capabilities) ? a.capabilities.map(String).slice(0, 4) : [],
        tools: Array.isArray(a?.tools) ? a.tools.map(String).slice(0, 5) : [],
      };
    })
    .filter((a) => a.role.length > 0);

  // Ensure at least the Executive agent exists
  if (!agents.some((a) => a.role.toLowerCase().includes('executive'))) {
    agents.unshift({
      name: 'Orion',
      role: 'Executive Agent',
      department: 'Executive',
      responsibilities: ['Coordinate the AI workforce', 'Plan and delegate work', 'Report to the founder'],
      capabilities: ['planning', 'delegation', 'coordination'],
      tools: ['task_planning', 'delegate_task', 'memory_store', 'memory_retrieve'],
    });
  }

  const goals: ProposedGoal[] = (Array.isArray(raw.goals) ? raw.goals : []).slice(0, 5).map((g) => ({
    title: String(g?.title ?? '').trim() || 'Company goal',
    description: String(g?.description ?? '').trim(),
    priority: (['low', 'normal', 'high', 'urgent'] as const).includes(g?.priority) ? g.priority as ProposedGoal['priority'] : 'high',
  }));

  const tasks: ProposedTask[] = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 12).map((t) => {
    const role = String(t?.agentRole ?? '').trim();
    const resolvedRole = agentRoles.has(role) ? role : (agents[0]?.role ?? 'Executive Agent');
    return {
      title: String(t?.title ?? '').trim() || 'Initial task',
      description: String(t?.description ?? '').trim(),
      goalIndex: Math.min(Math.max(Number(t?.goalIndex) || 0, 0), Math.max(goals.length - 1, 0)),
      agentRole: resolvedRole,
      priority: (['low', 'normal', 'high', 'urgent'] as const).includes(t?.priority) ? t.priority as ProposedTask['priority'] : 'normal',
    };
  });

  // If goals are empty, add a default from the analysis
  if (goals.length === 0) {
    goals.push({
      title: 'Launch and validate the core offering',
      description: `Turn "${analysis.description.slice(0, 120)}" into a working product with first customers.`,
      priority: 'high',
    });
  }
  // If tasks are empty, add a starter task per goal
  if (tasks.length === 0) {
    tasks.push({
      title: 'Define the initial operating plan',
      description: 'Break the first goal into concrete work and assign owners.',
      goalIndex: 0,
      agentRole: agents[0]?.role ?? 'Executive Agent',
      priority: 'high',
    });
  }

  return {
    departments,
    agents,
    goals,
    tasks,
    rationale: String(raw.rationale ?? 'A lean starting organization sized to the founder\'s current stage.').trim(),
  };
}

/** Deterministic fallback plan when the LLM is unavailable. */
function fallbackPlan(analysis: CompanyAnalysis): CompanyPlan {
  const industry = analysis.industry.toLowerCase();
  const wantsTech = /software|saas|app|platform|tech|code|web/i.test(industry + ' ' + analysis.rawInput);
  const wantsMarketing = /market|growth|lead|brand|content|saas|consumer|product/i.test(industry + ' ' + analysis.rawInput);
  const wantsSales = /sales|b2b|lead|revenue|client/i.test(industry + ' ' + analysis.rawInput);

  const departments = [
    { name: 'Executive', description: 'Leadership, coordination and strategic oversight.' },
  ];
  const agents: ProposedAgent[] = [
    {
      name: 'Orion',
      role: 'Executive Agent',
      department: 'Executive',
      responsibilities: ['Coordinate the AI workforce', 'Plan and delegate work', 'Report to the founder'],
      capabilities: ['planning', 'delegation', 'coordination'],
      tools: ['task_planning', 'delegate_task', 'memory_store', 'memory_retrieve'],
    },
  ];
  const goals: ProposedGoal[] = [
    {
      title: `Launch ${analysis.companyName || 'the company'} and validate the core offering`,
      description: `Turn "${analysis.description.slice(0, 160)}" into a working offering with clear next steps.`,
      priority: 'high',
    },
  ];
  const tasks: ProposedTask[] = [];

  if (wantsMarketing || wantsTech) {
    departments.push({ name: 'Marketing', description: 'Positioning, content and customer acquisition.' });
    agents.push({
      name: 'Mercury',
      role: 'Market Researcher',
      department: 'Marketing',
      responsibilities: ['Research competitors and market', 'Identify target customer segments', 'Surface positioning insights'],
      capabilities: ['research', 'analysis', 'competitive intelligence'],
      tools: ['web_search', 'research_competitors', 'analyze_market'],
    });
    tasks.push({
      title: 'Research the competitive landscape',
      description: `Identify direct competitors and market positioning for ${analysis.industry}.`,
      goalIndex: 0,
      agentRole: 'Market Researcher',
      priority: 'high',
    });
  }

  if (wantsTech) {
    departments.push({ name: 'Engineering', description: 'Product development and technical delivery.' });
    agents.push({
      name: 'Forge',
      role: 'Engineering Agent',
      department: 'Engineering',
      responsibilities: ['Scope technical work', 'Build and ship features', 'Review and test code'],
      capabilities: ['coding', 'architecture', 'testing'],
      tools: ['write_code', 'review_code', 'task_planning'],
    });
    tasks.push({
      title: 'Define the MVP technical scope',
      description: 'Break the core product into a buildable first version.',
      goalIndex: 0,
      agentRole: 'Engineering Agent',
      priority: 'high',
    });
  }

  if (wantsSales) {
    departments.push({ name: 'Sales', description: 'Prospecting, outreach and revenue.' });
    agents.push({
      name: 'Nova',
      role: 'Growth Agent',
      department: 'Sales',
      responsibilities: ['Identify prospects', 'Prepare outreach', 'Track pipeline'],
      capabilities: ['prospecting', 'copywriting', 'outreach'],
      tools: ['web_search', 'write_email', 'data_analysis'],
    });
    tasks.push({
      title: 'Build the initial prospect list',
      description: `Research and list early prospects for ${analysis.targetMarket || 'the target market'}.`,
      goalIndex: 0,
      agentRole: 'Growth Agent',
      priority: 'normal',
    });
  }

  // At least one task always
  if (tasks.length === 0) {
    tasks.push({
      title: 'Create the initial operating plan',
      description: 'Break the launch goal into concrete work items with owners.',
      goalIndex: 0,
      agentRole: 'Executive Agent',
      priority: 'high',
    });
  }

  return {
    departments,
    agents,
    goals,
    tasks,
    rationale: `A lean starting organization for a ${analysis.stage}-stage company in ${analysis.industry}.`,
  };
}

// ─── Step 3: Activation ─────────────────────────────────────────────────────

/**
 * Activate the approved plan — create departments, agents, goals and tasks
 * through the real ORQ8 services, then audit the whole operation.
 */
export async function activateCompany(
  db: Db,
  orgId: string,
  userId: string,
  plan: CompanyPlan,
): Promise<ActivationResult> {
  const result: ActivationResult = { departments: [], agents: [], goals: [], tasks: [], memoryCount: 0 };

  // 1. Departments
  const deptIdByName = new Map<string, string>();
  for (const d of plan.departments) {
    try {
      const created = await deptService.createDepartment(db, {
        orgId,
        name: d.name,
        description: d.description,
      });
      deptIdByName.set(d.name, created.id);
      result.departments.push({ id: created.id, name: d.name });
    } catch {
      // Departments table may be missing in some deployments — agents can
      // still be created with the department name only.
    }
  }

  // 2. AI Employees
  for (const a of plan.agents) {
    try {
      const deptId = deptIdByName.get(a.department) ?? null;
      const authority = {
        canCreateTasks: true,
        canExecuteTasks: true,
        canAccessCompanyInfo: true,
        canCommunicateExternally: false,
        canModifyResources: false,
        spendingLimitCents: 0,
        requiresApprovalFor: ['financial_commitments', 'external_communications', 'irreversible_actions', 'high_impact_decisions'],
        forbiddenActions: [],
      };
      const created = await agentsService.createAgent(db, {
        orgId,
        name: a.name,
        role: a.role,
        department: a.department,
        departmentId: deptId,
        status: 'active',
        capabilities: a.capabilities,
        authority,
        config: { tools: a.tools, onboarding_created: true },
      });
      result.agents.push({ id: created.id, name: created.name, role: created.role });
    } catch (err) {
      // Agent creation is best-effort per agent; a single failure shouldn't
      // abort the whole activation.
      console.error(`[company-builder] agent creation failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Goals
  const goalIdByIndex = new Map<number, string>();
  for (let i = 0; i < plan.goals.length; i++) {
    const g = plan.goals[i]!;
    try {
      const [goal] = await db
        .insert(goals)
        .values({
          orgId,
          title: g.title,
          description: g.description ?? null,
          priority: g.priority,
          status: 'active',
          progress: 0,
        })
        .returning();
      if (goal) {
        goalIdByIndex.set(i, goal.id);
        result.goals.push({ id: goal.id, title: goal.title });
      }
    } catch {
      // Skip goal on failure
    }
  }

  // 4. Tasks — assign to the matching created agent
  const agentByRole = new Map(result.agents.map((a) => [a.role.toLowerCase(), a]));
  for (const t of plan.tasks) {
    try {
      const goalId = goalIdByIndex.get(t.goalIndex) ?? null;
      const agent = agentByRole.get(t.agentRole.toLowerCase());
      const [task] = await db
        .insert(tasks)
        .values({
          orgId,
          title: t.title,
          description: t.description ?? null,
          goalId,
          agentId: agent?.id ?? null,
          status: 'pending',
          priority: t.priority,
        })
        .returning();
      if (task) result.tasks.push({ id: task.id, title: task.title });
    } catch {
      // Skip task on failure
    }
  }

  // 5. Memory — record that the company was activated
  try {
    await memoryService.createMemory(db, {
      orgId,
      category: 'decision',
      content: `Company activated on ${new Date().toISOString().slice(0, 10)} with ${result.departments.length} departments, ${result.agents.length} AI employees, ${result.goals.length} goals and ${result.tasks.length} initial tasks.`,
      importance: 8,
      source: 'company_builder:activation',
    });
    result.memoryCount = 1;
  } catch {
    // Non-fatal
  }

  // 6. Audit
  try {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'company.activated',
      outcome: 'success',
      resultRef: `departments:${result.departments.length};agents:${result.agents.length};goals:${result.goals.length};tasks:${result.tasks.length}`,
    });
  } catch {
    // Non-fatal
  }

  return result;
}