/**
 * Checkout E2E (Phase 5 — unblocked without live Stripe keys).
 *
 * No STRIPE_* keys exist in this environment and none may be invented, so the
 * E2E stubs exactly one boundary: the Stripe HTTP API.
 *
 * The `stripe` npm package is an *optional* dependency — billing.ts loads it
 * via `require('stripe')`, which the vitest mock registry cannot intercept
 * (verified: `vi.mock('stripe')` has zero effect on the CJS require path).
 * The seam is therefore explicit: `__setStripeClientForTests` injects a fake
 * client whose shape (customers.create / checkout.sessions.create /
 * subscriptions.retrieve / webhooks.constructEvent) mirrors the SDK surface
 * the service uses. `STRIPE_WEBHOOK_SECRET` is set to a fixture string that
 * is never sent anywhere — it only lets the route reach the (fake)
 * verification step instead of short-circuiting on "unconfigured".
 *
 * Everything else is real — the trial autonomy ceiling, the checkout route,
 * the webhook verify → apply → dedupe path, the subscription row, the
 * entitlements read-model, and the P2 tier gate reacting to the new plan. A
 * stubbed boundary is the standard shape for this test: Stripe's own
 * dashboard + `stripe trigger` cover the wire protocol outside CI.
 */
import { createLogger, loadConfig } from '@orq8/core';
import { createDb, subscriptions } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  __resetStripeClientForTests,
  __setStripeClientForTests,
} from '../src/services/billing.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

// ── Fixture credentials (never sent anywhere; test-local only) ─────────────
const TEST_SIG = 't_e2e_valid,v1_e2e_fixture_signature';

// ── Fake Stripe client ───────────────────────────────────────────────────
// Mirrors the SDK surface billing.ts touches. Records calls for assertions.
// constructEvent emulates the real verification contract: unknown
// signatures throw (→ route 400), exactly like a bad Stripe signature.
const stripeCalls: { customers: unknown[]; sessions: unknown[] } = {
  customers: [],
  sessions: [],
};

const fakeStripeClient = {
  customers: {
    create: async (params: unknown) => {
      stripeCalls.customers.push(params);
      return { id: 'cus_e2e_1' };
    },
  },
  checkout: {
    sessions: {
      create: async (params: unknown) => {
        stripeCalls.sessions.push(params);
        return {
          id: 'cs_e2e_1',
          url: 'https://checkout.stripe.fake/pay/cs_e2e_1',
        };
      },
    },
  },
  subscriptions: {
    retrieve: async (id: string) => ({ id, customer: 'cus_e2e_1' }),
  },
  webhooks: {
    constructEvent: (payload: string | Buffer, sig: string, _secret: string) => {
      if (sig !== TEST_SIG) throw new Error('Invalid signature');
      return JSON.parse(
        typeof payload === 'string' ? payload : payload.toString('utf8'),
      );
    },
  },
};

// Inject before any route can call getStripe().
__setStripeClientForTests(fakeStripeClient);

// ── Suite setup (standard integration pattern) ───────────────────────────
const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
  // Fixture only — lets the route reach verification instead of
  // short-circuiting on "Stripe unconfigured". Never leaves the process.
  STRIPE_WEBHOOK_SECRET: 'whsec_e2e_fixture_never_sent',
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
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
  __resetStripeClientForTests();
  if (app) await app.close();
  await deps.pool.end();
});

async function registerOrgOwner(tag: string): Promise<{
  token: string;
  orgId: string;
}> {
  const email = `bill-e2e-${tag}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `Bill E2E ${tag}` },
  });
  expect(res.statusCode).toBe(201);
  const { users } = await import('@orq8/db');
  const { eq: eqFn } = await import('drizzle-orm');
  await deps.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eqFn(users.email, email.trim().toLowerCase()));
  const body = res.json() as { data: { token: string; org: { id: string } } };
  return { token: body.data.token, orgId: body.data.org.id };
}

const run = dbUp ? describe : describe.skip;

run('billing checkout E2E (Stripe boundary stubbed)', () => {
  let token: string;
  let orgId: string;
  const auth = () => ({ authorization: `Bearer ${token}` });
  const eventId = `evt_e2e_${randomUUID()}`;

  beforeAll(async () => {
    const owner = await registerOrgOwner('A');
    token = owner.token;
    orgId = owner.orgId;
  });

  afterAll(async () => {
    if (orgId) await deleteOrg(deps.pool, orgId).catch(() => {});
  });

  it('trial plan enforces the autonomy ceiling before upgrade (P2 gate)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: auth(),
      payload: {
        name: 'Autonomous Before Upgrade',
        role: 'worker',
        autonomyLevel: 'autonomous',
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error?.message ?? res.body).toMatch(/Team plan or higher/i);
  });

  it('creates a checkout session with the plan in metadata', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/checkout',
      headers: auth(),
      payload: { plan: 'team', billing_cycle: 'monthly' },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json() as { data: { sessionId: string; url: string } };
    expect(json.data.sessionId).toBe('cs_e2e_1');
    expect(json.data.url).toContain('checkout.stripe.fake');
    expect(stripeCalls.customers).toHaveLength(1);
    expect(stripeCalls.sessions).toHaveLength(1);
    const sessionParams = stripeCalls.sessions[0] as {
      metadata: Record<string, string>;
    };
    expect(sessionParams.metadata).toMatchObject({
      orgId,
      plan: 'team',
      billingCycle: 'monthly',
    });
  });

  it('applies checkout.session.completed through the signed webhook path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'stripe-signature': TEST_SIG },
      payload: {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_e2e_1',
            customer: 'cus_e2e_1',
            subscription: 'sub_e2e_1',
            metadata: { orgId, plan: 'team', billingCycle: 'monthly' },
          },
        },
      },
    });
    expect(res.statusCode).toBe(200);

    const [sub] = await deps.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.stripeSubscriptionId, 'sub_e2e_1'),
        ),
      )
      .limit(1);
    expect(sub).toBeDefined();
    expect(sub?.plan).toBe('team');
    expect(sub?.status).toBe('active');
  });

  it('the new plan is visible in the read model and lifts the tier gate', async () => {
    const limits = await app.inject({
      method: 'GET',
      url: '/v1/entitlements',
      headers: auth(),
    });
    expect(limits.statusCode).toBe(200);
    const ent = limits.json() as {
      data: { plan: string; maxAgents: number; autonomy: string };
    };
    expect(ent.data.plan).toBe('team');
    expect(ent.data.maxAgents).toBeGreaterThan(1);

    // Same hire the trial plan refused now succeeds on team.
    const hire = await app.inject({
      method: 'POST',
      url: '/v1/agents',
      headers: auth(),
      payload: {
        name: 'Autonomous After Upgrade',
        role: 'worker',
        autonomyLevel: 'autonomous',
      },
    });
    expect(hire.statusCode).toBe(201);
  });

  it('is replay-safe: redelivering the event leaves one subscription', async () => {
    const payload = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_e2e_1',
          customer: 'cus_e2e_1',
          subscription: 'sub_e2e_1',
          metadata: { orgId, plan: 'team', billingCycle: 'monthly' },
        },
      },
    };
    const headers = { 'stripe-signature': TEST_SIG };
    const r1 = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers,
      payload,
    });
    const r2 = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers,
      payload,
    });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    const rows = await deps.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.stripeSubscriptionId, 'sub_e2e_1'),
        ),
      );
    expect(rows).toHaveLength(1);
  });

  it('rejects webhooks without a verifiable signature and changes nothing', async () => {
    const before = await deps.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId));
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      payload: { id: 'evt_forged', type: 'checkout.session.completed' },
    });
    expect(res.statusCode).toBe(400);
    const after = await deps.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.orgId, orgId));
    expect(after.length).toBe(before.length);
  });
});
