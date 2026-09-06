/**
 * ORQ8 Playbook / Template Seeding Service
 *
 * Turns "I just created my company" into "my company already has a functioning
 * AI organization" by seeding a coherent operating model from a deterministic
 * template — no LLM required, no manual configuration.
 *
 * Each playbook is a full operating model: company constitution + departments +
 * AI employees + initial goals + starter tasks. Seeding reuses the real ORQ8
 * services (company-builder activation, memory, audit) so a seeded company is
 * indistinguishable from a hand-built one.
 *
 * Idempotency: a company is seeded at most once per playbook. The guard is a
 * company-memory marker written at the end of a successful seed; re-running
 * returns { alreadySeeded: true } without touching anything.
 */

import { eq, and, ilike } from 'drizzle-orm';
import type { Db } from '@orq8/db';
import { organizations, companyMemory } from '@orq8/db';
import type { CompanyPlan, ActivationResult } from './company-builder.js';
import { activateCompany, fitPlanToAgentLimit } from './company-builder.js';
import * as memoryService from './memory.js';
import { appendAudit } from './audit.js';
import { ensureBuiltInCapabilities } from './capability-registry.js';
import { registerMcpServer } from './mcp.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlaybookConstitution {
  companyPurpose: string;
  values: string[];
  agentPolicies: {
    canDecide: string[];
    needsApproval: string[];
    neverAllowed: string[];
  };
  budgetPolicy: {
    dailyLimit: number;
    monthlyLimit: number;
    requiresApprovalAbove: number;
  };
  communicationPolicy: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface Playbook {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  constitution: PlaybookConstitution;
  plan: CompanyPlan;
}

export interface PlaybookSeedResult {
  slug: string;
  alreadySeeded: boolean;
  activation: ActivationResult | null;
  /** Present when the org plan capped the workforce below the playbook size. */
  agentLimitApplied?: { from: number; to: number };
}

// ─── Templates ──────────────────────────────────────────────────────────────

const STARTUP_CONSTITUTION: PlaybookConstitution = {
  companyPurpose: 'Ship a product customers love and reach first revenue.',
  values: ['Ship fast', 'Customer-obsessed', 'Evidence over opinion', 'Bias for action'],
  agentPolicies: {
    canDecide: ['internal_research', 'content_drafts', 'task_planning'],
    needsApproval: ['external_communications', 'financial_commitments', 'irreversible_actions'],
    neverAllowed: ['deleting_data', 'unauthorized_spending'],
  },
  budgetPolicy: { dailyLimit: 10000, monthlyLimit: 100000, requiresApprovalAbove: 5000 },
  communicationPolicy: 'Clear, concise and honest. Default to sharing progress with the founder.',
  riskTolerance: 'aggressive',
};

const ECOMMERCE_CONSTITUTION: PlaybookConstitution = {
  companyPurpose: 'Grow revenue by converting more visitors into repeat customers.',
  values: ['Conversion first', 'Customer trust', 'Data-driven merchandising', 'Operational rigor'],
  agentPolicies: {
    canDecide: ['product_research', 'campaign_drafts', 'support_triage'],
    needsApproval: ['external_communications', 'discounts_and_offers', 'financial_commitments'],
    neverAllowed: ['changing_prices_without_approval', 'deleting_orders'],
  },
  budgetPolicy: { dailyLimit: 20000, monthlyLimit: 200000, requiresApprovalAbove: 10000 },
  communicationPolicy: 'On-brand, helpful and consistent across every channel.',
  riskTolerance: 'moderate',
};

// ─── Engineering Department Model ────────────────────────────────────────────
// Real engineering positions with structured capabilities and connector
// capability strings, so the seeded agents participate in the capability model
// (MCP discovery, connector checks, tool gating) rather than being personas.

const ENGINEERING_DEPARTMENT = { name: 'Engineering', description: 'Product development and technical delivery.' };

interface EngineeringRole {
  name: string;
  role: string;
  responsibilities: string[];
  capabilities: string[];
  tools: string[];
}

const GH = {
  readRepos: 'github.read_repositories',
  readIssues: 'github.read_issues',
  readFiles: 'github.read_files',
  createIssues: 'github.create_issues',
  createPrs: 'github.create_pull_requests',
};

const GH_TOOLS = ['github_list_repositories', 'github_list_issues', 'github_read_file', 'github_create_issue', 'github_comment_on_issue', 'github_create_pull_request'];

/** Full engineering organization for product companies building software. */
const FULL_ENGINEERING_TEAM: EngineeringRole[] = [
  {
    name: 'Forge', role: 'Engineering Manager',
    responsibilities: ['Own engineering delivery end-to-end', 'Convert requirements into engineering plans', 'Assign, coordinate and review engineering work'],
    capabilities: ['engineering_management', 'planning', 'coordination', 'code_review', 'delegation', GH.readRepos, GH.readIssues],
    tools: ['create_plan', 'decompose_task', 'review_code', 'store_memory', 'search_memory', 'notify_founder', ...GH_TOOLS],
  },
  {
    name: 'Icarus', role: 'Software Architect',
    responsibilities: ['Design systems and service boundaries', 'Choose technology based on the existing stack', 'Produce architecture plans before any build'],
    capabilities: ['architecture', 'system_design', 'analysis', 'code_review', GH.readRepos, GH.readIssues, GH.readFiles],
    tools: ['create_plan', 'decompose_task', 'review_code', 'analyze_data', 'store_memory', 'search_memory', ...GH_TOOLS],
  },
  {
    name: 'Rigel', role: 'Backend Engineer',
    responsibilities: ['Build server-side systems, APIs and database logic', 'Integrate external services and webhooks', 'Keep authorization and RLS server-side'],
    capabilities: ['coding', 'backend', 'api_design', 'database', 'security', GH.readRepos, GH.readIssues, GH.readFiles, GH.createIssues],
    tools: ['write_code', 'review_code', 'create_plan', 'store_memory', 'search_memory', ...GH_TOOLS],
  },
  {
    name: 'Lyra', role: 'Frontend Engineer',
    responsibilities: ['Build the user-facing experience', 'Connect every interface to real backend state', 'Keep the UI accessible and responsive'],
    capabilities: ['coding', 'frontend', 'ui', 'accessibility', GH.readRepos, GH.readIssues, GH.readFiles, GH.createIssues],
    tools: ['write_code', 'review_code', 'create_plan', 'store_memory', 'search_memory', ...GH_TOOLS],
  },
  {
    name: 'Sentry', role: 'QA Engineer',
    responsibilities: ['Plan and run unit, integration and E2E tests', 'Verify behavior, not just compilation', 'Own regression testing and acceptance criteria'],
    capabilities: ['testing', 'quality', 'regression', 'analysis', GH.readRepos, GH.readIssues],
    tools: ['review_code', 'analyze_data', 'create_plan', 'store_memory', 'search_memory', 'github_list_issues', 'github_comment_on_issue'],
  },
  {
    name: 'Vault', role: 'DevOps / Security Engineer',
    responsibilities: ['Own deployments, environments and observability', 'Review security of every high-risk change', 'Never weaken security to make progress'],
    capabilities: ['deployment', 'security', 'infrastructure', 'monitoring', GH.readRepos, GH.createIssues],
    tools: ['create_plan', 'analyze_data', 'get_org_status', 'notify_founder', 'store_memory', 'search_memory', 'github_list_issues', 'github_comment_on_issue'],
  },
];

/** Lean engineering team for operating companies (e-commerce, agency). */
const SMALL_ENGINEERING_TEAM: EngineeringRole[] = [
  {
    name: 'Forge', role: 'Engineering Manager',
    responsibilities: ['Own engineering delivery end-to-end', 'Convert requirements into engineering plans', 'Assign, coordinate and review engineering work'],
    capabilities: ['engineering_management', 'planning', 'coordination', 'code_review', 'delegation', GH.readRepos, GH.readIssues],
    tools: ['create_plan', 'decompose_task', 'review_code', 'store_memory', 'search_memory', 'notify_founder', ...GH_TOOLS],
  },
  {
    name: 'Kestrel', role: 'Full-Stack Engineer',
    responsibilities: ['Handle self-contained features end-to-end', 'Build frontend, backend and database pieces', 'Test what is built'],
    capabilities: ['coding', 'backend', 'frontend', 'testing', GH.readRepos, GH.readIssues, GH.readFiles, GH.createIssues],
    tools: ['write_code', 'review_code', 'create_plan', 'store_memory', 'search_memory', ...GH_TOOLS],
  },
  {
    name: 'Beacon', role: 'QA Engineer',
    responsibilities: ['Verify features actually work', 'Run regression and failure tests', 'Own acceptance criteria'],
    capabilities: ['testing', 'quality', 'regression', 'analysis', GH.readRepos, GH.readIssues],
    tools: ['review_code', 'analyze_data', 'create_plan', 'store_memory', 'search_memory', 'github_list_issues', 'github_comment_on_issue'],
  },
];

const AGENCY_CONSTITUTION: PlaybookConstitution = {
  companyPurpose: 'Deliver exceptional client work on time, every time, and grow through referrals.',
  values: ['Client outcomes first', 'Delivery discipline', 'Radical transparency', 'Craftsmanship'],
  agentPolicies: {
    canDecide: ['research', 'drafting', 'scheduling_internal'],
    needsApproval: ['client_communications', 'scope_changes', 'financial_commitments', 'irreversible_actions'],
    neverAllowed: ['promising_unbilled_work', 'deleting_client_assets'],
  },
  budgetPolicy: { dailyLimit: 15000, monthlyLimit: 150000, requiresApprovalAbove: 7500 },
  communicationPolicy: 'Clients see status, not surprises. Internal updates default to shared.',
  riskTolerance: 'conservative',
};

const PLAYBOOKS: Playbook[] = [
  {
    slug: 'startup-launch',
    name: 'Startup Launch',
    tagline: 'Validate, build and launch your first product.',
    description: 'A lean operating model for pre-revenue startups: product validation, MVP build and first customer acquisition.',
    constitution: STARTUP_CONSTITUTION,
    plan: {
      rationale: 'A lean launch org: validate the problem, build the MVP, and acquire the first customers in parallel.',
      departments: [
        { name: 'Executive', description: 'Leadership, coordination and strategic oversight.' },
        { name: 'Product', description: 'Customer discovery, validation and product definition.' },
        { name: 'Growth', description: 'Positioning, content and customer acquisition.' },
        { name: 'Engineering', description: 'Product development and technical delivery.' },
      ],
      agents: [
        {
          name: 'Orion',
          role: 'Executive Agent',
          department: 'Executive',
          responsibilities: ['Coordinate the AI workforce', 'Plan and delegate work', 'Report to the founder'],
          capabilities: ['planning', 'delegation', 'coordination'],
          tools: ['task_planning', 'delegate_task', 'memory_store', 'memory_retrieve'],
        },
        {
          name: 'Nova',
          role: 'Market Researcher',
          department: 'Product',
          responsibilities: ['Research competitors and market', 'Identify target customer segments', 'Surface positioning insights'],
          capabilities: ['research', 'analysis', 'competitive intelligence'],
          tools: ['web_search', 'research_competitors', 'analyze_market'],
        },        {
          name: 'Atlas',
          role: 'Growth Agent',
          department: 'Growth',
          responsibilities: ['Create launch content', 'Draft outreach and landing copy', 'Track acquisition experiments'],
          capabilities: ['copywriting', 'content', 'outreach'],
          tools: ['web_search', 'write_email', 'create_content', 'data_analysis'],
        },
        ...FULL_ENGINEERING_TEAM.map(({ name, role, responsibilities, capabilities, tools }) => ({
          name, role, department: 'Engineering', responsibilities, capabilities, tools,
        })),
      ],
      goals: [
        { title: 'Validate the core problem with 10 target users', description: 'Interview or survey at least 10 people in the target market and document the evidence.', priority: 'urgent' },
        { title: 'Launch the MVP to the first 50 users', description: 'Ship the smallest product that delivers the core value and get 50 people using it.', priority: 'high' },
        { title: 'Establish a repeatable acquisition channel', description: 'Identify and prove one channel that consistently brings new users.', priority: 'normal' },
      ],
      tasks: [
        { title: 'Research the competitive landscape', description: 'Map direct and indirect competitors, their positioning and pricing.', goalIndex: 0, agentRole: 'Market Researcher', priority: 'high' },
        { title: 'Build the customer interview guide', description: 'Create a 15-question interview script focused on the core problem.', goalIndex: 0, agentRole: 'Market Researcher', priority: 'high' },
        { title: 'Define the MVP technical scope', description: 'Break the core product into a buildable first version.', goalIndex: 1, agentRole: 'Engineering Manager', priority: 'high' },
        { title: 'Design the system architecture', description: 'Produce the architecture plan for the MVP: services, data model and integrations.', goalIndex: 1, agentRole: 'Software Architect', priority: 'high' },
        { title: 'Draft the landing page and launch copy', description: 'Write the value proposition, hero copy and launch announcement.', goalIndex: 1, agentRole: 'Growth Agent', priority: 'normal' },
        { title: 'Define the QA and test plan', description: 'Create the acceptance criteria and test plan for the MVP build.', goalIndex: 1, agentRole: 'QA Engineer', priority: 'normal' },
        { title: 'Design the first acquisition experiment', description: 'Propose one channel experiment with success metrics and a two-week timeline.', goalIndex: 2, agentRole: 'Growth Agent', priority: 'normal' },
      ],
    },
  },
  {
    slug: 'ecommerce-growth',
    name: 'E-commerce Growth',
    tagline: 'Convert more visitors into repeat customers.',
    description: 'A growth-focused operating model for online stores: merchandising, acquisition, customer experience and operations.',
    constitution: ECOMMERCE_CONSTITUTION,
    plan: {
      rationale: 'A growth org for an operating store: improve conversion, scale acquisition and protect the customer experience.',
      departments: [
        { name: 'Executive', description: 'Leadership, coordination and strategic oversight.' },
        { name: 'Marketing', description: 'Acquisition, campaigns and merchandising.' },
        { name: 'Customer Experience', description: 'Support, retention and loyalty.' },
        { name: 'Operations', description: 'Inventory, fulfillment and back-office processes.' },
        ENGINEERING_DEPARTMENT,
      ],
      agents: [
        {
          name: 'Orion',
          role: 'Executive Agent',
          department: 'Executive',
          responsibilities: ['Coordinate the AI workforce', 'Plan and delegate work', 'Report to the founder'],
          capabilities: ['planning', 'delegation', 'coordination'],
          tools: ['task_planning', 'delegate_task', 'memory_store', 'memory_retrieve'],
        },
        {
          name: 'Aurora',
          role: 'Growth Agent',
          department: 'Marketing',
          responsibilities: ['Plan campaigns', 'Create product and email content', 'Analyze channel performance'],
          capabilities: ['marketing', 'copywriting', 'analytics'],
          tools: ['web_search', 'create_content', 'write_email', 'data_analysis'],
        },
        {
          name: 'Echo',
          role: 'Customer Experience Agent',
          department: 'Customer Experience',
          responsibilities: ['Draft support responses', 'Build the support playbook', 'Track satisfaction signals'],
          capabilities: ['support', 'empathy', 'retention'],
          tools: ['write_email', 'memory_store', 'memory_retrieve'],
        },
        {
          name: 'Vera',
          role: 'Operations Agent',
          department: 'Operations',
          responsibilities: ['Document operational processes', 'Audit inventory and fulfillment steps', 'Surface bottlenecks'],
          capabilities: ['operations', 'process', 'analysis'],
          tools: ['write_document', 'data_analysis', 'memory_store'],
        },
        ...SMALL_ENGINEERING_TEAM.map(({ name, role, responsibilities, capabilities, tools }) => ({
          name, role, department: 'Engineering', responsibilities, capabilities, tools,
        })),
      ],
      goals: [
        { title: 'Improve store conversion rate', description: 'Identify and fix the biggest conversion leaks in the purchase journey.', priority: 'high' },
        { title: 'Scale customer acquisition profitably', description: 'Grow traffic from the best-performing channel while keeping CAC in range.', priority: 'high' },
        { title: 'Reduce churn and grow repeat purchases', description: 'Turn one-time buyers into repeat customers through experience and retention work.', priority: 'normal' },
      ],
      tasks: [
        { title: 'Audit the product pages and checkout flow', description: 'Document conversion blockers on top product pages and the checkout.', goalIndex: 0, agentRole: 'Growth Agent', priority: 'high' },
        { title: 'Plan the next promotional campaign', description: 'Outline a campaign with audience, offer, channels and success metrics.', goalIndex: 1, agentRole: 'Growth Agent', priority: 'high' },
        { title: 'Draft the abandoned-cart recovery flow', description: 'Write the email sequence and timing for abandoned carts.', goalIndex: 0, agentRole: 'Growth Agent', priority: 'normal' },
        { title: 'Build the customer support playbook', description: 'Create response templates and escalation rules for common issues.', goalIndex: 2, agentRole: 'Customer Experience Agent', priority: 'normal' },
        { title: 'Document the fulfillment and inventory process', description: 'Map the current order-to-delivery process and flag risks.', goalIndex: 2, agentRole: 'Operations Agent', priority: 'normal' },
        { title: 'Prioritize the conversion fix backlog', description: 'Turn the page/checkout audit into a prioritized engineering backlog with acceptance criteria.', goalIndex: 0, agentRole: 'Engineering Manager', priority: 'normal' },
      ],
    },
  },
  {
    slug: 'agency-operations',
    name: 'Agency Operations',
    tagline: 'Deliver client work and grow through referrals.',
    description: 'A delivery-focused operating model for agencies: client success, project delivery and business development.',
    constitution: AGENCY_CONSTITUTION,
    plan: {
      rationale: 'A delivery org for an agency: win clients, onboard them cleanly, and deliver work that earns referrals.',
      departments: [
        { name: 'Executive', description: 'Leadership, coordination and strategic oversight.' },
        { name: 'Business Development', description: 'Pipeline, proposals and new business.' },
        { name: 'Client Success', description: 'Onboarding, communication and account health.' },
        { name: 'Delivery', description: 'Project planning, execution and quality.' },
        ENGINEERING_DEPARTMENT,
      ],
      agents: [
        {
          name: 'Orion',
          role: 'Executive Agent',
          department: 'Executive',
          responsibilities: ['Coordinate the AI workforce', 'Plan and delegate work', 'Report to the founder'],
          capabilities: ['planning', 'delegation', 'coordination'],
          tools: ['task_planning', 'delegate_task', 'memory_store', 'memory_retrieve'],
        },
        {
          name: 'Rhys',
          role: 'Business Development Agent',
          department: 'Business Development',
          responsibilities: ['Build the prospect list', 'Draft outreach and proposals', 'Track the pipeline'],
          capabilities: ['prospecting', 'proposals', 'outreach'],
          tools: ['web_search', 'write_email', 'write_document'],
        },
        {
          name: 'Cleo',
          role: 'Client Success Agent',
          department: 'Client Success',
          responsibilities: ['Build the client onboarding playbook', 'Draft client communications', 'Track account health signals'],
          capabilities: ['client_management', 'communication', 'retention'],
          tools: ['write_email', 'write_document', 'memory_store'],
        },
        {
          name: 'Vega',
          role: 'Delivery Agent',
          department: 'Delivery',
          responsibilities: ['Plan project kickoffs', 'Break work into milestones', 'Draft status reports'],
          capabilities: ['project_management', 'planning', 'quality'],
          tools: ['task_planning', 'write_document', 'review_code'],
        },
        ...SMALL_ENGINEERING_TEAM.map(({ name, role, responsibilities, capabilities, tools }) => ({
          name, role, department: 'Engineering', responsibilities, capabilities, tools,
        })),
      ],
      goals: [
        { title: 'Win and onboard the first three retained clients', description: 'Convert pipeline into signed, onboarded clients with a documented scope.', priority: 'urgent' },
        { title: 'Deliver projects on time and on scope', description: 'Every active project has a plan, owner and weekly status the client can see.', priority: 'high' },
        { title: 'Build a repeatable new-business pipeline', description: 'A steady flow of qualified prospects with tracked outreach.', priority: 'normal' },
      ],
      tasks: [
        { title: 'Build the initial prospect list', description: 'Research and list 20 target prospects with contact points.', goalIndex: 0, agentRole: 'Business Development Agent', priority: 'high' },
        { title: 'Draft the client onboarding playbook', description: 'Document the 5-step onboarding process from signed to kickoff.', goalIndex: 0, agentRole: 'Client Success Agent', priority: 'high' },
        { title: 'Create the project kickoff template', description: 'A repeatable kickoff doc: goals, scope, milestones, owners, cadence.', goalIndex: 1, agentRole: 'Delivery Agent', priority: 'high' },
        { title: 'Draft the capability one-pager', description: 'A short document describing services, process and proof points.', goalIndex: 2, agentRole: 'Business Development Agent', priority: 'normal' },
        { title: 'Design the weekly client status report', description: 'A template covering progress, blockers, decisions needed and next steps.', goalIndex: 1, agentRole: 'Delivery Agent', priority: 'normal' },
        { title: 'Define the delivery engineering workflow', description: 'Set up the repository, branch and review workflow for client delivery work.', goalIndex: 1, agentRole: 'Engineering Manager', priority: 'normal' },
      ],
    },
  },
];

// ─── Public API ─────────────────────────────────────────────────────────────

/** List available playbooks (metadata only — plans stay server-side). */
export function listPlaybooks(): Array<Pick<Playbook, 'slug' | 'name' | 'tagline' | 'description'>> {
  return PLAYBOOKS.map(({ slug, name, tagline, description }) => ({ slug, name, tagline, description }));
}

export function getPlaybook(slug: string): Playbook | undefined {
  return PLAYBOOKS.find((p) => p.slug === slug);
}

/**
 * Seed a playbook into an organization. Idempotent per playbook via a
 * company-memory marker; safe to retry after partial failure because the
 * marker is only written after a successful full activation.
 */
export async function seedPlaybook(
  db: Db,
  orgId: string,
  userId: string,
  slug: string,
  opts?: { enforceAgentLimit?: boolean },
): Promise<PlaybookSeedResult> {
  const playbook = getPlaybook(slug);
  if (!playbook) {
    throw new Error(`Unknown playbook: ${slug}`);
  }

  // Idempotency guard — re-running the same playbook is a no-op.
  const marker = `playbook_seeded:${slug}`;
  const existingMarker = await db
    .select({ id: companyMemory.id })
    .from(companyMemory)
    .where(and(eq(companyMemory.orgId, orgId), ilike(companyMemory.content, `%${marker}%`)))
    .limit(1);
  if (existingMarker.length > 0) {
    return { slug, alreadySeeded: true, activation: null };
  }

  // Constitution — merge into organizations.settings.constitution.
  await upsertConstitution(db, orgId, playbook.constitution);

  // Plan-aware sizing: when the founder explicitly opts in (e.g. Business
  // Import), the org's entitlement caps the seeded workforce — every
  // department keeps its lead, and roles fill up to the agent limit.
  let planToActivate = playbook.plan;
  let agentLimitApplied: { from: number; to: number } | undefined;
  if (opts?.enforceAgentLimit) {
    try {
      const { getCaps } = await import('./entitlements.js');
      const caps = await getCaps(db, orgId);
      const fitted = fitPlanToAgentLimit(playbook.plan, caps.maxAgents);
      if (fitted.limitedTo < fitted.limitedFrom) {
        planToActivate = fitted.plan;
        agentLimitApplied = { from: fitted.limitedFrom, to: fitted.limitedTo };
      }
    } catch {
      // Entitlement resolution failure must never block activation — seed the
      // full plan (previous behavior) rather than silently shrinking it.
      agentLimitApplied = undefined;
    }
  }

  // Departments, AI employees, goals and starter tasks — through the real
  // company-builder activation path.
  const activation = await activateCompany(db, orgId, userId, planToActivate);

  // Reusable capability surface: seed the capability registry (build-vs-buy)
  // and the connector-backed MCP tool catalogs the org can discover.
  try {
    await ensureBuiltInCapabilities(db, orgId);
    for (const provider of ['github', 'gmail', 'linear'] as const) {
      await registerMcpServer(db, {
        orgId,
        name: `${provider} MCP`,
        description: `Model Context Protocol server exposing ${provider} through the ORQ8 connector (capability-checked, approval-gated, audited).`,
        provider,
      });
    }
  } catch {
    // Non-fatal — the org is fully activated even if catalog seeding fails.
  }

  // Success marker — written only after activation completes.
  try {
    await memoryService.createMemory(db, {
      orgId,
      category: 'workflow',
      content: `Playbook seeded: ${slug} (${playbook.name}) — ${activation.departments.length} departments, ${activation.agents.length} AI employees, ${activation.goals.length} goals, ${activation.tasks.length} starter tasks${agentLimitApplied ? ` (workforce plan-limited from ${agentLimitApplied.from} to ${agentLimitApplied.to} AI employees by this plan — upgrade to unlock the full team)` : ''}.`,
      importance: 8,
      source: 'playbooks:seed',
    });
  } catch {
    // Marker is best-effort; activation itself already succeeded.
  }

  try {
    await appendAudit(db, {
      orgId,
      actorType: 'user',
      actorId: userId,
      action: 'playbook.seeded',
      outcome: 'success',
      resultRef: `${slug} — departments:${activation.departments.length};agents:${activation.agents.length};goals:${activation.goals.length};tasks:${activation.tasks.length}`,
    });
  } catch {
    // Non-fatal
  }

  return { slug, alreadySeeded: false, activation, agentLimitApplied };
}

/** Merge a playbook constitution into the org settings without clobbering other settings. */
async function upsertConstitution(db: Db, orgId: string, constitution: PlaybookConstitution): Promise<void> {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return;

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const current = (settings.constitution as Record<string, unknown>) ?? {};
  const merged = {
    ...current,
    ...constitution,
    agentPolicies: { ...(current.agentPolicies as Record<string, unknown> ?? {}), ...constitution.agentPolicies },
    budgetPolicy: { ...(current.budgetPolicy as Record<string, unknown> ?? {}), ...constitution.budgetPolicy },
    version: Number(current.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };

  await db
    .update(organizations)
    .set({ settings: { ...settings, constitution: merged } } satisfies Partial<typeof organizations.$inferInsert>)
    .where(eq(organizations.id, orgId));
}