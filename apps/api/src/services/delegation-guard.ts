/**
 * Delegation recursion guard (docs/80 Phase 2, docs/77 P3 §13).
 *
 * A task→tool→task loop, or an agent delegating to another agent that delegates
 * back, would otherwise let a single command fan out without bound. Three caps
 * close it, all readable from config:
 *
 *   - `maxDepth` — how deep the `tasks.parent_task_id` chain may go;
 *   - `maxChildrenPerTask` — how many sub-tasks one parent may own;
 *   - `maxTasksPerCommand` — how many tasks one delegation plan may create.
 *
 * The depth walk is bounded by `maxDepth` itself, so a pre-existing cycle in the
 * data cannot make this loop forever — it stops as soon as the bound is passed.
 */

import { and, eq, sql } from 'drizzle-orm';
import { tasks, type Db } from '@orq8/db';
import type { AppConfig } from '@orq8/core';

export interface DelegationLimits {
  /** Maximum depth (0 = the root task). A child whose depth would exceed this is refused. */
  maxDepth: number;
  /** Maximum direct sub-tasks one parent may own. */
  maxChildrenPerTask: number;
  /** Maximum tasks one delegation plan may create. */
  maxTasksPerCommand: number;
}

export const DEFAULT_DELEGATION_LIMITS: DelegationLimits = {
  maxDepth: 3,
  maxChildrenPerTask: 10,
  maxTasksPerCommand: 50,
};

/** Read the delegation caps from config, falling back to the defaults. */
export function resolveDelegationLimits(config?: Pick<AppConfig,
  'DELEGATION_MAX_DEPTH' | 'DELEGATION_MAX_CHILDREN_PER_TASK' | 'DELEGATION_MAX_TASKS_PER_COMMAND'
>): DelegationLimits {
  return {
    maxDepth: config?.DELEGATION_MAX_DEPTH ?? DEFAULT_DELEGATION_LIMITS.maxDepth,
    maxChildrenPerTask:
      config?.DELEGATION_MAX_CHILDREN_PER_TASK ?? DEFAULT_DELEGATION_LIMITS.maxChildrenPerTask,
    maxTasksPerCommand:
      config?.DELEGATION_MAX_TASKS_PER_COMMAND ?? DEFAULT_DELEGATION_LIMITS.maxTasksPerCommand,
  };
}

/** A valid non-empty uuid, so a placeholder cannot be persisted as a parent. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Number of ancestors of `taskId` (a root task has 0). Bounded: stops once it has
 * walked `maxDepth + 2` hops, which is all a caller ever needs to compare against
 * a limit.
 */
export async function countAncestors(
  db: Db,
  orgId: string,
  taskId: string,
  cap = DEFAULT_DELEGATION_LIMITS.maxDepth + 2,
): Promise<number> {
  let current: string | null = taskId;
  let depth = 0;
  while (isUuid(current) && depth <= cap) {
    const rows: Array<{ parentTaskId: string | null }> = await db
      .select({ parentTaskId: tasks.parentTaskId })
      .from(tasks)
      .where(and(eq(tasks.id, current), eq(tasks.orgId, orgId)))
      .limit(1);
    const parent: string | null = rows[0]?.parentTaskId ?? null;
    if (!isUuid(parent)) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

/** Direct sub-tasks already owned by `parentTaskId`. */
export async function countChildren(db: Db, orgId: string, parentTaskId: string): Promise<number> {
  const [row] = await db
    .select({ children: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.parentTaskId, parentTaskId)));
  return row?.children ?? 0;
}

export interface DelegationGuardResult {
  allowed: boolean;
  reason?: 'delegation_depth' | 'delegation_children';
  detail?: string;
}

/**
 * Decide whether a new sub-task may be created under `parentTaskId`.
 * A missing/blank parent is a top-level task: always allowed.
 */
export async function checkDelegationGuard(
  db: Db,
  orgId: string,
  parentTaskId: string | null | undefined,
  limits: DelegationLimits,
): Promise<DelegationGuardResult> {
  if (!isUuid(parentTaskId)) return { allowed: true };

  const depth = (await countAncestors(db, orgId, parentTaskId, limits.maxDepth + 2)) + 1;
  if (depth > limits.maxDepth) {
    return {
      allowed: false,
      reason: 'delegation_depth',
      detail: `Delegation depth limit reached: this sub-task would sit ${depth} levels deep, the maximum is ${limits.maxDepth}.`,
    };
  }

  const children = await countChildren(db, orgId, parentTaskId);
  if (children >= limits.maxChildrenPerTask) {
    return {
      allowed: false,
      reason: 'delegation_children',
      detail: `This task already has ${children} sub-tasks, the maximum is ${limits.maxChildrenPerTask}.`,
    };
  }

  return { allowed: true };
}
