/**
 * Abuse suite (docs/77 P3 §13–14).
 *
 * The brief lists 29 abuse scenarios. This file is the automated part: the ones
 * that have a control in the code today are asserted, and the ones that do **not**
 * are written down as `it.todo` at the bottom so a missing control is visible
 * rather than absent. Every later phase of the cost/credit work (docs/77 P1 §6–8)
 * is expected to move items off that list, not to add to it.
 *
 * Covered here:
 *   - a foreign id never returns 200, and a cross-tenant write changes nothing;
 *   - list endpoints do not leak another org's rows;
 *   - a waitlist signup is idempotent per email, including under a burst;
 *   - an Idempotency-Key replays the first response, and conflicts (409) when the
 *     same key arrives with a different payload;
 *   - a settlement racing itself with one idempotency key charges exactly once.
 *
 * Covered elsewhere (named so the gap does not look like a hole):
 *   - concurrent spend / lost update and ledger-vs-balance reconciliation —
 *     `credits.integration.test.ts` ("Charge integrity");
 *   - Stripe webhook signature + replay — `billing-webhook.test.ts`;
 *   - org-scoping of the credit endpoints — `credits.integration.test.ts`.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, creditTransactions, users, waitlistSignups } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';

// ─── Setup ──────────────────────────────────────────────────────────────────

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.DATABASE_URL } as NodeJS.ProcessEnv);

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

interface OrgSession {
  token: string;
  orgId: string;
  email: string;
}

async function registerConfirmedOrg(tag: string): Promise<OrgSession> {
  const email = `${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `${tag} Org` },
  });
  expect(res.statusCode).toBe(201);

  await deps.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email.trim().toLowerCase()));

  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password: 'Test1234!' },
  });
  expect(login.statusCode).toBe(200);
  const body = login.json() as { token?: string; data?: { token?: string } };
  const token = body.token ?? body.data?.token ?? '';
  expect(token).toBeTruthy();

  const me = await app.inject({ method: 'GET', url: '/v1/auth/me', headers: { authorization: `Bearer ${token}` } });
  const meBody = me.json() as { data?: { active_org_id?: string | null; memberships?: Array<{ org: { id: string } }> } };
  const orgId = meBody.data?.active_org_id ?? meBody.data?.memberships?.[0]?.org.id ?? '';
  expect(orgId).toBeTruthy();
  return { token, orgId, email };
}

function auth(session: OrgSession): Record<string, string> {
  return { authorization: `Bearer ${session.token}` };
}

/** Create a task in the caller's org and return its id. */
async function createTask(session: OrgSession, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/tasks',
    headers: auth(session),
    payload: { title },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id ?? '';
  expect(id).toBeTruthy();
  return id;
}

async function createGoal(session: OrgSession, title: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/goals',
    headers: auth(session),
    payload: { title },
  });
  expect(res.statusCode).toBe(201);
  const body = res.json() as { data?: { id?: string }; id?: string };
  const id = body.data?.id ?? body.id ?? '';
  expect(id).toBeTruthy();
  return id;
}

async function creditsUsed(session: OrgSession): Promise<number> {
  const res = await app.inject({ method: 'GET', url: '/v1/credits/balance', headers: auth(session) });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { data?: { used?: number; usedCredits?: number } };
  return body.data?.usedCredits ?? body.data?.used ?? 0;
}

// ─── 1. Tenancy ─────────────────────────────────────────────────────────────

describe.skipIf(!dbUp)('Abuse: cross-tenant ids', () => {
  it('refuses every foreign-id path, and a foreign write changes nothing', async () => {
    const orgA = await registerConfirmedOrg('abuse-a');
    const orgB = await registerConfirmedOrg('abuse-b');

    const taskTitle = `Org A private task ${randomUUID().slice(0, 6)}`;
    const goalTitle = `Org A private goal ${randomUUID().slice(0, 6)}`;
    const taskId = await createTask(orgA, taskTitle);
    const goalId = await createGoal(orgA, goalTitle);
    const missing = randomUUID();

    const probes: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; payload?: Record<string, unknown>; label: string }> = [
      { method: 'GET', url: `/v1/tasks/${taskId}`, label: 'read a foreign task' },
      { method: 'PATCH', url: `/v1/tasks/${taskId}`, payload: { title: 'hijacked' }, label: 'patch a foreign task' },
      { method: 'DELETE', url: `/v1/tasks/${taskId}`, label: 'delete a foreign task' },
      { method: 'GET', url: `/v1/goals/${goalId}`, label: 'read a foreign goal' },
      { method: 'PATCH', url: `/v1/goals/${goalId}`, payload: { title: 'hijacked' }, label: 'patch a foreign goal' },
      { method: 'DELETE', url: `/v1/goals/${goalId}`, label: 'delete a foreign goal' },
      { method: 'GET', url: `/v1/agents/${missing}`, label: 'read a nonexistent agent' },
      { method: 'POST', url: `/v1/agents/${missing}/emergency-stop`, payload: {}, label: 'stop a nonexistent agent (must not claim success)' },
      { method: 'POST', url: `/v1/agents/${missing}/resume`, payload: {}, label: 'resume a nonexistent agent' },
    ];

    for (const probe of probes) {
      const res = await app.inject({
        method: probe.method,
        url: probe.url,
        headers: auth(orgB),
        payload: probe.payload,
      });
      // 403 (refused) and 404 (not yours to know about) are both acceptable;
      // anything else means org B reached into org A's data.
      expect([401, 403, 404], `${probe.label} returned ${res.statusCode}: ${res.body}`).toContain(res.statusCode);
    }

    // The foreign write attempts left org A's data intact.
    const after = await app.inject({ method: 'GET', url: `/v1/tasks/${taskId}`, headers: auth(orgA) });
    expect(after.statusCode).toBe(200);
    const afterBody = after.json() as { data?: { title?: string; status?: string } };
    expect(afterBody.data?.title).toBe(taskTitle);

    const goalAfter = await app.inject({ method: 'GET', url: `/v1/goals/${goalId}`, headers: auth(orgA) });
    expect(goalAfter.statusCode).toBe(200);
  });

  it('does not leak another org\u2019s rows through the list endpoints', async () => {
    const orgA = await registerConfirmedOrg('abuse-list-a');
    const orgB = await registerConfirmedOrg('abuse-list-b');
    const marker = randomUUID().slice(0, 8);
    const taskId = await createTask(orgA, `Leak probe task ${marker}`);
    const goalId = await createGoal(orgA, `Leak probe goal ${marker}`);

    for (const url of ['/v1/tasks', '/v1/goals', '/v1/credits/history']) {
      const res = await app.inject({ method: 'GET', url, headers: auth(orgB) });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain(taskId);
      expect(res.body).not.toContain(goalId);
      expect(res.body).not.toContain(marker);
    }
  });
});

// ─── 2. Spam ────────────────────────────────────────────────────────────────

describe.skipIf(!dbUp)('Abuse: spam', () => {
  it('treats a repeated waitlist signup as a no-op, not a second row', async () => {
    const email = `repeat-${randomUUID().slice(0, 8)}@example.com`;
    const first = await app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email, source: 'landing' } });
    expect(first.statusCode).toBe(201);
    expect((first.json() as { data?: { already?: boolean } }).data?.already).toBe(false);

    const second = await app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email, source: 'landing' } });
    expect(second.statusCode).toBe(200);
    expect((second.json() as { data?: { already?: boolean } }).data?.already).toBe(true);

    const rows = await deps.db
      .select({ id: waitlistSignups.id })
      .from(waitlistSignups)
      .where(eq(waitlistSignups.email, email));
    expect(rows).toHaveLength(1);
  });

  it('creates exactly one row when the same signup arrives five times at once', async () => {
    const email = `burst-${randomUUID().slice(0, 8)}@example.com`;
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email, source: 'landing' } }),
      ),
    );

    // A raced duplicate must be answered, not crashed: a unique-index violation
    // surfacing as a 500 would be an outage caused by a double-click.
    const serverErrors = responses.filter((r) => r.statusCode >= 500);
    expect(serverErrors.map((r) => r.statusCode)).toEqual([]);

    const rows = await deps.db
      .select({ id: waitlistSignups.id })
      .from(waitlistSignups)
      .where(eq(waitlistSignups.email, email));
    expect(rows).toHaveLength(1);
  });
});

// ─── 3. Replay / idempotency ────────────────────────────────────────────────

describe.skipIf(!dbUp)('Abuse: replay and idempotency', () => {
  it('replays a mutating request under one Idempotency-Key instead of applying it twice', async () => {
    const session = await registerConfirmedOrg('abuse-idem');
    const key = `idem-${randomUUID()}`;
    const payload = {
      operation_type: 'task.executed',
      description: 'idempotency probe',
      amount: 1,
      idempotency_key: key,
    };
    const headers = { ...auth(session), 'idempotency-key': key };

    const first = await app.inject({ method: 'POST', url: '/v1/credits/consume', headers, payload });
    expect(first.statusCode).toBe(200);
    const usedAfterFirst = await creditsUsed(session);

    const second = await app.inject({ method: 'POST', url: '/v1/credits/consume', headers, payload });
    expect(second.statusCode, `first=${first.statusCode}:${first.body} second=${second.statusCode}:${second.body}`).toBe(first.statusCode);
    expect(second.body).toBe(first.body);
    // The replay is a replay: the balance did not move a second time.
    expect(await creditsUsed(session)).toBe(usedAfterFirst);

    const ledger = await deps.db
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(and(eq(creditTransactions.orgId, session.orgId), eq(creditTransactions.idempotencyKey, key)));
    expect(ledger).toHaveLength(1);
  });

  it('rejects one key used for two different payloads', async () => {
    const session = await registerConfirmedOrg('abuse-conflict');
    const key = `conflict-${randomUUID()}`;
    const headers = { ...auth(session), 'idempotency-key': key };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/credits/consume',
      headers,
      payload: { operation_type: 'task.executed', description: 'first payload', amount: 1, idempotency_key: key },
    });
    expect(first.statusCode).toBe(200);

    const conflicting = await app.inject({
      method: 'POST',
      url: '/v1/credits/consume',
      headers,
      payload: { operation_type: 'task.executed', description: 'different payload', amount: 1, idempotency_key: key },
    });
    expect(conflicting.statusCode).toBe(409);
    expect((conflicting.json() as { error?: { code?: string } }).error?.code).toBe('idempotency.conflict');
  });
});

// ─── 4. Concurrent spend ────────────────────────────────────────────────────

describe.skipIf(!dbUp)('Abuse: concurrent spend', () => {
  it('charges once when the same settlement races itself five ways', async () => {
    const session = await registerConfirmedOrg('abuse-race');
    const key = `race-${randomUUID()}`;
    const payload = {
      operation_type: 'task.executed',
      description: 'racing settlement',
      amount: 2,
      idempotency_key: key,
    };
    const headers = { ...auth(session), 'idempotency-key': key };

    const before = await creditsUsed(session);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({ method: 'POST', url: '/v1/credits/consume', headers, payload }),
      ),
    );

    expect(responses.filter((r) => r.statusCode >= 500).map((r) => r.statusCode)).toEqual([]);

    const ledger = await deps.db
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(and(eq(creditTransactions.orgId, session.orgId), eq(creditTransactions.idempotencyKey, key)));
    expect(ledger).toHaveLength(1);

    // And the balance moved by exactly the one charge — the ledger and the
    // cached balance agree after the race (docs/77 A3).
    expect((await creditsUsed(session)) - before).toBe(2);
  });
});

// ─── 5. Controls that do not exist yet ──────────────────────────────────────

describe('Abuse scenarios with no control yet (documented, not hidden)', () => {
  // These are the docs/77 scenarios whose guard has not been built. They are
  // todos rather than skipped tests so the count is visible in every run: a
  // phase that fixes one turns it into a real assertion here.
  it.todo('per-org, per-agent, per-endpoint-class and per-provider rate limits (docs/77 P1 \u00a78)');
  it.todo('recursive delegation / self-hire depth guard (docs/77 P3 \u00a713)');
  it.todo('per-day spend ceiling for trial orgs with no card (docs/77 A10)');
  it.todo('provider-exhaustion fallback proof: every provider down returns a clean error, not a hang (docs/77 A9)');
  it.todo('an agent job cannot be claimed twice under concurrent workers (docs/77 P3)');
});
