import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, llmPerformance } from '@orq8/db';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { classifyTask } from '../src/services/model-intelligence.js';
import {
  getRoutingPerformance,
  MIN_CALLS_FOR_ROUTING_FAILURE,
  MIN_CALLS_FOR_ROUTING_SUCCESS,
  selectMeasuredModel,
} from '../src/services/model-selector.js';
import type { AppDeps } from '../src/types.js';

/**
 * §7→§31 feedback wiring: model routing must follow MEASURED per-org history
 * in llm_performance — never fabricated numbers, never small samples.
 *
 * The registry's tier-0/1 candidates are the nvidia nemotron family
 * (`nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`,
 * `nvidia/nemotron-3-super-120b-a12b`), so measured-history scenarios below
 * are expressed against those real registry ids.
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

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

let orgId: string;
let userId: string;

const LIGHTNING = 'nvidia/nemotron-3.5-lightning-30b-a3b';
const NANO = 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning';
const SUPER = 'nvidia/nemotron-3-super-120b-a12b';

async function seedCalls(
  model: string,
  count: number,
  success: boolean,
  opts: { org?: string; provider?: string } = {},
) {
  for (let i = 0; i < count; i++) {
    await deps.db.insert(llmPerformance).values({
      orgId: opts.org ?? orgId,
      phase: 'task_execution',
      model,
      provider: opts.provider ?? 'test',
      success,
      durationMs: 600,
      totalTokens: 1000,
    });
  }
}

beforeAll(async () => {
  if (!dbUp) return;
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `router-${randomUUID()}`, slug: `router-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `router-${randomUUID()}@example.com`, name: 'Owner', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
});

afterAll(async () => {
  if (dbUp) {
    await deps.pool!.query('delete from llm_performance where org_id = $1', [orgId]);
    await deps.pool!.query('delete from memberships where org_id = $1', [orgId]);
    await deps.pool!.query('delete from users where id = $1', [userId]);
    await deps.pool!.query('delete from organizations where id = $1', [orgId]);
    await pool!.end();
  }
});

run('model selector consumes measured llm_performance history', () => {
  it('computes per-model stats scoped to the org and window', async () => {
    await seedCalls(LIGHTNING, 2, true);
    await seedCalls(LIGHTNING, 1, false);

    const perf = await getRoutingPerformance(deps.db, orgId);
    const s = perf.stats.get(LIGHTNING);
    expect(s).toBeDefined();
    expect(s!.calls).toBe(3);
    expect(s!.successes).toBe(2);
    expect(s!.failures).toBe(1);
    expect(s!.successRate).toBeCloseTo(2 / 3, 3);
  });

  it('keeps the static pick when the org has no measured history', async () => {
    const freshOrg = await deps.db
      .insert(organizations)
      .values({ name: `router-empty-${randomUUID()}`, slug: `router-empty-${randomUUID()}` })
      .returning();
    const freshId = freshOrg[0]!.id;

    try {
      const pick = await selectMeasuredModel(deps.db, freshId, classifyTask({ title: 'Write a summary of Q3 notes' }));
      expect(pick.source).toBe('static');
      expect(pick.reason).toContain('insufficient measured history');
    } finally {
      await deps.pool!.query('delete from organizations where id = $1', [freshId]);
    }
  });

  it('does NOT deviate from static order on a small sample (<8 successes)', async () => {
    // 7 successes, 0 failures — promising but below the claim threshold.
    await seedCalls(NANO, MIN_CALLS_FOR_ROUTING_SUCCESS - 1, true);

    const pick = await selectMeasuredModel(deps.db, orgId, classifyTask({ title: 'Draft a short update post' }));
    expect(pick.source).toBe('static');
  });

  it('prefers a measured-performing model over the static default', async () => {
    // Static default for simple work is the cheapest tier-0 model. Seed the
    // OTHER candidate with enough measured successes to earn preference.
    await seedCalls(NANO, MIN_CALLS_FOR_ROUTING_SUCCESS + 4, true);

    const pick = await selectMeasuredModel(deps.db, orgId, classifyTask({ title: 'Draft a short update post' }));
    expect(pick.modelId).toBe(NANO);
    expect(pick.source).toBe('measured');
    expect(pick.reason).toContain('measured successes');
  });

  it('routes away from a measured-degraded static default', async () => {
    // Make the tier-0 default itself degraded in THIS org: enough failures,
    // low success rate. Its successful sibling from the previous test has been
    // cleaned up — this org starts clean.
    const freshOrg = await deps.db
      .insert(organizations)
      .values({ name: `router-degraded-${randomUUID()}`, slug: `router-degraded-${randomUUID()}` })
      .returning();
    const freshId = freshOrg[0]!.id;

    try {
      // >= MIN_CALLS_FOR_ROUTING_FAILURE failures at <= 70% success.
      await seedCalls(LIGHTNING, MIN_CALLS_FOR_ROUTING_FAILURE, false, { org: freshId });
      await seedCalls(LIGHTNING, 1, true, { org: freshId }); // 1 success / 5 calls = 20%

      const pick = await selectMeasuredModel(deps.db, freshId, classifyTask({ title: 'Draft a short update post' }));
      expect(pick.modelId).not.toBe(LIGHTNING);
      expect(pick.modelId).toBeDefined();
    } finally {
      await deps.pool!.query('delete from llm_performance where org_id = $1', [freshId]);
      await deps.pool!.query('delete from organizations where id = $1', [freshId]);
    }
  });

  it('never promotes a model outside the tier-sufficient candidate set', async () => {
    // A reasoning-heavy, high-risk classification needs tier >= 2. Seed
    // stellar history for a tier-0 model — it must NOT be selected.
    await seedCalls(LIGHTNING, MIN_CALLS_FOR_ROUTING_SUCCESS + 10, true);

    const pick = await selectMeasuredModel(
      deps.db,
      orgId,
      classifyTask({
        title: 'Finalize the acquisition contract',
        description: 'Critical legal work with regulatory exposure — contract must be reviewed by counsel before signing',
      }),
    );
    expect(pick.modelId).not.toBe(LIGHTNING);
    // Tier >= 2 candidates only.
    expect([NANO, SUPER]).toContain(pick.modelId);
  });
});
