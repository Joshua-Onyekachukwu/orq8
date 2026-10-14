/**
 * Agent-Governance Gate Integration Tests
 *
 * Regression guard for the agent-governance privilege-escalation fix: org
 * members (non-admins) must NOT be able to grant AI employees authority,
 * raise autonomy, change execution status, hire pre-authorized agents, run
 * performance governance actions, resume paused agents, or delete agents.
 * Only owner/admin roles may. Left open on purpose: reads, hiring with safe
 * defaults, benign profile edits (name), and the emergency-stop kill switch
 * (pausing a rogue agent must never require admin).
 *
 *   1. Member PATCH authority/autonomyLevel/status → 403
 *   2. Member POST /v1/agents with authority/autonomy overrides → 403
 *   3. Member performance-action (set_autonomy) → 403
 *   4. Member resume-all → 403
 *   5. Member PATCH status=archived (retirement) → 403
 *   (There is no DELETE /v1/agents route: removal happens through the
 *   status gate, which is covered here.)
 *   6. Owner PATCH authority → 200 (no lockout)
 *   7. Member PATCH name → 200 (collaboration preserved)
 *   8. Member emergency-stop → 200 (kill switch stays open)
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, memberships } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import type { AppDeps } from '../src/types.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.DATABASE_URL } as NodeJS.ProcessEnv);

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function registerConfirmed(tag: string): Promise<{ token: string; orgId: string; userId: string; email: string }> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
  });
  expect(res.statusCode).toBe(201);
  const { users: usersTable } = await import('@orq8/db');
  const { eq: eqFn } = await import('drizzle-orm');
  await deps.db.update(usersTable).set({ emailVerifiedAt: new Date() }).where(eqFn(usersTable.email, email.trim().toLowerCase()));
  return {
    token: res.json().data.token as string,
    orgId: res.json().data.org.id as string,
    userId: res.json().data.user.id as string,
    email,
  };
}

/** Mint a session for an existing user scoped to a (different) org they joined. */
async function scopedSession(userId: string, orgId: string): Promise<string> {
  const { token } = await createSession(deps.db, { userId, orgId, ip: '127.0.0.1', userAgent: 'governance-gate-test' });
  return token;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('agent-governance gate: members cannot escalate agents', () => {
  it('denies every governance mutation to a member, leaves safe paths open', async () => {
    const owner = await registerConfirmed('gov-owner');
    const memberUser = await registerConfirmed('gov-member');

    // Owner hires an agent; the member joins the OWNER's org as a plain member.
    const hire = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Gatekeeper Test Agent', role: 'tester' },
    });
    expect(hire.statusCode).toBe(201);
    const agentId = hire.json().data.id as string;

    await deps.db.insert(memberships).values({ orgId: owner.orgId, userId: memberUser.userId, role: 'member', status: 'active' });
    const memberToken = await scopedSession(memberUser.userId, owner.orgId);

    // 1–3 + 5. PATCH governance fields → 403
    for (const payload of [
      { authority: { spendingLimitCents: 99999999, canModifyResources: true } },
      { autonomyLevel: 'autonomous' },
      { status: 'paused' },
      { status: 'archived' },
    ]) {
      const res = await app.inject({
        method: 'PATCH',
        url: `/v1/agents/${agentId}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload,
      });
      expect(res.statusCode, `PATCH ${JSON.stringify(payload)} should be 403 for member`).toBe(403);
    }

    // 4. Hiring a pre-authorized agent → 403
    const hiredArmed = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {
        name: 'Sleeper Agent',
        role: 'tester',
        autonomyLevel: 'autonomous',
        authority: { spendingLimitCents: 500000, canModifyResources: true, requiresApprovalFor: [] },
      },
    });
    expect(hiredArmed.statusCode).toBe(403);

    // 5. Performance governance action → 403
    const perf = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentId}/performance-action`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { action: 'set_autonomy', autonomyLevel: 'autonomous', reason: 'escalation probe' },
    });
    expect(perf.statusCode).toBe(403);

    // 6. Resume-all → 403
    const resumeAll = await app.inject({
      method: 'POST',
      url: '/v1/agents/resume-all',
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(resumeAll.statusCode).toBe(403);


    // 7. Owner governance still works (no lockout)
    const ownerPatch = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { authority: { spendingLimitCents: 1000 } },
    });
    expect(ownerPatch.statusCode).toBe(200);

    // 8. Member benign edit still works
    const memberRename = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { name: 'Renamed By Member' },
    });
    expect(memberRename.statusCode).toBe(200);

    // 9. Member kill switch stays open
    const stop = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentId}/emergency-stop`,
      headers: { authorization: `Bearer ${memberToken}` },
    });
    expect(stop.statusCode).toBe(200);
  });

  it('lets a member hire with safe defaults', async () => {
    const owner = await registerConfirmed('gov-owner2');
    const memberUser = await registerConfirmed('gov-member2');
    await deps.db.insert(memberships).values({ orgId: owner.orgId, userId: memberUser.userId, role: 'member', status: 'active' });
    const memberToken = await scopedSession(memberUser.userId, owner.orgId);

    const hire = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { name: 'Default Hire', role: 'assistant' },
    });
    expect(hire.statusCode).toBe(201);
  });
});
