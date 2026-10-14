import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createLogger, loadConfig } from '@orq8/core';
import { agents as agentsTable, createDb, tasks as tasksTable, users } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { executeTask } from '../src/services/task-executor.js';
import { executeTasksWithBudget } from '../src/services/ea-execution-budget.js';
import { reapOrphanedExecutions } from '../src/services/orphaned-executions.js';
import { deleteOrg } from './helpers/delete-org.js';

/**
 * docs/87 §5 item 15 — the abandoned-execution race, pinned end to end.
 *
 * The executor used to set `in_progress` in one statement and write its
 * terminal state in another, both unconditional. Anything that moved the row
 * in between — the interactive budget abandoning a slow task back to
 * `pending`, the orphan reaper, a founder retry — got its state stomped by
 * the very run it had just given up on, and that run's credits landed on a
 * row it no longer owned (live evidence: a deferred, 0-credit task read
 * `in_progress` afterwards and was executed — and charged — twice).
 *
 * The fix is a claim fence: the executor claims the row with a fresh
 * `execution_lock`, every owned write is conditional on still holding it, and
 * every deliberate re-own (converge, reap, retry, rejection) clears the lock.
 * This file pins both halves. Removing the fence from the terminal write, or
 * removing `executionLock: null` from either converge or the reaper, fails
 * these assertions.
 *
 * Only the LLM boundary is stubbed — and it is stubbed to BLOCK until the test
 * releases it, so the interleaving is deterministic rather than timing-based.
 * Everything else (claim, reservations, convergence, the reaper) is the real
 * code against a real database.
 */
const llmGate = vi.hoisted(() => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
});

vi.mock('../src/services/llm.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/llm.js')>()),
  chat: async () => {
    await llmGate.promise;
    return 'Stubbed result: the run finished after its claim was taken away.';
  },
}));

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new (await import('pg')).Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 /* 2026-10-13: 1.5s tripped under full-suite load, silently skipping files */ });
  await probe.query('SELECT 1');
  await probe.end();
  dbUp = true;
} catch {
  dbUp = false;
}
const run = dbUp ? describe : describe.skip;

let app: FastifyInstance;
let db: ReturnType<typeof createDb>['db'];
let pool: ReturnType<typeof createDb>['pool'];
let orgId = '';
let userId = '';
let taskId = '';

const authority = {
  canCreateTasks: true,
  canExecuteTasks: true,
  canAccessCompanyInfo: true,
  canCommunicateExternally: false,
  canModifyResources: false,
  spendingLimitCents: 0,
  requiresApprovalFor: [],
  forbiddenActions: [],
};

async function taskSnapshot(id: string) {
  const [row] = await db
    .select({ status: tasksTable.status, executionLock: tasksTable.executionLock, cost: tasksTable.cost })
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);
  return row;
}

run('an execution that loses its claim writes nothing and charges nothing', () => {
  beforeAll(async () => {
    const created = createDb(config.DATABASE_URL);
    db = created.db;
    pool = created.pool;
    app = await buildApp({ config, db, pool, logger: createLogger(config) });
    await app.ready();

    // Registration seeds the org's trial credits, which is what lets the real
    // reservation path run — the abandoned run must hold and then RELEASE a
    // real reservation, not skip the money half of the contract.
    const email = `fence-${Date.now()}@test.com`;
    const reg = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'TestPass123!', org_name: 'Fence Org' },
    });
    expect(reg.statusCode, reg.payload).toBe(201);
    const body = JSON.parse(reg.payload) as { data: { org: { id: string } } };
    orgId = body.data.org.id;

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    userId = user!.id;

    // Employees are seeded straight into the org (a Trial org is capped at
    // three and registration already hires some) — the cap itself is covered
    // by entitlements.test.ts.
    const [agent] = await db
      .insert(agentsTable)
      .values({ orgId, name: 'Fenced Worker', role: 'analyst', status: 'active', autonomyLevel: 'autonomous', authority })
      .returning();
    const [task] = await db
      .insert(tasksTable)
      .values({ orgId, agentId: agent!.id, title: 'Fence task', status: 'pending' })
      .returning();
    taskId = task!.id;
  }, 30_000);

  afterAll(async () => {
    if (app) await app.close();
    if (orgId) await deleteOrg(pool, orgId);
    if (userId) await pool.query('delete from users where id = $1', [userId]);
    await pool.end();
  });

  it('discards the abandoned run instead of stomping the re-owned row', async () => {
    // Run A starts and claims the row, then blocks inside the LLM call.
    const runA = executeTask(config, db, orgId, taskId);

    let claimedLock: string | null = null;
    for (let i = 0; i < 200; i++) {
      const row = await taskSnapshot(taskId);
      if (row?.status === 'in_progress' && row.executionLock) {
        claimedLock = row.executionLock;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(claimedLock, 'run A never claimed the row (in_progress + execution_lock)').toBeTruthy();

    // While run A is still mid-flight, the product deliberately re-owns the
    // row: the interactive budget abandons the task and converges it to an
    // honest pending. This is the exact P1 sequence (docs/87 §5 item 15).
    const outcome = await executeTasksWithBudget(config, db, orgId, [taskId], { totalMs: 0 });
    expect(outcome.deferred).toBe(1);

    const mid = await taskSnapshot(taskId);
    expect(mid?.status).toBe('pending');
    // Pins the converge-side half: abandoning a run must revoke its claim,
    // or the doomed run's terminal write below would still match the row.
    expect(mid?.executionLock, 'convergeToPending must clear execution_lock').toBeNull();

    // Now let the abandoned run finish. Its fenced terminal write matches
    // zero rows, its reservation is released, and the discard is reported
    // honestly rather than applied.
    llmGate.release();
    const result = await runA;
    expect(result.cost).toBe(0);
    expect(result.result).toMatch(/Discarded/);

    const final = await taskSnapshot(taskId);
    // The pin: without the fenced terminal write, run A stamps its outcome
    // over the restart and this row reads `failed`/`completed` instead.
    expect(final?.status).toBe('pending');
    expect(final?.executionLock).toBeNull();
  }, 30_000);

  it('the orphan reaper revokes the claim it reaps', async () => {
    // A zombie run: in_progress, owned, but stale past the reaper bound.
    // The `tasks_set_updated_at` trigger forces updated_at to now() on ANY
    // update, so the backdate runs with the trigger disabled for this session
    // only — no other suite's rows are affected.
    const zombieLock = randomUUID();
    await pool.query('set session_replication_role = replica');
    await pool.query(
      "update tasks set status = 'in_progress', execution_lock = $1, updated_at = now() - interval '40 minutes' where id = $2",
      [zombieLock, taskId],
    );
    await pool.query('set session_replication_role = origin');

    const reaped = await reapOrphanedExecutions(db, config);
    expect(reaped).toBeGreaterThanOrEqual(1);

    const row = await taskSnapshot(taskId);
    expect(row?.status).toBe('failed');
    // Pins the reaper-side half: a reaped row is revoked, so a zombie that
    // later returns cannot write its state back.
    expect(row?.executionLock, 'reaper must clear execution_lock').toBeNull();
  }, 30_000);

  it('the reaper judges the heartbeat, not write-silence', async () => {
    // A live run with an old last-write: beating heart, stale updated_at. The
    // trigger would force updated_at to now() on any update, so the backdate
    // runs with it disabled for this session only (same trick as above).
    const liveLock = randomUUID();
    await pool.query('set session_replication_role = replica');
    await pool.query(
      "update tasks set status = 'in_progress', execution_lock = $1, execution_heartbeat_at = now(), updated_at = now() - interval '40 minutes' where id = $2",
      [liveLock, taskId],
    );
    await pool.query('set session_replication_role = origin');

    await reapOrphanedExecutions(db, config);
    const live = await taskSnapshot(taskId);
    // The pin: judging updated_at would reap this row (40 minutes of write
    // silence). Judging the heartbeat spares it — the run is alive.
    expect(live?.status).toBe('in_progress');
    expect(live?.executionLock).toBe(liveLock);

    // And when the heart stops too, the row is dead and the reap revokes it.
    await pool.query('set session_replication_role = replica');
    await pool.query(
      "update tasks set execution_heartbeat_at = now() - interval '40 minutes', updated_at = now() - interval '40 minutes' where id = $1",
      [taskId],
    );
    await pool.query('set session_replication_role = origin');

    await reapOrphanedExecutions(db, config);
    const dead = await taskSnapshot(taskId);
    expect(dead?.status).toBe('failed');
    expect(dead?.executionLock).toBeNull();
  }, 30_000);
});
