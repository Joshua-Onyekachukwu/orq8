import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import type { AppDeps } from '../types.js';
import { goals, tasks, teams, type Db } from '@orq8/db';

const createGoalBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueDate: z.string().datetime().optional(), // ISO date string
  teamId: z.string().uuid().optional(),
});

const updateGoalBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['active', 'completed', 'paused', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
});

const createTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  goalId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueDate: z.string().datetime().optional(),
});

const updateTaskBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
  agentId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  result: z.string().max(5000).optional().nullable(),
});

/**
 * Validate that a team belongs to the requesting org (IDOR guard).
 * Returns the team id or null; throws a 400 validation error for foreign teams.
 */
async function resolveTeamInOrg(
  db: Db,
  orgId: string,
  teamId: string | null | undefined,
): Promise<string | null> {
  if (!teamId) return null;
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.orgId, orgId)))
    .limit(1);
  if (!team) throw validation({ teamId: ['Team not found in this organization'] });
  return team.id;
}

export function registerGoalRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  // ── GOALS ──

  /** List all goals for the current org, optionally filtered by status. */
  app.get('/v1/goals', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

    const teamId = url.searchParams.get('team_id') ?? undefined;
    const conditions = [eq(goals.orgId, ctx.orgId)];
    if (status) conditions.push(eq(goals.status, status));
    if (teamId) conditions.push(eq(goals.teamId, teamId));

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(goals)
      .where(and(...conditions));
    const list = await db
      .select()
      .from(goals)
      .where(and(...conditions))
      .orderBy(goals.createdAt)
      .limit(limit)
      .offset(offset);
    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  /** Get a single goal. */
  app.get<{ Params: { id: string } }>('/v1/goals/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const result = await db
      .select()
      .from(goals)
      .where(and(eq(goals.id, request.params.id), eq(goals.orgId, ctx.orgId)))
      .limit(1);
    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Goal not found' } };
    }
    return { data: result[0] };
  });

  /** Create a new goal. */
  app.post('/v1/goals', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createGoalBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const teamId = await resolveTeamInOrg(db, ctx.orgId, parsed.data.teamId);
    const [goal] = await db
      .insert(goals)
      .values({
        orgId: ctx.orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        teamId,
        status: 'active',
        progress: 0,
      })
      .returning();

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'goal.created',
      outcome: 'success',
    });

    reply.code(201);
    return { data: goal };
  });

  /** Update a goal. */
  app.patch<{ Params: { id: string } }>('/v1/goals/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateGoalBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
    if (parsed.data.progress !== undefined) updates.progress = parsed.data.progress;
    if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    if (parsed.data.teamId !== undefined) {
      updates.teamId = await resolveTeamInOrg(db, ctx.orgId, parsed.data.teamId);
    }

    const result = await db
      .update(goals)
      .set(updates)
      .where(and(eq(goals.id, request.params.id), eq(goals.orgId, ctx.orgId)))
      .returning();

    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Goal not found' } };
    }
    return { data: result[0] };
  });

  /** Delete a goal. */
  app.delete<{ Params: { id: string } }>('/v1/goals/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const result = await db
      .delete(goals)
      .where(and(eq(goals.id, request.params.id), eq(goals.orgId, ctx.orgId)))
      .returning();

    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Goal not found' } };
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'goal.deleted',
      outcome: 'success',
    });

    reply.code(204);
    return reply.send();
  });

  // ── TASKS ──

  /** List tasks, optionally filtered by goalId, agentId, status, or priority. */
  app.get('/v1/tasks', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const goalId = url.searchParams.get('goal_id') ?? undefined;
    const agentId = url.searchParams.get('agent_id') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const priority = url.searchParams.get('priority') ?? undefined;
    const sortBy = url.searchParams.get('sort') ?? 'createdAt'; // createdAt | priority | dueDate
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const teamId = url.searchParams.get('team_id') ?? undefined;
    const conditions = [eq(tasks.orgId, ctx.orgId)];
    if (goalId) conditions.push(eq(tasks.goalId, goalId));
    if (agentId) conditions.push(eq(tasks.agentId, agentId));
    if (teamId) conditions.push(eq(tasks.teamId, teamId));
    if (status) conditions.push(eq(tasks.status, status));
    if (priority) conditions.push(eq(tasks.priority, priority));

    // Sort: priority order is urgent > high > normal > low; dueDate sorts NULLS LAST
    const orderClause = sortBy === 'priority'
      ? tasks.priority
      : sortBy === 'dueDate'
      ? tasks.dueDate
      : tasks.createdAt;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(...conditions));
    const list = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  /** Get a single task. */
  app.get<{ Params: { id: string } }>('/v1/tasks/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const result = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, request.params.id), eq(tasks.orgId, ctx.orgId)))
      .limit(1);
    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Task not found' } };
    }
    return { data: result[0] };
  });

  /** Create a new task. */
  app.post('/v1/tasks', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createTaskBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const teamId = await resolveTeamInOrg(db, ctx.orgId, parsed.data.teamId);
    const [task] = await db
      .insert(tasks)
      .values({
        orgId: ctx.orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        goalId: parsed.data.goalId ?? null,
        agentId: parsed.data.agentId ?? null,
        teamId,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: 'pending',
        cost: 0,
      })
      .returning();

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'task.created',
      outcome: 'success',
    });

    reply.code(201);
    return { data: task };
  });

  /** Update a task. */
  app.patch<{ Params: { id: string } }>('/v1/tasks/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateTaskBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) updates.title = parsed.data.title;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.agentId !== undefined) updates.agentId = parsed.data.agentId;
    if (parsed.data.goalId !== undefined) updates.goalId = parsed.data.goalId;
    if (parsed.data.teamId !== undefined) {
      updates.teamId = await resolveTeamInOrg(db, ctx.orgId, parsed.data.teamId);
    }
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority;
    if (parsed.data.dueDate !== undefined) updates.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    if (parsed.data.result !== undefined) updates.result = parsed.data.result;

    const result = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, request.params.id), eq(tasks.orgId, ctx.orgId)))
      .returning();

    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Task not found' } };
    }

    // Auto-update goal progress when task status changes
    const updatedTask = result[0]!;
    if (updatedTask.goalId && parsed.data.status) {
      try {
        const [totalRow, completedRow] = await Promise.all([
          db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(eq(tasks.goalId, updatedTask.goalId)),
          db.select({ count: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.goalId, updatedTask.goalId), eq(tasks.status, 'completed'))),
        ]);
        const total = totalRow[0]?.count ?? 0;
        const completed = completedRow[0]?.count ?? 0;
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const goalStatus = progress >= 100 ? 'completed' : 'active';
        await db.update(goals).set({ progress, status: goalStatus, updatedAt: new Date() }).where(eq(goals.id, updatedTask.goalId));
      } catch {
        // Goal auto-progress is best-effort
      }
    }

    return { data: result[0] };
  });

  /** Delete a task. */
  app.delete<{ Params: { id: string } }>('/v1/tasks/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const result = await db
      .delete(tasks)
      .where(and(eq(tasks.id, request.params.id), eq(tasks.orgId, ctx.orgId)))
      .returning();

    if (result.length === 0) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Task not found' } };
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'task.deleted',
      outcome: 'success',
    });

    reply.code(204);
    return reply.send();
  });
}
