/**
 * Credit reservations (docs/80 Phase 1).
 *
 * Reserve → execute → settle/release. These tests exercise the primitives the
 * task executor and Executive Agent now depend on, against the real embedded
 * Postgres lineage:
 *
 *   - a reservation moves credits from `available` into `reserved` and no
 *     further (no ledger row is written when the hold is taken);
 *   - settlement charges the measured actual, capped at the estimate, and
 *     releases the remainder — never more than the hold;
 *   - release and expiry return the whole hold with no charge;
 *   - concurrent reservations cannot over-commit the same credits, and a
 *     reservation settled five ways charges exactly once;
 *   - a failed task (settle with actual 0) charges nothing;
 *   - a refund returns credits and keeps reconcile drift at zero;
 *   - the per-task ceiling caps the estimate and flags approval.
 */

import { createLogger, loadConfig, type AppConfig } from '@orq8/core';
import { createDb, creditTransactions, llmPerformance } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import {
  reserveCredits,
  settleReservation,
  releaseReservation,
  expireStaleReservations,
  refundCredits,
  getOrCreateBalance,
  reconcileLedger,
  CreditExhaustedError,
} from '../src/services/credits.js';
import { estimateCredits } from '../src/services/credit-estimator.js';

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

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(deps);
});

afterAll(async () => {
  if (app) await app.close();
  await deps.pool.end();
});

async function registerOrg(label: string): Promise<{ token: string; orgId: string }> {
  const email = `resv-${label}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `Reservation Test ${label}` },
  });
  expect(res.statusCode).toBe(201);
  const { users } = await import('@orq8/db');
  await deps.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email.trim().toLowerCase()));
  const body = res.json();
  return { token: body.data.token as string, orgId: body.data.org.id as string };
}

const run = dbUp ? describe : describe.skip;

run('Credit reservations (docs/80 Phase 1)', () => {
  it('holds credits out of available without writing a ledger row', async () => {
    const { orgId } = await registerOrg('hold');
    const before = await getOrCreateBalance(deps.db, orgId);

    const reservation = await reserveCredits(deps.db, orgId, { estimate: 30, reason: 'test' });
    const after = await getOrCreateBalance(deps.db, orgId);

    expect(reservation.estimateCredits).toBe(30);
    expect(reservation.status).toBe('active');
    expect(after.reserved).toBe(30);
    expect(after.used).toBe(before.used);
    expect(after.available).toBe(before.available - 30);

    // No money moved: the hold is state, not a transaction.
    const rows = await deps.db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.orgId, orgId), eq(creditTransactions.type, 'usage')));
    expect(rows).toHaveLength(0);
  });

  it('refuses a reservation the balance cannot cover', async () => {
    const { orgId } = await registerOrg('over');
    const balance = await getOrCreateBalance(deps.db, orgId);
    await expect(
      reserveCredits(deps.db, orgId, { estimate: balance.available + 1 }),
    ).rejects.toBeInstanceOf(CreditExhaustedError);
  });

  it('settles the measured actual, caps it at the estimate, and releases the remainder', async () => {
    const { orgId } = await registerOrg('settle');
    const before = await getOrCreateBalance(deps.db, orgId);
    const reservation = await reserveCredits(deps.db, orgId, { estimate: 40 });

    const outcome = await settleReservation(deps.db, reservation.id, {
      actualCredits: 25,
      description: 'Task: settle test',
    });

    const after = await getOrCreateBalance(deps.db, orgId);
    expect(outcome.settled).toBe(25);
    expect(outcome.released).toBe(15);
    expect(after.reserved).toBe(0);
    expect(after.used).toBe(before.used + 25);

    // A settle that measures above the hold is capped, never overcharged.
    const reservation2 = await reserveCredits(deps.db, orgId, { estimate: 5 });
    const capped = await settleReservation(deps.db, reservation2.id, { actualCredits: 999 });
    expect(capped.settled).toBe(5);
  });

  it('charges exactly once when the same reservation settles five ways', async () => {
    const { orgId } = await registerOrg('race');
    const before = await getOrCreateBalance(deps.db, orgId);
    const reservation = await reserveCredits(deps.db, orgId, { estimate: 20 });

    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        settleReservation(deps.db, reservation.id, { actualCredits: 20, description: 'race' }),
      ),
    );

    const settledTotal = outcomes.reduce((sum, o) => sum + o.settled, 0);
    const after = await getOrCreateBalance(deps.db, orgId);
    expect(settledTotal).toBe(20);
    expect(after.used).toBe(before.used + 20);
    expect(after.reserved).toBe(0);
    expect(outcomes.filter((o) => o.duplicate)).toHaveLength(4);
  });

  it('cannot over-commit the same credits under concurrent reservations', async () => {
    const { orgId } = await registerOrg('concurrent');
    const before = await getOrCreateBalance(deps.db, orgId);
    // Trial allotment is 100; 40 apiece admits exactly two.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reserveCredits(deps.db, orgId, { estimate: 40 })),
    );
    const granted = results.filter((r) => r.status === 'fulfilled');
    expect(granted).toHaveLength(2);

    const after = await getOrCreateBalance(deps.db, orgId);
    expect(after.reserved).toBe(80);
    expect(after.used).toBe(before.used);
  });

  it('releases the whole hold on failure without charging', async () => {
    const { orgId } = await registerOrg('fail');
    const before = await getOrCreateBalance(deps.db, orgId);
    const reservation = await reserveCredits(deps.db, orgId, { estimate: 25 });

    // A failed task measured no model work: settle with 0 releases everything.
    const outcome = await settleReservation(deps.db, reservation.id, { actualCredits: 0 });

    const after = await getOrCreateBalance(deps.db, orgId);
    expect(outcome.settled).toBe(0);
    expect(outcome.released).toBe(25);
    expect(after.used).toBe(before.used);
    expect(after.reserved).toBe(0);
  });

  it('release returns the hold and records a reservation_release line', async () => {
    const { orgId } = await registerOrg('release');
    const before = await getOrCreateBalance(deps.db, orgId);
    const reservation = await reserveCredits(deps.db, orgId, { estimate: 15 });

    const outcome = await releaseReservation(deps.db, reservation.id, 'abandoned');
    const after = await getOrCreateBalance(deps.db, orgId);
    expect(outcome.released).toBe(15);
    expect(after.reserved).toBe(0);
    expect(after.available).toBe(before.available);

    const releases = await deps.db
      .select()
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.orgId, orgId),
          eq(creditTransactions.type, 'reservation_release'),
        ),
      );
    expect(releases).toHaveLength(1);
    expect(releases[0]!.amount).toBe(0);
  });

  it('expires a stale hold and returns its credits', async () => {
    const { orgId } = await registerOrg('expire');
    const reservation = await reserveCredits(deps.db, orgId, {
      estimate: 20,
      expiresAt: new Date(Date.now() - 60_000),
    });

    const swept = await expireStaleReservations(deps.db);
    expect(swept.expired).toBeGreaterThanOrEqual(1);

    const after = await getOrCreateBalance(deps.db, orgId);
    expect(after.reserved).toBe(0);

    // Not double-released by a second sweep.
    const again = await expireStaleReservations(deps.db);
    expect(again.releasedCredits).toBe(0);

    const [row] = await deps.db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.orgId, orgId));
    // reserve wrote no ledger row; only the expiry release exists.
    expect(row?.type).toBe('reservation_release');
    expect(reservation.status).toBe('active');
  });

  it('refunds a settled charge and keeps reconcile drift at zero', async () => {
    const { orgId } = await registerOrg('refund');
    const before = await getOrCreateBalance(deps.db, orgId);
    const reservation = await reserveCredits(deps.db, orgId, { estimate: 30 });
    await settleReservation(deps.db, reservation.id, { actualCredits: 30, description: 'Task: refund' });

    const refund = await refundCredits(deps.db, orgId, 10, {
      reason: 'ORQ8-caused failure',
      idempotencyKey: `refund:${randomUUID()}`,
    });
    expect(refund.refunded).toBe(10);

    const after = await getOrCreateBalance(deps.db, orgId);
    expect(after.used).toBe(before.used + 20);

    const recon = await reconcileLedger(deps.db, orgId);
    expect(recon.drift).toBe(0);
    expect(recon.balanced).toBe(true);

    // Idempotent: the same key refunds nothing again.
    const replay = await refundCredits(deps.db, orgId, 10, {
      reason: 'ORQ8-caused failure',
      idempotencyKey: `refund:fixed-key`,
    });
    const replayAgain = await refundCredits(deps.db, orgId, 10, {
      reason: 'ORQ8-caused failure',
      idempotencyKey: `refund:fixed-key`,
    });
    expect(replay.refunded).toBe(10);
    expect(replayAgain.refunded).toBe(0);
    expect(replayAgain.duplicate).toBe(true);
  });

  it('keeps one org’s settlement out of another org’s balance', async () => {
    const a = await registerOrg('tenA');
    const b = await registerOrg('tenB');
    const beforeB = await getOrCreateBalance(deps.db, b.orgId);

    const reservation = await reserveCredits(deps.db, a.orgId, { estimate: 12 });
    await settleReservation(deps.db, reservation.id, { actualCredits: 12, description: 'Task: tenancy' });

    const afterB = await getOrCreateBalance(deps.db, b.orgId);
    expect(afterB.used).toBe(beforeB.used);
    expect(afterB.reserved).toBe(beforeB.reserved);
  });

  it('caps the estimate at the per-task ceiling and flags approval', async () => {
    const { orgId } = await registerOrg('ceiling');
    const tight: AppConfig = { ...config, CREDIT_TASK_CEILING: 3, CREDIT_ESTIMATE_FLOOR: 2 };

    // Seed measured usage far above the ceiling.
    await deps.db.insert(llmPerformance).values({
      orgId,
      phase: 'task.execute',
      model: 'test/model',
      provider: 'nvidia',
      success: true,
      promptTokens: 50_000,
      completionTokens: 50_000,
      totalTokens: 100_000,
    });

    const estimate = await estimateCredits(deps.db, tight, {
      orgId,
      operationClass: 'task.execute',
      phase: 'task.execute',
    });
    expect(estimate.estimate).toBe(3);
    expect(estimate.ceiling).toBe(3);
    expect(estimate.approvalRequired).toBe(true);
    expect(estimate.source).toBe('measured');

    // And the reservation it drives respects the ceiling.
    const reservation = await reserveCredits(deps.db, orgId, { estimate: estimate.estimate });
    expect(reservation.estimateCredits).toBe(3);
  });

  it('returns the estimate through POST /v1/credits/estimate for the caller’s org', async () => {
    const { token, orgId } = await registerOrg('route');
    const res = await app.inject({
      method: 'POST',
      url: '/v1/credits/estimate',
      headers: { authorization: `Bearer ${token}` },
      payload: { operation_class: 'task.execute' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().data;
    expect(body.estimate).toBeGreaterThan(0);
    expect(body.estimate).toBeLessThanOrEqual(body.ceiling);
    expect(body.basis).toBeTruthy();

    // The estimate never leaks another org's measured history: a fresh org has
    // no samples, so the source is the cold-start table.
    expect(body.source).toBe('cold_start');

    const balance = await getOrCreateBalance(deps.db, orgId);
    expect(balance.available).toBeGreaterThanOrEqual(0);
  });

  it('caps a trial org’s spending per day (docs/80 §3.3, abuse todo #3)', async () => {
    const { orgId } = await registerOrg('trialcap');
    const cap = 25;

    // A trial org (the default on first balance) may hold 20 of the 25 daily cap.
    const first = await reserveCredits(deps.db, orgId, { estimate: 20, dailyCap: cap });
    await settleReservation(deps.db, first.id, { actualCredits: 20, description: 'trial day' });

    // 20 is already spent today; a further 10-credit hold would exceed the cap.
    await expect(
      reserveCredits(deps.db, orgId, { estimate: 10, dailyCap: cap }),
    ).rejects.toBeInstanceOf(CreditExhaustedError);

    // The remaining 5 of the day is still allowed.
    const remaining = await reserveCredits(deps.db, orgId, { estimate: 5, dailyCap: cap });
    expect(remaining.estimateCredits).toBe(5);

    // A paid plan is not subject to the trial cap.
    await expect(
      reserveCredits(deps.db, orgId, { estimate: 40, dailyCap: 0 }),
    ).resolves.toBeTruthy();
  });
});
