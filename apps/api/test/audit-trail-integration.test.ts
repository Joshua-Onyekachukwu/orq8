import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { appendAudit } from '../src/services/audit.js';
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

const authA = () => ({ authorization: `Bearer ${tokenA}` });
const authB = () => ({ authorization: `Bearer ${tokenB}` });

async function cleanupAll(): Promise<void> {
  for (const id of [orgA, orgB].filter(Boolean)) {
    await deleteOrg(deps.pool, id);
  }
  for (const id of [userA, userB].filter(Boolean)) {
    await deps.db.delete(users).where(eq(users.id, id));
  }
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgARow] = await deps.db
    .insert(organizations)
    .values({ name: `audit-a-${randomUUID()}`, slug: `audit-a-${randomUUID()}` })
    .returning();
  orgA = orgARow!.id;
  const [orgBRow] = await deps.db
    .insert(organizations)
    .values({ name: `audit-b-${randomUUID()}`, slug: `audit-b-${randomUUID()}` })
    .returning();
  orgB = orgBRow!.id;

  const [userARow] = await deps.db
    .insert(users)
    .values({
      email: `audit-a-${randomUUID()}@example.com`,
      name: 'Audit A',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  userA = userARow!.id;
  const [userBRow] = await deps.db
    .insert(users)
    .values({
      email: `audit-b-${randomUUID()}@example.com`,
      name: 'Audit B',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  userB = userBRow!.id;

  await deps.db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' });
  await deps.db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' });

  tokenA = (await createSession(deps.db, { userId: userA, orgId: orgA })).token;
  tokenB = (await createSession(deps.db, { userId: userB, orgId: orgB })).token;

  // A mixed trail for org A: two domains, so the filter has something to do.
  await appendAudit(deps.db, {
    orgId: orgA,
    actorType: 'user',
    actorId: userA,
    action: 'task.created',
    outcome: 'success',
    resultRef: JSON.stringify({ task: 'Pricing page build' }),
  });
  await appendAudit(deps.db, {
    orgId: orgA,
    actorType: 'system',
    action: 'credits.consumed',
    outcome: 'success',
    cost: 42,
  });
  await appendAudit(deps.db, {
    orgId: orgA,
    actorType: 'system',
    action: 'task.status_changed',
    outcome: 'failure',
    resultRef: 'The gated tool call was denied',
  });
  // Org B decoy: same action names, different org.
  await appendAudit(deps.db, {
    orgId: orgB,
    actorType: 'system',
    action: 'task.created',
    outcome: 'success',
    inputRef: 'RIVAL-SECRET-PAYLOAD',
  });
});

afterAll(async () => {
  if (dbUp) {
    await app.close();
    await cleanupAll();
  }
  await deps.pool.end();
  await pool?.end();
});

run('audit trail — the append-only record', () => {
  it('is behind auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit' });
    expect(res.statusCode).toBe(401);
    const verify = await app.inject({ method: 'GET', url: '/v1/audit/verify' });
    expect(verify.statusCode).toBe(401);
  });

  it('reads this org’s rows only, newest first, with real action and outcome', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit', headers: authA() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      data: Array<{ action: string; outcome: string; actorType: string; hash: string; prevHash: string }>;
      meta: { total: number; domains: Array<{ domain: string; count: number }> };
    };

    expect(body.data).toHaveLength(3);
    // Newest first — this is what makes the page's first row current.
    expect(body.data[0]!.action).toBe('task.status_changed');
    expect(body.data[0]!.outcome).toBe('failure');
    expect(body.data.every((row) => row.hash.length === 64 && row.prevHash.length === 64)).toBe(true);
    expect(body.meta.total).toBe(3);
    expect(body.meta.domains.map((d) => d.domain).sort()).toEqual(['credits', 'task']);

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('RIVAL-SECRET-PAYLOAD');
  });

  it('filters by action domain, and never leaks across orgs through the filter', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit?domain=task', headers: authA() });
    const body = res.json() as {
      data: Array<{ action: string }>;
      meta: { total: number; domains: Array<{ domain: string }> };
    };
    expect(body.data).toHaveLength(2);
    expect(body.data.every((row) => row.action.startsWith('task.'))).toBe(true);
    expect(body.meta.total).toBe(2);
    // The domain list stays org-wide, so a filtered page still shows every lane.
    expect(body.meta.domains.map((d) => d.domain).sort()).toEqual(['credits', 'task']);

    const rival = await app.inject({ method: 'GET', url: '/v1/audit?domain=task', headers: authB() });
    const rivalBody = rival.json() as { data: Array<{ action: string }> };
    expect(rivalBody.data).toHaveLength(1);
  });

  it('verifies the hash chain for the org', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/audit/verify', headers: authA() });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: { valid: boolean; rows: number; firstBrokenId?: number } };
    expect(body.data.valid).toBe(true);
    expect(body.data.rows).toBe(3);
    expect(body.data.firstBrokenId).toBeUndefined();
  });
});
