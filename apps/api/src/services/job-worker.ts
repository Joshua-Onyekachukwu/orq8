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
import { expireOpenGates } from './approvals.js';

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

/**
 * Preflight one claim: decide whether this job should run at all, before any
 * work or model call happens.
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
async function preflightTaskJob(
  db: Db,
  job: { id: string; orgId: string; type: string; taskId: string | null },
): Promise<{ dead: string } | { skip: string } | null> {
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
}

export type ClaimedJobOutcome =
  | { kind: 'empty' }
  | { kind: 'done'; jobId: string; taskId: string | null }
  | { kind: 'skipped'; jobId: string; taskId: string | null; reason: string }
  | { kind: 'failed'; jobId: string; taskId: string | null; dead: boolean; error: string };

/**
 * Claim ONE pending job and take it through the shared preflight → dispatch →
 * settle ladder. Extracted from the interval loop so the identical ladder can
 * be driven deterministically — by tests, and by code paths that release one
 * unit of already-approved work (e.g. a founder decision on a gate) without
 * waiting for the next tick. Every queue consumer goes through this function:
 * the loop and the callers can never drift apart in what running a job means.
 */
export async function claimAndRunOne(
  config: AppConfig,
  db: Db,
  logger: Logger,
  workerId: string,
): Promise<ClaimedJobOutcome> {
  const job = await claimJob(db, workerId, {
    maxConcurrentPerOrg: config.JOB_MAX_CONCURRENT_PER_ORG,
  });
  if (!job) return { kind: 'empty' };
  const started = Date.now();
  try {
    const verdict = await preflightTaskJob(db, job);
    if (verdict && 'dead' in verdict) {
      throw new NotRetryableError(verdict.dead);
    }
    if (verdict && 'skip' in verdict) {
      await skipJob(db, job.id, verdict.skip);
      logger.warn(
        { jobId: job.id, type: job.type, taskId: job.taskId, reason: verdict.skip },
        'job-worker: job skipped — the work was not run again',
      );
      return { kind: 'skipped', jobId: job.id, taskId: job.taskId, reason: verdict.skip };
    }

    if (job.type !== 'task.execute' || !job.taskId) {
      // A reserved type with no arm (docs/75 phase 2 keeps `command.run`
      // reserved), or a task.execute job with no taskId: fail fast and visibly
      // rather than retrying three times over nothing.
      throw new NotRetryableError(
        job.type !== 'task.execute'
          ? `no dispatcher for job type "${job.type}"`
          : 'task.execute job has no taskId in its payload',
      );
    }
    await withTimeout(
      executeWithQuality(config, db, job.orgId, job.taskId),
      config.JOB_TIMEOUT_MS,
      `job exceeded JOB_TIMEOUT_MS (${config.JOB_TIMEOUT_MS}ms)`,
    );

    await completeJob(db, job.id);
    logger.info(
      { jobId: job.id, type: job.type, taskId: job.taskId, ms: Date.now() - started },
      'job-worker: job done',
    );
    return { kind: 'done', jobId: job.id, taskId: job.taskId };
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    const notRetryable = err instanceof NotRetryableError || err instanceof JobTimeoutError;
    if (notRetryable) {
      await deadLetterJob(db, job.id, err);
      logger.error(
        { jobId: job.id, type: job.type, taskId: job.taskId, reason: message },
        'job-worker: job dead-lettered (not retryable)',
      );
      return { kind: 'failed', jobId: job.id, taskId: job.taskId, dead: true, error: message };
    }
    const outcome = await failJob(db, job.id, job.attempts, job.maxAttempts, err);
    logger.warn(
      { jobId: job.id, type: job.type, taskId: job.taskId, attempts: job.attempts, outcome, err },
      'job-worker: job failed',
    );
    return {
      kind: 'failed',
      jobId: job.id,
      taskId: job.taskId,
      dead: outcome === 'dead',
      error: message,
    };
  }
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

      // Gate expiry (docs/82 §gate-expiry): an open approval past its decision
      // window expires to a pause — silence never approves. Same cadence as
      // the reservation sweep: cheap, indexed, safe to run every tick.
      const gatesExpired = await expireOpenGates(db, { limit: 100 }).catch(() => []);
      if (gatesExpired.length > 0) {
        logger.warn(
          { expired: gatesExpired.length, gates: gatesExpired.map((g) => g.approvalId.slice(0, 8)) },
          'job-worker: expired unanswered approval gates (paused, never approved)',
        );
      }

      for (let i = 0; i < batchSize; i++) {
        if (stopped) break;
        const outcome = await claimAndRunOne(config, db, logger, workerId);
        if (outcome.kind === 'empty') break;
        stats.claimed += 1;
        stats.lastClaimAt = new Date();
        if (outcome.kind === 'done') stats.done += 1;
        if (outcome.kind === 'skipped') stats.skipped += 1;
        if (outcome.kind === 'failed') {
          stats.failed += 1;
          stats.lastError = outcome.error;
          if (outcome.dead) stats.deadLettered += 1;
        }
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
