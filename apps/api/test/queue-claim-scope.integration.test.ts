/**
 * Queue claim scope — the regression guard for cross-file job stealing.
 *
 * `agent_jobs` is ONE global queue on a database every API test file shares
 * (maxForks > 1). Before `claimJob` grew its optional `orgId` narrowing, any
 * process could claim any pending job, so a neighbouring test file's worker
 * would take this file's job and run it under ITS module registry — which in a
 * test run means its stubbed model. The symptom was two "product failures" that
 * were not product failures:
 *
 *   - `agent-jobs.integration.test.ts` saw `thisWorker.stats.skipped` stay 0
 *     while the job still settled to `done`, because another process had
 *     claimed and skipped it;
 *   - `task-tools.integration.test.ts` failed printing another file's stubbed
 *     answer into our task record.
 *
 * Reproducing that by chance takes two files landing on the same job in the
 * same window — a 1-in-3 flake over a six-file cluster. This test produces the
 * SAME race deliberately and deterministically instead of waiting for luck: two
 * workers drain the same `agent_jobs` table concurrently, each scoped to its
 * own org, and the assertions fail if either one takes the other's row.
 *
 * It also pins the property that makes the narrowing safe to ship: an unscoped
 * worker (which is what production runs) still claims work for every org.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { agentJobs, createDb, organizations } from '@orq8/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDeps } from '../src/types.js';
import { claimJob, completeJob, enqueueJob } from '../src/services/jobs.js';
import { startJobWorker, type JobWorkerHandle } from '../src/services/job-worker.js';
import { deleteOrg } from './helpers/delete-org.js';

const config = loadConfig({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.DATABASE_URL,
} as NodeJS.ProcessEnv);

let dbUp = false;
try {
  const probe = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 10_000 /* 2026-10-13: 1.5s tripped under full-suite load, silently skipping files */ });
  await probe.query('SELECT 1');
  await probe.end();
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

const orgA = randomUUID();
const orgB = randomUUID();

/**
 * A job type with no dispatcher, so a claimed job settles on the first attempt
 * as a dead-letter. That keeps this test about WHICH worker claimed the row
 * rather than about what the work did — the fastest deterministic terminal
 * state the queue offers.
 */
async function seedJob(orgId: string, priority = 0): Promise<string> {
  const { id } = await enqueueJob(deps.db, {
    orgId,
    type: 'command.run',
    payload: {},
    priority,
  });
  return id;
}

function workerConfig(workerId: string) {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: config.DATABASE_URL,
    JOB_QUEUE_MODE: 'workers',
    // The shortest interval the config allows, one job per claim: the two
    // workers interleave as fast as the scheduler will let them, which is the
    // race being tested.
    JOB_WORKER_INTERVAL_MS: '250',
    JOB_BATCH_SIZE: '1',
    JOB_TIMEOUT_MS: '5000',
    WORKER_ID: workerId,
  } as NodeJS.ProcessEnv);
}

/** Start a worker, optionally narrowed to one org (the test's guard). */
function startWorker(workerId: string, orgId?: string): JobWorkerHandle {
  return startJobWorker(
    workerConfig(workerId),
    deps.db,
    createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    orgId ? { orgId } : {},
  );
}

async function statusOf(jobId: string): Promise<string | undefined> {
  const [row] = await deps.db
    .select({ status: agentJobs.status })
    .from(agentJobs)
    .where(eq(agentJobs.id, jobId));
  return row?.status;
}

/** Wait until every named job has left pending/running, bounded. */
async function waitForTerminal(jobIds: string[], timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const statuses = await Promise.all(jobIds.map(statusOf));
    if (statuses.every((s) => s !== 'pending' && s !== 'running')) return;
    if (Date.now() > deadline) {
      throw new Error(`jobs not terminal in ${timeoutMs}ms: ${JSON.stringify(statuses)}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

beforeAll(async () => {
  if (!dbUp) return;
  for (const [id, name] of [
    [orgA, 'queue-scope-a'],
    [orgB, 'queue-scope-b'],
  ] as const) {
    await deps.db
      .insert(organizations)
      .values({ id, name: `${name}-${id.slice(0, 8)}`, slug: `${name}-${id.slice(0, 8)}` });
  }
}, 30_000);

afterAll(async () => {
  const pool = deps.pool as Pool | undefined;
  if (pool) {
    // Only this file's rows: the two throwaway orgs carry everything seeded
    // here (jobs and tasks cascade from the org).
    await deleteOrg(pool, orgA).catch(() => undefined);
    await deleteOrg(pool, orgB).catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
});

run('queue claim scope', () => {
  // NOTE ON WHICH TEST IS THE GUARD. This first case is the race stated plainly,
  // but with exactly one job per org a broken (unscoped) claim can still land
  // one job each by luck — it was verified to pass with the narrowing removed.
  // The second case is the deterministic guard: depth in the other org makes an
  // overreaching worker show up immediately, and it was verified to FAIL
  // (`expected 2 to be +0`) with the narrowing removed and pass with it.
  it('two workers scoped to different orgs never claim each other’s job', async () => {
    const jobA = await seedJob(orgA);
    const jobB = await seedJob(orgB);

    // Both started before either can have drained the queue, so the two loops
    // are genuinely concurrent against one shared table.
    const workerA = startWorker('scope-worker-a', orgA);
    const workerB = startWorker('scope-worker-b', orgB);

    try {
      await waitForTerminal([jobA, jobB]);

      // Each worker claimed exactly one job. A steal would show up here as one
      // worker at 2 and the other at 0 — which is precisely what the flake did.
      expect(workerA.stats.claimed).toBe(1);
      expect(workerB.stats.claimed).toBe(1);
      expect(workerA.stats.deadLettered).toBe(1);
      expect(workerB.stats.deadLettered).toBe(1);

      // Each job was touched exactly once, by the worker that owns its org.
      expect(await statusOf(jobA)).toBe('dead');
      expect(await statusOf(jobB)).toBe('dead');
    } finally {
      await workerA.stop();
      await workerB.stop();
    }
  });

  it('a scoped worker leaves another org’s jobs alone, however many are waiting', async () => {
    // Enough depth in the other org that a greedy claim loop would have taken
    // them while the scoped worker waited for its own work.
    const foreign = await Promise.all([seedJob(orgB), seedJob(orgB), seedJob(orgB)]);

    const workerA = startWorker('scope-worker-a2', orgA);
    try {
      // Give the loop real time to overreach if the narrowing were absent.
      await new Promise((r) => setTimeout(r, 600));
      expect(workerA.stats.claimed).toBe(0);

      // The foreign jobs are exactly where they were left.
      expect(await Promise.all(foreign.map(statusOf))).toEqual([
        'pending',
        'pending',
        'pending',
      ]);
    } finally {
      await workerA.stop();
      // Drain what this test left, so it cannot leak into another file's run —
      // the very contamination this suite exists to stop.
      const workerB = startWorker('scope-worker-b2', orgB);
      try {
        await waitForTerminal(foreign);
      } finally {
        await workerB.stop();
      }
    }
  });

  it('an unscoped claim still reaches every org — production is unchanged', async () => {
    // The narrow is optional for exactly this reason: `buildApp` starts the
    // production worker with no orgId, so it must still serve the whole queue.
    //
    // Asserted through ONE explicit claim rather than by running a global worker
    // loop. A global loop in this file would itself claim whatever another test
    // file had pending — this suite would become the flake it exists to
    // prevent. A single claim is the same code path and steals nothing.
    //
    // Priority is the ordering key (`order by priority desc, run_at asc`), so a
    // very high value makes the row this test owns the one a claim must return,
    // whatever else happens to be pending on the shared table right now — the
    // assertion does not depend on what other files left behind.
    const jobId = await seedJob(orgB, 1_000_000);

    const claimed = await claimJob(deps.db, 'scope-worker-global');
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(jobId);
    expect(claimed!.orgId).toBe(orgB);

    // Settle the row this test claimed, so the shared table is left as found
    // (a job abandoned in `running` would be reaped by a later worker instead).
    await completeJob(deps.db, jobId);
    expect(await statusOf(jobId)).toBe('done');
  });
});
