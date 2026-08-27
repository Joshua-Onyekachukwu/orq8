import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as memory from '../services/memory.js';
import type { AppDeps } from '../types.js';

const createMemoryBody = z.object({
  category: z.enum(['fact', 'decision', 'lesson', 'preference', 'workflow', 'context']),
  content: z.string().trim().min(1).max(5000),
  source: z.string().trim().max(200).optional(),
  agentId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  importance: z.number().int().min(1).max(10).default(5),
});

const updateMemoryBody = z.object({
  content: z.string().trim().min(1).max(5000).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  category: z.enum(['fact', 'decision', 'lesson', 'preference', 'workflow', 'context']).optional(),
});

export function registerMemoryRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List memory entries with search and filtering. */
  app.get('/v1/memory', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const query = url.searchParams.get('q') ?? undefined;
    const category = url.searchParams.get('category') as memory.MemoryCategory | null;
    const minImportance = url.searchParams.get('min_importance')
      ? parseInt(url.searchParams.get('min_importance')!, 10)
      : undefined;
    const agentId = url.searchParams.get('agent_id') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

    const list = await memory.findByOrg(db, ctx.orgId, {
      query,
      category: category ?? undefined,
      minImportance,
      agentId,
      limit,
      offset,
    });

    return { data: list, meta: { limit, offset } };
  });

  /** Get memory stats for the org. */
  app.get('/v1/memory/stats', async (request) => {
    const ctx = await requireAuth(request, deps);
    const stats = await memory.getStats(db, ctx.orgId);
    return { data: stats };
  });

  /** Retrieve relevant memory for context (used internally by Executive Agent). */
  app.get('/v1/memory/context', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const maxEntries = Math.min(parseInt(url.searchParams.get('max') ?? '20', 10), 100);
    const categories = url.searchParams.get('categories')?.split(',') as memory.MemoryCategory[] | null;

    const entries = await memory.retrieveForContext(db, ctx.orgId, {
      maxEntries,
      categories: categories ?? undefined,
    });

    return { data: entries };
  });

  /** Get a single memory entry. */
  app.get<{ Params: { id: string } }>('/v1/memory/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const entry = await memory.findById(db, ctx.orgId, request.params.id);
    if (!entry) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Memory entry not found' } };
    }
    return { data: entry };
  });

  /** Create a new memory entry. */
  app.post('/v1/memory', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createMemoryBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const entry = await memory.createMemory(db, {
      orgId: ctx.orgId,
      category: parsed.data.category,
      content: parsed.data.content,
      source: parsed.data.source ?? null,
      agentId: parsed.data.agentId ?? null,
      taskId: parsed.data.taskId ?? null,
      importance: parsed.data.importance,
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'memory.created',
      outcome: 'success',
    });

    reply.code(201);
    return { data: entry };
  });

  /** Update a memory entry. */
  app.patch<{ Params: { id: string } }>('/v1/memory/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = updateMemoryBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const updated = await memory.updateMemory(db, ctx.orgId, request.params.id, parsed.data);
    if (!updated) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Memory entry not found' } };
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'memory.updated',
      outcome: 'success',
    });

    return { data: updated };
  });

  /** Delete a memory entry. */
  app.delete<{ Params: { id: string } }>('/v1/memory/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const deleted = await memory.deleteMemory(db, ctx.orgId, request.params.id);
    if (!deleted) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Memory entry not found' } };
    }

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'memory.deleted',
      outcome: 'success',
    });

    reply.code(204);
    return reply.send();
  });
}
