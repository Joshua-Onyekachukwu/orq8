/**
 * §20 decision-outcome feedback loop — founder-filed outcome classification.
 *
 * Covers:
 *   1. classifyFounderOutcome — the narrative → structured-verdict mapping
 *      (positive/negative cue detection, measured-execution tie-breaks).
 *   2. updateDecision — a founder filing an outcome via PATCH gets a
 *      structured prediction_accuracy IMMEDIATELY (not left null for the
 *      scheduled reviewer), with the narrative preserved untouched.
 *
 * The DB describe block follows the suite's standard probe-and-skip pattern
 * (same as deliberations.integration.test.ts): tests run against the local
 * Postgres when it is up and are skipped cleanly when it is not.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, decisions } from '@orq8/db';
import type { Db } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyFounderOutcome } from '../src/services/decision-feedback.js';
import { updateDecision } from '../src/services/decision-memory.js';
import { deleteOrg } from './helpers/delete-org.js';

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
} catch {
  pool = undefined;
}
const run = pool ? describe : describe.skip;

describe('classifyFounderOutcome (§20 phase 2)', () => {
  it('reads success narratives as accurate', () => {
    expect(classifyFounderOutcome('Beta activation exceeded the 40% expectation and blockers were resolved.', 12, 0)).toBe('accurate');
    expect(classifyFounderOutcome('Launch validated the recommendation; churn held flat.', 8, 0)).toBe('accurate');
  });

  it('reads failure narratives as inaccurate', () => {
    expect(classifyFounderOutcome('The campaign failed to generate pipeline and missed target.', 2, 5)).toBe('inaccurate');
    expect(classifyFounderOutcome('Churn rose after GA — we reversed the rollout.', 1, 3)).toBe('inaccurate');
  });

  it('mixed narrative maps to partially_accurate', () => {
    expect(
      classifyFounderOutcome('Activation exceeded expectations, but churn rose slightly during the window.', 5, 1),
    ).toBe('partially_accurate');
  });

  it('falls back to measured execution when the narrative is neutral', () => {
    expect(classifyFounderOutcome('The rollout completed within the window.', 7, 0)).toBe('accurate');
    expect(classifyFounderOutcome('The rollout completed within the window.', 3, 4)).toBe('inaccurate');
    expect(classifyFounderOutcome('The rollout completed within the window.', 3, 1)).toBe('partially_accurate');
  });

  it('never invents confidence from empty evidence', () => {
    expect(classifyFounderOutcome('No measurable activity occurred.', 0, 0)).toBe('partially_accurate');
  });
});

run('updateDecision files and classifies founder outcomes (§20)', () => {
  const { db, pool: dbPool } = createDb(config.DATABASE_URL);
  const log = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  void log;
  const ownerId = randomUUID();
  const orgId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  afterAll(async () => {
    // Suite-canonical org cleanup (see helpers/delete-org.ts): disables FK
    // triggers for the session so audit_events and other children the service
    // layer wrote never break teardown, then removes the org and its rows.
    // decisions is not in the helper's org-scoped list, so it goes first.
    await db.delete(decisions).where(eq(decisions.orgId, orgId));
    await deleteOrg(dbPool, orgId);
    await db.delete(memberships).where(eqMem(ownerId));
    await db.delete(users).where(eqUser(ownerId));
    await dbPool.end();
  });

  it('sets outcomeFiledAt and a structured predictionAccuracy on the same PATCH', async () => {
    await db.insert(users).values({ id: ownerId, email: `outcome-${suffix}@test.local`, passwordHash: 'x', emailVerifiedAt: new Date() });
    await db.insert(organizations).values({ id: orgId, name: `Outcome Org ${suffix}`, slug: `outcome-org-${suffix}` });
    await db.insert(memberships).values({ userId: ownerId, orgId, role: 'owner' });
    const [decision] = await db
      .insert(decisions)
      .values({
        orgId,
        title: 'Launch now or beta first?',
        whatWasDecided: 'Run a controlled beta before GA.',
        decisionType: 'strategic',
        confidence: 'medium',
        status: 'active',
        expectedOutcome: 'Activation above 40% with blockers resolved.',
      })
      .returning();
    if (!decision) throw new Error('decision insert returned no row');

    const updated = await updateDecision(db, orgId, ownerId, decision.id, {
      actualOutcome: 'Beta activation exceeded the 40% expectation and both blockers were resolved.',
      lessonsLearned: 'Beta-first reduced launch risk.',
      status: 'validated',
    } as never);

    expect(updated?.outcomeFiledAt).toBeTruthy();
    expect(updated?.predictionAccuracy).toBe('accurate');
    expect(updated?.actualOutcome).toContain('exceeded the 40% expectation');
  });
});

// Small helpers keep the cleanup readable.
import { eq } from 'drizzle-orm';
function eqMem(userId: string) {
  return eq(memberships.userId, userId);
}
function eqUser(id: string) {
  return eq(users.id, id);
}
