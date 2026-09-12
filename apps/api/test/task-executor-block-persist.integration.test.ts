import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';

let app: FastifyInstance;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
let token = '';
let orgId = '';

async function registerUser() {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email: `blockpersist-${Date.now()}@test.com`, password: 'TestPass123!', org_name: 'Block Persist Org' },
    headers: { 'content-type': 'application/json' },
  });
  const body = JSON.parse(res.payload) as { data?: { token?: string; user?: { currentOrganizationId?: string } } };
  if (!body?.data?.token) throw new Error(`register failed: ${res.payload}`);
  return body.data;
}

beforeAll(async () => {
  const config = loadConfig({
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
  const data = await registerUser();
  token = data.token!;
  orgId = data.user?.currentOrganizationId ?? '';
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

const describeIfDB = canRun ? describe : describe.skip;

/**
 * §16/§17 regression pin — a pre-execution governance block (observe-mode
 * agent) previously returned a failed result WITHOUT touching the task row:
 * the API said "failed" while the founder's task list showed "pending" forever.
 * The block must now be persisted (status=failed + honest reason) and charged
 * nothing.
 */
describeIfDB('pre-execution block persistence (observe-mode agent)', () => {
  it('persists the autonomy block to the task row instead of leaving it pending', async () => {
    // 1. Department + observe-mode agent.
    const deptRes = await app.inject({
      method: 'POST',
      url: '/v1/departments',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Observe Dept' },
    });
    const deptId = JSON.parse(deptRes.payload).data?.id;
    expect(deptId).toBeTruthy();

    const hireRes = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { name: 'Observer Agent', role: 'Analyst', departmentId: deptId, autonomyLevel: 'observe' },
    });
    const agentId = JSON.parse(hireRes.payload).data?.id;
    expect(agentId).toBeTruthy();

    // 2. Task assigned to that agent.
    const taskRes = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { title: 'Blocked task', description: 'Should never run.', agentId },
    });
    const taskId = JSON.parse(taskRes.payload).data?.id;
    expect(taskId).toBeTruthy();

    // 3. Execute → honest failure, and the task row must now say so.
    const execRes = await app.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(execRes.statusCode).toBe(200);
    const execBody = JSON.parse(execRes.payload) as { status: string; data?: { status?: string; result?: string; cost?: number } };
    expect(execBody.status).toBe('failed');
    expect(execBody.data?.result).toContain('observe mode');

    const readback = await app.inject({
      method: 'GET',
      url: `/v1/tasks/${taskId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const task = JSON.parse(readback.payload).data;
    expect(task.status).toBe('failed'); // persisted — not 'pending' forever
    expect(task.result).toContain('observe mode');
    expect(task.cost).toBe(0); // no work was done; founder is not charged
  });
});