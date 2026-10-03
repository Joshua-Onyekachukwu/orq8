// Background job worker (docs/75 — backend phases 1 and 2).
//
// The queue is `agent_jobs`; the worker is this loop. In 'workers' mode it runs
// inside the API process; in 'enqueue' mode the API only enqueues and this loop
// runs in `apps/worker` instead — the SAME function, so the two can never drift
// apart in what a job means. The dispatch table is deliberately tiny: today it
// runs agent tasks through the exact same executeWithQuality pipeline the inline
// path used, which is the point — the queue changes WHERE work runs, never WHAT
// the work is. New job types are new dispatch arms, not new pipelines.
//
// Safety, in the order it matters:
//   • claiming is atomic (UPDATE … FOR UPDATE SKIP LOCKED, attempts++ in the
//     same statement), so N workers across N containers never double-claim;
//   • a claimed job is guarded against duplicate execution before dispatch;
//   • a job that overruns JOB_TIMEOUT_MS is dead-lettered rather than retried
//     (a retry could run the same task beside a still-running original);
//   • failures that retrying cannot fix (unknown type, malformed payload) are
//     dead-lettered immediately instead of burning the backoff ladder;
//   • locks left by a killed process are reaped after STALE_LOCK_SECONDS;
//   • stop() stops claiming and waits for in-flight work, bounded by
//     JOB_SHUTDOWN_GRACE_MS — a SIGTERM is not a reason to orphan a job.

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import { agentJobs, tasks } from '@orq8/db';
import { and, eq, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { claimJob, completeJob, deadLetterJob, failJob, reapStaleJobs, skipJob } from './jobs.js';
import { executeWithQuality } from './quality-pipeline.js';
import { expireStaleReservations } from './credits.js';

export interface JobWorkerStats {
  claimed: number;
  done: number;
  failed: number;
  deadLettered: number;
  skipped: number;
  reaped: number;
  lastClaimAt: Date | null;
  lastError: string | null;
}

export interface JobWorkerHandle {
  workerId: string;
  stats: JobWorkerStats;
  stop: () => Promise<void>;
}

/** Must exceed the longest honest task run; also the reaper's window. */
const STALE_LOCK_SECONDS = 300;

/** Retrying cannot fix this failure, so it goes straight to dead-letter. */
class NotRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotRetryableError';
  }
}

class JobTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobTimeoutError';
  }
}

function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new JobTimeoutError(onTimeout)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export function startJobWorker(config: AppConfig, db: Db, logger: Logger): JobWorkerHandle {
  let stopped = false;
  let running = false; // no overlapping ticks if a run outlasts the interval
  let inFlight = 0;
  let timer: NodeJS.Timeout | null = null;
  const workerId =
    config.WORKER_ID?.trim() ||
    `worker-${process.env.HOSTNAME ?? 'local'}-${process.pid}`;
  const batchSize = Math.max(1, config.JOB_BATCH_SIZE);
  const stats: JobWorkerStats = {
    claimed: 0,
    done: 0,
    failed: 0,
    deadLettered: 0,
    skipped: 0,
    reaped: 0,
    lastClaimAt: null,
    lastError: null,
  };

  /**
   * Preflight every claim: decide whether this job should run at all, before
   * any work or model call happens.
   *
   *   { dead }  the job can never succeed (no payload, or the task is gone) —
   *             retrying it wastes the ladder, so it is dead-lettered now.
   *   { skip }  the job is legitimate but unnecessary right now: another job is
   *             already running this task, or the task is already completed or
   *             settled by the founder. Running it again would either duplicate
   *             execution or overwrite the founder's own record of what
   *             happened with a fresh, unasked-for run.
   *   null      run it.
   */
  const preflight = async (
    job: { id: string; orgId: string; type: string; taskId: string | null },
  ): Promise<{ dead: string } | { skip: string } | null> => {
    if (job.type !== 'task.execute') return null;
    if (!job.taskId) return { dead: 'task.execute job has no taskId in its payload' };

    // The org match is defense in depth (docs/80 Phase 0): the job row's org
    // is authoritative, and a payload that ever pointed at a foreign task must
    // read as gone rather than be executed under the wrong tenant.
    const [task] = await db
      .select({ status: tasks.status })
      .from(tasks)
      .where(and(eq(tasks.id, job.taskId), eq(tasks.orgId, job.orgId)))
      .limit(1);
    if (!task) return { dead: `task ${job.taskId} no longer exists` };
    if (task.status === 'completed') {
      return { skip: 'the task is already completed — it will not be run again' };
    }
    if (task.status === 'cancelled' || task.status === 'rejected') {
      return { skip: `the task is ${task.status}; it was settled by the founder` };
    }

    const [other] = await db
      .select({ id: agentJobs.id })
      .from(agentJobs)
      .where(
        and(
          eq(agentJobs.taskId, job.taskId),
          eq(agentJobs.orgId, job.orgId),
          eq(agentJobs.status, 'running'),
          sql`${agentJobs.id} <> ${job.id}`,
          sql`${agentJobs.lockedAt} > now() - (${STALE_LOCK_SECONDS} || ' seconds')::interval`,
        ),
      )
      .limit(1);
    if (other) {
      return { skip: `another job (${other.id.slice(0, 8)}) is already running this task` };
    }
    return null;
  };

  const dispatch = async (job: {
    id: string;
    type: string;
    orgId: string;
    taskId: string | null;
  }): Promise<void> => {
    switch (job.type) {
      case 'task.execute': {
        if (!job.taskId) {
          throw new NotRetryableError('task.execute job has no taskId in its payload');
        }
        await executeWithQuality(config, db, job.orgId, job.taskId);
        return;
      }
      default:
        // A reserved type with no arm (docs/75 phase 2 keeps `command.run`
        // reserved): fail fast and visibly rather than retrying three times
        // over nothing.
        throw new NotRetryableError(`no dispatcher for job type "${job.type}"`);
    }
  };

  const runOne = async (job: Awaited<ReturnType<typeof claimJob>>): Promise<void> => {
    if (!job) return;
    stats.claimed += 1;
    stats.lastClaimAt = new Date();
    const started = Date.now();
    try {
      const verdict = await preflight(job);
      if (verdict && 'dead' in verdict) {
        throw new NotRetryableError(verdict.dead);
      }
      if (verdict && 'skip' in verdict) {
        stats.skipped += 1;
        await skipJob(db, job.id, verdict.skip);
        logger.warn(
          { jobId: job.id, type: job.type, taskId: job.taskId, reason: verdict.skip },
          'job-worker: job skipped — the work was not run again',
        );
        return;
      }
      await withTimeout(
        dispatch(job),
        config.JOB_TIMEOUT_MS,
        `job exceeded JOB_TIMEOUT_MS (${config.JOB_TIMEOUT_MS}ms)`,
      );
      await completeJob(db, job.id);
      stats.done += 1;
      logger.info(
        { jobId: job.id, type: job.type, taskId: job.taskId, ms: Date.now() - started },
        'job-worker: job done',
      );
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      stats.lastError = message;
      const notRetryable = err instanceof NotRetryableError || err instanceof JobTimeoutError;
      if (notRetryable) {
        stats.deadLettered += 1;
        await deadLetterJob(db, job.id, err);
        logger.error(
          { jobId: job.id, type: job.type, taskId: job.taskId, reason: message },
          'job-worker: job dead-lettered (not retryable)',
        );
        return;
      }
      const outcome = await failJob(db, job.id, job.attempts, job.maxAttempts, err);
      stats.failed += 1;
      if (outcome === 'dead') stats.deadLettered += 1;
      logger.warn(
        { jobId: job.id, type: job.type, taskId: job.taskId, attempts: job.attempts, outcome, err },
        'job-worker: job failed',
      );
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    inFlight += 1;
    try {
      const reaped = await reapStaleJobs(db, STALE_LOCK_SECONDS);
      if (reaped > 0) {
        stats.reaped += reaped;
        logger.warn({ reaped }, 'job-worker: reaped stale locks');
      }

      // Stale credit reservations (docs/80 Phase 1): a crashed worker, a
      // timed-out job or an abandoned task must not hold credits forever. The
      // sweep is safe to call every tick (partial index on active reservations).
      const swept = await expireStaleReservations(db).catch(() => ({
        expired: 0,
        releasedCredits: 0,
      }));
      if (swept.expired > 0) {
        logger.warn(
          { expired: swept.expired, releasedCredits: swept.releasedCredits },
          'job-worker: released stale credit reservations',
        );
      }

      for (let i = 0; i < batchSize; i++) {
        if (stopped) break;
        const job = await claimJob(db, workerId, {
          maxConcurrentPerOrg: config.JOB_MAX_CONCURRENT_PER_ORG,
        });
        if (!job) break;
        await runOne(job);
      }
    } catch (err) {
      // The queue is durable and the interval persistent — a bad tick must
      // never kill the loop. Log and let the next tick retry.
      stats.lastError = (err as Error)?.message ?? String(err);
      logger.error({ err, workerId }, 'job-worker: tick failed');
    } finally {
      running = false;
      inFlight -= 1;
    }
  };

  timer = setInterval(() => void tick(), Math.max(250, config.JOB_WORKER_INTERVAL_MS));

  logger.info(
    {
      workerId,
      intervalMs: config.JOB_WORKER_INTERVAL_MS,
      batchSize,
      timeoutMs: config.JOB_TIMEOUT_MS,
      graceMs: config.JOB_SHUTDOWN_GRACE_MS,
    },
    'job-worker: draining agent_jobs',
  );

  return {
    workerId,
    stats,
    stop: async () => {
      stopped = true;
      if (timer) clearInterval(timer);
      // Give in-flight work its grace window so a deploy does not orphan a job
      // the process could have finished. A hard kill is covered by the reaper.
      const deadline = Date.now() + config.JOB_SHUTDOWN_GRACE_MS;
      while ((running || inFlight > 0) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
      }
      logger.info(
        { workerId, stats, waitedMs: config.JOB_SHUTDOWN_GRACE_MS },
        'job-worker: stopped',
      );
    },
  };
}
