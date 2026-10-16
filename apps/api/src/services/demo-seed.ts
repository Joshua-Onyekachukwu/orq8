import { count, eq } from 'drizzle-orm';
import {
  activityEvents,
  agents,
  approvals,
  deals,
  decisions,
  departments,
  goals,
  knowledgeEntities,
  tasks,
  tickets,
  type Db,
} from '@orq8/db';
import { createAgent } from './agents.js';
import { createApproval } from './approvals.js';
import { createDepartment, defaultPageConfig } from './departments.js';
import { updateOrg } from './orgs.js';
import { appendAudit } from './audit.js';

/**
 * One-click demo company (MVP-020).
 *
 * Seeds the caller's EMPTY org with a small living company — Northwind Labs —
 * so a prospect sees every board working: departments with focus read-models,
 * three AI employees with personas, goals, tasks in every state that matters
 * (in-progress, completed with results, awaiting approval, pending), an open
 * approval gate, a sales pipeline, a support queue, decisions and an activity
 * feed. The org is flagged `isDemo`, which every screen already badges.
 *
 * What this deliberately does NOT do (unlike the review-stack seeder it is
 * adapted from):
 *   - no money movement: no credit purchases, usage rows, reservations or
 *     alerts. Fabricating ledger rows would poison billing aggregates.
 *   - no execution: no EA command, no task run, no background ticker. All
 *     rows are sample records; nothing spends real model calls.
 *   - no privilege changes: no platform admin, no onboarding-state edits.
 *   - exactly 3 agents: the trial plan caps at 3, so the seed never needs an
 *     entitlement bypass (see services/entitlements.ts TRIAL_CAPS).
 *
 * Guards live in the route (owner/admin, org empty, not already demo, global
 * rate limit, audit row `demo.seeded`). This module assumes them and only
 * writes rows scoped to `orgId`.
 */

const FULL_AUTHORITY = {
  canCreateTasks: true,
  canExecuteTasks: true,
  canAccessCompanyInfo: true,
  canCommunicateExternally: false,
  canModifyResources: false,
  spendingLimitCents: 0,
  requiresApprovalFor: [
    'financial_commitments',
    'external_communications',
    'irreversible_actions',
    'high_impact_decisions',
  ],
  forbiddenActions: [],
};

export async function isOrgEmpty(db: Db, orgId: string): Promise<boolean> {
  const [[a], [t], [g], [d]] = await Promise.all([
    db.select({ n: count() }).from(agents).where(eq(agents.orgId, orgId)),
    db.select({ n: count() }).from(tasks).where(eq(tasks.orgId, orgId)),
    db.select({ n: count() }).from(goals).where(eq(goals.orgId, orgId)),
    db.select({ n: count() }).from(departments).where(eq(departments.orgId, orgId)),
  ]);
  return (a?.n ?? 0) === 0 && (t?.n ?? 0) === 0 && (g?.n ?? 0) === 0 && (d?.n ?? 0) === 0;
}

export interface DemoSeedSummary {
  departments: number;
  agents: number;
  goals: number;
  tasks: number;
  approvals: number;
  deals: number;
  tickets: number;
  decisions: number;
}

export async function seedDemoCompany(db: Db, orgId: string, userId: string): Promise<DemoSeedSummary> {
  // ── Departments (3, each carrying its focus read-model) ────────────────
  const engineering = await createDepartment(db, {
    orgId,
    name: 'Engineering',
    description: 'Builds and ships the product surface: pages, APIs, deploys.',
  });
  const communications = await createDepartment(db, {
    orgId,
    name: 'Communications',
    description: 'Public copy, briefings and newsletters. Publishes only through a gate.',
  });
  const growth = await createDepartment(db, {
    orgId,
    name: 'Growth',
    description: 'Demand, positioning and waitlist conversion.',
  });
  const blueprint = async (
    id: string,
    slug: string,
    roles: string[],
    kpis: string[],
    typicalGoals: string[],
  ): Promise<void> => {
    await db
      .update(departments)
      .set({
        settings: {
          templateSlug: slug,
          roles: roles.map((name) => ({ name })),
          kpis: kpis.map((name) => ({ name })),
          typicalGoals: typicalGoals.map((name) => ({ name })),
          pageConfig: defaultPageConfig(slug),
        },
        updatedAt: new Date(),
      })
      .where(eq(departments.id, id));
  };
  await blueprint(
    engineering.id as string,
    'engineering',
    ['engineering_lead', 'software_engineer', 'operations_manager'],
    ['Lead time', 'Change failure rate', 'Test coverage'],
    ['Ship the pricing page', 'Cut the p95 build time'],
  );
  await blueprint(
    communications.id as string,
    'marketing',
    ['communications_agent', 'content_writer'],
    ['Assets published', 'Briefing delivery rate'],
    ['Ship the launch announcement', 'Grow the waitlist'],
  );
  await blueprint(
    growth.id as string,
    'sales',
    ['market_researcher', 'sales_representative'],
    ['Pipeline value', 'Win rate', 'Deals closed'],
    ['Convert the waitlist to paid pilots'],
  );

  // ── Employees (3 — the trial cap, no bypass) ───────────────────────────
  const ridge = await createAgent(db, {
    orgId,
    name: 'Ridge',
    role: 'software_engineer',
    departmentId: engineering.id,
    status: 'active',
    // Fixtures obey the trial ceiling too (P2 tier gate) — staged content
    // must never showcase a tier the plan cannot grant.
    autonomyLevel: 'execute_with_approval',
    capabilities: ['software_engineer', 'frontend', 'api', 'testing'],
    authority: FULL_AUTHORITY,
    config: {
      systemPrompt:
        'You are Ridge, the Engineer of Northwind Labs. You build and ship the product surface: pages, APIs and deploys. You verify your own work before reporting it done, and pushes to production go through the founder.',
    },
    currentTask: 'Pricing page build',
    creditsUsed: 0,
    weeklyCost: 0,
    tasksCompleted: 1,
    tasksFailed: 0,
    lastActiveAt: new Date(),
  });
  const ember = await createAgent(db, {
    orgId,
    name: 'Ember',
    role: 'communications_agent',
    departmentId: communications.id,
    status: 'active',
    autonomyLevel: 'execute_with_approval',
    capabilities: ['communications_agent', 'copywriting', 'email', 'announcements'],
    authority: FULL_AUTHORITY,
    config: {
      systemPrompt:
        'You are Ember, the Communications lead of Northwind Labs. You draft all public copy in a clear, warm voice — but you never publish externally yourself: publishing always goes through the founder\u2019s approval.',
    },
    currentTask: 'Publish the pricing post',
    creditsUsed: 0,
    weeklyCost: 0,
    tasksCompleted: 1,
    tasksFailed: 0,
    lastActiveAt: new Date(),
  });
  const milo = await createAgent(db, {
    orgId,
    name: 'Milo',
    role: 'market_researcher',
    departmentId: growth.id,
    status: 'active',
    // Same trial-ceiling rule as Ridge above.
    autonomyLevel: 'execute_with_approval',
    capabilities: ['market_researcher', 'growth', 'outreach', 'campaigns'],
    authority: FULL_AUTHORITY,
    config: {
      systemPrompt:
        'You are Milo, the Growth lead of Northwind Labs. You own outreach, campaigns and waitlist conversion. Growth work that costs money is proposed, never started silently.',
    },
    creditsUsed: 0,
    weeklyCost: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    lastActiveAt: new Date(),
  });
  const agentIds = {
    ridge: ridge.id as string,
    ember: ember.id as string,
    milo: milo.id as string,
  };

  // ── Goals + tasks (one live week, records only) ────────────────────────
  const [goal1] = await db
    .insert(goals)
    .values({
      orgId,
      title: 'Announce the new pricing page',
      description: 'Ship the public pricing page and announce it to the waitlist.',
      status: 'active',
      progress: 64,
      priority: 'high',
    })
    .returning();
  const [goal2] = await db
    .insert(goals)
    .values({
      orgId,
      title: 'Convert waitlist to trials',
      description: 'Turn the waitlist into activated trials after the pricing announcement.',
      status: 'active',
      progress: 8,
      priority: 'normal',
    })
    .returning();
  if (!goal1 || !goal2) throw new Error('demo seed: goals insert returned no rows');
  const task = async (row: Record<string, unknown>): Promise<string> => {
    const [t] = await db.insert(tasks).values({ orgId, ...row } as never).returning();
    if (!t) throw new Error('demo seed: tasks insert returned no row');
    return t.id as string;
  };
  await task({
    goalId: goal1.id,
    agentId: agentIds.ridge,
    title: 'Pricing page build',
    description: 'Build the public pricing page: three tiers, annual toggle, FAQ.',
    status: 'in_progress',
    priority: 'high',
    cost: 0,
  });
  await task({
    goalId: goal1.id,
    agentId: agentIds.ridge,
    title: 'Competitor page screenshots',
    description: 'Screenshot and archive the competitor pricing pages.',
    status: 'completed',
    priority: 'normal',
    cost: 0,
    result: 'Screenshots archived for all three competitor pricing pages and filed in company memory.',
  });
  await task({
    goalId: goal1.id,
    agentId: agentIds.ember,
    title: 'Weekly metrics baseline',
    description: 'Record this week\u2019s baseline: signups, activation, revenue.',
    status: 'completed',
    priority: 'normal',
    cost: 0,
    result: 'Baseline recorded: 412 signups, 9.4% activation, $1,204 MRR. No anomalies vs. last week.',
  });
  const publishTaskId = await task({
    goalId: goal1.id,
    agentId: agentIds.ember,
    title: 'Publish the pricing post',
    description: 'Publish the pricing announcement to the company blog and newsletter.',
    status: 'awaiting_approval',
    priority: 'high',
    cost: 0,
  });
  await task({
    goalId: goal2.id,
    agentId: agentIds.ember,
    title: 'Draft launch email to waitlist',
    description: 'Draft the launch email announcing the new pricing.',
    status: 'pending',
    priority: 'normal',
    cost: 0,
  });

  // ── The open gate ──────────────────────────────────────────────────────
  await createApproval(db, {
    orgId,
    agentId: agentIds.ember,
    action: 'Publish the pricing post',
    description:
      'Ember wants to publish the pricing announcement to the company blog and newsletter. Authority: may draft, may not publish externally.',
    cost: 2500,
    riskLevel: 'medium',
    status: 'pending',
    taskId: publishTaskId,
  } as never);

  // ── Pipeline + queue (records; accounts as knowledge entities) ─────────
  const [acme] = await db
    .insert(knowledgeEntities)
    .values({
      orgId,
      type: 'customer',
      name: 'Acme Collective',
      summary: 'Twelve-agency pilot cohort, monthly reporting.',
      source: 'demo_seed',
    })
    .returning();
  const [beacon] = await db
    .insert(knowledgeEntities)
    .values({
      orgId,
      type: 'customer',
      name: 'Beacon Labs',
      summary: 'Evaluating the studio plan; needs SSO before signing.',
      source: 'demo_seed',
    })
    .returning();
  if (acme && beacon) {
    await db.insert(deals).values([
      {
        orgId,
        accountId: acme.id,
        accountName: 'Acme Collective',
        title: 'Acme pilot to studio upgrade',
        stage: 'proposal',
        valueCents: 1450000,
        probability: 60,
        ownerAgentId: agentIds.milo,
        nextStep: 'Send the revised studio pricing',
      },
      {
        orgId,
        accountId: beacon.id,
        accountName: 'Beacon Labs',
        title: 'Beacon Labs first order',
        stage: 'negotiation',
        valueCents: 480000,
        probability: 45,
        ownerAgentId: agentIds.milo,
        nextStep: 'Confirm SSO timeline, then send the order form',
      },
      {
        orgId,
        accountId: acme.id,
        accountName: 'Acme Collective',
        title: 'Acme starter pilot',
        stage: 'won',
        valueCents: 290000,
        probability: 100,
        ownerAgentId: agentIds.milo,
      },
    ] as never);
    await db.insert(tickets).values([
      {
        orgId,
        accountId: acme.id,
        accountName: 'Acme Collective',
        subject: 'Login broken for two of our agencies',
        body: 'SSO redirect loops after the last deploy. Blocking their Monday reports.',
        status: 'escalated',
        priority: 'urgent',
        channel: 'email',
        assigneeAgentId: agentIds.milo,
      },
      {
        orgId,
        accountId: beacon.id,
        accountName: 'Beacon Labs',
        subject: 'Invoice copy for our finance team',
        body: 'They need last month\u2019s invoice as PDF.',
        status: 'open',
        priority: 'low',
        channel: 'portal',
        assigneeAgentId: null,
      },
      {
        orgId,
        accountId: acme.id,
        accountName: 'Acme Collective',
        subject: 'Onboarding call went well',
        body: 'Three agencies onboarded; two still need their brand colour.',
        status: 'resolved',
        priority: 'normal',
        channel: 'chat',
        assigneeAgentId: agentIds.milo,
      },
    ] as never);
  }

  // ── Decisions + activity (so the feed and Decision Center open non-empty)
  await db.insert(decisions).values([
    {
      orgId,
      title: 'Price the starter plan at $29 per month',
      decisionType: 'pricing',
      status: 'active',
      confidence: 'high',
      decisionMakerType: 'user',
      decisionMakerName: 'Founder',
      whatWasDecided: 'Starter is $29/mo per agency; Studio is $79/mo unlimited clients.',
      rationale: 'Design partners anchor value per agency, not per seat.',
      expectedOutcome: '10 paying agencies at blended ARPU above $35.',
    },
    {
      orgId,
      title: 'Move the pricing launch to Friday',
      decisionType: 'operational',
      status: 'active',
      confidence: 'medium',
      decisionMakerType: 'agent',
      decisionMakerName: 'Atlas (Executive Agent)',
      whatWasDecided: 'Launch announcement moves to Friday.',
      rationale: 'Announcing before checkout works would burn the waitlist\u2019s first impression.',
      expectedOutcome: 'Launch lands with a working checkout and a same-day newsletter.',
    },
  ] as never);
  await db.insert(activityEvents).values([
    { orgId, agentId: agentIds.ember, type: 'approval_requested', summary: 'Ember requests approval: publish the pricing post', cost: 0, department: 'Communications' },
    { orgId, agentId: agentIds.ridge, type: 'task_started', summary: 'Pricing page build', cost: 0, department: 'Engineering' },
    { orgId, agentId: agentIds.ridge, type: 'task_completed', summary: 'Competitor page screenshots archived', cost: 0, department: 'Engineering' },
    { orgId, agentId: agentIds.ember, type: 'task_completed', summary: 'Weekly metrics baseline recorded — 412 signups, 9.4% activation', cost: 0, department: 'Communications' },
    { orgId, agentId: agentIds.milo, type: 'analyzed', summary: 'Waitlist segments ranked by trial likelihood', cost: 0, department: 'Growth' },
  ] as never);

  // ── Badge it ───────────────────────────────────────────────────────────
  await updateOrg(db, orgId, { isDemo: true });
  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'demo.seeded',
    outcome: 'success',
  });

  return { departments: 3, agents: 3, goals: 2, tasks: 5, approvals: 1, deals: 3, tickets: 3, decisions: 2 };
}
