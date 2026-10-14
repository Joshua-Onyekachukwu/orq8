/**
 * Role-Matrix Gate Integration Tests (Phase 1.3, risk R-002).
 *
 * Every mutation below controls credentials, external access, automation, org
 * policy, company structure activation, or org money. Before this fix any org
 * member could invoke them; now only owner/admin may. Members keep all daily
 * collaboration (goals, tasks, knowledge, hiring with safe defaults).
 *
 * Technique: gates sit immediately after requireAuth, so a member probe with
 * ANY body gets 403 with zero side effects, while the same probe as owner
 * sails past the gate (400/404/200 — anything but 403), proving no lockout
 * without touching Stripe, providers, or real credentials.
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

async function scopedSession(userId: string, orgId: string): Promise<string> {
  const { token } = await createSession(deps.db, { userId, orgId, ip: '127.0.0.1', userAgent: 'role-matrix-test' });
  return token;
}

const FAKE_ID = '00000000-0000-4000-8000-000000000000';

async function setup(): Promise<{ ownerToken: string; memberToken: string }> {
  const owner = await registerConfirmed('rm-owner');
  const memberUser = await registerConfirmed('rm-member');
  await deps.db.insert(memberships).values({ orgId: owner.orgId, userId: memberUser.userId, role: 'member', status: 'active' });
  const memberToken = await scopedSession(memberUser.userId, owner.orgId);
  return { ownerToken: owner.token, memberToken };
}

async function memberDenied(
  memberToken: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const res = await app.inject({ method, url, headers: { authorization: `Bearer ${memberToken}` }, payload });
  expect(res.statusCode, `${method} ${url} should be 403 for member (got ${res.statusCode})`).toBe(403);
}

async function ownerPasses(
  ownerToken: string,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const res = await app.inject({ method, url, headers: { authorization: `Bearer ${ownerToken}` }, payload });
  expect(res.statusCode, `${method} ${url} should NOT be 403 for owner (got ${res.statusCode})`).not.toBe(403);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('role matrix: privileged mutations require owner/admin', () => {
  it('denies members across credentials, integrations, automation, policy, structure, and billing', async () => {
    const { memberToken } = await setup();

    // Provider keys: full key lifecycle (add / edit controls / rotate / revoke / test).
    await memberDenied(memberToken, 'POST', '/v1/providers/keys', {});
    await memberDenied(memberToken, 'PATCH', `/v1/providers/keys/${FAKE_ID}`, {});
    await memberDenied(memberToken, 'POST', `/v1/providers/keys/${FAKE_ID}/rotate`, {});
    await memberDenied(memberToken, 'POST', `/v1/providers/keys/${FAKE_ID}/revoke`, {});
    await memberDenied(memberToken, 'POST', `/v1/providers/keys/${FAKE_ID}/test`, {});

    // Integrations: connect / reconfigure / disconnect org external accounts.
    await memberDenied(memberToken, 'POST', '/v1/integrations', {});
    await memberDenied(memberToken, 'PATCH', `/v1/integrations/${FAKE_ID}`, {});
    await memberDenied(memberToken, 'DELETE', `/v1/integrations/${FAKE_ID}`);

    // Agent ↔ integration power grants + capability/approval policy.
    await memberDenied(memberToken, 'POST', '/v1/agent-integration-access', {});
    await memberDenied(memberToken, 'DELETE', '/v1/agent-integration-access', { agentId: FAKE_ID, providerId: FAKE_ID });
    await memberDenied(memberToken, 'POST', '/v1/integration-capabilities', {});

    // MCP servers: arbitrary external tool servers for agents.
    await memberDenied(memberToken, 'POST', '/v1/mcp/servers', {});
    await memberDenied(memberToken, 'PATCH', `/v1/mcp/servers/${FAKE_ID}`, {});
    await memberDenied(memberToken, 'DELETE', `/v1/mcp/servers/${FAKE_ID}`);

    // Event rules: automation that triggers agent work, incl. approval bypass.
    await memberDenied(memberToken, 'PUT', '/v1/event-rules', {});
    await memberDenied(memberToken, 'DELETE', `/v1/event-rules/${FAKE_ID}`);

    // Org constitution: budget policy, agent policies, risk tolerance.
    await memberDenied(memberToken, 'PATCH', '/v1/constitution', {});

    // Company-builder activation: provisions departments + agents org-wide.
    await memberDenied(memberToken, 'POST', '/v1/company-builder/activate', {});

    // Demo-company seed: writes departments, agents, goals, tasks, pipeline org-wide.
    await memberDenied(memberToken, 'POST', '/v1/demo-company', {});

    // Billing: spend the company's money / manage subscription.
    await memberDenied(memberToken, 'POST', '/v1/billing/checkout', {});
    await memberDenied(memberToken, 'POST', '/v1/billing/portal', {});

    // ROI hourly rate: org financial configuration.
    await memberDenied(memberToken, 'PATCH', '/v1/roi/rate', { hourlyRate: 100 });
  });

  it('denies members plan ratify/reject but lets owners ratify (no lockout)', async () => {
    const { ownerToken, memberToken } = await setup();

    const created = await app.inject({
      method: 'POST',
      url: '/v1/plan-revisions',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { title: 'Member draft plan' },
    });
    // Drafting stays open to members; only the founder's ratify is gated.
    expect(created.statusCode).toBe(201);
    const revId = created.json().id as string;

    await memberDenied(memberToken, 'POST', `/v1/plan-revisions/${revId}/ratify`, {});
    await memberDenied(memberToken, 'POST', `/v1/plan-revisions/${revId}/reject`, {});
    await ownerPasses(ownerToken, 'POST', `/v1/plan-revisions/${revId}/ratify`, {});
  });

  it('closes the template-hire autonomy bypass: members cannot hire autonomous-template agents', async () => {
    const { ownerToken, memberToken } = await setup();

    const mkTemplate = async (slugSuffix: string, autonomy: string): Promise<string> => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/agent-templates',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: `Matrix ${slugSuffix}`,
          slug: `matrix-${slugSuffix}-${randomUUID().slice(0, 6)}`,
          role: 'tester',
          suggestedAutonomy: autonomy,
        },
      });
      expect(res.statusCode).toBe(201);
      return res.json().data.id as string;
    };

    const autonomousTpl = await mkTemplate('auto', 'autonomous');
    const safeTpl = await mkTemplate('safe', 'execute_with_approval');

    // Member hire of an autonomous-template agent → 403 (closes R-001 bypass).
    const blocked = await app.inject({
      method: 'POST',
      url: `/v1/agent-templates/${autonomousTpl}/hire`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {},
    });
    expect(blocked.statusCode).toBe(403);

    // Member hire from a safe template → 201 (collaboration preserved).
    const ok = await app.inject({
      method: 'POST',
      url: `/v1/agent-templates/${safeTpl}/hire`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload: {},
    });
    expect(ok.statusCode).toBe(201);

    // Owner hire of the autonomous template → 201 (no lockout).
    const ownerHire = await app.inject({
      method: 'POST',
      url: `/v1/agent-templates/${autonomousTpl}/hire`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {},
    });
    expect(ownerHire.statusCode).toBe(201);
  });

  it('lets owners past every new gate (anything but 403; no Stripe/provider side effects)', async () => {
    const { ownerToken } = await setup();

    // Empty bodies fail validation (400) or miss rows (404) — both prove the
    // role gate passed without reaching any external service.
    await ownerPasses(ownerToken, 'POST', '/v1/providers/keys', {});
    await ownerPasses(ownerToken, 'PATCH', `/v1/providers/keys/${FAKE_ID}`, {});
    await ownerPasses(ownerToken, 'POST', `/v1/providers/keys/${FAKE_ID}/rotate`, {});
    await ownerPasses(ownerToken, 'POST', `/v1/providers/keys/${FAKE_ID}/revoke`, {});
    await ownerPasses(ownerToken, 'POST', `/v1/providers/keys/${FAKE_ID}/test`, {});
    await ownerPasses(ownerToken, 'POST', '/v1/integrations', {});
    await ownerPasses(ownerToken, 'DELETE', `/v1/integrations/${FAKE_ID}`);
    await ownerPasses(ownerToken, 'POST', '/v1/agent-integration-access', {});
    await ownerPasses(ownerToken, 'POST', '/v1/integration-capabilities', {});
    await ownerPasses(ownerToken, 'POST', '/v1/mcp/servers', {});
    await ownerPasses(ownerToken, 'DELETE', `/v1/mcp/servers/${FAKE_ID}`);
    await ownerPasses(ownerToken, 'PUT', '/v1/event-rules', {});
    await ownerPasses(ownerToken, 'DELETE', `/v1/event-rules/${FAKE_ID}`);
    await ownerPasses(ownerToken, 'POST', '/v1/company-builder/activate', {});
    await ownerPasses(ownerToken, 'POST', '/v1/billing/checkout', {});

    // Safe writes with real effects confined to the synthetic test org.
    await ownerPasses(ownerToken, 'PATCH', '/v1/constitution', { riskTolerance: 'moderate' });
    await ownerPasses(ownerToken, 'PATCH', '/v1/roi/rate', { hourlyRate: 100 });
  });
});
