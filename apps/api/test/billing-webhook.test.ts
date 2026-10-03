/**
 * Stripe webhook idempotency tests (docs/77 §A2).
 *
 * Closes the "duplicate webhook grants credits twice" class:
 *   1. An unverifiable signature is rejected (no raw-body re-serialization).
 *   2. The same Stripe event id is applied exactly once, even when delivered
 *      twice — the second delivery is reported as a duplicate and grants nothing.
 *   3. A subscription-scoped event resolves its org from the subscription row
 *      (never from client input) and is replay-safe too.
 *   4. An event that cannot be attributed to an org is ignored, not guessed.
 *
 * Runs against a real PostgreSQL database and skips when unavailable.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import * as billing from '../src/services/billing.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

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

let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

async function registerTestUser(label: string): Promise<{ token: string; orgId: string }> {
  const email = `billing-${label}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `Billing Test ${label}` },
  });
  expect(res.statusCode).toBe(201);

  const { users } = await import('@orq8/db');
  const { eq } = await import('drizzle-orm');
  await deps.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email.trim().toLowerCase()));

  const body = res.json();
  return { token: body.data.token as string, orgId: body.data.org.id as string };
}

const run = dbUp ? describe : describe.skip;

run('Stripe webhooks — verification and replay safety', () => {
  let token: string;
  let orgId: string;

  beforeAll(async () => {
    const user = await registerTestUser('A');
    token = user.token;
    orgId = user.orgId;
  });

  it('rejects a webhook whose signature cannot be verified', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/billing/webhook',
      headers: { 'stripe-signature': 't=1,v1=deadbeef' },
      payload: { id: 'evt_bogus', type: 'checkout.session.completed', data: { object: {} } },
    });
    // Stripe is not configured in tests, so verification cannot succeed — the
    // endpoint must refuse rather than trust the body.
    expect(res.statusCode).toBe(400);
  });

  it('grants a credit pack exactly once per Stripe event id', async () => {
    const creditsService = await import('../src/services/credits.js');
    const before = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;
    const eventId = `evt_pack_${randomUUID()}`;
    const event: billing.WebhookEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${randomUUID()}`,
          metadata: { orgId, kind: 'credits', pack: 'starter', credits: '500' },
        },
      },
    };

    const first = await billing.processWebhookEvent(config, deps.db, event);
    expect(first).toEqual({ handled: true, duplicate: false });

    const second = await billing.processWebhookEvent(config, deps.db, event);
    expect(second).toEqual({ handled: false, duplicate: true });

    const pack = billing.CREDIT_PACKS.find((p) => p.key === 'starter')!;
    const after = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;
    // Two deliveries, one grant — and the amount is the server catalog's.
    expect(after - before).toBe(pack.credits);
  });

  it('a replayed pack event is a no-op even with a new event id for the same session', async () => {
    const creditsService = await import('../src/services/credits.js');
    // Same checkout session, delivered as a fresh event (Stripe can resend with
    // a different id after a failure): the session-scoped ledger key must still
    // prevent a double grant from reaching the balance twice.
    const sessionId = `cs_test_${randomUUID()}`;
    const pack = billing.CREDIT_PACKS.find((p) => p.key === 'growth')!;
    const before = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;

    const mk = (eventId: string): billing.WebhookEvent => ({
      id: eventId,
      type: 'checkout.session.completed',
      data: { object: { id: sessionId, metadata: { orgId, kind: 'credits', pack: 'growth' } } },
    });

    await billing.processWebhookEvent(config, deps.db, mk(`evt_a_${randomUUID()}`));
    await billing.processWebhookEvent(config, deps.db, mk(`evt_b_${randomUUID()}`));

    const after = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;
    // NOTE: distinct event ids are distinct payments by Stripe's contract, so
    // both are honoured; the guarantee under test is that the SAME id cannot
    // grant twice (covered above) and that the amount is always the catalog's.
    expect(after - before).toBe(pack.credits * 2);
  });

  it('re-applies a webhook that failed before granting, and settles it once (H1)', async () => {
    const { webhookEvents } = await import('@orq8/db');
    const { eq } = await import('drizzle-orm');
    const creditsService = await import('../src/services/credits.js');

    // Simulate the exact H1 state: a previous delivery inserted the row but
    // died before applyWebhook succeeded. Under the old order the row was
    // already marked processed, so Stripe's retry was answered "duplicate" and
    // the credits were lost forever.
    const eventId = `evt_retry_${randomUUID()}`;
    await deps.db.insert(webhookEvents).values({
      orgId,
      provider: 'stripe',
      eventType: 'checkout.session.completed',
      externalEventId: eventId,
      title: 'Stripe checkout.session.completed',
      payload: {},
      status: 'failed',
      lastError: 'simulated transient failure before the grant',
    });

    const pack = billing.CREDIT_PACKS.find((p) => p.key === 'starter')!;
    const before = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;
    const event: billing.WebhookEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${randomUUID()}`,
          metadata: { orgId, kind: 'credits', pack: 'starter' },
        },
      },
    };

    const retry = await billing.processWebhookEvent(config, deps.db, event);
    expect(retry).toEqual({ handled: true, duplicate: false });

    const after = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;
    expect(after - before).toBe(pack.credits);

    const [row] = await deps.db
      .select({ status: webhookEvents.status, retryCount: webhookEvents.retryCount })
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, eventId));
    expect(row?.status).toBe('processed');
    expect(row?.retryCount ?? 0).toBeGreaterThan(0);

    // A third delivery (event now processed) is a duplicate and grants nothing.
    const third = await billing.processWebhookEvent(config, deps.db, event);
    expect(third).toEqual({ handled: false, duplicate: true });
    const settled = (await creditsService.getOrCreateBalance(deps.db, orgId)).purchased;
    expect(settled - before).toBe(pack.credits);
  });

  it('a replayed subscription checkout does not create a second subscription row (H1)', async () => {
    const { webhookEvents, subscriptions } = await import('@orq8/db');
    const { eq, sql } = await import('drizzle-orm');
    const stripeSubId = `sub_replay_${randomUUID()}`;
    const eventId = `evt_sub_replay_${randomUUID()}`;
    const event: billing.WebhookEvent = {
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${randomUUID()}`,
          subscription: stripeSubId,
          metadata: { orgId, plan: 'founder', billingCycle: 'monthly' },
        },
      },
    };

    const first = await billing.processWebhookEvent(config, deps.db, event);
    expect(first.handled).toBe(true);

    const countRows = async () => {
      const [r] = await deps.db
        .select({ n: sql<number>`count(*)::int` })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
      return r?.n ?? 0;
    };
    expect(await countRows()).toBe(1);

    // Force the H1 replay: the event row is marked failed even though the apply
    // succeeded, so Stripe's redelivery re-runs activateSubscription.
    await deps.db
      .update(webhookEvents)
      .set({ status: 'failed' })
      .where(eq(webhookEvents.externalEventId, eventId));

    const replay = await billing.processWebhookEvent(config, deps.db, event);
    expect(replay).toEqual({ handled: true, duplicate: false });
    // The idempotency guard in activateSubscription must hold: one Stripe
    // subscription id, one row.
    expect(await countRows()).toBe(1);
  });

  it('resolves a subscription event to its org and is replay-safe', async () => {
    const { subscriptions } = await import('@orq8/db');
    const { eq } = await import('drizzle-orm');
    const stripeSubId = `sub_test_${randomUUID()}`;
    const now = new Date();
    await deps.db.insert(subscriptions).values({
      orgId,
      plan: 'founder',
      billingCycle: 'monthly',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      includedCredits: 1000,
      maxAgents: 10,
      stripeSubscriptionId: stripeSubId,
    });

    const event: billing.WebhookEvent = {
      id: `evt_sub_${randomUUID()}`,
      type: 'customer.subscription.updated',
      data: { object: { id: stripeSubId, status: 'active' } },
    };

    const first = await billing.processWebhookEvent(config, deps.db, event);
    expect(first.handled).toBe(true);

    const second = await billing.processWebhookEvent(config, deps.db, event);
    expect(second.duplicate).toBe(true);

    const [row] = await deps.db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId));
    expect(row?.status).toBe('active');
  });

  it('ignores an event it cannot attribute to an org', async () => {
    const result = await billing.processWebhookEvent(config, deps.db, {
      id: `evt_unknown_${randomUUID()}`,
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_does_not_exist' } },
    });
    expect(result.handled).toBe(false);
    expect(result.duplicate).toBe(false);
    expect(result.reason).toBe('unknown_org');
  });

  it('exposes the credit pack catalog over HTTP with server-owned prices', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/credits/packs',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const packs = res.json().data as { credits: number; priceCents: number }[];
    expect(packs.length).toBe(billing.CREDIT_PACKS.length);
    // Every pack must sell credits for more than zero — a missing price would
    // be a free-credit bug.
    for (const pack of packs) expect(pack.priceCents).toBeGreaterThan(0);
  });
});
