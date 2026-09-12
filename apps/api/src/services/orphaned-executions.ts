/**
 * Orphaned-execution reaper (§17 data integrity).
 *
 * A task's `in_progress` state is set in-memory by executeTask right before
 * the LLM call; if the process dies mid-call (Railway 502/timeout, deploy,
 * OOM), the task row can stay `in_progress` forever with no result — a task
 * the founder's board shows as running but that no process will ever finish.
 * (Live production evidence: a Marketing task stuck in_progress with 0-char
 * result after a gateway 502 killed the request.)
 *
 * The reaper marks such rows failed with an honest reason and an activity
 * event. Staleness bound: tasks claimed recently (within STALE_MS) are left
 * alone — a genuinely running task takes minutes, not hours.
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { tasks, activityEvents } from '@orq8/db';
import type { Db } from '@orq8/db';
import { createLogger } from '@orq8/core';
import type { AppConfig } from '@orq8/core';

/** Tasks in_progress older than this are considered orphaned (35 min). */
const STALE_MS = 35 * 60 * 1000;

export async function reapOrphanedExecutions(db: Db, config: AppConfig): Promise<number> {
  const logger = createLogger(config);
  const cutoff = new Date(Date.now() - STALE_MS);
  try {
    const stale = await db
      .select({ id: tasks.id, title: tasks.title, orgId: tasks.orgId, updatedAt: tasks.updatedAt })
      .from(tasks)
      .where(and(eq(tasks.status, 'in_progress'), lt(tasks.updatedAt, cutoff)))
      .limit(50);

    if (stale.length === 0) return 0;

    for (const t of stale) {
      const reason =
        'Execution interrupted: the worker process was restarted or timed out mid-run. Marked failed by the system — retry from the task page.';
      await db
        .update(tasks)
        .set({ status: 'failed', result: reason, updatedAt: new Date() })
        .where(and(eq(tasks.id, t.id), eq(tasks.orgId, t.orgId)));

      await db.insert(activityEvents).values({
        orgId: t.orgId,
        agentId: null,
        taskId: t.id,
        type: 'task.failed',
        summary: `Execution interrupted for "${(t.title ?? '').slice(0, 80)}" — task marked failed after a worker interruption.`,
        reason: 'orphaned_execution_reaped',
        cost: 0,
      });
    }

    logger.info({ reaped: stale.length }, 'orphaned in_progress tasks reaped');
    return stale.length;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'orphan reaper skipped (non-fatal)');
    return 0;
  }
}

/** Boot-time reaper pass (runs once per API startup, then every 10 min). */
export function startOrphanReaper(db: Db, config: AppConfig): NodeJS.Timeout {
  const run = () => void reapOrphanedExecutions(db, config);
  // Delay first pass so startup migrations/connections settle first.
  setTimeout(run, 20_000);
  return setInterval(run, 10 * 60_000);
}
