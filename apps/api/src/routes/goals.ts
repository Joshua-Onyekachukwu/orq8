import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import type { AppDeps } from '../types.js';
import { goals, tasks } from '@orq8/db';

const createGoalBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueDate: z.string().datetime().optional(), // ISO date string
});

const updateGoalBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['active', 'completed', 'paused', 'cancelled']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dueDate: z.string().datetime().optional().nullable(),
});

const createTaskBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  goalId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  dueDate: z.string().datetime().optional(),
});

const updateTaskBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
  agentId: z.string().uuid().optional().nullable(),
  goalId: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  result: z.string().max(5000).optional().nullable(),
});

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

    const conditions = [eq(goals.orgId, ctx.orgId)];
    if (status) conditions.push(eq(goals.status, status));

    const list = await db
      .select()
      .from(goals)
      .where(and(...conditions))
      .orderBy(goals.createdAt)
      .limit(limit)
      .offset(offset);
    return { data: list, meta: { limit, offset } };
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

    const [goal] = await db
      .insert(goals)
      .values({
        orgId: ctx.orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
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

    const conditions = [eq(tasks.orgId, ctx.orgId)];
    if (goalId) conditions.push(eq(tasks.goalId, goalId));
    if (agentId) conditions.push(eq(tasks.agentId, agentId));
    if (status) conditions.push(eq(tasks.status, status));
    if (priority) conditions.push(eq(tasks.priority, priority));

    // Sort: priority order is urgent > high > normal > low; dueDate sorts NULLS LAST
    const orderClause = sortBy === 'priority'
      ? tasks.priority
      : sortBy === 'dueDate'
      ? tasks.dueDate
      : tasks.createdAt;

    const list = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset);

    return { data: list, meta: { limit, offset } };
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

    const [task] = await db
      .insert(tasks)
      .values({
        orgId: ctx.orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        goalId: parsed.data.goalId ?? null,
        agentId: parsed.data.agentId ?? null,
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
