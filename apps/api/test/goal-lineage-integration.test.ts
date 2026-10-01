import { createLogger, loadConfig } from '@orq8/core';
import {
  createDb,
  organizations,
  users,
  memberships,
  goals,
  tasks,
  strategies,
  objectives,
  keyResults,
  initiatives,
} from '@orq8/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/services/sessions.js';
import { deleteOrg } from './helpers/delete-org.js';
import type { AppDeps } from '../src/types.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

// DB reachability probe (same pattern as the other integration suites).
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

let app: FastifyInstance;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let tokenA = '';
let tokenB = '';

const authA = () => ({ authorization: `Bearer ${tokenA}` });

async function cleanupAll(): Promise<void> {
  for (const id of [orgA, orgB].filter(Boolean)) {
    await deleteOrg(deps.pool, id);
  }
  for (const id of [userA, userB].filter(Boolean)) {
    await deps.db.delete(users).where(eq(users.id, id));
  }
}

/** strategy → objective → key result → initiative, the four names a goal inherits. */
async function seedChain(
  orgId: string,
  names: { strategy: string; objective: string; keyResult: string; initiative: string },
  opts: { initiativeObjectiveId?: string | null } = {},
) {
  const [strategy] = await deps.db
    .insert(strategies)
    .values({ orgId, title: names.strategy })
    .returning();
  const [objective] = await deps.db
    .insert(objectives)
    .values({ orgId, strategyId: strategy!.id, title: names.objective })
    .returning();
  const [keyResult] = await deps.db
    .insert(keyResults)
    .values({ orgId, objectiveId: objective!.id, title: names.keyResult })
    .returning();
  const [initiative] = await deps.db
    .insert(initiatives)
    .values({
      orgId,
      strategyId: strategy!.id,
      objectiveId: opts.initiativeObjectiveId === undefined ? objective!.id : opts.initiativeObjectiveId,
      keyResultId: keyResult!.id,
      title: names.initiative,
    })
    .returning();
  return { strategy: strategy!, objective: objective!, keyResult: keyResult!, initiative: initiative! };
}

async function seedGoal(orgId: string, title: string) {
  const [goal] = await deps.db.insert(goals).values({ orgId, title }).returning();
  return goal!;
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);

  const [orgARow] = await deps.db
    .insert(organizations)
    .values({ name: `goal-lineage-a-${randomUUID()}`, slug: `goal-lineage-a-${randomUUID()}` })
    .returning();
  orgA = orgARow!.id;
  const [orgBRow] = await deps.db
    .insert(organizations)
    .values({ name: `goal-lineage-b-${randomUUID()}`, slug: `goal-lineage-b-${randomUUID()}` })
    .returning();
  orgB = orgBRow!.id;

  const [userARow] = await deps.db
    .insert(users)
    .values({
      email: `goal-lineage-a-${randomUUID()}@example.com`,
      name: 'Goal Lineage A',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  userA = userARow!.id;
  const [userBRow] = await deps.db
    .insert(users)
    .values({
      email: `goal-lineage-b-${randomUUID()}@example.com`,
      name: 'Goal Lineage B',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  userB = userBRow!.id;

  await deps.db.insert(memberships).values({ orgId: orgA, userId: userA, role: 'owner' });
  await deps.db.insert(memberships).values({ orgId: orgB, userId: userB, role: 'owner' });

  tokenA = (await createSession(deps.db, { userId: userA, orgId: orgA })).token;
  tokenB = (await createSession(deps.db, { userId: userB, orgId: orgB })).token;
});

afterAll(async () => {
  if (dbUp) {
    await app.close();
    await cleanupAll();
  }
  await deps.pool.end();
  await pool?.end();
});

run('goal lineage — the chain behind each commitment', () => {
  it('is behind auth like every other read', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/goals/lineage' });
    expect(res.statusCode).toBe(401);
  });

  it('resolves the full chain from the goal’s tasks, and never crosses orgs', async () => {
    // Org A: a goal whose step is attached to a full chain.
    const chain = await seedChain(orgA, {
      strategy: 'Win solo agencies',
      objective: 'Launch paid plans',
      keyResult: 'Pricing page live',
      initiative: 'Pricing launch',
    });
    const goal = await seedGoal(orgA, 'Announce the new pricing page');
    await deps.db.insert(tasks).values({
      orgId: orgA,
      goalId: goal.id,
      initiativeId: chain.initiative.id,
      title: 'Build the pricing page',
      status: 'in_progress',
    });

    // Org B decoy with the same shape — its names must never appear for org A.
    const decoyChain = await seedChain(orgB, {
      strategy: 'Rival strategy',
      objective: 'Rival objective',
      keyResult: 'Rival key result',
      initiative: 'Rival initiative',
    });
    const decoyGoal = await seedGoal(orgB, 'Rival goal');
    await deps.db.insert(tasks).values({
      orgId: orgB,
      goalId: decoyGoal.id,
      initiativeId: decoyChain.initiative.id,
      title: 'Rival task',
      status: 'pending',
    });

    const res = await app.inject({ method: 'GET', url: '/v1/goals/lineage', headers: authA() });
    // A literal segment, not a uuid — this must not reach the `/:id` lookup.
    expect(res.statusCode).toBe(200);
    const rows = res.json().data as Array<Record<string, { id: string; title: string } | null>>;
    expect(rows).toHaveLength(1);

    const row = rows.find((r) => (r.initiative as { id: string } | null)?.id === chain.initiative.id);
    expect(row).toBeDefined();
    expect(row!.strategy!.title).toBe('Win solo agencies');
    expect(row!.objective!.title).toBe('Launch paid plans');
    expect(row!.keyResult!.title).toBe('Pricing page live');
    expect(row!.initiative!.title).toBe('Pricing launch');
    expect(JSON.stringify(rows)).not.toContain('Rival');
  });

  it('resolves the objective through the key result when the initiative has none', async () => {
    const chain = await seedChain(
      orgA,
      {
        strategy: 'Win solo agencies',
        objective: 'Launch paid plans',
        keyResult: 'Waitlist converted',
        initiative: 'Waitlist push',
      },
      // An initiative created against a key result only.
      { initiativeObjectiveId: null },
    );
    const goal = await seedGoal(orgA, 'Convert the waitlist');
    await deps.db.insert(tasks).values({
      orgId: orgA,
      goalId: goal.id,
      initiativeId: chain.initiative.id,
      title: 'Draft the waitlist email',
      status: 'pending',
    });

    const res = await app.inject({ method: 'GET', url: '/v1/goals/lineage', headers: authA() });
    const rows = res.json().data as Array<Record<string, { id: string; title: string } | null>>;
    const row = rows.find((r) => (r.initiative as { id: string } | null)?.id === chain.initiative.id);
    expect(row).toBeDefined();
    // The objective is not on the initiative itself; it comes back through the
    // key result, which is the only path that exists in the schema.
    expect(row!.objective!.title).toBe('Launch paid plans');
    expect(row!.strategy!.title).toBe('Win solo agencies');
  });

  it('prefers the most complete chain when a goal’s tasks disagree', async () => {
    const deep = await seedChain(orgA, {
      strategy: 'Win solo agencies',
      objective: 'Launch paid plans',
      keyResult: 'Pricing page live',
      initiative: 'Pricing launch',
    });
    const bare = await deps.db
      .insert(initiatives)
      .values({ orgId: orgA, title: 'Loose research thread' })
      .returning();
    const goal = await seedGoal(orgA, 'Research the pricing gap');
    await deps.db.insert(tasks).values({
      orgId: orgA,
      goalId: goal.id,
      initiativeId: bare[0]!.id,
      title: 'Collect competitor pricing',
      status: 'completed',
    });
    await deps.db.insert(tasks).values({
      orgId: orgA,
      goalId: goal.id,
      initiativeId: deep.initiative.id,
      title: 'Interview three agencies',
      status: 'pending',
    });

    const res = await app.inject({ method: 'GET', url: '/v1/goals/lineage', headers: authA() });
    const rows = res.json().data as Array<Record<string, { id: string; title: string } | null>>;
    const row = rows.find((r) => (r.initiative as { id: string } | null)?.id === deep.initiative.id);
    expect(row).toBeDefined();
    expect(row!.strategy!.title).toBe('Win solo agencies');
  });

  it('stays silent for a goal whose steps carry no initiative', async () => {
    const goal = await seedGoal(orgA, 'Unowned intention');
    await deps.db.insert(tasks).values({
      orgId: orgA,
      goalId: goal.id,
      title: 'A task with no strategy link',
      status: 'pending',
    });

    const res = await app.inject({ method: 'GET', url: '/v1/goals/lineage', headers: authA() });
    const rows = res.json().data as Array<{ initiative: { id: string } | null }>;
    // No row for an unlinked goal — the page renders that honestly instead of
    // inventing a parent for it.
    expect(rows.every((r) => r.initiative !== null)).toBe(true);
    expect(rows.some((r) => (r.initiative as { title?: string }).title === 'Unowned intention')).toBe(false);
  });
});
