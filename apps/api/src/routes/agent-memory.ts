import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as agentMemory from '../services/agent-memory.js';
import type { AppDeps } from '../types.js';

const storeBody = z.object({
  agentId: z.string().uuid(),
  category: z.enum(['lesson', 'preference', 'pattern', 'relationship', 'technique', 'context', 'feedback']),
  content: z.string().trim().min(1).max(2000),
  importance: z.number().int().min(1).max(10).default(5),
  taskId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

const retrieveQuery = z.object({
  agentId: z.string().uuid(),
  category: z.string().optional(),
  query: z.string().optional(),
  minImportance: z.coerce.number().int().min(1).max(10).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export function registerAgentMemoryRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /**
   * POST /v1/agent-memory — Store a memory entry for an agent.
   */
  app.post('/v1/agent-memory', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = storeBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const entryId = await agentMemory.storeAgentMemory(db, {
      orgId: ctx.orgId,
      ...parsed.data,
    });

    reply.code(201);
    return { data: { id: entryId, stored: true } };
  });

  /**
   * GET /v1/agent-memory — Retrieve memory entries for an agent.
   */
  app.get('/v1/agent-memory', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const query = Object.fromEntries(url.searchParams.entries());

    const parsed = retrieveQuery.safeParse(query);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const entries = await agentMemory.retrieveAgentMemory(db, {
      orgId: ctx.orgId,
      agentId: parsed.data.agentId,
      category: parsed.data.category as agentMemory.AgentMemoryCategory | undefined,
      query: parsed.data.query,
      minImportance: parsed.data.minImportance,
      limit: parsed.data.limit,
    });

    return { data: entries };
  });

  /**
   * GET /v1/agent-memory/:agentId/stats — Get memory stats for an agent.
   */
  app.get<{ Params: { agentId: string } }>('/v1/agent-memory/:agentId/stats', async (request) => {
    const ctx = await requireAuth(request, deps);
    const stats = await agentMemory.getAgentMemoryStats(db, ctx.orgId, request.params.agentId);
    return { data: stats };
  });
}
