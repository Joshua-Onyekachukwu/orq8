import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, agents, auditEvents } from '@orq8/db';
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
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 /* 2026-10-13: 1.5s tripped under full-suite load, silently skipping files */ });
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

async function makeOrg(role: 'owner' | 'member' = 'owner'): Promise<{ orgId: string; userId: string; token: string }> {
  const tag = randomUUID().slice(0, 8);
  const [org] = await deps.db
    .insert(organizations)
    .values({ name: `demo-co-${tag}`, slug: `demo-co-${tag}` })
    .returning();
  const [user] = await deps.db
    .insert(users)
    .values({
      email: `demo-${tag}@example.com`,
      name: 'Demo Founder',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  await deps.db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role });
  const token = (await createSession(deps.db, { userId: user!.id, orgId: org!.id })).token;
  return { orgId: org!.id, userId: user!.id, token };
}

const created: { orgIds: string[]; userIds: string[] } = { orgIds: [], userIds: [] };

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
});

afterAll(async () => {
  if (!dbUp) return;
  for (const id of created.orgIds) {
    await deleteOrg(deps.pool, id);
  }
  for (const id of created.userIds) {
    await deps.db.delete(users).where(eq(users.id, id));
  }
  await app.close();
});

run('POST /v1/demo-company (MVP-020 one-click demo)', () => {
  it('seeds an empty org and flags it demo', async () => {
    const { orgId, token } = await makeOrg('owner');
    created.orgIds.push(orgId);
    const res = await app.inject({ method: 'POST', url: '/v1/demo-company', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.demo).toBe(true);
    expect(body.agents).toBe(3);
    expect(body.departments).toBe(3);
    expect(body.goals).toBe(2);
    expect(body.tasks).toBe(5);
    expect(body.approvals).toBe(1);

    const [org] = await deps.db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect((org?.settings as { isDemo?: boolean })?.isDemo).toBe(true);

    const seededAgents = await deps.db.select().from(agents).where(eq(agents.orgId, orgId));
    expect(seededAgents).toHaveLength(3);

    const audit = await deps.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.orgId, orgId)));
    expect(audit.some((e) => (e as { action: string }).action === 'demo.seeded')).toBe(true);
  });

  it('refuses a second seed (already demo)', async () => {
    const { orgId, token } = await makeOrg('owner');
    created.orgIds.push(orgId);
    const first = await app.inject({ method: 'POST', url: '/v1/demo-company', headers: { authorization: `Bearer ${token}` } });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/v1/demo-company', headers: { authorization: `Bearer ${token}` } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('already_demo');
  });

  it('refuses a non-empty org', async () => {
    const { orgId, token } = await makeOrg('owner');
    created.orgIds.push(orgId);
    const hire = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Real Hire', role: 'engineer', authority: {} },
    });
    expect(hire.statusCode).toBe(201);
    const res = await app.inject({ method: 'POST', url: '/v1/demo-company', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('org_not_empty');
    // The real hire is untouched — the seed wrote nothing.
    const rows = await deps.db.select().from(agents).where(eq(agents.orgId, orgId));
    expect(rows).toHaveLength(1);
  });

  it('refuses members (owner/admin only)', async () => {
    const { orgId, token } = await makeOrg('member');
    created.orgIds.push(orgId);
    const res = await app.inject({ method: 'POST', url: '/v1/demo-company', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(403);
  });
});

run('POST /v1/demo-company/isolated (C-03/C-04 isolated demo org)', () => {
  it('creates a separate demo org, seeds it, and moves the session into it', async () => {
    const { orgId: realOrgId, token } = await makeOrg('owner');
    created.orgIds.push(realOrgId);
    // The real org already has content — the legacy endpoint would refuse it.
    const hire = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Real Hire', role: 'engineer', authority: {} },
    });
    expect(hire.statusCode).toBe(201);

    const res = await app.inject({ method: 'POST', url: '/v1/demo-company/isolated', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(201);
    const body = res.json().data;
    expect(body.demo).toBe(true);
    expect(body.isolated).toBe(true);
    expect(body.orgId).toBeDefined();
    expect(body.orgId).not.toBe(realOrgId);
    created.orgIds.push(body.orgId);

    // The real org is untouched: still exactly the one real hire, never flagged demo.
    const realAgents = await deps.db.select().from(agents).where(eq(agents.orgId, realOrgId));
    expect(realAgents).toHaveLength(1);
    const [realOrg] = await deps.db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, realOrgId));
    expect((realOrg?.settings as { isDemo?: boolean })?.isDemo).not.toBe(true);

    // The demo org is flagged and seeded.
    const [demoOrg] = await deps.db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, body.orgId));
    expect((demoOrg?.settings as { isDemo?: boolean })?.isDemo).toBe(true);
    const demoAgents = await deps.db.select().from(agents).where(eq(agents.orgId, body.orgId));
    expect(demoAgents).toHaveLength(3);

    // The session now lives in the demo org: /v1/auth/me reports it.
    const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.active_org_id).toBe(body.orgId);

    const audit = await deps.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.orgId, body.orgId)));
    expect(audit.some((e) => (e as { action: string }).action === 'demo.isolated_created')).toBe(true);
  });

  it('refuses a second isolated demo while one is live', async () => {
    const { orgId, token } = await makeOrg('owner');
    created.orgIds.push(orgId);
    const first = await app.inject({ method: 'POST', url: '/v1/demo-company/isolated', headers: { authorization: `Bearer ${token}` } });
    expect(first.statusCode).toBe(201);
    created.orgIds.push(first.json().data.orgId);
    const second = await app.inject({ method: 'POST', url: '/v1/demo-company/isolated', headers: { authorization: `Bearer ${token}` } });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('demo_exists');
  });
});
