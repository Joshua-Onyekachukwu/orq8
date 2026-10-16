import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, activityEvents, creditTransactions } from '@orq8/db';
import { eq } from 'drizzle-orm';
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
    .values({ name: `spend-${tag}`, slug: `spend-${tag}` })
    .returning();
  const [user] = await deps.db
    .insert(users)
    .values({
      email: `spend-${tag}@example.com`,
      name: 'Spend Tester',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  await deps.db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: 'owner' });
  const token = (await createSession(deps.db, { userId: user!.id, orgId: org!.id })).token;
  return { orgId: org!.id, token };
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

run('GET /v1/dashboard weekly_spend (B3: ledger cost basis)', () => {
  it('sums ledger usage rows only — activity cost, old rows, and purchases excluded', async () => {
    const { orgId, token } = await makeOrg();
    created.orgIds.push(orgId);
    const tag = randomUUID().slice(0, 8);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    // In-window usage: -100 + -50 => weekly_spend must be 150.
    await deps.db.insert(creditTransactions).values([
      { orgId, type: 'usage', amount: -100, description: 'Task execution', idempotencyKey: `spend-a-${tag}` },
      { orgId, type: 'usage', amount: -50, description: 'Task execution', idempotencyKey: `spend-b-${tag}` },
      // Out of window: must not count.
      { orgId, type: 'usage', amount: -1000, description: 'Old run', idempotencyKey: `spend-old-${tag}`, createdAt: tenDaysAgo },
      // Not usage: must not count.
      { orgId, type: 'purchase', amount: 500, description: 'Top-up', idempotencyKey: `spend-topup-${tag}` },
    ]);

    // Decoy: a huge per-execution cost on the activity feed. The old
    // activityEvents.cost basis would report 9999+ here; the ledger basis
    // must ignore it entirely.
    await deps.db.insert(activityEvents).values({
      orgId,
      type: 'analyzed',
      summary: 'decoy event with uncontrolled cost',
      cost: 9999,
    });

    const res = await app.inject({ method: 'GET', url: '/v1/dashboard', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.weekly_spend).toBe(150);
  });
});
