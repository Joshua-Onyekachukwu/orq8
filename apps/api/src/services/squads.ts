/**
 * ORQ8 Cross-Agent Squads (F13)
 *
 * A squad is a named group of AI employees working a shared objective. The
 * execution substrate is the existing delegation orchestrator; squads persist
 * the group definition, membership and created-task linkage so founders can
 * create, monitor and archive squads through the product.
 *
 * Everything is org-scoped; membership is validated server-side against the
 * org's agents.
 */

import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import type { Db, Squad, SquadAgent } from '@orq8/db';
import { squads, squadAgents, agents, tasks, type NewSquad } from '@orq8/db';
import { createDelegationPlan, executeDelegationPlan } from './delegation-orchestrator.js';
import { appendAudit } from './audit.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SquadWithAgents extends Squad {
  agents: Array<{ id: string; name: string; role: string; status: string }>;
}

export interface SquadMonitor {
  squad: SquadWithAgents;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    agentId: string | null;
    agentName: string | null;
    cost: number;
    updatedAt: string;
  }>;
  summary: {
    totalTasks: number;
    completed: number;
    inProgress: number;
    pending: number;
    failed: number;
    totalCost: number;
    completionRate: number;
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createSquad(
  db: Db,
  orgId: string,
  userId: string,
  data: { name: string; purpose?: string; objective: string; agentIds: string[] },
): Promise<SquadWithAgents> {
  // Validate agents are in this org (server-side, never trust the browser).
  if (data.agentIds.length > 0) {
    const rows = await db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.orgId, orgId), inArray(agents.id, data.agentIds)));
    const validIds = new Set(rows.map(r => r.id));
    const invalid = data.agentIds.find(id => !validIds.has(id));
    if (invalid) throw new Error(`Agent ${invalid} does not belong to this organization`);
  }

  const [squad] = await db
    .insert(squads)
    .values({
      orgId,
      name: data.name.trim(),
      purpose: data.purpose?.trim() || null,
      objective: data.objective.trim(),
      status: 'active',
      createdBy: userId,
    } satisfies NewSquad)
    .returning();
  if (!squad) throw new Error('createSquad returned no row');

  if (data.agentIds.length > 0) {
    await db
      .insert(squadAgents)
      .values(data.agentIds.map(agentId => ({ orgId, squadId: squad.id, agentId })))
      .onConflictDoNothing();
  }

  return getSquad(db, orgId, squad.id) as Promise<SquadWithAgents>;
}

export async function listSquads(db: Db, orgId: string): Promise<SquadWithAgents[]> {
  const rows = await db
    .select()
    .from(squads)
    .where(and(eq(squads.orgId, orgId), sql`${squads.status} <> 'archived'`))
    .orderBy(desc(squads.updatedAt))
    .limit(100);

  const memberships = await db
    .select({
      squadId: squadAgents.squadId,
      id: agents.id,
      name: agents.name,
      role: agents.role,
      status: agents.status,
    })
    .from(squadAgents)
    .innerJoin(agents, eq(agents.id, squadAgents.agentId))
    .where(eq(squadAgents.orgId, orgId));

  const bySquad = new Map<string, SquadWithAgents['agents']>();
  for (const m of memberships) {
    const list = bySquad.get(m.squadId) ?? [];
    list.push({ id: m.id, name: m.name, role: m.role, status: m.status });
    bySquad.set(m.squadId, list);
  }

  return rows.map(r => ({ ...r, agents: bySquad.get(r.id) ?? [] }));
}

export async function getSquad(db: Db, orgId: string, id: string): Promise<SquadWithAgents | null> {
  const [squad] = await db
    .select()
    .from(squads)
    .where(and(eq(squads.id, id), eq(squads.orgId, orgId)))
    .limit(1);
  if (!squad) return null;

  const memberships = await db
    .select({ id: agents.id, name: agents.name, role: agents.role, status: agents.status })
    .from(squadAgents)
    .innerJoin(agents, eq(agents.id, squadAgents.agentId))
    .where(and(eq(squadAgents.orgId, orgId), eq(squadAgents.squadId, id)));
  return { ...squad, agents: memberships };
}

export async function updateSquadStatus(
  db: Db,
  orgId: string,
  id: string,
  status: 'active' | 'completed' | 'archived',
): Promise<Squad | undefined> {
  const rows = await db
    .update(squads)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(squads.id, id), eq(squads.orgId, orgId)))
    .returning();
  return rows[0];
}

// ─── Execution (delegation orchestrator) ────────────────────────────────────

export interface SquadTaskInput {
  title: string;
  description: string;
  suggestedAgentRole: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

/**
 * Start a squad: decompose the objective into tasks and execute through the
 * delegation orchestrator. Records the parent task so the founder can monitor.
 */
export async function startSquad(
  db: Db,
  orgId: string,
  userId: string,
  squadId: string,
  tasksInput: SquadTaskInput[],
): Promise<{ squad: SquadWithAgents; createdTaskIds: string[]; parentTaskId: string | null }> {
  const squad = await getSquad(db, orgId, squadId);
  if (!squad) throw new Error('Squad not found');

  const plan = await createDelegationPlan(db, orgId, tasksInput);
  const result = await executeDelegationPlan(db, orgId, plan, tasksInput);
  const parentTaskId = result.createdTaskIds[0] ?? null;

  await db
    .update(squads)
    .set({ parentTaskId, updatedAt: new Date() })
    .where(eq(squads.id, squadId));

  // Tag the created tasks with the squad so monitoring is a single query.
  if (result.createdTaskIds.length > 0) {
    await db
      .update(tasks)
      .set({ squadId })
      .where(and(eq(tasks.orgId, orgId), inArray(tasks.id, result.createdTaskIds)));
  }

  await appendAudit(db, {
    orgId,
    actorType: 'user',
    actorId: userId,
    action: 'squad.started',
    outcome: 'success',
    resultRef: `${squad.name} — ${result.createdTaskIds.length} tasks delegated`,
  });

  const fresh = await getSquad(db, orgId, squadId);
  return { squad: fresh as SquadWithAgents, createdTaskIds: result.createdTaskIds, parentTaskId };
}

// ─── Monitoring ─────────────────────────────────────────────────────────────

/** Per-agent task distribution + completion for a squad. */
export async function monitorSquad(db: Db, orgId: string, squadId: string): Promise<SquadMonitor | null> {
  const squad = await getSquad(db, orgId, squadId);
  if (!squad) return null;

  const squadTasks = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      agentId: tasks.agentId,
      cost: tasks.cost,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .where(and(eq(tasks.orgId, orgId), eq(tasks.squadId, squadId)));

  const agentIds = [...new Set(squadTasks.map(t => t.agentId).filter((id): id is string => Boolean(id)))];
  const agentRows = agentIds.length
    ? await db.select({ id: agents.id, name: agents.name }).from(agents).where(and(eq(agents.orgId, orgId), inArray(agents.id, agentIds)))
    : [];
  const nameById = new Map(agentRows.map(a => [a.id, a.name]));

  const completed = squadTasks.filter(t => t.status === 'completed').length;
  const inProgress = squadTasks.filter(t => t.status === 'in_progress').length;
  const pending = squadTasks.filter(t => t.status === 'pending').length;
  const failed = squadTasks.filter(t => t.status === 'failed').length;
  const totalCost = squadTasks.reduce((s, t) => s + t.cost, 0);

  return {
    squad,
    tasks: squadTasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      agentId: t.agentId,
      agentName: t.agentId && nameById.has(t.agentId) ? (nameById.get(t.agentId) ?? null) : null,
      cost: t.cost,
      updatedAt: t.updatedAt.toISOString(),
    })),
    summary: {
      totalTasks: squadTasks.length,
      completed,
      inProgress,
      pending,
      failed,
      totalCost,
      completionRate: squadTasks.length > 0 ? Math.round((completed / squadTasks.length) * 100) : 0,
    },
  };
}