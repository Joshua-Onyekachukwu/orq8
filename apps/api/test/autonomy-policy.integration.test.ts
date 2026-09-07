import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { buildApp } from '../src/app.js';
import { enforceAutonomy, AUTONOMY_LEVELS } from '../src/services/autonomy.js';
import type { FastifyInstance } from 'fastify';

const canRun = !!process.env.DATABASE_URL || process.env.CI === 'true';

let app: FastifyInstance;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
let token = '';

interface PolicyLevel {
  level: string;
  label: string;
  can: string[];
  requiresApproval: string[];
  denied: string[];
}

async function registerUser() {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email: `autonomy-${Date.now()}@test.com`, password: 'TestPass123!', org_name: 'Autonomy Org' },
    headers: { 'content-type': 'application/json' },
  });
  const body = JSON.parse(res.payload) as { data?: { token?: string } };
  if (!body?.data?.token) throw new Error(`register failed: ${res.payload}`);
  return body.data.token;
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
  token = await registerUser();
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

const describeIfDB = canRun ? describe : describe.skip;

describeIfDB('autonomy policy (GET /v1/autonomy/policy)', () => {
  it('requires a session (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/autonomy/policy' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the L0–L4 levels with labels derived from the enforcement engine', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/autonomy/policy',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { data?: { levels?: PolicyLevel[] } };
    const levels = body.data?.levels ?? [];
    expect(levels).toHaveLength(AUTONOMY_LEVELS.length); // 5 levels
    expect(levels.map((l) => l.label)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
  });

  it('matches the server-side enforcement engine for every level and action class', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/autonomy/policy',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.payload) as { data?: { levels?: PolicyLevel[] } };
    const levels = body.data?.levels ?? [];
    const actionClasses = ['task_execute', 'connector_read', 'draft_external', 'connector_action', 'external_communicate', 'modify_resources'];
    for (const entry of levels) {
      for (const action of actionClasses) {
        const decision = enforceAutonomy(entry.level as (typeof AUTONOMY_LEVELS)[number], action as Parameters<typeof enforceAutonomy>[1]);
        if (!decision.allowed) {
          expect(entry.denied).toContain(action);
        } else if (decision.requiresApproval) {
          expect(entry.requiresApproval).toContain(action);
        } else {
          expect(entry.can).toContain(action);
        }
      }
    }
  });

  it('L0 observe can read external systems but cannot execute tasks', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/autonomy/policy',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.payload) as { data?: { levels?: PolicyLevel[] } };
    const l0 = (body.data?.levels ?? []).find((l) => l.label === 'L0');
    expect(l0?.can).toContain('connector_read');
    expect(l0?.denied).toContain('task_execute');
    expect(l0?.denied).toContain('external_communicate');
  });

  it('L3 execute-with-approval requires approval for external actions', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/autonomy/policy',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.payload) as { data?: { levels?: PolicyLevel[] } };
    const l3 = (body.data?.levels ?? []).find((l) => l.label === 'L3');
    expect(l3?.requiresApproval).toContain('connector_action');
    expect(l3?.requiresApproval).toContain('external_communicate');
  });

  it('L4 autonomous can act in external systems without approval', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/autonomy/policy',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = JSON.parse(res.payload) as { data?: { levels?: PolicyLevel[] } };
    const l4 = (body.data?.levels ?? []).find((l) => l.label === 'L4');
    expect(l4?.can).toContain('connector_action');
    expect(l4?.can).toContain('external_communicate');
  });
});