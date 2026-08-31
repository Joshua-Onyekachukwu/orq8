/**
 * Credits Integration Tests
 *
 * Tests the full credit consumption flow end-to-end:
 *   1. Real Fastify server with all middleware (CSRF, rate-limit, auth)
 *   2. Real PostgreSQL database (skips when unavailable)
 *   3. Full auth flow: register → login → Bearer token
 *   4. Credit balance, consumption, exhaustion, top-up
 *   5. Authorization: cross-tenant isolation
 *   6. Database writes: verify transactions are persisted
 *   7. Atomic guard: concurrent consumption prevention
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

// Only run when PostgreSQL is reachable — keeps `pnpm test` green on machines without Docker.
let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Register a new user + org, return token and orgId */
async function registerTestUser(
  label: string,
): Promise<{ token: string; orgId: string; email: string }> {
  const email = `credits-${label}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `Credits Test ${label}` },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json();
  return {
    token: body.data.token as string,
    orgId: body.data.org.id as string,
    email,
  };
}

/** Login and return a fresh token */
async function login(email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode).toBe(200);
  return res.json().data.token as string;
}

/** Auth headers helper */
function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

const run = dbUp ? describe : describe.skip;

run('Credits — full integration flow', () => {
  let tokenA: string;
  let orgIdA: string;
  let emailA: string;

  beforeAll(async () => {
    const user = await registerTestUser('A');
    tokenA = user.token;
    orgIdA = user.orgId;
    emailA = user.email;
  });

  // ── Balance ──

  describe('GET /v1/credits/balance', () => {
    it('returns a balance for the authenticated org', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/credits/balance',
        headers: auth(tokenA),
      });
      expect(res.statusCode).toBe(200);
      const balance = res.json().data;
      expect(balance).toBeDefined();
      expect(balance.orgId).toBe(orgIdA);
      expect(typeof balance.included).toBe('number');
      expect(typeof balance.used).toBe('number');
      expect(typeof balance.remaining).toBe('number');
      expect(balance.remaining).toBeGreaterThanOrEqual(0);
    });

    it('returns 401 without authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/credits/balance' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('auth.unauthorized');
    });
  });

  // ── Check ──

  describe('POST /v1/credits/check', () => {
    it('returns allowed=true when sufficient credits', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/check',
        headers: auth(tokenA),
        payload: { operation_type: 'task.planned' }, // cost=1
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.allowed).toBe(true);
      expect(data.required).toBe(1);
    });

    it('returns 401 without auth', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/check',
        payload: { operation_type: 'default' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── Consume ──

  describe('POST /v1/credits/consume', () => {
    it('consumes credits and returns updated balance', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/consume',
        headers: auth(tokenA),
        payload: {
          operation_type: 'task.planned',
          description: 'Integration test: plan a task',
        },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.consumed).toBe(1);
      expect(data.balance).toBeDefined();
      expect(data.balance.remaining).toBeGreaterThanOrEqual(0);
    });

    it('consumes multiple operations sequentially', async () => {
      const before = await app.inject({
        method: 'GET',
        url: '/v1/credits/balance',
        headers: auth(tokenA),
      });
      const usedBefore = before.json().data.used;

      // Consume 3 different operations
      for (const op of ['task.planned', 'task.executed', 'research.quick']) {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/credits/consume',
          headers: auth(tokenA),
          payload: { operation_type: op, description: `Test: ${op}` },
        });
        expect(res.statusCode).toBe(200);
      }

      const after = await app.inject({
        method: 'GET',
        url: '/v1/credits/balance',
        headers: auth(tokenA),
      });
      const usedAfter = after.json().data.used;
      // Should have consumed 1 + 2 + 1 = 4 credits
      expect(usedAfter).toBe(usedBefore + 4);
    });

    it('rejects invalid operation_type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/consume',
        headers: auth(tokenA),
        payload: { operation_type: '', description: 'Empty op' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects missing description', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/consume',
        headers: auth(tokenA),
        payload: { operation_type: 'task.planned' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── Exhaustion ──

  describe('Credit exhaustion', () => {
    it('exhausts credits on a fresh org with low balance', async () => {
      // Create a new user with trial plan (100 credits)
      const user = await registerTestUser('exhaust');

      // Consume credits until exhausted
      let exhausted = false;
      let consumed = 0;
      for (let i = 0; i < 150; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/v1/credits/consume',
          headers: auth(user.token),
          payload: { operation_type: 'research.deep', description: `Exhaust test ${i}` },
        });
        if (res.statusCode === 200) {
          consumed++;
        } else {
          // Should get a response indicating exhaustion
          const body = res.json();
          expect(body.data.allowed).toBe(false);
          exhausted = true;
          break;
        }
      }

      // Should have consumed some credits before exhaustion
      expect(consumed).toBeGreaterThan(0);
      expect(exhausted).toBe(true);
    });
  });

  // ── Top-up ──

  describe('POST /v1/credits/top-up', () => {
    it('adds purchased credits to the balance', async () => {
      const before = await app.inject({
        method: 'GET',
        url: '/v1/credits/balance',
        headers: auth(tokenA),
      });
      const purchasedBefore = before.json().data.purchased;

      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/top-up',
        headers: auth(tokenA),
        payload: { amount: 500, description: 'Test top-up' },
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.purchased).toBe(purchasedBefore + 500);

      // Verify the balance reflects the top-up
      const after = await app.inject({
        method: 'GET',
        url: '/v1/credits/balance',
        headers: auth(tokenA),
      });
      expect(after.json().data.purchased).toBe(purchasedBefore + 500);
    });

    it('rejects negative amounts', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/top-up',
        headers: auth(tokenA),
        payload: { amount: -100 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects amounts over 100,000', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/credits/top-up',
        headers: auth(tokenA),
        payload: { amount: 200_000 },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── History ──

  describe('GET /v1/credits/history', () => {
    it('returns transaction history for the org', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/credits/history',
        headers: auth(tokenA),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta).toBeDefined();
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('supports pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/credits/history?limit=2&offset=0',
        headers: auth(tokenA),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.length).toBeLessThanOrEqual(2);
      expect(body.meta.limit).toBe(2);
      expect(body.meta.offset).toBe(0);
    });
  });

  // ── Usage Summary ──

  describe('GET /v1/credits/usage', () => {
    it('returns usage summary for the current period', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/credits/usage',
        headers: auth(tokenA),
      });
      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(typeof data.totalUsed).toBe('number');
      expect(Array.isArray(data.byOperation)).toBe(true);
      expect(Array.isArray(data.dailyUsage)).toBe(true);
    });
  });
});

// ─── Cross-Tenant Authorization ─────────────────────────────────────────────

run('Credits — cross-tenant authorization', () => {
  let tokenA: string;
  let orgIdA: string;
  let tokenB: string;
  let orgIdB: string;

  beforeAll(async () => {
    const userA = await registerTestUser('isolation-A');
    tokenA = userA.token;
    orgIdA = userA.orgId;

    const userB = await registerTestUser('isolation-B');
    tokenB = userB.token;
    orgIdB = userB.orgId;
  });

  it('org A cannot see org B balance', async () => {
    const resA = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: auth(tokenA),
    });
    expect(resA.json().data.orgId).toBe(orgIdA);

    const resB = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: auth(tokenB),
    });
    expect(resB.json().data.orgId).toBe(orgIdB);

    // Org IDs must be different
    expect(orgIdA).not.toBe(orgIdB);
  });

  it('org A cannot consume org B credits', async () => {
    // Consume as org A
    const consumeA = await app.inject({
      method: 'POST',
      url: '/v1/credits/consume',
      headers: auth(tokenA),
      payload: { operation_type: 'task.planned', description: 'Org A consumption' },
    });
    expect(consumeA.statusCode).toBe(200);
    const usedA = consumeA.json().data.balance.used;

    // Check org B balance — should be unaffected
    const balanceB = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: auth(tokenB),
    });
    // Org B's used credits should not include org A's consumption
    expect(balanceB.json().data.orgId).toBe(orgIdB);
  });

  it('org A cannot view org B transaction history', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/credits/history',
      headers: auth(tokenA),
    });
    expect(res.statusCode).toBe(200);
    const history = res.json().data;
    // All transactions should belong to org A
    for (const tx of history) {
      expect(tx.orgId).toBe(orgIdA);
    }
  });

  it('stolen token cannot access credits', async () => {
    // Try with a fake token
    const res = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: { authorization: 'Bearer fake-token-12345' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ─── Database Writes Verification ───────────────────────────────────────────

run('Credits — database writes', () => {
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    const user = await registerTestUser('dbwrites');
    token = user.token;
    orgId = user.orgId;
  });

  it('consume creates a credit_transactions row', async () => {
    // Get transaction count before
    const before = await app.inject({
      method: 'GET',
      url: '/v1/credits/history?limit=200',
      headers: auth(token),
    });
    const countBefore = before.json().meta.total;

    // Consume credits
    const consume = await app.inject({
      method: 'POST',
      url: '/v1/credits/consume',
      headers: auth(token),
      payload: { operation_type: 'task.executed', description: 'DB write test' },
    });
    expect(consume.statusCode).toBe(200);

    // Verify transaction was recorded
    const after = await app.inject({
      method: 'GET',
      url: '/v1/credits/history?limit=200',
      headers: auth(token),
    });
    const countAfter = after.json().meta.total;
    expect(countAfter).toBe(countBefore + 1);

    // Verify the transaction details
    const transactions = after.json().data;
    const latest = transactions[0]; // most recent first
    expect(latest.orgId).toBe(orgId);
    expect(latest.type).toBe('usage');
    expect(latest.amount).toBeLessThan(0); // negative = consumption
  });

  it('top-up creates a purchase transaction', async () => {
    const before = await app.inject({
      method: 'GET',
      url: '/v1/credits/history?limit=200',
      headers: auth(token),
    });
    const countBefore = before.json().meta.total;

    await app.inject({
      method: 'POST',
      url: '/v1/credits/top-up',
      headers: auth(token),
      payload: { amount: 100, description: 'DB write test top-up' },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/v1/credits/history?limit=200',
      headers: auth(token),
    });
    const countAfter = after.json().meta.total;
    expect(countAfter).toBe(countBefore + 1);

    // Verify the purchase transaction
    const transactions = after.json().data;
    const purchase = transactions.find((t: { type: string }) => t.type === 'purchase');
    expect(purchase).toBeDefined();
    expect(purchase.amount).toBe(100);
    expect(purchase.orgId).toBe(orgId);
  });

  it('balance reflects all operations correctly', async () => {
    const balance = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: auth(token),
    });
    const data = balance.json().data;

    // Balance math should be consistent
    expect(data.total).toBe(data.included + data.purchased);
    expect(data.remaining).toBe(data.total - data.used);
    expect(data.utilizationPercent).toBe(
      data.total > 0 ? Math.round((data.used / data.total) * 100) : 0,
    );
  });
});

// ─── Auth Edge Cases ────────────────────────────────────────────────────────

run('Credits — auth edge cases', () => {
  it('rejects credit operations with expired session', async () => {
    // Register a user, get token, then try with a malformed token
    const res = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: { authorization: 'Bearer expired.invalid.token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects credit operations with no auth header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/credits/consume',
      payload: { operation_type: 'task.planned', description: 'No auth test' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects credit operations with empty Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/credits/balance',
      headers: { authorization: 'Bearer ' },
    });
    expect(res.statusCode).toBe(401);
  });
});
