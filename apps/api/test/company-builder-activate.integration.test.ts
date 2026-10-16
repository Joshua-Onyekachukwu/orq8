import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, auditEvents } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

/**
 * C-06 regression: the founder-reviewed company name sent with activation must
 * land on the org record — otherwise the dashboard keeps the signup-time name.
 */

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 });
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
    .values({ name: `Signup Name ${tag}`, slug: `cba-${tag}` })
    .returning();
  const [user] = await deps.db
    .insert(users)
    .values({
      email: `cba-${tag}@example.com`,
      name: 'Builder Founder',
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

const MIN_PLAN = {
  rationale: 'test',
  departments: [{ name: 'Executive', description: 'Leadership.' }],
  agents: [{
    name: 'Orion',
    role: 'Executive Agent',
    department: 'Executive',
    responsibilities: ['Coordinate'],
    capabilities: ['planning'],
    tools: ['task_planning'],
  }],
  goals: [{ title: 'Test goal', description: 'd', priority: 'high' }],
  tasks: [],
};

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

run('POST /v1/company-builder/activate — companyName propagation (C-06)', () => {
  it('applies the founder-reviewed name to the org and audits it', async () => {
    const { orgId, token } = await makeOrg('owner');
    created.orgIds.push(orgId);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/activate',
      headers: { authorization: `Bearer ${token}` },
      payload: { plan: MIN_PLAN, companyName: 'Corrected Company Name' },
    });
    expect(res.statusCode).toBe(201);

    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.name).toBe('Corrected Company Name');

    const audit = await deps.db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId));
    expect(audit.some((e) => (e as { action: string }).action === 'org.renamed')).toBe(true);
  });

  it('leaves the name alone when no companyName is sent', async () => {
    const { orgId, token } = await makeOrg('owner');
    created.orgIds.push(orgId);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/activate',
      headers: { authorization: `Bearer ${token}` },
      payload: { plan: MIN_PLAN },
    });
    expect(res.statusCode).toBe(201);

    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.name).toMatch(/^Signup Name /);
  });

  it('members cannot activate', async () => {
    const { orgId, token } = await makeOrg('member');
    created.orgIds.push(orgId);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/activate',
      headers: { authorization: `Bearer ${token}` },
      payload: { plan: MIN_PLAN, companyName: 'Nope' },
    });
    expect(res.statusCode).toBe(403);

    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.name).toMatch(/^Signup Name /);
  });
});
