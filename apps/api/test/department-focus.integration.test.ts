import { loadConfig } from '@orq8/core';
import {
  createDb,
  agents,
  briefings,
  creditAlerts,
  creditReservations,
  creditTransactions,
  deals,
  departments,
  engineeringTasks,
  files,
  integrationProviders,
  knowledgeEntities,
  organizations,
  repositories,
  repositoryPrs,
  sandboxRuns,
  tickets,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findDetail } from '../src/services/departments.js';
import { deleteOrg } from './helpers/delete-org.js';

/**
 * Department focus read-models (docs/86 §6).
 *
 * A focus model is the one part of a department page that claims to show "this
 * department's actual work". These tests pin the three things that make that
 * claim honest, for every model:
 *   1. member-scoped rows are scoped to the department's own employees, so
 *      another department's work cannot appear on this page;
 *   2. workspace-wide rows are returned and labelled as such (they have no
 *      employee column to scope by);
 *   3. only a department whose template HAS a model receives the block at all —
 *      absent, not empty, so a page can tell the two apart;
 *   4. every read is org-scoped, so no model can enumerate another tenant's
 *      money, files or customers.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL:
    process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
} as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  dbUp = false;
}

const run = dbUp ? describe : describe.skip;
const { db } = createDb(config.DATABASE_URL);

const orgId = randomUUID();
const engDeptId = randomUUID();
const marketingDeptId = randomUUID();
const finDeptId = randomUUID();
const salesDeptId = randomUUID();
const successDeptId = randomUUID();
const opsDeptId = randomUUID();
const inDeptAgentId = randomUUID();
const otherDeptAgentId = randomUUID();
const finAgentId = randomUUID();
const salesAgentId = randomUUID();
const csAgentId = randomUUID();
const providerId = randomUUID();
const repoId = randomUUID();

run('department engineering focus', () => {
  beforeAll(async () => {
    await db.insert(organizations).values({
      id: orgId,
      name: `focus-test-${orgId.slice(0, 8)}`,
      slug: `focus-test-${orgId.slice(0, 8)}`,
    });

    await db.insert(departments).values([
      {
        id: engDeptId,
        orgId,
        name: 'Engineering',
        status: 'active',
        settings: { templateSlug: 'engineering', roles: ['engineering_lead'] },
      },
      { id: marketingDeptId, orgId, name: 'Marketing', status: 'active', settings: { templateSlug: 'marketing' } },
      // Finance carries a budget so the burn percentage has a denominator.
      { id: finDeptId, orgId, name: 'Finance', status: 'active', budget: 1000, settings: { templateSlug: 'finance' } },
      { id: salesDeptId, orgId, name: 'Sales', status: 'active', settings: { templateSlug: 'sales' } },
      { id: successDeptId, orgId, name: 'Customer Success', status: 'active', settings: { templateSlug: 'customer_success' } },
      // A template with no focus model at all — the control case.
      { id: opsDeptId, orgId, name: 'Operations', status: 'active', settings: { templateSlug: 'operations' } },
    ]);

    await db.insert(agents).values([
      {
        id: inDeptAgentId,
        orgId,
        name: 'Ada',
        role: 'engineering_lead',
        departmentId: engDeptId,
        status: 'active',
      },
      {
        id: otherDeptAgentId,
        orgId,
        name: 'Zed',
        role: 'engineering_lead',
        departmentId: marketingDeptId,
        status: 'active',
      },
      {
        id: finAgentId,
        orgId,
        name: 'Fran',
        role: 'financial_analyst',
        departmentId: finDeptId,
        status: 'active',
        // Lifetime burn the finance focus measures against the budget: 250 of
        // 1000 is 25%.
        creditsUsed: 250,
      },
      {
        id: salesAgentId,
        orgId,
        name: 'Sol',
        role: 'sales_representative',
        departmentId: salesDeptId,
        status: 'active',
      },
      {
        id: csAgentId,
        orgId,
        name: 'Cleo',
        role: 'customer_success_manager',
        departmentId: successDeptId,
        status: 'active',
      },
    ]);

    await db.insert(integrationProviders).values({
      id: providerId,
      orgId,
      name: 'GitHub',
      provider: 'github',
      status: 'connected',
    });

    await db.insert(repositories).values({
      id: repoId,
      orgId,
      name: 'orq8',
      fullName: 'Joshua-Onyekachukwu/orq8',
      owner: 'Joshua-Onyekachukwu',
      defaultBranch: 'main',
      providerId,
    });

    // One engineering task per agent: only Ada's may surface on Engineering.
    await db.insert(engineeringTasks).values([
      {
        orgId,
        repositoryId: repoId,
        branch: 'feat/ada',
        title: "Ada's implementation",
        status: 'implemented',
        assigneeId: inDeptAgentId,
      },
      {
        orgId,
        repositoryId: repoId,
        branch: 'feat/zed',
        title: "Zed's implementation",
        status: 'implemented',
        assigneeId: otherDeptAgentId,
      },
    ]);

    // One open PR per agent.
    await db.insert(repositoryPrs).values([
      {
        repositoryId: repoId,
        title: 'Ada opens a PR',
        headBranch: 'feat/ada',
        baseBranch: 'main',
        state: 'open',
        status: 'pending_review',
        authorId: inDeptAgentId,
        authorType: 'agent',
      },
      {
        repositoryId: repoId,
        title: "Zed's unrelated PR",
        headBranch: 'feat/zed',
        baseBranch: 'main',
        state: 'open',
        status: 'pending_review',
        authorId: otherDeptAgentId,
        authorType: 'agent',
      },
    ]);

    await db.insert(sandboxRuns).values({
      orgId,
      repositoryId: repoId,
      branch: 'feat/ada',
      command: 'pnpm test',
      workingDir: '.',
      state: 'running',
    });

    // ── Marketing: one asset per employee (member-scoped), one briefing
    //    (workspace-wide, no employee column).
    await db.insert(files).values([
      {
        orgId,
        name: 'launch-post.md',
        key: 'marketing/launch-post.md',
        mimeType: 'text/markdown',
        size: 2048,
        agentId: otherDeptAgentId,
      },
      {
        orgId,
        name: 'eng-diagram.png',
        key: 'eng/diagram.png',
        mimeType: 'image/png',
        size: 4096,
        agentId: inDeptAgentId,
      },
    ]);
    await db.insert(briefings).values({
      orgId,
      kind: 'weekly',
      periodStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      periodEnd: new Date(),
      status: 'delivered',
      deliveredAt: new Date(),
    });

    // ── Finance: spend and a live hold for the finance employee, a spend and a
    //    hold for someone else (must not leak), a company purchase, an unread
    //    balance alert.
    await db.insert(creditTransactions).values([
      {
        orgId,
        type: 'usage',
        amount: -3,
        description: 'Task execution',
        agentId: finAgentId,
      },
      {
        orgId,
        type: 'usage',
        amount: -4,
        description: 'Engineering task execution',
        agentId: inDeptAgentId,
      },
      { orgId, type: 'purchase', amount: 100, description: 'Credit top-up' },
    ]);
    await db.insert(creditReservations).values([
      {
        orgId,
        agentId: finAgentId,
        estimateCredits: 5,
        status: 'active',
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        orgId,
        agentId: inDeptAgentId,
        estimateCredits: 7,
        status: 'active',
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    await db.insert(creditAlerts).values({
      orgId,
      type: 'low_balance',
      threshold: 80,
      message: 'You have used 80% of your credits.',
    });

    // ── Accounts: customers the company knows, plus a non-customer entity that
    //    must not be counted as one.
    const acmeOne = (
      await db
        .insert(knowledgeEntities)
        .values({ orgId, type: 'customer', name: 'Acme One', summary: 'Pilot account' })
        .returning({ id: knowledgeEntities.id })
    )[0]!.id;
    await db.insert(knowledgeEntities).values([
      { orgId, type: 'customer', name: 'Acme Two' },
      { orgId, type: 'product', name: 'Widget' },
    ]);

    // ── Deals (migration 0054): the sales pipeline. Sol owns the department's
    //    deals; Ada (another department) owns one that must not leak; one deal
    //    is unowned and is counted workspace-wide only.
    const soon = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await db.insert(deals).values([
      {
        orgId,
        accountId: acmeOne,
        accountName: 'Acme One',
        title: 'Acme One pilot expansion',
        stage: 'proposal',
        valueCents: 500_000,
        probability: 60,
        ownerAgentId: salesAgentId,
        expectedCloseAt: soon,
        nextStep: 'Send the revised pricing',
      },
      {
        orgId,
        accountName: 'Acme Two',
        title: 'Acme Two seat upgrade',
        stage: 'negotiation',
        valueCents: 300_000,
        probability: 40,
        ownerAgentId: salesAgentId,
      },
      {
        orgId,
        accountName: 'Acme Two',
        title: 'Acme Two first order',
        stage: 'won',
        valueCents: 100_000,
        probability: 100,
        ownerAgentId: salesAgentId,
        closedAt: tenDaysAgo,
      },
      {
        orgId,
        accountName: 'Beacon Labs',
        title: 'Beacon Labs evaluation',
        stage: 'lost',
        valueCents: 200_000,
        probability: 0,
        ownerAgentId: salesAgentId,
        closedAt: tenDaysAgo,
      },
      {
        orgId,
        accountName: 'Beacon Labs',
        title: "Ada's deal (another department)",
        stage: 'discovery',
        valueCents: 999_000,
        probability: 10,
        ownerAgentId: inDeptAgentId,
      },
      {
        orgId,
        accountName: 'Fathom Suite',
        title: 'Unowned inbound lead',
        stage: 'qualifying',
        valueCents: 50_000,
        probability: 10,
      },
    ]);

    // ── Tickets (migration 0054): the customer-success queue. Cleo is on the
    //    department's tickets; Ada is on one that must not leak; one is
    //    unassigned and is counted workspace-wide only.
    await db.insert(tickets).values([
      {
        orgId,
        accountId: acmeOne,
        accountName: 'Acme One',
        subject: 'Login broken after upgrade',
        status: 'escalated',
        priority: 'urgent',
        channel: 'email',
        assigneeAgentId: csAgentId,
        slaDueAt: new Date(Date.now() - 60 * 60 * 1000),
        firstResponseAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      },
      {
        orgId,
        accountName: 'Acme Two',
        subject: 'Invoice copy request',
        status: 'open',
        priority: 'low',
        channel: 'portal',
        assigneeAgentId: csAgentId,
      },
      {
        orgId,
        accountName: 'Acme Two',
        subject: 'Onboarding call done',
        status: 'resolved',
        priority: 'normal',
        channel: 'chat',
        assigneeAgentId: csAgentId,
        firstResponseAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        resolvedAt: tenDaysAgo,
      },
      {
        orgId,
        accountName: 'Beacon Labs',
        subject: "Ada's ticket (another department)",
        status: 'open',
        priority: 'normal',
        assigneeAgentId: inDeptAgentId,
      },
      {
        orgId,
        accountName: 'Fathom Suite',
        subject: 'Unassigned inbound question',
        status: 'open',
        priority: 'high',
        slaDueAt: soon,
      },
    ]);
  });

  afterAll(async () => {
    if (pool) await deleteOrg(pool, orgId);
    await pool?.end();
  });

  it('scopes work and reviews to the department, and reports workspace repositories', async () => {
    const detail = await findDetail(db, orgId, engDeptId);
    expect(detail).toBeDefined();

    const focus = detail!.focus?.engineering;
    expect(focus).toBeDefined();

    // Member-scoped: Ada only, never Zed (the other department's employee).
    expect(focus!.work.map((w) => w.title)).toEqual(["Ada's implementation"]);
    expect(focus!.reviews.map((r) => r.title)).toEqual(["Ada opens a PR"]);

    // Workspace-wide, and labelled as such in the shape.
    expect(focus!.repositories.map((r) => r.name)).toEqual(["orq8"]);
    expect(focus!.sandbox).toHaveLength(1);

    // Counts agree with the rows that were returned.
    expect(focus!.counts.workOpen).toBe(1);
    expect(focus!.counts.workCompleted).toBe(0);
    expect(focus!.counts.reviewsOpen).toBe(1);
    expect(focus!.counts.sandboxRunning).toBe(1);
    expect(focus!.counts.repositories).toBe(1);
  });

  it('gives a template without a focus model no focus block at all', async () => {
    const detail = await findDetail(db, orgId, opsDeptId);
    expect(detail).toBeDefined();
    // Absent, not empty — a page must be able to tell the two apart.
    expect(detail!.focus).toBeUndefined();
  });

  it('scopes marketing assets to the department and reports briefings workspace-wide', async () => {
    const detail = await findDetail(db, orgId, marketingDeptId);
    const focus = detail!.focus?.marketing;
    expect(focus).toBeDefined();

    // Member-scoped: Zed's asset only — Ada is another department's employee.
    expect(focus!.assets.map((a) => a.name)).toEqual(['launch-post.md']);
    expect(focus!.counts.assets).toBe(1);
    expect(focus!.counts.assets30d).toBe(1);
    expect(focus!.counts.assetsBytes).toBe(2048);

    // Workspace-wide, and the shape says so rather than the page guessing.
    expect(focus!.briefings).toHaveLength(1);
    expect(focus!.counts.briefingsDelivered).toBe(1);
  });

  it('reports the finance department’s own spend, holds and budget', async () => {
    const detail = await findDetail(db, orgId, finDeptId);
    const focus = detail!.focus?.finance;
    expect(focus).toBeDefined();

    // The budget and the burn the page prints agree with the department's own
    // budgetBurnPct metric: 250 lifetime credits of a 1000 credit budget.
    expect(focus!.budget).toBe(1000);
    expect(focus!.counts.burnPct).toBe(25);

    // Member-scoped: Fran's spend, never Ada's.
    expect(focus!.counts.spendCredits30d).toBe(3);
    expect(focus!.spend.map((s) => s.agentId)).toEqual([finAgentId]);

    // Member-scoped holds: Fran's live hold, not Ada's.
    expect(focus!.counts.holdsActive).toBe(1);
    expect(focus!.counts.holdsCredits).toBe(5);
    expect(focus!.holds.map((h) => h.agentId)).toEqual([finAgentId]);

    // Workspace-wide: the purchase and the balance alert belong to the company.
    expect(focus!.counts.purchasesCredits30d).toBe(100);
    expect(focus!.purchases).toHaveLength(1);
    expect(focus!.counts.unreadAlerts).toBe(1);
    expect(focus!.alerts[0]?.type).toBe('low_balance');
  });

  it('builds the sales board from real deals, scoped to the department', async () => {
    const detail = await findDetail(db, orgId, salesDeptId);
    const focus = detail!.focus?.sales;
    expect(focus).toBeDefined();

    // Member-scoped: Sol's open deals only — never Ada's, and never the
    // unowned one, which belongs to the workspace rather than to a department.
    expect(focus!.pipeline.map((d) => d.title).sort()).toEqual([
      'Acme One pilot expansion',
      'Acme Two seat upgrade',
    ]);
    expect(focus!.counts.openDeals).toBe(2);

    // Value is the deals' own amounts, in cents.
    expect(focus!.counts.pipelineValueCents).toBe(800_000);
    // Weighted = 500000×60% + 300000×40% = 420000. An estimate, and labelled so.
    expect(focus!.counts.weightedValueCents).toBe(420_000);

    // Only the deal with an expected close inside 30 days counts as soon.
    expect(focus!.counts.closingSoon).toBe(1);

    // Terminal deals are counted by outcome, not shown as pipeline.
    expect(focus!.counts.won30d).toBe(1);
    expect(focus!.counts.lost30d).toBe(1);
    expect(focus!.counts.winRatePct).toBe(50);

    // The stage breakdown adds up to the open pipeline and nothing else.
    expect(focus!.stages.map((s) => [s.stage, s.count])).toEqual([
      ['qualifying', 0],
      ['discovery', 0],
      ['proposal', 1],
      ['negotiation', 1],
    ]);
    expect(focus!.stages.reduce((a, s) => a + s.valueCents, 0)).toBe(
      focus!.counts.pipelineValueCents,
    );

    // Unowned pipeline is counted, and counted workspace-wide.
    expect(focus!.counts.unassigned).toBe(1);

    // The account list is still there, as context rather than as the board.
    expect(focus!.accounts.map((a) => a.name).sort()).toEqual(['Acme One', 'Acme Two']);
    expect(focus!.counts.accounts).toBe(2);
  });

  it('builds the customer-success board from real tickets, scoped to the department', async () => {
    const detail = await findDetail(db, orgId, successDeptId);
    const focus = detail!.focus?.success;
    expect(focus).toBeDefined();

    // Member-scoped: Cleo's open tickets — never Ada's, never the unassigned one,
    // and never a resolved ticket (that is history, not queue).
    expect(focus!.queue.map((t) => t.subject)).toEqual([
      'Login broken after upgrade',
      'Invoice copy request',
    ]);
    expect(focus!.counts.open).toBe(2);
    expect(focus!.counts.escalated).toBe(1);
    expect(focus!.counts.urgent).toBe(1);

    // An open ticket past its due date is a breach; the resolved one is not.
    expect(focus!.counts.slaBreached).toBe(1);
    // The unresolved low-priority ticket has no first response yet.
    expect(focus!.counts.awaitingFirstResponse).toBe(1);
    // The resolved ticket is closed history and is counted as such.
    expect(focus!.counts.resolved30d).toBe(1);

    // Urgent sorts to the top of the queue — that is the point of a queue.
    expect(focus!.queue[0]?.priority).toBe('urgent');

    // Unassigned tickets belong to the workspace, not to this department.
    expect(focus!.counts.unassigned).toBe(1);

    expect(focus!.accounts.map((a) => a.name).sort()).toEqual(['Acme One', 'Acme Two']);
    expect(focus!.counts.accounts).toBe(2);
  });

  it('never leaks another org’s repositories into a focus model', async () => {
    const otherOrgId = randomUUID();
    await db.insert(organizations).values({
      id: otherOrgId,
      name: `focus-other-${otherOrgId.slice(0, 8)}`,
      slug: `focus-other-${otherOrgId.slice(0, 8)}`,
    });
    try {
      const otherDeptId = randomUUID();
      await db.insert(departments).values({
        id: otherDeptId,
        orgId: otherOrgId,
        name: 'Engineering',
        status: 'active',
        settings: { templateSlug: 'engineering' },
      });

      const detail = await findDetail(db, otherOrgId, otherDeptId);
      expect(detail!.focus?.engineering?.repositories).toEqual([]);
      expect(detail!.focus?.engineering?.sandbox).toEqual([]);
      expect(detail!.focus?.engineering?.work).toEqual([]);

      // The new models are org-scoped too: a fresh org has no assets, no
      // money and no accounts, whatever the neighbouring tenant has.
      const finDetail = await findDetail(db, otherOrgId, await seedFinDept(otherOrgId));
      expect(finDetail!.focus?.finance?.counts.spendCredits30d).toBe(0);
      expect(finDetail!.focus?.finance?.spend).toEqual([]);
      expect(finDetail!.focus?.finance?.purchases).toEqual([]);

      const salesDetail = await findDetail(db, otherOrgId, await seedSalesDept(otherOrgId));
      expect(salesDetail!.focus?.sales?.pipeline).toEqual([]);
      expect(salesDetail!.focus?.sales?.accounts).toEqual([]);
      expect(salesDetail!.focus?.sales?.counts).toMatchObject({
        openDeals: 0,
        pipelineValueCents: 0,
        unassigned: 0,
        winRatePct: null,
      });

      const successDetail = await findDetail(
        db,
        otherOrgId,
        await seedDept(otherOrgId, 'Customer Success', 'customer_success'),
      );
      expect(successDetail!.focus?.success?.queue).toEqual([]);
      expect(successDetail!.focus?.success?.accounts).toEqual([]);
      expect(successDetail!.focus?.success?.counts.open).toBe(0);
    } finally {
      if (pool) await deleteOrg(pool, otherOrgId);
    }
  });

  /** A finance department in a throwaway org, for the isolation checks. */
  async function seedFinDept(targetOrgId: string): Promise<string> {
    const id = randomUUID();
    await db
      .insert(departments)
      .values({ id, orgId: targetOrgId, name: 'Finance', status: 'active', settings: { templateSlug: 'finance' } });
    return id;
  }

  async function seedSalesDept(targetOrgId: string): Promise<string> {
    return seedDept(targetOrgId, 'Sales', 'sales');
  }

  /** Any template department in a throwaway org, for the isolation checks. */
  async function seedDept(targetOrgId: string, name: string, slug: string): Promise<string> {
    const id = randomUUID();
    await db
      .insert(departments)
      .values({ id, orgId: targetOrgId, name, status: 'active', settings: { templateSlug: slug } });
    return id;
  }
});
