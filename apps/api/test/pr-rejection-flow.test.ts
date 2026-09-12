import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  organizations,
  users,
  memberships,
  integrationProviders,
  repositories,
  repositoryPrs,
  approvals as approvalsTable,
  auditEvents,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

/**
 * §16 failure-path regression: the founder REJECTS a merge approval.
 *
 * Root cause fixed here: requestPrMergeApproval treated a linked approval as
 * idempotent regardless of status, so after a rejection the PR was permanently
 * stuck — re-requesting returned the dead rejected record and the merge gate
 * (requireApprovedPrMerge) could never pass again. Rejection must be final for
 * that request, not for the PR: the team addresses the feedback and re-requests.
 */

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
let orgId: string;
let userId: string;
let token = '';
let prId: string;

const auth = () => ({ authorization: `Bearer ${token}` });

async function cleanup(): Promise<void> {
  if (orgId) await deleteOrg(deps.pool, orgId);
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `pr-reject-${randomUUID()}`, slug: `pr-reject-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `pr-reject-${randomUUID()}@example.com`, name: 'Founder', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });

  const session = await createSession(deps.db, { userId, orgId });
  token = session.token;

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
      title: 'Rejectable feature',
      headBranch: 'feature/r',
      baseBranch: 'main',
      authorId: userId,
      authorType: 'agent',
      status: 'pending_review',
    })
    .returning();
  prId = pr!.id;
});

afterAll(async () => {
  if (!dbUp) return;
  await cleanup();
  await app?.close();
  await pool?.end().catch(() => undefined);
});

run('PR merge approval rejection flow (§16 failure path)', () => {
  it('request → approve gate blocks → founder REJECTS → merge gate reports rejection honestly', async () => {
    // 1. Request approval.
    const req1 = await app.inject({ method: 'POST', url: `/v1/prs/${prId}/request-approval`, headers: auth() });
    expect(req1.statusCode).toBe(201);
    const approvalId = req1.json().data.approval.id;

    // 2. Merge blocked while pending.
    const blocked = await app.inject({ method: 'PATCH', url: `/v1/prs/${prId}`, headers: auth(), payload: { status: 'merged' } });
    expect(blocked.statusCode).toBe(409);

    // 3. Founder rejects in Command Center.
    const rejected = await app.inject({ method: 'PATCH', url: `/v1/approvals/${approvalId}`, headers: auth(), payload: { status: 'rejected', note: 'Not ready' } });
    expect(rejected.statusCode).toBe(200);

    // 4. Merge still blocked — and the reason names the rejection (honest, not generic).
    const afterReject = await app.inject({ method: 'PATCH', url: `/v1/prs/${prId}`, headers: auth(), payload: { status: 'merged' } });
    expect(afterReject.statusCode).toBe(409);
    expect(afterReject.json().error.message).toContain('rejected');

    // 5. Re-request does NOT return the dead rejected record — a fresh approval is created.
    const req2 = await app.inject({ method: 'POST', url: `/v1/prs/${prId}/request-approval`, headers: auth() });
    expect(req2.statusCode).toBe(201);
    expect(req2.json().data.created).toBe(true);
    const approval2Id = req2.json().data.approval.id;
    expect(approval2Id).not.toBe(approvalId);

    // 6. The fresh approval gates merge normally (approve → merge succeeds).
    const approved = await app.inject({ method: 'PATCH', url: `/v1/approvals/${approval2Id}`, headers: auth(), payload: { status: 'approved' } });
    expect(approved.statusCode).toBe(200);
    const merged = await app.inject({ method: 'PATCH', url: `/v1/prs/${prId}`, headers: auth(), payload: { status: 'merged' } });
    expect(merged.statusCode).toBe(200);
    expect(merged.json().data.status).toBe('merged');

    // 7. Audit trail records the re-request distinctly.
    const audit = await deps.db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.orgId, orgId));
    const actions = audit.map((a) => a.action);
    expect(actions).toContain('pr.approval_requested');
    expect(actions).toContain('pr.approval_re_requested');
  });

  it('idempotency still holds for non-rejected approvals (pending re-request returns same record)', async () => {
    // prA-style behavior: a second request while one is pending must not duplicate.
    // Use a second PR in the same org.
    const [repo] = await deps.db.select().from(repositories).where(eq(repositories.orgId, orgId)).limit(1);
    const [pr2] = await deps.db
      .insert(repositoryPrs)
      .values({
        repositoryId: repo!.id,
        title: 'Idempotent feature',
        headBranch: 'feature/i',
        baseBranch: 'main',
        authorId: userId,
        authorType: 'agent',
        status: 'pending_review',
      })
      .returning();

    const first = await app.inject({ method: 'POST', url: `/v1/prs/${pr2!.id}/request-approval`, headers: auth() });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: `/v1/prs/${pr2!.id}/request-approval`, headers: auth() });
    expect(second.statusCode).toBe(200);
    expect(second.json().data.created).toBe(false);
    expect(second.json().data.approval.id).toBe(first.json().data.approval.id);
  });
});
