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

// Test users
let userA: { token: string; orgId: string };
let userB: { token: string; orgId: string };

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
  });
  const logger = createLogger(config);
  const created = createDb(config.DATABASE_URL);
  db = created.db;
  pool = created.pool;
  app = await buildApp({ config, db, pool, logger });
  await app.ready();
  // Ensure app/db are non-optional before any test runs
  if (!app || !db || !pool) throw new Error('test app failed to initialize');

  userA = await registerUser(`approval-a-${Date.now()}@test.com`, 'Org A');
  userB = await registerUser(`approval-b-${Date.now()}@test.com`, 'Org B');
}, 30_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

const describeIfDB = canRun ? describe : describe.skip;

describeIfDB('approval gates', () => {
  let approvalId: string;

  it('GET /v1/approvals returns empty list for new org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('POST /v1/agents creates an agent (needed for approvals)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'application/json',
      },
      payload: { name: 'Test Agent', role: 'researcher', department: 'Research' },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /v1/approvals creates a pending approval', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'application/json',
      },
      payload: {
        action: 'Send external email to investor',
        description: 'Draft investor outreach email for Series A',
        cost: 500,
        risk_level: 'high',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('pending');
    expect(body.data.riskLevel).toBe('high');
    expect(body.data.action).toBe('Send external email to investor');
    approvalId = body.data.id;
  });

  it('GET /v1/approvals returns the pending approval', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
      headers: { authorization: `Bearer ${userA.token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.some((a: { id: string }) => a.id === approvalId)).toBe(true);
  });

  it('PATCH /v1/approvals/:id/approve approves the request', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approvalId}/approve`,
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'application/json',
      },
      payload: { decision_note: 'Approved — proceed with outreach' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('approved');
    expect(body.data.decisionNote).toBe('Approved — proceed with outreach');
  });

  it('PATCH /v1/approvals/:id/approve rejects already-approved approval', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approvalId}/approve`,
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'application/json',
      },
      payload: { decision_note: 'Double approve?' },
    });
    // Should fail because it's already approved
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('POST /v1/approvals creates and PATCH /v1/approvals/:id/reject works', async () => {
    // Create a new approval
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'application/json',
      },
      payload: {
        action: 'Purchase software license',
        description: 'Annual subscription for design tools',
        cost: 2000,
        risk_level: 'medium',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const newId = (JSON.parse(createRes.payload) as { data: { id: string } }).data.id;

    // Reject it
    const rejectRes = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${newId}/reject`,
      headers: {
        authorization: `Bearer ${userA.token}`,
        'content-type': 'application/json',
      },
      payload: { decision_note: 'Not in budget right now' },
    });
    expect(rejectRes.statusCode).toBe(200);
    const body = JSON.parse(rejectRes.payload);
    expect(body.data.status).toBe('rejected');
    expect(body.data.decisionNote).toBe('Not in budget right now');
  });

  it('IDOR: User B cannot approve User A\'s approval', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/approvals/${approvalId}/approve`,
      headers: {
        authorization: `Bearer ${userB.token}`,
        'content-type': 'application/json',
      },
      payload: { decision_note: 'Hacked!' },
    });
    // Should return 404 (not found in User B's org) or 403
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('Unauthorized: No token cannot access approvals', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
    });
    expect(res.statusCode).toBe(401);
  });
});
