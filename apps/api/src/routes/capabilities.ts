import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  ensureBuiltInCapabilities,
  listCapabilities,
  registerCapability,
  searchCapabilities,
  resolveCapabilityRequest,
} from '../services/capability-registry.js';
import { appendAudit } from '../services/audit.js';
import type { AppDeps } from '../types.js';

const resolveBody = z.object({
  request: z.string().trim().min(3).max(1000),
  limit: z.number().int().min(1).max(10).optional(),
});

const registerBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.enum(['connector', 'agent', 'workflow', 'code', 'service', 'tool']),
  provider: z.string().max(50).optional(),
  capability: z.string().max(200).optional(),
  location: z.string().max(300).optional(),
  ownerAgentId: z.string().uuid().optional(),
  reusable: z.boolean().optional(),
  status: z.enum(['available', 'in_development', 'deprecated']).optional(),
  source: z.enum(['builtin', 'connector', 'engineering', 'manual']).optional(),
});

export function registerCapabilityRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List all capabilities for the org (seeding built-ins lazily on first read). */
  app.get('/v1/capabilities', async (request) => {
    const ctx = await requireAuth(request, deps);
    await ensureBuiltInCapabilities(db, ctx.orgId);
    const capabilities = await listCapabilities(db, ctx.orgId);
    return { data: capabilities };
  });

  /** Search capabilities — the build-vs-buy query for agents and founders. */
  app.get('/v1/capabilities/search', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { query?: string; category?: string };
    if (!q.query?.trim()) return { data: [] };
    await ensureBuiltInCapabilities(db, ctx.orgId);
    const result = await searchCapabilities(db, ctx.orgId, q.query, q.category);
    return { data: result };
  });

  /**
   * Reuse-vs-build resolution (Phase 11). Given a request, decide whether the
   * company can already do it (reuse), partially can (extend), or must build.
   * Searches registered capabilities + AI employees + company knowledge.
   */
  app.post('/v1/capabilities/resolve', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = resolveBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());
    await ensureBuiltInCapabilities(db, ctx.orgId);
    const result = await resolveCapabilityRequest(db, ctx.orgId, parsed.data.request, {
      limit: parsed.data.limit,
      actorId: ctx.userId,
    });
    return { data: result };
  });

  /** Register a reusable capability (post-engineering completion, manual, etc.). */
  app.post('/v1/capabilities', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const entry = await registerCapability(db, ctx.orgId, {
      ...parsed.data,
      ownerAgentId: parsed.data.ownerAgentId ?? null,
      provider: parsed.data.provider ?? null,
      capability: parsed.data.capability ?? null,
      location: parsed.data.location ?? null,
      reusable: parsed.data.reusable ?? true,
      status: parsed.data.status ?? 'available',
      source: parsed.data.source ?? 'manual',
    });
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'capability.registered',
      outcome: 'success',
      resultRef: entry.name,
    });
    reply.code(201);
    return { data: entry };
  });
}