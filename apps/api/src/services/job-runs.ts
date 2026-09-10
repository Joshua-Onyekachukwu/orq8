/**
 * Scheduled-job run log (platform automation health).
 *
 * Every INTERNAL_TOKEN-gated cron hook records one `job_runs` row per
 * execution through `trackJobRun`. Founders read the latest run per job via
 * GET /v1/jobs/status so scheduled-job health is observable in production:
 * did the briefing / anomaly scan / consolidation actually run, when, and did
 * it succeed?
 *
 * The log must never take down the job it records — inserts are best-effort
 * and swallow their own failures.
 */

import { desc, gte } from 'drizzle-orm';
import { jobRuns, type Db } from '@orq8/db';

export type JobKey =
  | 'events_process_pending'
  | 'memory_consolidate'
  | 'anomaly_scan'
  | 'briefing_daily'
  | 'briefing_weekly'
  | 'briefing_monthly'
  | 'decision_outcome_review'
  | 'decision_signal_sync';

export interface JobRunMeta {
  /** Number of orgs (or events) the pass touched. */
  orgsProcessed?: number;
  /** Aggregate, non-sensitive counts only (no tokens/PII/per-org payloads). */
  detail?: Record<string, unknown>;
}

interface RunRecord extends JobRunMeta {
  status: 'success' | 'error';
  startedAt: Date;
  finishedAt: Date;
  trigger: string;
  error?: string;
}

async function insertRun(db: Db, job: JobKey, rec: RunRecord): Promise<void> {
  try {
    await db.insert(jobRuns).values({
      job,
      status: rec.status,
      trigger: rec.trigger,
      startedAt: rec.startedAt,
      finishedAt: rec.finishedAt,
      durationMs: Math.max(0, rec.finishedAt.getTime() - rec.startedAt.getTime()),
      orgsProcessed: rec.orgsProcessed ?? 0,
      detail: (rec.detail ?? {}) as never,
      error: rec.error ?? null,
    });
  } catch {
    // Never let run-logging break the actual job.
  }
}

/**
 * Run `fn` while recording one job_runs row. On success the returned value of
 * `fn` is passed to `summarize` to derive safe aggregate detail. On error a
 * row with status='error' is recorded and the original error rethrown so the
 * caller (cron hook) still surfaces the failure.
 */
export async function trackJobRun<T>(
  db: Db,
  job: JobKey,
  fn: () => Promise<T>,
  options: { trigger?: string; summarize?: (result: T) => JobRunMeta } = {},
): Promise<T> {
  const startedAt = new Date();
  const trigger = options.trigger ?? 'schedule';
  try {
    const result = await fn();
    const meta = options.summarize ? options.summarize(result) : {};
    await insertRun(db, job, {
      ...meta,
      status: 'success',
      startedAt,
      finishedAt: new Date(),
      trigger,
    });
    return result;
  } catch (err) {
    await insertRun(db, job, {
      status: 'error',
      startedAt,
      finishedAt: new Date(),
      trigger,
      error: err instanceof Error ? err.message.slice(0, 2000) : 'unknown error',
    });
    throw err;
  }
}

/** Latest run per job key within the retention window (default 90 days). */
export async function latestJobRuns(
  db: Db,
  windowDays = 90,
): Promise<Array<typeof jobRuns.$inferSelect>> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(jobRuns)
    .where(gte(jobRuns.startedAt, since))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1000);
  const latest = new Map<string, (typeof jobRuns.$inferSelect)[]>();
  for (const row of rows) {
    const list = latest.get(row.job) ?? [];
    list.push(row);
    latest.set(row.job, list);
  }
  return [...latest.entries()].map(([, runs]) => runs[0]!);
}
