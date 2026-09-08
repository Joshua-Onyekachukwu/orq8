/**
 * ORQ8 Strategic Lineage Service
 *
 * Traces every organizational action back to company strategy through the chain:
 * Strategy → Objective → Key Result → Initiative → Task → Agent Action
 *
 * Answers:
 *   - "Why does this task exist?" (trace task → strategy)
 *   - "What % of work is connected to strategy?" (lineage score)
 *   - "Show me the full strategic tree" (visual lineage)
 */

import { eq, and, sql, count, inArray } from 'drizzle-orm';
import {
  strategies, objectives, keyResults, initiatives, tasks, agents, goals as goalsTable, activityEvents,
  type Db,
} from '@orq8/db';

// ── Types ───────────────────────────────────────────────────────────────────

export interface LineageNode {
  id: string;
  title: string;
  type: 'strategy' | 'objective' | 'key_result' | 'initiative' | 'task' | 'action';
  status: string;
  progress: number;
  priority: string;
  agentName?: string;
  completedAt?: Date;
  children: LineageNode[];
}

export interface TaskLineage {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  initiativeId: string | null;
  initiativeTitle: string | null;
  objectiveId: string | null;
  objectiveTitle: string | null;
  strategyId: string | null;
  strategyTitle: string | null;
  keyResultId: string | null;
  keyResultTitle: string | null;
  goalId: string | null;
  goalTitle: string | null;
  agentId: string | null;
  agentName: string | null;
}

export interface LineageScore {
  totalActiveTasks: number;
  tasksWithInitiative: number;
  tasksWithObjective: number;
  tasksWithStrategy: number;
  tasksWithGoal: number;
  lineageScore: number; // % of active tasks that trace to a strategy
  orphanedTasks: number;
  deepLinkedTasks: number; // tasks with full chain to strategy
}

// ── Trace a single task's lineage ──────────────────────────────────────────

export async function traceTaskLineage(
  db: Db,
  orgId: string,
  taskId: string,
): Promise<TaskLineage | null> {
  // Fetch the task with its direct links
  const [task] = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      initiativeId: tasks.initiativeId,
      goalId: tasks.goalId,
      agentId: tasks.agentId,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));

  if (!task) return null;

  // Trace initiative → objective → strategy
  let initiativeTitle: string | null = null;
  let objectiveId: string | null = null;
  let objectiveTitle: string | null = null;
  let strategyId: string | null = null;
  let strategyTitle: string | null = null;
  let keyResultId: string | null = null;
  let keyResultTitle: string | null = null;

  if (task.initiativeId) {
    const [init] = await db.select().from(initiatives)
      .where(eq(initiatives.id, task.initiativeId));
    if (init) {
      initiativeTitle = init.title;
      objectiveId = init.objectiveId;
      strategyId = init.strategyId;
      keyResultId = init.keyResultId;
    }
  }

  if (objectiveId) {
    const [obj] = await db.select().from(objectives)
      .where(eq(objectives.id, objectiveId));
    if (obj) {
      objectiveTitle = obj.title;
      if (!strategyId) strategyId = obj.strategyId;
    }
  }

  if (keyResultId) {
    const [kr] = await db.select().from(keyResults)
      .where(eq(keyResults.id, keyResultId));
    if (kr) {
      keyResultTitle = kr.title;
      if (!objectiveId) objectiveId = kr.objectiveId;
    }
  }

  if (!strategyId && objectiveId) {
    const [obj] = await db.select({ strategyId: objectives.strategyId })
      .from(objectives).where(eq(objectives.id, objectiveId));
    if (obj) strategyId = obj.strategyId;
  }

  if (strategyId) {
    const [strat] = await db.select().from(strategies)
      .where(eq(strategies.id, strategyId));
    if (strat) strategyTitle = strat.title;
  }

  // Goal and agent
  let goalTitle: string | null = null;
  let agentName: string | null = null;

  if (task.goalId) {
    const { goals: goalsTable } = await import('@orq8/db');
    const [goal] = await db.select({ title: goalsTable.title })
      .from(goalsTable).where(eq(goalsTable.id, task.goalId));
    goalTitle = goal?.title ?? null;
  }

  if (task.agentId) {
    const [agent] = await db.select({ name: agents.name })
      .from(agents).where(eq(agents.id, task.agentId));
    agentName = agent?.name ?? null;
  }

  return {
    taskId: task.id,
    taskTitle: task.title,
    taskStatus: task.status,
    initiativeId: task.initiativeId,
    initiativeTitle,
    objectiveId,
    objectiveTitle,
    strategyId,
    strategyTitle,
    keyResultId,
    keyResultTitle,
    goalId: task.goalId,
    goalTitle,
    agentId: task.agentId,
    agentName,
  };
}

// ── Build the full strategic tree ──────────────────────────────────────────

export async function buildStrategicTree(db: Db, orgId: string): Promise<LineageNode[]> {
  // Fetch all strategies with their children
  const orgStrategies = await db.select().from(strategies)
    .where(eq(strategies.orgId, orgId))
    .orderBy(strategies.createdAt);

  const tree: LineageNode[] = [];

  for (const strat of orgStrategies) {
    // Objectives under this strategy
    const stratObjectives = await db.select().from(objectives)
      .where(and(eq(objectives.orgId, orgId), eq(objectives.strategyId, strat.id)));

    const objectiveNodes: LineageNode[] = [];

    for (const obj of stratObjectives) {
      // Key results under this objective
      const objKRs = await db.select().from(keyResults)
        .where(eq(keyResults.objectiveId, obj.id));

      const krNodes: LineageNode[] = [];

      for (const kr of objKRs) {
        // Initiatives under this KR
        const krInits = await db.select().from(initiatives)
          .where(and(eq(initiatives.orgId, orgId), eq(initiatives.keyResultId, kr.id)));

        // Tasks under this KR (via initiatives or direct)
        const initIds = krInits.map(i => i.id);
        let krTasks: any[] = [];
        if (initIds.length > 0) {
          krTasks = await db.select({
            id: tasks.id,
            title: tasks.title,
            status: tasks.status,
            priority: tasks.priority,
            agentId: tasks.agentId,
            updatedAt: tasks.updatedAt,
          }).from(tasks)
            .where(and(eq(tasks.orgId, orgId), inArray(tasks.initiativeId, initIds)));
        }

        krNodes.push({
          id: kr.id,
          title: kr.title,
          type: 'key_result',
          status: kr.status,
          progress: kr.progress,
          priority: 'normal',
          children: [
            ...krInits.map(init => ({
              id: init.id,
              title: init.title,
              type: 'initiative' as const,
              status: init.status,
              progress: init.progress,
              priority: init.priority,
              children: krTasks
                .filter((t: any) => t.id) // tasks linked to this initiative's KR
                .map((t: any) => ({
                  id: t.id,
                  title: t.title,
                  type: 'task' as const,
                  status: t.status,
                  progress: t.status === 'completed' ? 100 : 0,
                  priority: t.priority,
                  children: [],
                })),
            })),
          ],
        });
      }

      // Initiatives directly under this objective (not via KR)
      const objInits = await db.select().from(initiatives)
        .where(and(eq(initiatives.orgId, orgId), eq(initiatives.objectiveId, obj.id), sql`${initiatives.keyResultId} IS NULL`));

      // Tasks directly under this objective (not via initiative)
      const initIds = [...objInits.map(i => i.id)];
      let directTasks: any[] = [];
      if (initIds.length > 0) {
        directTasks = await db.select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          priority: tasks.priority,
          agentId: tasks.agentId,
        }).from(tasks)
          .where(and(eq(tasks.orgId, orgId), inArray(tasks.initiativeId, initIds)));
      }

      // Tasks linked directly to objective via goal
      // (no-op: tasks link to objectives through initiatives, not directly)

      objectiveNodes.push({
        id: obj.id,
        title: obj.title,
        type: 'objective',
        status: obj.status,
        progress: obj.progress,
        priority: obj.priority,
        children: [
          ...krNodes,
          ...objInits.map(init => ({
            id: init.id,
            title: init.title,
            type: 'initiative' as const,
            status: init.status,
            progress: init.progress,
            priority: init.priority,
            children: directTasks.map((t: any) => ({
              id: t.id,
              title: t.title,
              type: 'task' as const,
              status: t.status,
              progress: t.status === 'completed' ? 100 : 0,
              priority: t.priority,
              children: [],
            })),
          })),
        ],
      });
    }

    // Initiatives directly under strategy (not via objective)
    const stratInits = await db.select().from(initiatives)
      .where(and(eq(initiatives.orgId, orgId), eq(initiatives.strategyId, strat.id), sql`${initiatives.objectiveId} IS NULL`));

    tree.push({
      id: strat.id,
      title: strat.title,
      type: 'strategy',
      status: strat.status,
      progress: 0,
      priority: strat.priority,
      children: [
        ...objectiveNodes,
        ...stratInits.map(init => ({
          id: init.id,
          title: init.title,
          type: 'initiative' as const,
          status: init.status,
          progress: init.progress,
          priority: init.priority,
          children: [],
        })),
      ],
    });
  }

  return tree;
}

// ── Calculate Lineage Score ────────────────────────────────────────────────

export async function calculateLineageScore(db: Db, orgId: string): Promise<LineageScore> {
  const [activeTasks] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), sql`${tasks.status} IN ('pending', 'in_progress')`));

  const [withInitiative] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(
      eq(tasks.orgId, orgId),
      sql`${tasks.status} IN ('pending', 'in_progress')`,
      sql`${tasks.initiativeId} IS NOT NULL`,
    ));

  const [withGoal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(
      eq(tasks.orgId, orgId),
      sql`${tasks.status} IN ('pending', 'in_progress')`,
      sql`${tasks.goalId} IS NOT NULL`,
    ));

  // Tasks that have an initiative which has an objective which has a strategy
  const [deepLinked] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id))
    .innerJoin(objectives, eq(initiatives.objectiveId, objectives.id))
    .innerJoin(strategies, eq(objectives.strategyId, strategies.id))
    .where(and(
      eq(tasks.orgId, orgId),
      sql`${tasks.status} IN ('pending', 'in_progress')`,
    ));

  // Also count via key_results → objectives → strategies
  const [deepLinkedViaKR] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id))
    .innerJoin(keyResults, eq(initiatives.keyResultId, keyResults.id))
    .innerJoin(objectives, eq(keyResults.objectiveId, objectives.id))
    .innerJoin(strategies, eq(objectives.strategyId, strategies.id))
    .where(and(
      eq(tasks.orgId, orgId),
      sql`${tasks.status} IN ('pending', 'in_progress')`,
    ));

  const total = activeTasks?.count ?? 0;
  const withInit = withInitiative?.count ?? 0;
  const withObj = (withInitiative?.count ?? 0); // simplified
  const withStrat = (deepLinked?.count ?? 0) + (deepLinkedViaKR?.count ?? 0);
  const withGoalCount = withGoal?.count ?? 0;
  const orphaned = total - withInit;
  const deep = withStrat;
  const score = total > 0 ? Math.round((withStrat / total) * 100) : 0;

  return {
    totalActiveTasks: total,
    tasksWithInitiative: withInit,
    tasksWithObjective: withObj,
    tasksWithStrategy: withStrat,
    tasksWithGoal: withGoalCount,
    lineageScore: score,
    orphanedTasks: orphaned,
    deepLinkedTasks: deep,
  };
}

// ── EA Context ──────────────────────────────────────────────────────────────

export async function getLineageContext(db: Db, orgId: string): Promise<string> {
  const score = await calculateLineageScore(db, orgId);
  if (score.totalActiveTasks === 0) return '';

  const lines: string[] = ['### Strategic Lineage'];
  lines.push(`Lineage score: ${score.lineageScore}% (${score.deepLinkedTasks}/${score.totalActiveTasks} active tasks traced to a strategy)`);
  if (score.orphanedTasks > 0) {
    lines.push(`Orphaned tasks: ${score.orphanedTasks} (no initiative or strategy link)`);
  }

  return lines.join('\n');
}
