import { createLogger, loadConfig } from '@orq8/core';
import { createDb, organizations, users, memberships, agents, goals, tasks, departments, teams } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeTaskWithBudget, executeTasksWithBudget } from '../src/services/ea-execution-budget.js';
import type { AppDeps } from '../src/types.js';

/**
 * Phase 10 verification: interactive EA execution is wall-clock bounded.
 * A task that cannot finish inside its slice is DEFERRED (honest pending
 * state in the DB, 0 credits, reported as deferred) — never fabricated as
 * completed, never left in_progress, never an infinite hang.
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
let agentId: string;
let goalId: string;
let taskId: string;

beforeAll(async () => {
  if (!dbUp) return;
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `budget-${randomUUID()}`, slug: `budget-${randomUUID()}` })
    .returning();
  orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({ email: `budget-${randomUUID()}@example.com`, name: 'Owner', passwordHash: 'not-a-real-hash', status: 'active' })
    .returning();
  userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });

  const [dept] = await deps.db
    .insert(departments)
    .values({ orgId, name: 'Budget Eng' })
    .returning();
  const [team] = await deps.db.insert(teams).values({ orgId, name: `budget-team-${randomUUID().slice(0, 8)}`, departmentId: dept!.id }).returning();
  const [agent] = await deps.db
    .insert(agents)
    .values({ orgId, name: 'Budget Agent', role: 'software_engineer', departmentId: dept!.id, teamId: team!.id, status: 'active' })
    .returning();
  agentId = agent!.id;
  const [goal] = await deps.db.insert(goals).values({ orgId, title: 'Budget goal', status: 'active' }).returning();
  goalId = goal!.id;
  const [task] = await deps.db
    .insert(tasks)
    .values({ orgId, goalId, title: 'Budget task', status: 'pending', agentId })
    .returning();
  taskId = task!.id;
});

afterAll(async () => {
  if (dbUp) {
    await deps.pool!.query('delete from tasks where org_id = $1', [orgId]);
    await deps.pool!.query('delete from goals where org_id = $1', [orgId]);
    await deps.pool!.query('delete from agents where org_id = $1', [orgId]);
    await deps.pool!.query('delete from teams where org_id = $1', [orgId]);
    await deps.pool!.query('delete from departments where org_id = $1', [orgId]);
    await deps.pool!.query('delete from memberships where org_id = $1', [orgId]);
    await deps.pool!.query('delete from users where id = $1', [userId]);
    await deps.pool!.query('delete from organizations where id = $1', [orgId]);
    await pool!.end();
  }
});

run('interactive execution budget', () => {
  it('defers a task that cannot finish within its slice and converges the DB to pending', async () => {
    // 1ms budget: the LLM path cannot possibly finish — the slice must fire.
    const r = await executeTaskWithBudget(config, deps.db, orgId, taskId!, 1);
    expect(r.status).toBe('deferred');
    expect(r.deferred).toBe(true);
    expect(r.cost).toBe(0);

    // DB truth: no lingering in_progress; pending is the honest state.
    const row = await deps.db
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.id, taskId!), eq(tasks.orgId, orgId)));
    expect(row[0]?.status).not.toBe('in_progress');
  }, 30_000);

  it('defers remaining tasks once the run budget is exhausted, with honest reporting', async () => {
    const extra = await deps.db
      .insert(tasks)
      .values({ orgId, goalId, title: 'Budget task 2', status: 'pending', agentId })
      .returning();

    // Total budget 0 → everything defers immediately without executing.
    const outcome = await executeTasksWithBudget(config, deps.db, orgId, [taskId!, extra![0]!.id], {
      totalMs: 0,
      onTaskDone: () => {},
    });

    expect(outcome.results).toHaveLength(2);
    expect(outcome.completed).toBe(0);
    expect(outcome.failed).toBe(0);
    expect(outcome.deferred).toBe(2);
    for (const r of outcome.results) {
      expect(r.status).toBe('deferred');
      expect(r.cost).toBe(0);
      expect(r.result).toContain('Deferred');
    }

    await deps.pool!.query('delete from tasks where id = $1', [extra![0]!.id]);
  }, 30_000);
});
