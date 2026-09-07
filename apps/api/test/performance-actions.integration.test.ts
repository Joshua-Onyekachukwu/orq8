import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb, auditEvents, agents, tasks, type Db } from '@orq8/db';
import { buildApp } from '../src/app.js';
import { executeTask } from '../src/services/task-executor.js';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '@orq8/core';

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';

let app: FastifyInstance;
let config: AppConfig;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];

let tokenA = '';
let orgA = '';
let tokenB = '';
let agentAId = '';

async function register(email: string, orgName: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: orgName },
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode !== 201) throw new Error(`register failed (${res.statusCode}): ${res.payload}`);
  const body = JSON.parse(res.payload) as { data?: { token?: string; org?: { id?: string } } };
  return { token: body.data?.token ?? '', orgId: body.data?.org?.id ?? '' };
}

beforeAll(async () => {
  config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
    SESSION_SECRET: 'test-session-secret-32-bytes!!',
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!',
  });
  const logger = createLogger(config);
  const created = createDb(config.DATABASE_URL);
  db = created.db;
  pool = created.pool;
  app = await buildApp({ config, db, pool, logger });
  await app.ready();

  const a = await register(`perf-a-${Date.now()}@test.com`, 'Perf Org A');
  tokenA = a.token;
  orgA = a.orgId;
  const b = await register(`perf-b-${Date.now()}@test.com`, 'Perf Org B');
  tokenB = b.token;

  const hire = await app.inject({
    method: 'POST',
    url: '/v1/agents',
    payload: { name: 'Ada', role: 'Software Engineer' },
    headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
  });
  expect(hire.statusCode).toBe(201);
  agentAId = (hire.json().data as { id: string }).id;
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end().catch(() => undefined);
});

const describeIfDB = canRun ? describe : describe.skip;

async function auditRows(action: string) {
  return db
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.orgId, orgA), eq(auditEvents.action, action)))
    .orderBy(auditEvents.id);
}

describeIfDB('AI employee performance actions (KEEP / IMPROVE / REPLACE)', () => {
  it('confirm_keep is server-authorized and audited', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentAId}/performance-action`,
      payload: { action: 'confirm_keep', reason: 'Strong output' },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const rows = await auditRows('agent.performance.confirm_keep');
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[rows.length - 1]!;
    expect(row.agentId).toBe(agentAId);
    expect(row.actorId).toBeTruthy();
    expect(row.outcome).toBe('success');
  });

  it('improve adjusts role/capabilities and is audited', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentAId}/performance-action`,
      payload: { action: 'improve', role: 'Senior Software Engineer', reason: 'Broaden scope' },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const [updated] = await db.select({ role: agents.role }).from(agents).where(eq(agents.id, agentAId));
    expect(updated?.role).toBe('Senior Software Engineer');
    const rows = await auditRows('agent.performance.improve');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('replace archives the employee but preserves the record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentAId}/performance-action`,
      payload: { action: 'replace', reason: 'Role no longer needed' },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
    const [archived] = await db.select().from(agents).where(eq(agents.id, agentAId));
    expect(archived?.status).toBe('archived'); // row still exists — history preserved
    const rows = await auditRows('agent.performance.replace');
    expect(rows.length).toBeGreaterThan(0);
  });

  it('rejects a cross-organization agent (org isolation)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/agents/${agentAId}/performance-action`,
      payload: { action: 'confirm_keep' },
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('archived employees cannot be assigned new work (task creation blocked)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { title: 'New task for archived agent', agentId: agentAId },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error?.code).toBe('agent_archived');
  });

  it('archived employees cannot execute assigned work (executor blocks)', async () => {
    const [task] = await db
      .insert(tasks)
      .values({ orgId: orgA, title: 'Leftover task for archived agent', agentId: agentAId, status: 'pending', cost: 0 })
      .returning();
    const result = await executeTask(config, db, orgA, task!.id);
    expect(result.status).toBe('failed');
    expect(result.result).toMatch(/archived/);
  });

  it('rejects assigning a task to an agent in another organization', async () => {
    const hireB = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      payload: { name: 'Bob', role: 'Analyst' },
      headers: { authorization: `Bearer ${tokenB}`, 'content-type': 'application/json' },
    });
    expect(hireB.statusCode).toBe(201);
    const orgBAgentId = (hireB.json().data as { id: string }).id;
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { title: 'Foreign assignee', agentId: orgBAgentId },
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(404);
  });
});