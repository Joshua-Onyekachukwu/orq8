/**
 * §24 founder-verdict beat — the founder records their decision on a council
 * recommendation via updateDecision.
 *
 * Covers:
 *   1. founderVerdict + optional note persist, with founderVerdictAt stamped.
 *   2. The write lands a dedicated `decision.founder_verdict` audit event
 *      (attributable, not a generic decision.updated).
 *   3. Absent a verdict, no verdict fields are touched.
 *
 * DB describe block follows the suite's probe-and-skip pattern (runs against
 * local Postgres when up, skipped cleanly when not — CI runs it for real).
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, memberships, users, decisions } from '@orq8/db';
import type { Db } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
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

run('updateDecision records the founder verdict (§24)', () => {
  const { db, pool: dbPool } = createDb(config.DATABASE_URL);
  const log = createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' });
  void log;

  const ownerId = randomUUID();
  const orgId = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  let decisionId = '';

  beforeAll(async () => {
    await db.insert(users).values({ id: ownerId, email: `verdict-${suffix}@test.local`, passwordHash: 'x', emailVerifiedAt: new Date() });
    await db.insert(organizations).values({ id: orgId, name: `Verdict Org ${suffix}`, slug: `verdict-org-${suffix}` });
    await db.insert(memberships).values({ userId: ownerId, orgId, role: 'owner' });
    const [decision] = await db
      .insert(decisions)
      .values({
        orgId,
        title: 'Launch now or run a controlled beta?',
        whatWasDecided: 'Run a controlled beta before general availability.',
        decisionType: 'strategic',
        confidence: 'low',
        decisionMakerType: 'ai_council',
        status: 'active',
        expectedOutcome: 'Activation above 40% with launch blockers resolved.',
      })
      .returning();
    if (!decision) throw new Error('decision insert returned no row');
    decisionId = decision.id;
  });

  afterAll(async () => {
    // decisions is not in deleteOrg's org-scoped list — delete it first, then
    // the suite-canonical org cleanup (handles audit_events FK triggers).
    await db.delete(decisions).where(eq(decisions.orgId, orgId));
    await deleteOrg(dbPool, orgId);
    await db.delete(memberships).where(eq(memberships.userId, ownerId));
    await db.delete(users).where(eq(users.id, ownerId));
    await dbPool.end();
  });

  it('persists verdict, note, timestamp, and a dedicated audit event', async () => {
    const updated = await updateDecision(db, orgId, ownerId, decisionId, {
      founderVerdict: 'approved',
      founderVerdictNote: 'Beta-first matches our risk appetite for this quarter.',
    } as never);

    expect(updated?.founderVerdict).toBe('approved');
    expect(updated?.founderVerdictNote).toBe('Beta-first matches our risk appetite for this quarter.');
    expect(updated?.founderVerdictAt).toBeTruthy();

    const audit = await dbPool.query(
      `select count(*)::int as n from audit_events where org_id = $1 and action = 'decision.founder_verdict'`,
      [orgId],
    );
    expect(audit.rows[0]?.n ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('leaves verdict fields untouched when none is supplied', async () => {
    const before = await updateDecision(db, orgId, ownerId, decisionId, {
      lessonsLearned: 'Reassurance is not evidence; wait for activation data.',
    } as never);
    expect(before?.founderVerdict).toBe('approved'); // unchanged from previous test
    expect(before?.founderVerdictAt).toBeTruthy();
  });
});
