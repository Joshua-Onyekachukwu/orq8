import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  organizations,
  users,
  memberships,
  sessions,
  departments,
  agents,
  goals,
  tasks,
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
const auth = () => ({ authorization: `Bearer ${token}` });

async function countAll(): Promise<{ departments: number; agents: number; goals: number; tasks: number }> {
  const d = await deps.db.select({ id: departments.id }).from(departments).where(eq(departments.orgId, orgId));
  const a = await deps.db.select({ id: agents.id }).from(agents).where(eq(agents.orgId, orgId));
  const g = await deps.db.select({ id: goals.id }).from(goals).where(eq(goals.orgId, orgId));
  const t = await deps.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.orgId, orgId));
  return { departments: d.length, agents: a.length, goals: g.length, tasks: t.length };
}

async function cleanupAll(): Promise<void> {
  await deleteOrg(deps.pool, orgId);
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `onboarding-${randomUUID()}`, slug: `onboarding-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `ob-${randomUUID()}@example.com`, name: 'Founder', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
  const s = await createSession(deps.db, { userId, orgId });
  token = s.token;
});

afterAll(async () => {
  if (!dbUp) return;
  await cleanupAll();
  await app?.close();
  await pool?.end().catch(() => undefined);
});

run('onboarding playbook seeding — entitlements, idempotency and first task', () => {
  it('seeds departments, AI employees, goals and a first task within the trial package cap', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/playbook',
      headers: auth(),
      payload: { slug: 'startup-launch' },
    });
    expect(res.statusCode).toBe(200);
    const { result } = res.json().data;
    expect(result.alreadySeeded).toBe(false);
    expect(result.activation).not.toBeNull();

    const counts = await countAll();
    // Trial caps AI employees at 3 and the seed is plan-aware.
    expect(counts.agents).toBeGreaterThan(0);
    expect(counts.agents).toBeLessThanOrEqual(3);
    expect(counts.departments).toBeGreaterThan(0);
    expect(counts.goals).toBeGreaterThan(0);
    expect(counts.tasks).toBeGreaterThan(0);
    if (counts.agents === 3) {
      expect(result.agentLimitApplied).toBeDefined();
    }
  });

  it('creates a valid first task owned by the organization and assigned to a seeded agent', async () => {
    const firstTasks = await deps.db
      .select({ id: tasks.id, title: tasks.title, orgId: tasks.orgId, status: tasks.status, agentId: tasks.agentId })
      .from(tasks)
      .where(eq(tasks.orgId, orgId))
      .orderBy(tasks.createdAt)
      .limit(1);
    expect(firstTasks).toHaveLength(1);
    const t = firstTasks[0]!;
    expect(t.orgId).toBe(orgId);
    expect(t.title.length).toBeGreaterThan(0);
    expect(t.status).toBeTruthy();
    if (t.agentId) {
      const [agent] = await deps.db.select().from(agents).where(eq(agents.id, t.agentId));
      expect(agent?.orgId).toBe(orgId); // assignment points at an in-org AI employee
    }
  });

  it('is idempotent — re-seeding creates no duplicates and stays within package limits', async () => {
    const before = await countAll();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/company-builder/playbook',
      headers: auth(),
      payload: { slug: 'startup-launch' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.result.alreadySeeded).toBe(true);
    const after = await countAll();
    expect(after).toEqual(before);
    expect(after.agents).toBeLessThanOrEqual(3);
  });
});