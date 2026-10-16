import { createLogger, loadConfig } from '@orq8/core';
import { createDb, subscriptions, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

// P2 (Phase 4, non-payment part): Founder phased vs Company full map.
// Trial/Founder top out at execute_with_approval; autonomous unlocks at
// Team/Company. The gate must hold on every grant path: hire, PATCH, and
// performance-action set_autonomy.

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  await probe.query('SELECT 1');
  await probe.end();
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
const createdOrgIds: string[] = [];

async function register(email: string): Promise<{ token: string; orgId: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: `tier-${email}` },
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed (${res.statusCode}): ${res.payload}`);
  const body = res.json() as { data?: { token?: string; org?: { id?: string } } };
  await deps.db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email.trim().toLowerCase()));
  return { token: body.data?.token ?? '', orgId: body.data?.org?.id ?? '' };
}

async function setPlan(orgId: string, plan: string): Promise<void> {
  const now = new Date();
  await deps.db.insert(subscriptions).values({
    orgId,
    plan,
    billingCycle: 'monthly',
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
    includedCredits: 0,
    maxAgents: 3,
  });
}

async function hire(token: string, autonomyLevel?: string) {
  return app.inject({
    method: 'POST',
    url: '/v1/agents',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: `Tier Agent ${Math.random().toString(36).slice(2, 8)}`,
      role: 'engineer',
      authority: {},
      ...(autonomyLevel ? { autonomyLevel } : {}),
    },
  });
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
});

afterAll(async () => {
  if (!dbUp) return;
  for (const id of createdOrgIds) {
    await deleteOrg(deps.pool, id);
  }
  await app?.close();
});

run('plan-tier autonomy gate (P2)', () => {
  it('trial org cannot hire an autonomous agent (403 + upgrade path)', async () => {
    const { orgId, token } = await register(`tier-trial-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    const res = await hire(token, 'autonomous');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.message).toMatch(/Trial.*execute_with_approval|Team plan or higher/i);
  });

  it('trial org hires at the default level just fine', async () => {
    const { orgId, token } = await register(`tier-ok-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    const res = await hire(token);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.autonomyLevel).toBe('execute_with_approval');
  });

  it('trial org cannot raise an agent to autonomous via PATCH', async () => {
    const { orgId, token } = await register(`tier-patch-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    const hired = await hire(token);
    expect(hired.statusCode).toBe(201);
    const agentId = hired.json().data.id as string;
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { autonomyLevel: 'autonomous' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('trial org cannot grant autonomous via performance set_autonomy', async () => {
    const { orgId, token } = await register(`tier-perf-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    const hired = await hire(token);
    expect(hired.statusCode).toBe(201);
    const agentId = hired.json().data.id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentId}/performance-action`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: 'set_autonomy', autonomyLevel: 'autonomous' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('founder plan still caps at execute_with_approval', async () => {
    const { orgId, token } = await register(`tier-founder-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    await setPlan(orgId, 'founder');
    const res = await hire(token, 'autonomous');
    expect(res.statusCode).toBe(403);
    const ok = await hire(token, 'draft');
    expect(ok.statusCode).toBe(201);
  });

  it('EA create_agent tool obeys the tier gate (trial refused, company allowed)', async () => {
    const { createAgent } = await import('../src/services/ea-tools.js');
    const trialEmail = `tier-eatool-${Date.now()}@example.com`;
    const trial = await register(trialEmail);
    createdOrgIds.push(trial.orgId);
    const [trialUser] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, trialEmail));
    const denied = await createAgent(
      { db: deps.db, orgId: trial.orgId, userId: trialUser!.id },
      { name: 'Tool Hire', role: 'engineer', autonomyLevel: 'autonomous' },
    );
    expect(denied.success).toBe(false);
    expect(denied.error).toBe('tier_locked');

    const companyEmail = `tier-eatool-co-${Date.now()}@example.com`;
    const company = await register(companyEmail);
    createdOrgIds.push(company.orgId);
    await setPlan(company.orgId, 'company');
    const [companyUser] = await deps.db.select({ id: users.id }).from(users).where(eq(users.email, companyEmail));
    const allowed = await createAgent(
      { db: deps.db, orgId: company.orgId, userId: companyUser!.id },
      { name: 'Tool Hire', role: 'engineer', autonomyLevel: 'autonomous' },
    );
    expect(allowed.success).toBe(true);
  });

  it('company plan unlocks autonomous on every grant path', async () => {
    const { orgId, token } = await register(`tier-company-${Date.now()}@example.com`);
    createdOrgIds.push(orgId);
    await setPlan(orgId, 'company');
    const hired = await hire(token, 'autonomous');
    expect(hired.statusCode).toBe(201);
    // Lower then re-raise via PATCH to prove the update path honors the tier.
    const agentId = hired.json().data.id as string;
    const down = await app.inject({
      method: 'PATCH',
      url: `/v1/agents/${agentId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { autonomyLevel: 'observe' },
    });
    expect(down.statusCode).toBe(200);
    const up = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentId}/performance-action`,
      headers: { authorization: `Bearer ${token}` },
      payload: { action: 'set_autonomy', autonomyLevel: 'autonomous' },
    });
    expect(up.statusCode).toBe(200);
  });
});
