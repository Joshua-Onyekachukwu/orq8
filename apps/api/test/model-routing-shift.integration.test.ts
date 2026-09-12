import { createLogger, loadConfig } from '@orq8/core';
import { createDb, llmPerformance, memberships, organizations, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getRoutingShift } from '../src/services/model-insights.js';

/**
 * §31 feedback-loop visibility: `getRoutingShift` groups measured llm_performance
 * rows by how the model was chosen (routing_source) across trailing vs preceding
 * week, so the dashboard can show whether routing is actually consuming real
 * history. Every number must derive from inserted rows — nothing invented.
 *
 * DB-gated like the other integration suites (skips cleanly when no local
 * Postgres; CI runs it against the real stack and acts as arbiter).
 */

const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' } as NodeJS.ProcessEnv);

let dbUp = false;
let pool: Pool | undefined;
try {
  pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 1500 });
  await pool.query('SELECT 1');
  dbUp = true;
} catch {
  dbUp = false;
}
const run = dbUp ? describe : describe.skip;

const db = dbUp ? createDb(config.DATABASE_URL).db : (undefined as never);

let orgId = '';
let userId = '';

const DAY = 24 * 60 * 60 * 1000;

async function seedCall(overrides: {
  routingSource?: string;
  daysAgo?: number;
}): Promise<void> {
  await db.insert(llmPerformance).values({
    orgId,
    phase: 'task_execution',
    model: 'test/model-x',
    provider: 'test',
    success: true,
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    ...(overrides.daysAgo !== undefined
      ? { createdAt: new Date(Date.now() - overrides.daysAgo * DAY) }
      : {}),
    ...(overrides.routingSource ? { routingSource: overrides.routingSource } : {}),
  });
}

run('routing shift aggregation', () => {
  beforeAll(async () => {
    // Isolated org so CI reruns never double-count each other's rows.
    const [org] = await db
      .insert(organizations)
      .values({
        name: `routing-shift-${randomUUID().slice(0, 8)}`,
        slug: `routing-shift-${randomUUID().slice(0, 8)}`,
      })
      .returning();
    orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({
        email: `routing-shift-${randomUUID().slice(0, 8)}@example.test`,
        passwordHash: 'x',
      })
      .returning();
    userId = user!.id;
    await db.insert(memberships).values({ orgId, userId, role: 'owner' });
  });

  afterAll(async () => {
    await db.delete(llmPerformance).where(eq(llmPerformance.orgId, orgId));
    await db.delete(memberships).where(eq(memberships.orgId, orgId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await pool?.end();
  });

  it('returns null shares and zero totals for an org with no calls', async () => {
    const fresh = await db
      .insert(organizations)
      .values({
        name: `routing-shift-empty-${randomUUID().slice(0, 8)}`,
        slug: `routing-shift-empty-${randomUUID().slice(0, 8)}`,
      })
      .returning();
    try {
      const shift = await getRoutingShift(db, fresh[0]!.id);
      expect(shift.week).toEqual([]);
      expect(shift.previousWeek).toEqual([]);
      expect(shift.measuredShare).toBeNull();
      expect(shift.shiftPct).toBeNull();
      expect(shift.totalCalls).toBe(0);
    } finally {
      await db.delete(organizations).where(eq(organizations.id, fresh[0]!.id));
    }
  });

  it('groups this week vs last week and computes the measured-share shift', async () => {
    // This week: 3 measured, 1 default → 75% measured share.
    await seedCall({ routingSource: 'measured', daysAgo: 1 });
    await seedCall({ routingSource: 'measured', daysAgo: 2 });
    await seedCall({ routingSource: 'measured', daysAgo: 3 });
    await seedCall({ routingSource: 'default', daysAgo: 2 });
    // Last week: 1 measured, 3 static → 25% measured share.
    await seedCall({ routingSource: 'measured', daysAgo: 9 });
    await seedCall({ routingSource: 'static', daysAgo: 10 });
    await seedCall({ routingSource: 'static', daysAgo: 11 });
    await seedCall({ routingSource: 'static', daysAgo: 12 });

    const shift = await getRoutingShift(db, orgId);

    const weekCalls = shift.week.reduce((a, e) => a + e.calls, 0);
    const prevCalls = shift.previousWeek.reduce((a, e) => a + e.calls, 0);
    expect(weekCalls).toBe(4);
    expect(prevCalls).toBe(4);
    expect(shift.measuredShare).toBeCloseTo(0.75);
    expect(shift.previousMeasuredShare).toBeCloseTo(0.25);
    expect(shift.shiftPct).toBeCloseTo(0.5);
    expect(shift.totalCalls).toBe(8);
  });

  it('treats a week with calls but zero measured as 0% share (not null)', async () => {
    // The empty-org case already proved null; here one all-static week must be 0.
    const [org] = await db
      .insert(organizations)
      .values({
        name: `routing-shift-static-${randomUUID().slice(0, 8)}`,
        slug: `routing-shift-static-${randomUUID().slice(0, 8)}`,
      })
      .returning();
    try {
      await db.insert(llmPerformance).values({
        orgId: org!.id,
        phase: 'task_execution',
        model: 'test/model-x',
        provider: 'test',
        success: true,
        routingSource: 'static',
        // Explicit past timestamp: defaultNow() races the aggregation's
        // app-clock upper bound (createdAt < now) — a millisecond of CI
        // clock skew between runner and DB must not decide this test.
        createdAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      const shift = await getRoutingShift(db, org!.id);
      expect(shift.measuredShare).toBe(0);
    } finally {
      await db.delete(llmPerformance).where(eq(llmPerformance.orgId, org!.id));
      await db.delete(organizations).where(eq(organizations.id, org!.id));
    }
  });
});
