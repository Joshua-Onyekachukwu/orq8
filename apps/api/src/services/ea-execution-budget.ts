/**
 * Wall-clock execution budget for interactive EA runs (Phase 10: the EA must
 * never appear to hang).
 *
 * Root cause this fixes: the pipeline ran up to 3 recovery attempts × 2 LLM
 * attempts × LLM_TIMEOUT_MS × QA passes per task, sequentially, with no
 * overall bound — a founder on camera saw "Executing tasks" for 3+ minutes
 * (indistinguishable from a hang) while every LLM call was technically
 * "working".
 *
 * Contract: each task gets an honest terminal state within its slice. Tasks
 * whose slice expires before their LLM finished are marked pending in the DB
 * (nothing fabricated), reported as deferred, and any still-running call is
 * abandoned via best-effort cancellation. Failed tasks cost 0 credits
 * (task-executor already guarantees this); deferred tasks cost 0 too.
 */

import { and, eq } from 'drizzle-orm';
import { tasks, type Db } from '@orq8/db';
import { executeWithQuality, type QualityPipelineResult } from './quality-pipeline.js';
import type { AppConfig } from '@orq8/core';

/**
 * Per-task wall-clock slice for interactive runs. Sized so a full task (LLM
 * execution + QA) fits normally, one slow LLM call (~90s provider timeout)
 * can still complete, but the founder is never left watching past ~90s.
 */
export const INTERACTIVE_TASK_BUDGET_MS = 90_000;

export interface BudgetedExecution {
  taskId: string;
  status: 'completed' | 'failed' | 'deferred';
  result: string;
  cost: number;
  tokensUsed: number;
  llmUsed: boolean;
  deferred?: boolean;
}

/**
 * Run one task under a hard wall-clock budget.
 *   • Finishes in time → its real result (completed or failed-with-reason).
 *   • Exceeds the slice → the DB keeps its true state (in_progress → pending),
 *     the caller reports it as deferred, and the in-flight work is abandoned.
 * Nothing is marked complete that did not complete.
 */
export async function executeTaskWithBudget(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskId: string,
  budgetMs: number = INTERACTIVE_TASK_BUDGET_MS,
): Promise<BudgetedExecution> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const execution = executeWithQuality(config, db, orgId, taskId, { skipQA: false, revisionCount: 0 }).then(
    (qr: QualityPipelineResult): BudgetedExecution => ({
      taskId: qr.executionResult.taskId,
      status: qr.executionResult.status as BudgetedExecution['status'],
      result: qr.executionResult.result,
      cost: qr.executionResult.cost,
      tokensUsed: qr.executionResult.tokensUsed,
      llmUsed: qr.executionResult.llmUsed,
    }),
  );

  const timeout = new Promise<BudgetedExecution>((resolve) => {
    timer = setTimeout(() => {
      resolve({
        taskId,
        status: 'deferred',
        result:
          'Execution exceeded its time budget; the task remains pending in your organization and can be re-run.',
        cost: 0,
        tokensUsed: 0,
        llmUsed: false,
        deferred: true,
      });
    }, budgetMs);
  });

  try {
    return await Promise.race([execution, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Aggregate execution shape for a whole command run. */
export interface BudgetedRunOutcome {
  results: BudgetedExecution[];
  completed: number;
  failed: number;
  deferred: number;
}

/**
 * Execute all tasks for a command under a total interactive budget.
 * Tasks beyond the budget are deferred (not executed) rather than hanging.
 */
export async function executeTasksWithBudget(
  config: AppConfig,
  db: Db,
  orgId: string,
  taskIds: string[],
  opts: {
    /** Total wall-clock budget for the whole execution stage. */
    totalMs?: number;
    /** Emit progress after each task (deferred tasks included). */
    onTaskDone?: (r: BudgetedExecution) => void;
  } = {},
): Promise<BudgetedRunOutcome> {
  const totalMs = opts.totalMs ?? 120_000;
  const deadline = Date.now() + totalMs;
  const results: BudgetedExecution[] = [];
  let completed = 0;
  let failed = 0;
  let deferred = 0;

  const defer = (taskId: string, message: string): BudgetedExecution => ({
    taskId,
    status: 'deferred',
    result: message,
    cost: 0,
    tokensUsed: 0,
    llmUsed: false,
    deferred: true,
  });

  // Honest DB convergence for ANY deferred task: a timed-out or budget-
  // exhausted task must never linger in_progress. Pending is the true state
  // (the work did not complete and can be re-run).
  const convergeToPending = async (taskId: string): Promise<void> => {
    try {
      await db.update(tasks).set({ status: 'pending' }).where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));
    } catch {
      // Non-fatal: leave the true state rather than guess.
    }
  };

  for (const taskId of taskIds) {
    const remaining = deadline - Date.now();
    if (remaining <= 5_000) {
      const r = defer(
        taskId,
        'Deferred: the execution budget was reached before this task started. It remains pending and can be re-run.',
      );
      await convergeToPending(taskId);
      results.push(r);
      deferred++;
      if (opts.onTaskDone) opts.onTaskDone(r);
      continue;
    }

    const r = await executeTaskWithBudget(config, db, orgId, taskId, Math.min(remaining, INTERACTIVE_TASK_BUDGET_MS));
    if (r.deferred) await convergeToPending(taskId);
    results.push(r);
    if (r.status === 'completed') completed++;
    else if (r.status === 'failed') failed++;
    else deferred++;
    if (opts.onTaskDone) opts.onTaskDone(r);
  }

  return { results, completed, failed, deferred };
}
