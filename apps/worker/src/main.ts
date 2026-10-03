import 'dotenv/config';
import { createLogger, loadConfig } from '@orq8/core';
import { createDb } from '@orq8/db';
import { startJobWorker } from '@orq8/api/worker';
import { jobsHealth } from '@orq8/api/jobs';

/**
 * ORQ8 standalone agent-job worker (docs/75 phase 2).
 *
 * The API and this process share one seam: the durable `agent_jobs` table.
 * Request handlers enqueue (JOB_QUEUE_MODE=enqueue); this process claims with
 * FOR UPDATE SKIP LOCKED, runs the same quality pipeline the API used to run
 * inline, and records the outcome. Nothing about a job's meaning lives here —
 * `startJobWorker` is the same function the API uses in single-process mode, so
 * the two deployments cannot drift.
 *
 * Scaling is horizontal and independent of the API: run N of these (compose
 * `--scale worker=5`) and SKIP LOCKED keeps them from colliding. There is no
 * HTTP listener and no request path in this process by design.
 *
 * Usage:
 *   pnpm --filter @orq8/worker start     # run continuously (SIGTERM = graceful)
 *   pnpm --filter @orq8/worker once      # drain what is eligible now, then exit
 *                                        # (exit 1 if a job was dead-lettered,
 *                                        #  which is what CI/gates check)
 *   WORKER_ONCE_TIMEOUT_MS overrides the --once deadline (default 120s).
 */

async function main(): Promise<void> {
  const once = process.argv.includes('--once');
  const config = loadConfig();
  const logger = createLogger(config);

  if (config.JOB_QUEUE_MODE !== 'workers') {
    // A worker that does not drain is worse than no worker: the queue fills,
    // the API answers 202, and nobody notices until a founder asks why their
    // work never ran. Refuse to start and say exactly what to set.
    logger.error(
      { mode: config.JOB_QUEUE_MODE },
      'worker: refusing to start — set JOB_QUEUE_MODE=workers for this process ' +
        '(the API process should run JOB_QUEUE_MODE=enqueue)',
    );
    process.exit(1);
  }

  const { db, pool } = createDb(config.DATABASE_URL);
  const worker = startJobWorker(config, db, logger);

  logger.info(
    {
      workerId: worker.workerId,
      mode: config.JOB_QUEUE_MODE,
      once,
      intervalMs: config.JOB_WORKER_INTERVAL_MS,
      batchSize: config.JOB_BATCH_SIZE,
      timeoutMs: config.JOB_TIMEOUT_MS,
      graceMs: config.JOB_SHUTDOWN_GRACE_MS,
      node: process.version,
    },
    'worker: started — draining agent_jobs',
  );

  // Heartbeat: queue depth plus this process's own counters, so an operator
  // (or the soak harness) can tell an idle-but-alive worker from a wedged one.
  const heartbeat = setInterval(() => {
    void jobsHealth(db)
      .then((health) => {
        logger.info(
          {
            workerId: worker.workerId,
            stats: worker.stats,
            queue: {
              pending: health.pending,
              eligible: health.eligible,
              running: health.running,
              done: health.counts.done ?? 0,
              dead: health.dead,
              oldestPendingAt: health.oldestPendingAt,
            },
          },
          'worker: heartbeat',
        );
      })
      .catch((err) => logger.warn({ err }, 'worker: heartbeat read failed'));
  }, 60_000);
  heartbeat.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(heartbeat);
    logger.info({ signal, workerId: worker.workerId }, 'worker: shutting down');
    await worker.stop();
    await pool.end().catch(() => undefined);
    logger.info({ stats: worker.stats }, 'worker: stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  if (once) {
    // `once` drains what is eligible right now and leaves backoff timers alone:
    // a job waiting out its retry delay is not "stuck", it is scheduled.
    const deadline = Date.now() + Number(process.env.WORKER_ONCE_TIMEOUT_MS ?? 120_000);
    const startedStats = { deadLettered: worker.stats.deadLettered };
    for (;;) {
      const health = await jobsHealth(db);
      if (health.eligible === 0 && health.running === 0) break;
      if (Date.now() > deadline) {
        logger.warn(
          { eligible: health.eligible, running: health.running },
          'worker: --once deadline reached with work still eligible',
        );
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    await worker.stop();
    await pool.end().catch(() => undefined);
    const deadLettered = worker.stats.deadLettered - startedStats.deadLettered;
    // Machine-readable result for gates and the soak harness.
    process.stdout.write(
      `${JSON.stringify({ workerId: worker.workerId, once: true, deadLettered, stats: worker.stats })}\n`,
    );
    process.exit(deadLettered > 0 ? 1 : 0);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`worker: fatal: ${(err as Error)?.stack ?? err}`);
  process.exit(1);
});
