import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, auditEvents } from '@orq8/db';
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
 * C-02 regression: a playbook seed without company facts must be refused, and
 * a gated seed must apply the founder's company name to the org record.
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

async function makeOrg(): Promise<{ orgId: string; token: string }> {
  const tag = randomUUID().slice(0, 8);
  const [org] = await deps.db
    .insert(organizations)
    .values({ name: `Gate Co ${tag}`, slug: `pbg-${tag}` })
    .returning();
  const [user] = await deps.db
    .insert(users)
    .values({
      email: `pbg-${tag}@example.com`,
      name: 'Gate Founder',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  await deps.db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: 'owner' });
  const token = (await createSession(deps.db, { userId: user!.id, orgId: org!.id })).token;
  return { orgId: org!.id, token };
}

const created: { orgIds: string[] } = { orgIds: [] };

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
});

afterAll(async () => {
  if (!dbUp) return;
  for (const id of created.orgIds) {
    await deleteOrg(deps.pool, id);
  }
  await app.close();
});

run('POST /v1/company-builder/playbook — company-facts gate (C-02)', () => {
  it('refuses a seed with no companyName', async () => {
    const { orgId, token } = await makeOrg();
    created.orgIds.push(orgId);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/playbook',
      headers: { authorization: `Bearer ${token}` },
      payload: { slug: 'startup-launch' },
    });
    expect(res.statusCode).toBe(400);

    // Nothing was seeded and the name is untouched.
    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.name).toMatch(/^Gate Co /);
  });

  it('seeds with company facts and applies the company name', async () => {
    const { orgId, token } = await makeOrg();
    created.orgIds.push(orgId);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/playbook',
      headers: { authorization: `Bearer ${token}` },
      payload: { slug: 'startup-launch', companyName: 'Gated Startup', objective: 'Validate the wedge' },
    });
    expect(res.statusCode).toBe(200);

    const [org] = await deps.db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org?.name).toBe('Gated Startup');

    const audit = await deps.db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId));
    expect(audit.some((e) => (e as { action: string }).action === 'org.renamed')).toBe(true);
    expect(audit.some((e) => (e as { action: string }).action === 'playbook.seeded')).toBe(true);
  });
});
