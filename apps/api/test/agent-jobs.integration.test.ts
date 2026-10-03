/**
 * agent_jobs queue + worker (docs/75 phase 2, brief §7–§11).
 *
 * The Commands tab and the release gate both lean on this behaviour, so it is
 * asserted against a real database and a real worker loop rather than a mock:
 *
 *   - health reflects real rows (counts, eligible depth, dead-letter count);
 *   - retry REFUSES what must not be retried (missing / pending / running /
 *     done) and requeues what may be (dead), keeping the original error;
 *   - a job type with no dispatcher is dead-lettered on the first attempt
 *     instead of burning three retries;
 *   - a job whose task is already completed is completed WITHOUT running the
 *     work again — duplicate execution is the failure this queue must not have;
 *   - the retry endpoint is platform-admin only.
 */

import { createLogger, loadConfig } from '@orq8/core';
import { agentJobs, createDb, memberships, organizations, tasks, users } from '@orq8/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { AppDeps } from '../src/types.js';
import { createSession } from '../src/services/sessions.js';
import { enqueueJob, jobsHealth, retryJob } from '../src/services/jobs.js';
import { startJobWorker } from '../src/services/job-worker.js';

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

const run = dbUp ? describe : describe.skip;

const deps: AppDeps = {
  config,
  logger: createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
  ...createDb(config.DATABASE_URL),
};

interface OrgFixture {
  orgId: string;
  userId: string;
  token: string;
  auth: () => { authorization: string };
}

let app: FastifyInstance;
let org: OrgFixture;

async function createOrgFixture(name: string): Promise<OrgFixture> {
  const [orgRow] = await deps.db
    .insert(organizations)
    .values({ name: `${name}-${randomUUID()}`, slug: `${name}-${randomUUID()}` })
    .returning();
  const orgId = orgRow!.id;
  const [userRow] = await deps.db
    .insert(users)
    .values({
      email: `${name}-${randomUUID()}@example.com`,
      name: 'Founder',
      passwordHash: 'not-a-real-hash',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning();
  const userId = userRow!.id;
  await deps.db.insert(memberships).values({ orgId, userId, role: 'owner' });
  const session = await createSession(deps.db, { userId, orgId });
  return { orgId, userId, token: session.token, auth: () => ({ authorization: `Bearer ${session.token}` }) };
}

beforeAll(async () => {
  if (!dbUp) return;
  app = await buildApp(deps);
  org = await createOrgFixture('agent-jobs');
}, 30_000);

afterAll(async () => {
  await app?.close();
  await deps.pool?.end().catch(() => undefined);
});

/** A real task row, so jobs carry the task the Commands table displays. */
async function seedTask(status: string): Promise<string> {
  const [row] = await deps.db
    .insert(tasks)
    .values({
      orgId: org.orgId,
      title: `Queue test task ${randomUUID().slice(0, 8)}`,
      description: 'seeded by agent-jobs.integration.test.ts',
      status,
      priority: 'normal',
      cost: 0,
    })
    .returning();
  return row!.id;
}

/** Force a job into a terminal state the way a crashed run would leave it. */
async function forceStatus(jobId: string, status: string, error?: string): Promise<void> {
  await deps.db
    .update(agentJobs)
    .set({
      status,
      attempts: status === 'dead' ? 3 : 1,
      lockedAt: null,
      lockedBy: null,
      lastError: error ?? null,
      updatedAt: new Date(),
    })
    .where(eq(agentJobs.id, jobId));
}

async function readJob(jobId: string) {
  const [row] = await deps.db.select().from(agentJobs).where(eq(agentJobs.id, jobId)).limit(1);
  return row;
}

/** Wait for a job to reach a terminal state, or fail with what it is stuck at. */
async function waitForTerminal(jobId: string, timeoutMs = 8_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await readJob(jobId);
    if (row && (row.status === 'done' || row.status === 'dead')) return row.status;
    if (Date.now() > deadline) return row?.status ?? 'missing';
    await new Promise((r) => setTimeout(r, 100));
  }
}

run('agent_jobs queue', () => {
  it('health counts a queued job and reports it eligible', async () => {
      const taskId = await seedTask('pending');
      const { id } = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });

    const health = await jobsHealth(deps.db);
    // The timestamps must be parseable by a browser, not merely present:
    // Postgres' OF format ("+01") made every one of them an Invalid Date in the
    // Commands tab. "2026-…+01:00" parses; "2026-…+01" does not.
    expect(health.oldestPendingAt).toBeTruthy();
    expect(Number.isFinite(new Date(health.oldestPendingAt as string).getTime())).toBe(true);
    expect(health.pending).toBeGreaterThanOrEqual(1);
      expect(health.eligible).toBeGreaterThanOrEqual(1);
      expect(health.counts.pending ?? 0).toBeGreaterThanOrEqual(1);

      await forceStatus(id, 'done');
    });

    it('enqueue is idempotent per task while a job is still executable', async () => {
      const taskId = await seedTask('pending');
      const first = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });
      const second = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });
      expect(second.id).toBe(first.id);
      expect(second.reused).toBe(true);
      await forceStatus(first.id, 'done');
    });

    it('retry refuses a missing job, a queued job and a completed job', async () => {
      const missing = await retryJob(deps.db, randomUUID());
      expect(missing.ok).toBe(false);
      if (!missing.ok) expect(missing.status).toBe(404);

      const taskId = await seedTask('pending');
      const { id } = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });

      const queued = await retryJob(deps.db, id);
      expect(queued.ok).toBe(false);
      if (!queued.ok) {
        expect(queued.status).toBe(409);
        expect(queued.reason).toMatch(/already queued/i);
      }

      await forceStatus(id, 'done');
      const completed = await retryJob(deps.db, id);
      expect(completed.ok).toBe(false);
      if (!completed.ok) expect(completed.status).toBe(409);
    });

    it('retry requeues a dead job, resets its attempts and keeps the original error', async () => {
      const taskId = await seedTask('pending');
      const { id } = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });
      await forceStatus(id, 'dead', 'job-worker: no dispatcher for job type "nope"');

      const result = await retryJob(deps.db, id);
      expect(result.ok).toBe(true);

      const row = await readJob(id);
      expect(row?.status).toBe('pending');
      expect(row?.attempts).toBe(0);
      expect(row?.lockedAt).toBeNull();
      // The reason it died the first time is history the operator needs.
      expect(row?.lastError).toContain('no dispatcher');
      // And it is visible in the queue again.
    const health = await jobsHealth(deps.db);
    // The timestamps must be parseable by a browser, not merely present:
    // Postgres' OF format ("+01") made every one of them an Invalid Date in the
    // Commands tab. "2026-…+01:00" parses; "2026-…+01" does not.
    expect(health.oldestPendingAt).toBeTruthy();
    expect(Number.isFinite(new Date(health.oldestPendingAt as string).getTime())).toBe(true);
    expect(health.pending).toBeGreaterThanOrEqual(1);
      await forceStatus(id, 'done');
    });

    it('dead-letters a job type with no dispatcher on the first attempt', async () => {
      const { id } = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'command.run',
        payload: {},
      });

      const worker = startJobWorker(
        loadConfig({
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          DATABASE_URL: config.DATABASE_URL,
          JOB_QUEUE_MODE: 'workers',
          JOB_WORKER_INTERVAL_MS: '250',
          JOB_BATCH_SIZE: '1',
          JOB_TIMEOUT_MS: '5000',
          WORKER_ID: 'test-worker-dead',
        } as NodeJS.ProcessEnv),
        deps.db,
        createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      );
      try {
        const status = await waitForTerminal(id);
        expect(status).toBe('dead');
        const row = await readJob(id);
        expect(row?.attempts).toBe(1);
        expect(row?.lastError).toMatch(/no dispatcher for job type "command\.run"/);
      } finally {
        await worker.stop();
      }
    });

    it('does not re-run a task that is already completed', async () => {
      const taskId = await seedTask('completed');
      const { id } = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });

      const worker = startJobWorker(
        loadConfig({
          NODE_ENV: 'test',
          LOG_LEVEL: 'silent',
          DATABASE_URL: config.DATABASE_URL,
          JOB_QUEUE_MODE: 'workers',
          JOB_WORKER_INTERVAL_MS: '250',
          JOB_BATCH_SIZE: '1',
          JOB_TIMEOUT_MS: '5000',
          WORKER_ID: 'test-worker-skip',
        } as NodeJS.ProcessEnv),
        deps.db,
        createLogger({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
      );
      try {
        const status = await waitForTerminal(id);
        // Completed without executing: a dead-letter here would mean the guard
        // treated honest history as a failure.
        expect(status).toBe('done');
        expect(worker.stats.skipped + worker.stats.deadLettered).toBeGreaterThanOrEqual(1);
        const row = await readJob(id);
        expect(row?.lastError).toMatch(/already completed/i);
      } finally {
        await worker.stop();
      }
    });

    it('the retry endpoint is platform-admin only, and requeues when allowed', async () => {
      const taskId = await seedTask('pending');
      const { id } = await enqueueJob(deps.db, {
        orgId: org.orgId,
        type: 'task.execute',
        payload: { taskId },
        taskId,
      });
      await forceStatus(id, 'dead', 'seeded failure for the admin retry test');

      const founder = await app.inject({
        method: 'POST',
        url: `/v1/admin/jobs/${id}/retry`,
        headers: org.auth(),
      });
      expect(founder.statusCode).toBe(403);

      await deps.db
        .update(users)
        .set({ platformRole: 'admin' })
        .where(and(eq(users.id, org.userId)));
      try {
        const admin = await app.inject({
          method: 'POST',
          url: `/v1/admin/jobs/${id}/retry`,
          headers: org.auth(),
        });
        expect(admin.statusCode).toBe(200);
        const body = admin.json() as { data?: { requeued?: boolean; previous?: { status?: string } } };
        expect(body.data?.requeued).toBe(true);
        expect(body.data?.previous?.status).toBe('dead');

        const row = await readJob(id);
        expect(row?.status).toBe('pending');

        // A second click on a job that is already queued is refused, not
        // silently accepted.
        const again = await app.inject({
          method: 'POST',
          url: `/v1/admin/jobs/${id}/retry`,
          headers: org.auth(),
        });
        expect(again.statusCode).toBe(409);
      } finally {
        // Back to the schema default ('user') — platform_role is NOT NULL, and
        // leaving the fixture as an admin would silently un-gate the reads
        // asserted in the next test.
        await deps.db
          .update(users)
          .set({ platformRole: 'user' })
          .where(and(eq(users.id, org.userId)));
        await forceStatus(id, 'done');
      }
    });

    it('the admin queue reads require a platform admin too', async () => {
      const health = await app.inject({
        method: 'GET',
        url: '/v1/admin/jobs/health',
        headers: org.auth(),
      });
      expect(health.statusCode).toBe(403);
    const dead = await app.inject({
      method: 'GET',
      url: '/v1/admin/jobs/dead-letter',
      headers: org.auth(),
    });
    expect(dead.statusCode).toBe(403);
  });
});
