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

const INTERNAL_TOKEN = 'test-internal-token-for-ops-check-123456';

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
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

const describeIfDB = canRun ? describe : describe.skip;

describeIfDB('production ops check (GET /v1/internal/ops-check)', () => {
  it('rejects a missing internal token (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/internal/ops-check' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an invalid internal token (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/internal/ops-check',
      headers: { 'x-internal-token': 'wrong-token-value' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts the valid internal token and returns a structured report', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/internal/ops-check',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { data?: { overall?: string; checks?: Array<{ label: string; ok: boolean; detail: string; category: string }>; checkedAt?: string } };
    expect(body.data).toBeTruthy();
    expect(['PASS', 'FAIL']).toContain(body.data?.overall);
    expect(Array.isArray(body.data?.checks)).toBe(true);
    expect((body.data?.checks ?? []).length).toBeGreaterThan(5);
    expect(body.data?.checkedAt).toBeTruthy();
    // Required categories are all present
    const labels = (body.data?.checks ?? []).map((c) => c.label);
    expect(labels).toContain('INTERNAL_TOKEN');
    expect(labels).toContain('DATABASE');
    expect(labels.some((l) => l.startsWith('MIGRATION 0012'))).toBe(true);
  });

  it('never leaks the internal token in the response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/internal/ops-check',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(res.payload).not.toContain(INTERNAL_TOKEN);
  });

  it('never leaks database credentials in the response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/internal/ops-check',
      headers: { 'x-internal-token': INTERNAL_TOKEN },
    });
    expect(res.payload).not.toMatch(/postgres(ql)?:\/\//);
    expect(res.payload).not.toMatch(/password/i);
  });
});