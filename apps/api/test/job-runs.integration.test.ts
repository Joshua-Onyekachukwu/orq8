import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

// Skip when no local PostgreSQL is available (same as other integration tests)
const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';

let app: FastifyInstance;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];

const INTERNAL_TOKEN = 'test-internal-token-for-jobs';

let userA: { token: string; orgId: string };

async function registerUser(email: string, orgName: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'TestPass123!', org_name: orgName },
    headers: { 'content-type': 'application/json' },
  });
  if (res.statusCode !== 201) {
    throw new Error(`Register failed (${res.statusCode}): ${res.payload}`);
  }
  const body = JSON.parse(res.payload) as { data?: { token?: string; org?: { id?: string } } };
  const token = body?.data?.token;
  const orgId = body?.data?.org?.id;
  if (!token || !orgId) {
    throw new Error(`Unexpected register response: ${res.payload}`);
  }
  return { token, orgId };
}

beforeAll(async () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://orq8:orq8_dev_only_change_me@localhost:5432/orq8',
    SESSION_SECRET: 'test-session-secret-32-bytes!!',
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!',
    INTERNAL_TOKEN,
  });
  const logger = createLogger(config);
  const created = createDb(config.DATABASE_URL);
  db = created.db;
  pool = created.pool;
  app = await buildApp({ config, db, pool, logger });
  await app.ready();
  userA = await registerUser(`jobs-a-${Date.now()}@test.com`, 'Jobs Org');
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

const describeIfDB = canRun ? describe : describe.skip;

describeIfDB('scheduled job run log (GET /v1/jobs/status)', () => {
  it('requires a session (401 without token)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/jobs/status' });
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty job list for a fresh install', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/jobs/status',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body.data.jobs)).toBe(true);
  });

  it('rejects internal calls with a bad token (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/memory/consolidate',
      headers: { 'content-type': 'application/json', 'x-internal-token': 'nope' },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('records a memory_consolidate run and surfaces it to founders', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/memory/consolidate',
      headers: { 'content-type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const status = await app.inject({
      method: 'GET',
      url: '/v1/jobs/status',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(status.statusCode).toBe(200);
    const body = JSON.parse(status.payload);
    const run = body.data.jobs.find((j: { job: string }) => j.job === 'memory_consolidate');
    expect(run).toBeTruthy();
    expect(run.status).toBe('success');
    expect(typeof run.startedAt).toBe('string');
    expect(typeof run.orgsProcessed).toBe('number');
    expect(run.detail).toBeTruthy();
  });

  it('records an events_process_pending run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/events/process-pending',
      headers: { 'content-type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const status = await app.inject({
      method: 'GET',
      url: '/v1/jobs/status',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const body = JSON.parse(status.payload);
    const run = body.data.jobs.find((j: { job: string }) => j.job === 'events_process_pending');
    expect(run).toBeTruthy();
    expect(run.status).toBe('success');
  });

  it('records an anomaly_scan run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/internal/anomalies/scan',
      headers: { 'content-type': 'application/json', 'x-internal-token': INTERNAL_TOKEN },
      payload: {},
    });
    expect(res.statusCode).toBe(200);

    const status = await app.inject({
      method: 'GET',
      url: '/v1/jobs/status',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    const body = JSON.parse(status.payload);
    const run = body.data.jobs.find((j: { job: string }) => j.job === 'anomaly_scan');
    expect(run).toBeTruthy();
    expect(run.status).toBe('success');
    expect(run.orgsProcessed).toBeGreaterThanOrEqual(1);
  });
});
