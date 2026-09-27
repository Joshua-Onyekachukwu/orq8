import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  agents,
  approvals,
  auditEvents,
  creditAlerts,
  decisions,
  goals,
  memberships,
  organizations,
  tasks,
  users,
} from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
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

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

interface OrgFixture {
  orgId: string;
  userId: string;
  token: string;
  auth: () => { authorization: string };
}

let app: FastifyInstance;
const fixtures: OrgFixture[] = [];

async function createOrgFixture(name: string): Promise<OrgFixture> {
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `${name}-${randomUUID()}`, slug: `${name}-${randomUUID()}` })
    .returning();
  const orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({
      email: `${name}-${randomUUID()}@example.com`,
      name: 'Founder',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      // Verified: the email-confirmation gate blocks unverified sessions.
      emailVerifiedAt: new Date(),
    })
    .returning();
  const userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
  const session = await createSession(deps.db, { userId, orgId });
  // Deliberately NOT pushed here: these fixtures are created with Promise.all,
  // so pushes would land in completion order and `fixtures[0]` would be a
  // random org from run to run. The caller records them in a fixed order.
  return {
    orgId,
    userId,
    token: session.token,
    auth: () => ({ authorization: `Bearer ${session.token}` }),
  };
}

interface AttentionResponse {
  items: Array<{
    id: string;
    source: string;
    severity: string;
    entity: { type: string; id: string };
    actions: Array<{ kind: string; endpoint?: string }>;
  }>;
  summary: { total: number; critical: number; warning: number; info: number; bySource: Record<string, number> };
  quiet: boolean;
  truncated: boolean;
}

async function getAttention(org: OrgFixture): Promise<AttentionResponse> {
  const res = await app.inject({ method: 'GET', url: '/v1/attention', headers: org.auth() });
  expect(res.statusCode).toBe(200);
  return res.json().data as AttentionResponse;
}

/** One item per source, all owned by org A, plus decoys that must not appear. */
const ids = {
  regularApproval: '',
  permissionApproval: '',
  decidedApproval: '',
  blockedTask: '',
  failedTask: '',
  completedTask: '',
  creditAlert: '',
  overdueGoal: '',
  escalation: '',
  foreignApproval: '',
};

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgA, orgB, quietOrg] = await Promise.all([
    createOrgFixture('attention-a'),
    createOrgFixture('attention-b'),
    createOrgFixture('attention-quiet'),
  ]);
  // Fixed order is part of the fixture contract: tests index by position.
  fixtures.push(orgA, orgB, quietOrg);

  // A real AI employee so items can name who is waiting.
  const [agentRow] = await deps.db
    .insert(agents)
    .values({ orgId: orgA.orgId, name: 'Atlas', role: 'executive_agent' })
    .returning();
  const agentId = agentRow!.id;

  const [regularApproval] = await deps.db
    .insert(approvals)
    .values({
      orgId: orgA.orgId,
      agentId,
      action: 'Approve the pilot launch budget',
      description: 'The pilot needs a paid channel budget to start.',
      cost: 25000,
      riskLevel: 'medium',
      status: 'pending',
    })
    .returning();
  ids.regularApproval = regularApproval!.id;

  const [permissionApproval] = await deps.db
    .insert(approvals)
    .values({
      orgId: orgA.orgId,
      agentId,
      action: 'Tool: Send external email',
      description: 'Agent "Atlas" wants to use tool "gmail.send".',
      cost: 0,
      riskLevel: 'high',
      status: 'pending',
    })
    .returning();
  ids.permissionApproval = permissionApproval!.id;

  const [decidedApproval] = await deps.db
    .insert(approvals)
    .values({
      orgId: orgA.orgId,
      action: 'Approve the office lease',
      status: 'approved',
      riskLevel: 'low',
      decidedAt: new Date(),
    })
    .returning();
  ids.decidedApproval = decidedApproval!.id;

  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const [blockedTask] = await deps.db
    .insert(tasks)
    .values({
      orgId: orgA.orgId,
      agentId,
      title: 'Migrate billing data',
      status: 'in_progress',
      priority: 'urgent',
      createdAt: fiveDaysAgo,
      updatedAt: fiveDaysAgo,
    })
    .returning();
  ids.blockedTask = blockedTask!.id;

  const [failedTask] = await deps.db
    .insert(tasks)
    .values({
      orgId: orgA.orgId,
      agentId,
      title: 'Draft the investor update',
      status: 'failed',
      priority: 'high',
      result: 'No model was available to run the task',
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    })
    .returning();
  ids.failedTask = failedTask!.id;

  const [completedTask] = await deps.db
    .insert(tasks)
    .values({ orgId: orgA.orgId, title: 'Already shipped', status: 'completed', priority: 'high' })
    .returning();
  ids.completedTask = completedTask!.id;

  const [creditAlert] = await deps.db
    .insert(creditAlerts)
    .values({
      orgId: orgA.orgId,
      type: 'critical',
      threshold: 99,
      message: 'Work Credits critically low, only 12 remaining.',
      metadata: { remaining: 12, total: 1000, utilizationPercent: 99 },
    })
    .returning();
  ids.creditAlert = creditAlert!.id;

  const [overdueGoal] = await deps.db
    .insert(goals)
    .values({
      orgId: orgA.orgId,
      title: 'Launch the Lagos pilot',
      status: 'active',
      progress: 40,
      priority: 'high',
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    })
    .returning();
  ids.overdueGoal = overdueGoal!.id;

  const [escalation] = await deps.db
    .insert(decisions)
    .values({
      orgId: orgA.orgId,
      title: 'Should we enter the Nigerian market this quarter?',
      decisionType: 'strategic',
      status: 'active',
      confidence: 'medium',
      decisionMakerType: 'ai_council',
      whatWasDecided: 'Recommend a limited pilot first.',
      councilDetail: { requiresFounderApproval: true } as never,
      decidedAt: new Date(),
    })
    .returning();
  ids.escalation = escalation!.id;

  // Org B holds a pending approval of its own: A must never see it.
  const [foreignApproval] = await deps.db
    .insert(approvals)
    .values({ orgId: orgB.orgId, action: 'Foreign org approval', status: 'pending', riskLevel: 'low' })
    .returning();
  ids.foreignApproval = foreignApproval!.id;
});

afterAll(async () => {
  if (!dbUp) return;
  for (const fixture of fixtures) {
    // decisions are not in deleteOrg's table list, so clear them explicitly.
    await deps.db.delete(decisions).where(eq(decisions.orgId, fixture.orgId)).catch(() => undefined);
    await deleteOrg(deps.pool, fixture.orgId);
  }
  await app?.close();
  await pool?.end().catch(() => undefined);
});

run("founder's attention aggregation — real rows, org scoping and actions", () => {
  it('aggregates every source from real rows, ordered by severity', async () => {
    const orgA = fixtures[0]!;
    const attention = await getAttention(orgA);

    expect(attention.quiet).toBe(false);
    expect(attention.truncated).toBe(false);
    expect(attention.summary.total).toBe(7);
    expect(attention.summary.bySource).toMatchObject({
      approval: 1,
      permission: 1,
      blocked_work: 1,
      failure: 1,
      credits: 1,
      deadline: 1,
      escalation: 1,
    });

    const entityIds = attention.items.map((i) => i.entity.id);
    expect(entityIds).toEqual(
      expect.arrayContaining([
        ids.regularApproval,
        ids.permissionApproval,
        ids.blockedTask,
        ids.failedTask,
        ids.creditAlert,
        ids.overdueGoal,
        ids.escalation,
      ]),
    );

    // Decided work and completed work never enter the queue.
    expect(entityIds).not.toContain(ids.decidedApproval);
    expect(entityIds).not.toContain(ids.completedTask);

    // Severity is non-decreasing, and decisions lead their severity band.
    const ranks = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
    const severitySequence = attention.items.map((i) => ranks[i.severity]!);
    expect(severitySequence).toEqual([...severitySequence].sort((a, b) => a - b));
    expect(attention.items[0]!.severity).toBe('critical');
    const firstWarning = severitySequence.indexOf(1);
    const firstInfo = severitySequence.indexOf(2);
    if (firstWarning !== -1) {
      const approvalsBeforeWarning = attention.items
        .slice(0, firstWarning)
        .filter((i) => i.source === 'approval' || i.source === 'permission');
      expect(approvalsBeforeWarning.length).toBeGreaterThan(0);
    }
    if (firstInfo !== -1) {
      const sourcesAfterInfo = new Set(attention.items.slice(firstInfo).map((i) => i.source));
      expect(sourcesAfterInfo.has('approval')).toBe(false);
    }
  });

  it('is isolated per organization in both directions', async () => {
    const [orgA, orgB] = fixtures as [OrgFixture, OrgFixture];

    const attentionA = await getAttention(orgA);
    expect(attentionA.items.some((i) => i.entity.id === ids.foreignApproval)).toBe(false);

    const attentionB = await getAttention(orgB);
    expect(attentionB.summary.total).toBe(1);
    expect(attentionB.items[0]!.entity.id).toBe(ids.foreignApproval);
    for (const id of Object.values(ids)) {
      if (id === ids.foreignApproval || id === '') continue;
      expect(attentionB.items.some((i) => i.entity.id === id)).toBe(false);
    }
  });

  it('reports an honest empty state for a company with nothing pending', async () => {
    const quietOrg = fixtures[2]!;
    const attention = await getAttention(quietOrg);
    expect(attention.quiet).toBe(true);
    expect(attention.items).toEqual([]);
    expect(attention.summary.total).toBe(0);
    expect(attention.summary.bySource.escalation).toBe(0);
  });

  it('clears each item through its real endpoint, leaves an audit trail, and ends quiet', async () => {
    const orgA = fixtures[0]!;

    // Approve a business decision.
    const approve = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${ids.regularApproval}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'approved' },
    });
    expect(approve.statusCode).toBe(200);

    // Deciding again is rejected, not silently repeated (idempotent decision).
    const approveAgain = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${ids.regularApproval}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'approved' },
    });
    expect(approveAgain.statusCode).toBe(404);

    // Reject a permission request.
    const rejectPermission = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${ids.permissionApproval}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'rejected' },
    });
    expect(rejectPermission.statusCode).toBe(200);

    // Retry failed work.
    const retry = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${ids.failedTask}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'pending' },
    });
    expect(retry.statusCode).toBe(200);

    // Cancel stalled work.
    const cancel = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${ids.blockedTask}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'cancelled' },
    });
    expect(cancel.statusCode).toBe(200);

    // Acknowledge the credit alert.
    const acknowledge = await app.inject({
      method: 'PATCH',
      url: `/v1/credits/alerts/${ids.creditAlert}/read`,
      headers: orgA.auth(),
    });
    expect(acknowledge.statusCode).toBe(200);

    // Record the founder verdict on the council escalation.
    const verdict = await app.inject({
      method: 'PATCH',
      url: `/v1/decisions/${ids.escalation}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { founderVerdict: 'approved' },
    });
    expect(verdict.statusCode).toBe(200);

    // Pause the goal behind the deadline risk.
    const pause = await app.inject({
      method: 'PATCH',
      url: `/v1/goals/${ids.overdueGoal}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'paused' },
    });
    expect(pause.statusCode).toBe(200);

    // Every action was audited.
    const auditRows = await deps.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(and(eq(auditEvents.orgId, orgA.orgId), eq(auditEvents.action, 'task.status_changed')));
    expect(auditRows.length).toBeGreaterThanOrEqual(2);

    // The queue is honestly empty again.
    const attention = await getAttention(orgA);
    expect(attention.quiet).toBe(true);
    expect(attention.items).toEqual([]);
  });

  it('never lets one org act on another org rows', async () => {
    const [orgA, orgB] = fixtures as [OrgFixture, OrgFixture];

    const foreignDecision = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${ids.foreignApproval}`,
      headers: { ...orgA.auth(), 'content-type': 'application/json' },
      payload: { status: 'approved' },
    });
    expect(foreignDecision.statusCode).toBe(404);

    const attentionB = await getAttention(orgB);
    expect(attentionB.summary.total).toBe(1);
    expect(attentionB.items[0]!.entity.id).toBe(ids.foreignApproval);
  });
});
