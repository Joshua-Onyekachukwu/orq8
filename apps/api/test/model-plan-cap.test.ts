/**
 * Plan model-tier caps + recorded routing reason (docs/80 Phase 4).
 *
 * Selection must never route above a plan's tier cap (decision 5): a trial org
 * cannot burn a flagship model even when a task's own risk floor would allow it.
 * The choice is always explained — a cap-bound pick reports `source: 'plan_cap'`
 * with a reason.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import {
  PLAN_TIER_CAP,
  planTierCap,
  modelsByTier,
  selectTierModel,
  type TaskComplexity,
} from '../src/services/model-intelligence.js';
import { selectMeasuredModel } from '../src/services/model-selector.js';

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

const mediumTask: TaskComplexity = {
  complexity: 3,
  reasoning: 'medium',
  risk: 'low',
  businessImpact: 'medium',
  requiredAccuracy: 'medium',
  signals: [],
};
const criticalTask: TaskComplexity = {
  complexity: 4,
  reasoning: 'high',
  risk: 'critical',
  businessImpact: 'high',
  requiredAccuracy: 'medium',
  signals: [],
};

async function registerOrg(label: string): Promise<{ orgId: string }> {
  const email = `routecap-${label}-${randomUUID().slice(0, 8)}@test.example.com`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: 'Test1234!', org_name: `Route Cap ${label}` },
  });
  expect(res.statusCode).toBe(201);
  await deps.db
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.email, email.trim().toLowerCase()));
  return { orgId: res.json().data.org.id as string };
}

describe('plan tier caps (pure)', () => {
  it('maps plans to ceilings, treating unknown/absent as uncapped', () => {
    expect(PLAN_TIER_CAP.trial).toBe(0);
    expect(PLAN_TIER_CAP.founder).toBe(1);
    expect(PLAN_TIER_CAP.team).toBe(2);
    expect(PLAN_TIER_CAP.company).toBe(3);
    expect(planTierCap('trial')).toBe(0);
    expect(planTierCap('enterprise')).toBe(3);
    expect(planTierCap(undefined)).toBe(3);
    expect(planTierCap('mystery')).toBe(3);
  });

  it('selectTierModel never returns a model above maxTier', () => {
    const tier0 = modelsByTier()[0][0]?.id;
    // A complexity-3 task's own floor is tier 1; the cap clamps it to tier 0.
    expect(selectTierModel(mediumTask, { maxTier: 0 })).toBe(tier0);
    // Uncapped, the same task may use tier 1.
    expect(selectTierModel(mediumTask, { maxTier: 3 })).not.toBe(undefined);
  });
});

const run = dbUp ? describe : describe.skip;

run('plan tier caps + routing reason (docs/80 Phase 4)', () => {
  it('clamps a trial org to tier 0 and records why', async () => {
    const { orgId } = await registerOrg('trial');
    await deps.db.update(organizations).set({ plan: 'trial' }).where(eq(organizations.id, orgId));
    const result = await selectMeasuredModel(deps.db, orgId, mediumTask);

    expect(result.source).toBe('plan_cap');
    expect(result.reason).toMatch(/plan cap/i);
    const tier0Ids = modelsByTier()[0].map((m) => m.id);
    expect(tier0Ids).toContain(result.modelId);
  });

  it('lets a higher plan use a higher tier, with no cap reason', async () => {
    const { orgId } = await registerOrg('company');
    await deps.db.update(organizations).set({ plan: 'company' }).where(eq(organizations.id, orgId));

    const result = await selectMeasuredModel(deps.db, orgId, mediumTask);
    // No measured history → static; crucially not capped by plan.
    expect(result.source).toBe('static');
    expect(result.reason ?? '').not.toMatch(/plan cap/i);
  });

  it('still clamps when a caller passes an explicit lower cap', async () => {
    const { orgId } = await registerOrg('explicit');
    await deps.db.update(organizations).set({ plan: 'company' }).where(eq(organizations.id, orgId));

    const result = await selectMeasuredModel(deps.db, orgId, criticalTask, undefined, { maxTier: 1 });
    expect(result.source).toBe('plan_cap');
    const allowed = [...modelsByTier()[0], ...modelsByTier()[1]].map((m) => m.id);
    expect(allowed).toContain(result.modelId);
  });
});
