// Background job worker (docs/75 — backend phase, first slice).
//
// With JOB_QUEUE_MODE=workers, request handlers only ENQUEUE into agent_jobs
// and this loop drains the table: reap stale locks, claim one job with
// FOR UPDATE SKIP LOCKED, dispatch it, complete or fail it (with backoff and
// a dead-letter ceiling). The dispatch table is deliberately tiny — today it
// runs agent tasks through the exact same executeWithQuality pipeline the
// inline path used, which is the point: the queue changes WHERE work runs,
// never WHAT the work is. New job types are new dispatch arms, not new
// pipelines.
//
// One worker process, one interval, one claim at a time. Scale by starting
// more of these (in-process today, separate containers in docs/75 phase 2) —
// SKIP LOCKED makes contention harmless.

import type { AppConfig } from '@orq8/core';
import type { Db } from '@orq8/db';
import type { Logger } from 'pino';
import { claimJob, completeJob, failJob, reapStaleJobs } from './jobs.js';
import { executeWithQuality } from './quality-pipeline.js';

export interface JobWorkerHandle {
  stop: () => Promise<void>;
}

const STALE_LOCK_SECONDS = 300; // must exceed the longest honest task run

export function startJobWorker(config: AppConfig, db: Db, logger: Logger): JobWorkerHandle {
  let stopped = false;
  let running = false; // no overlapping ticks if a run outlasts the interval
  let timer: NodeJS.Timeout | null = null;
  const workerId = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

  const dispatch = async (job: {
    type: string;
    orgId: string;
    taskId: string | null;
  }): Promise<void> => {
    switch (job.type) {
      case 'task.execute': {
        if (!job.taskId) throw new Error('task.execute job has no taskId');
        await executeWithQuality(config, db, job.orgId, job.taskId);
        return;
      }
      default:
        // Unknown types fail into the normal retry/dead path rather than
        // spinning forever on a claim we can never honor.
        throw new Error(`job-worker: no dispatcher for job type "${job.type}"`);
    }
  };

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      const reaped = await reapStaleJobs(db, STALE_LOCK_SECONDS);
      if (reaped > 0) logger.warn({ reaped }, 'job-worker reaped stale locks');

      for (let i = 0; i < 5; i++) {
        // bounded batch per tick — one slow org must not starve the queue
        const job = await claimJob(db, workerId);
        if (!job) break;
        const started = Date.now();
        try {
          await dispatch(job);
          await completeJob(db, job.id);
          logger.info(
            { jobId: job.id, type: job.type, taskId: job.taskId, ms: Date.now() - started },
            'job-worker: job done',
          );
        } catch (err) {
          const outcome = await failJob(db, job.id, job.attempts, job.maxAttempts, err);
          logger.warn(
            { jobId: job.id, type: job.type, taskId: job.taskId, attempts: job.attempts, outcome, err },
            'job-worker: job failed',
          );
        }
      }
    } catch (err) {
      // The queue is durable and the interval persistent — a bad tick must
      // never kill the loop. Log and let the next tick retry.
      logger.error({ err, workerId }, 'job-worker: tick failed');
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void tick(), Math.max(250, config.JOB_WORKER_INTERVAL_MS));

  logger.info(
    { workerId, intervalMs: config.JOB_WORKER_INTERVAL_MS },
    'job-worker: draining agent_jobs',
  );

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearInterval(timer);
      // If a job is mid-flight, give it a brief grace period so the process
      // does not orphan work it could finish — the stale reaper covers the
      // hard-crash case, this covers the graceful one.
      for (let i = 0; i < 20 && running; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
}
