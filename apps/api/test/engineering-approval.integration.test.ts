import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  organizations,
  users,
  memberships,
  sessions,
  integrationProviders,
  repositories,
  repositoryPrs,
  engineeringTasks,
  approvals as approvalsTable,
  auditEvents,
  agents,
  departments,
  teams,
  goals,
  tasks,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

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

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let tokenA = '';
let tokenB = '';
let prA: string;
let prB: string;

const authA = () => ({ authorization: `Bearer ${tokenA}` });
const authB = () => ({ authorization: `Bearer ${tokenB}` });

async function cleanupAll(): Promise<void> {
  for (const id of [orgA, orgB].filter(Boolean)) {
    await deps.db.delete(sessions).where(eq(sessions.orgId, id));
    await deps.db.delete(agents).where(eq(agents.orgId, id));
    await deps.db.delete(tasks).where(eq(tasks.orgId, id));
    await deps.db.delete(goals).where(eq(goals.orgId, id));
    await deps.db.delete(teams).where(eq(teams.orgId, id));
    await deps.db.delete(departments).where(eq(departments.orgId, id));
    await deps.db.delete(auditEvents).where(eq(auditEvents.orgId, id));
    await deps.db.delete(memberships).where(eq(memberships.orgId, id));
    await deps.db.delete(organizations).where(eq(organizations.id, id));
  }
}

async function makeRepoPr(orgId: string, title: string): Promise<string> {
  const [provider] = await deps.db
    .insert(integrationProviders)
    .values({ orgId, name: 'GitHub', provider: 'github', status: 'connected', metadata: {} })
    .returning();
  const [repo] = await deps.db
    .insert(repositories)
    .values({
      orgId,
      name: 'test-repo',
      fullName: `owner/test-repo-${randomUUID().slice(0, 6)}`,
      owner: 'owner',
      defaultBranch: 'main',
      providerId: provider!.id,
      languages: [],
      filesCount: 0,
    })
    .returning();
  const [pr] = await deps.db
    .insert(repositoryPrs)
    .values({
      repositoryId: repo!.id,
      title,
      headBranch: 'feature/x',
      baseBranch: 'main',
      authorId: userA,
      authorType: 'agent',
      status: 'pending_review',
    })
    .returning();
  return pr!.id;
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgARow] = await deps.db
    .insert(organizations)
    .values({ name: `eng-approve-a-${randomUUID()}`, slug: `eng-approve-a-${randomUUID()}` })
    .returning();
  orgA = orgARow!.id;
  const [orgBRow] = await deps.db
    .insert(organizations)
    .values({ name: `eng-approve-b-${randomUUID()}`, slug: `eng-approve-b-${randomUUID()}` })
    .returning();
  orgB = orgBRow!.id;

  const [userARow] = await deps.db
    .insert(users)
    .values({ email: `eng-a-${randomUUID()}@example.com`, name: 'User A', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userA = userARow!.id;
  const [userBRow] = await deps.db
    .insert(users)
    .values({ email: `eng-b-${randomUUID()}@example.com`, name: 'User B', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userB = userBRow!.id;

  await deps.db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' });
  await deps.db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' });

  const sA = await createSession(deps.db, { userId: userA, orgId: orgA });
  const sB = await createSession(deps.db, { userId: userB, orgId: orgB });
  tokenA = sA.token;
  tokenB = sB.token;

  prA = await makeRepoPr(orgA, 'Add billing dashboard');
  prB = await makeRepoPr(orgB, 'Org B feature');
});

afterAll(async () => {
  if (!dbUp) return;
  await cleanupAll();
  await app?.close();
  await pool?.end().catch(() => undefined);
});

run('engineering PR merge approvals — central approvals integration', () => {
  it('request-approval creates a real pending record in the approvals table', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/prs/${prA}/request-approval`,
      headers: authA(),
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.approval.status).toBe('pending');
    expect(body.data.approval.action).toContain('Merge PR: Add billing dashboard');
    expect(body.data.created).toBe(true);

    const linked = await deps.db.select().from(repositoryPrs).where(eq(repositoryPrs.id, prA)).limit(1);
    expect(linked[0]?.approvalId).toBe(body.data.approval.id);
  });

  it('is idempotent — re-requesting returns the same approval, no duplicate', async () => {
    const first = await app.inject({
      method: 'POST',
      url: `/v1/prs/${prA}/request-approval`,
      headers: authA(),
    });
    const second = await app.inject({
      method: 'POST',
      url: `/v1/prs/${prA}/request-approval`,
      headers: authA(),
    });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.approval.id).toBe(first.json().data.approval.id);
    expect(second.json().data.created).toBe(false);

    const count = await deps.db
      .select({ id: approvalsTable.id })
      .from(approvalsTable)
      .where(eq(approvalsTable.orgId, orgA));
    expect(count.filter((a) => a.id === first.json().data.approval.id).length).toBe(1);
  });

  it('denies cross-org approval requests', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/prs/${prA}/request-approval`,
      headers: authB(),
    });
    expect(res.statusCode).toBe(404);
  });

  it('blocks direct status flips without an approval record', async () => {
    // prB has no approval requested — direct 'approved' must be rejected.
    const approved = await app.inject({
      method: 'PATCH',
      url: `/v1/prs/${prB}`,
      headers: authB(),
      payload: { status: 'approved' },
    });
    expect(approved.statusCode).toBe(409);
    expect(approved.json().error.code).toBe('pr_approval_blocked');
  });

  it('blocks merge while the approval is pending, then allows it after Command Center approval', async () => {
    // 1. Pending approval → merge blocked.
    const blockedMerge = await app.inject({
      method: 'PATCH',
      url: `/v1/prs/${prA}`,
      headers: authA(),
      payload: { status: 'merged' },
    });
    expect(blockedMerge.statusCode).toBe(409);

    // 2. Find the pending approval id.
    const rows = await deps.db.select().from(approvalsTable).where(eq(approvalsTable.orgId, orgA)).orderBy();
    const approval = rows.find((a) => a.action.startsWith('Merge PR:') && a.description?.includes(`prId:${prA}`));
    expect(approval).toBeDefined();

    // 3. Approve in Command Center (central decide) → PR auto-advances to approved.
    const decided = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approval!.id}`,
      headers: authA(),
      payload: { status: 'approved', note: 'LGTM' },
    });
    expect(decided.statusCode).toBe(200);

    const afterDecide = await deps.db.select().from(repositoryPrs).where(eq(repositoryPrs.id, prA)).limit(1);
    expect(afterDecide[0]?.status).toBe('approved');

    // 4. Merge now succeeds and is audited.
    const merged = await app.inject({
      method: 'PATCH',
      url: `/v1/prs/${prA}`,
      headers: authA(),
      payload: { status: 'merged' },
    });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().data.status).toBe('merged');

    const audit = await deps.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.orgId, orgA));
    const actions = audit.map((a) => a.action);
    expect(actions).toContain('pr.approval_requested');
    expect(actions).toContain('pr.approved_via_approval');
    expect(actions).toContain('pr.merged');
  });
});