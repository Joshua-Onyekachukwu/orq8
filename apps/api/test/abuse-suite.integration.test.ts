/**
 * Abuse suite (docs/77 P3 §13–14).
 *
 * The brief lists 29 abuse scenarios. This file is the automated part: the ones
 * that have a control in the code today are asserted. Every control has now
 * shipped — layered rate limits, the trial per-day ceiling, the recursion guard,
 * provider exhaustion and the concurrent-claim/no-leaked-lock proof (in
 * scripts/worker-soak.ts) — so there are no `it.todo` items left; a future
 * missing control should add one back rather than be silently absent.
 *
 * Covered here:
 *   - a foreign id never returns 200, and a cross-tenant write changes nothing;
 *   - list endpoints do not leak another org's rows;
 *   - a waitlist signup is idempotent per email, including under a burst;
 *   - an Idempotency-Key replays the first response, and conflicts (409) when the
 *     same key arrives with a different payload;
 *   - a settlement racing itself with one idempotency key charges exactly once;
 *   - the layered per-user / per-org / per-agent / per-provider limits answer 429
 *     before any work starts (docs/80 §3.3, closing docs/77 P1 §8).
 *
 * Covered elsewhere (named so the gap does not look like a hole):
 *   - concurrent spend / lost update and ledger-vs-balance reconciliation —
 *     `credits.integration.test.ts` ("Charge integrity");
 *   - Stripe webhook signature + replay — `billing-webhook.test.ts`;
 *   - org-scoping of the credit endpoints — `credits.integration.test.ts`.
 */

import { createLogger, loadConfig, type AppConfig } from '@orq8/core';
import { createDb, agentJobs, agents, creditTransactions, tasks, users, waitlistSignups } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import { reserveCredits, settleReservation, CreditExhaustedError } from '../src/services/credits.js';

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

// RATE_LIMIT_FORCE=true activates the layered limits under NODE_ENV=test. The
// shared `app` below keeps them off (so the older scenarios stay untouched);
// only `limitedApp` / `disabledApp` in section 5 exercise rate limiting.
/**
 * Budgets small enough to trip in three requests, so every layer is proven with
 * cheap calls instead of by hammering the production defaults.
 *   execute: user 2/min, org 4/h   → the per-user test trips on request 3
 *   import:  user 50/min, org 2/h  → the per-org test trips on request 3
 *   agent:   2 jobs/hour           → the per-agent test seeds two jobs
 */
const limitedConfig: AppConfig = {
  ...config,
  RATE_LIMIT_FORCE: 'true',
  RATE_LIMIT_EXECUTE_USER_PER_MIN: 2,
  RATE_LIMIT_EXECUTE_ORG_PER_HOUR: 4,
  RATE_LIMIT_IMPORT_USER_PER_MIN: 50,
  RATE_LIMIT_IMPORT_ORG_PER_HOUR: 2,
  RATE_LIMIT_AGENT_JOBS_PER_HOUR: 2,
  JOB_QUEUE_MODE: 'enqueue',
};
const disabledConfig: AppConfig = { ...limitedConfig, RATE_LIMIT_ENABLED: 'false' };

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

/** A second live session for the same user — same org, different session bucket. */
async function loginSecondSession(session: OrgSession): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email: session.email, password: 'Test1234!' },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as { token?: string; data?: { token?: string } };
  const token = body.token ?? body.data?.token ?? '';
  expect(token).toBeTruthy();
  return token;
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

// ─── 5. Layered rate limits ─────────────────────────────────────────────────
//
// docs/77 P1 §8 asked for four layers — per user (per endpoint class), per org,
// per agent, per provider. They are asserted here over real HTTP with the tiny
// budgets in `limitedConfig`; the provider gates have unit pins in
// `rate-limits-layered.test.ts`. All of them answer with the shared envelope:
// `{ error: { code: 'rate_limited', policy_ref } }` + Retry-After.

describe.skipIf(!dbUp)('Abuse: layered rate limits', () => {
  let limitedApp: FastifyInstance;
  let disabledApp: FastifyInstance;

  beforeAll(async () => {
    limitedApp = await buildApp({ ...deps, config: limitedConfig });
    disabledApp = await buildApp({ ...deps, config: disabledConfig });
  });

  afterAll(async () => {
    if (limitedApp) await limitedApp.close();
    if (disabledApp) await disabledApp.close();
  });

  it('throttles one session at the per-user / per-endpoint-class rate', async () => {
    const session = await registerConfirmedOrg('abuse-limits-user');
    const call = () =>
      limitedApp.inject({
        method: 'POST',
        url: '/v1/commands/tasks/execute-pending',
        headers: auth(session),
        payload: {},
      });

    expect((await call()).statusCode).not.toBe(429);
    expect((await call()).statusCode).not.toBe(429);

    const third = await call();
    expect(third.statusCode).toBe(429);
    const body = third.json() as { error?: { code?: string; policy_ref?: string } };
    expect(body.error?.code).toBe('rate_limited');
    expect(body.error?.policy_ref).toBe('docs/80 §3.3');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts every session of one company against the shared per-org bucket', async () => {
    const session = await registerConfirmedOrg('abuse-limits-org');
    const secondToken = await loginSecondSession(session);
    const call = (token: string) =>
      limitedApp.inject({
        method: 'POST',
        url: '/v1/business-imports/analyze',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

    // Two sessions, two user buckets — one company bucket.
    expect((await call(session.token)).statusCode).not.toBe(429);
    expect((await call(secondToken)).statusCode).not.toBe(429);

    const third = await call(session.token);
    expect(third.statusCode).toBe(429);
    expect((third.json() as { error?: { code?: string } }).error?.code).toBe('rate_limited');

    // Another company is untouched: the ceiling is per-org, not platform-wide.
    const other = await registerConfirmedOrg('abuse-limits-org-c');
    expect((await call(other.token)).statusCode).not.toBe(429);
  });

  it('stops one AI employee from looping: per-agent hourly job quota', async () => {
    const session = await registerConfirmedOrg('abuse-limits-agent');
    const [agent] = await deps.db
      .insert(agents)
      .values({ orgId: session.orgId, name: 'Loop Probe', role: 'software_engineer', status: 'active' })
      .returning({ id: agents.id });
    const taskId = await createTask(session, 'Loop probe task');
    await deps.db.update(tasks).set({ agentId: agent!.id }).where(eq(tasks.id, taskId));

    // Two jobs is this employee's whole hourly budget (agent cap = 2).
    for (let i = 0; i < 2; i++) {
      await deps.db.insert(agentJobs).values({
        orgId: session.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });
    }

    const single = await limitedApp.inject({
      method: 'POST',
      url: `/v1/commands/tasks/${taskId}/execute`,
      headers: auth(session),
    });
    expect(single.statusCode).toBe(429);
    expect((single.json() as { error?: { code?: string } }).error?.code).toBe('rate_limited');

    // The batch path throttles the exhausted employee and says so in the response.
    const batch = await limitedApp.inject({
      method: 'POST',
      url: '/v1/commands/tasks/execute-pending',
      headers: auth(session),
      payload: {},
    });
    expect(batch.statusCode).toBe(200);
    const data = (batch.json() as { data?: { queued?: number; throttled?: Array<{ taskId: string }> } }).data;
    expect(data?.queued).toBe(0);
    expect(data?.throttled?.map((t) => t.taskId)).toContain(taskId);
  });

  it('RATE_LIMIT_ENABLED=false turns every layer off', async () => {
    const session = await registerConfirmedOrg('abuse-limits-off');
    // With the budgets in `limitedConfig`, request 3 would be a 429 if active.
    for (let i = 0; i < 5; i++) {
      const res = await disabledApp.inject({
        method: 'POST',
        url: '/v1/commands/tasks/execute-pending',
        headers: auth(session),
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it('caps a trial org at its per-day credit ceiling even with allotment left', async () => {
    const session = await registerConfirmedOrg('abuse-trial-cap');
    const cap = 25;
    // Fill the day: a 20-credit settlement leaves 5 for the rest of the UTC day.
    const first = await reserveCredits(deps.db, session.orgId, {
      estimate: 20,
      dailyCap: cap,
      reason: 'trial.execute',
    });
    await settleReservation(deps.db, first.id, { actualCredits: 20, description: 'trial day' });

    // The org still holds most of its 100-credit trial allotment, yet the day is
    // spent: the per-day cap is what bounds an account with no card (docs/77 A10).
    await expect(
      reserveCredits(deps.db, session.orgId, { estimate: 10, dailyCap: cap, reason: 'trial.execute' }),
    ).rejects.toBeInstanceOf(CreditExhaustedError);
  });

});

// ─── 6. Controls that do not exist yet ──────────────────────────────────────

// ─── 6. Abuse controls — all implemented, asserted in their own suites ─────
  // These are the docs/77 scenarios whose guard has not been built. They are
  // todos rather than skipped tests so the count is visible in every run: a
  // phase that fixes one turns it into a real assertion here.
  // Recursive delegation / self-hire depth guard (docs/77 P3 \u00a713) shipped
  // with the Phase 2 recursion caps: asserted in ai-budget.test.ts (depth,
  // sibling-per-task and per-command caps), so it is no longer a todo here.
  // The per-day trial ceiling (docs/77 A10) shipped with the reservation work
  // (docs/80 Phase 1) and is asserted in §5 above and in credit-reservations.
  // Provider exhaustion (docs/77 A9) is asserted in llm-fallback.test.ts —
  // "returns null when every provider in the chain fails" plus the saturated
  // provider gate test.
  // Concurrent job claim (docs/77 P3) is proven by scripts/worker-soak.ts: it
  // boots an isolated database, runs 4 real workers against 20k+ jobs with a
  // deliberately leaked lock, and asserts the queue drains with no double-claims
  // and no leaked locks. It is a soak harness rather than a unit test because
  // workers are global — the proof needs the isolated database this file cannot
  // provide without racing the rest of the suite.
