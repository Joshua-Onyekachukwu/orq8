import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import {
  createSquad,
  listSquads,
  getSquad,
  startSquad,
  monitorSquad,
  updateSquadStatus,
} from '../services/squads.js';
import { appendAudit } from '../services/audit.js';
import type { AppDeps } from '../types.js';

const createBody = z.object({
  name: z.string().trim().min(1).max(100),
  purpose: z.string().max(1000).optional(),
  objective: z.string().trim().min(1).max(2000),
  agentIds: z.array(z.string().uuid()).max(50).default([]),
});

const startBody = z.object({
  tasks: z.array(
    z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().min(1).max(2000),
      suggestedAgentRole: z.string().trim().min(1).max(100),
      priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
    }),
  ).min(1).max(100),
});

export function registerSquadRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** List squads (active + completed, not archived). */
  app.get('/v1/squads', async (request) => {
    const ctx = await requireAuth(request, deps);
    const squads = await listSquads(db, ctx.orgId);
    return { data: squads };
  });

  /** Create a squad with selected AI employees. */
  app.post('/v1/squads', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    try {
      const squad = await createSquad(db, ctx.orgId, ctx.userId, parsed.data);
      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'squad.created',
        outcome: 'success',
        resultRef: squad.name,
      });
      reply.code(201);
      return { data: squad };
    } catch (err) {
      reply.code(400);
      return { error: { code: 'squad.create_failed', message: err instanceof Error ? err.message : 'Failed to create squad' } };
    }
  });

  /** Get one squad with its members. */
  app.get<{ Params: { id: string } }>('/v1/squads/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const squad = await getSquad(db, ctx.orgId, request.params.id);
    if (!squad) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Squad not found' } };
    }
    return { data: squad };
  });

  /** Start a squad — decompose the objective and delegate through the orchestrator. */
  app.post<{ Params: { id: string } }>('/v1/squads/:id/start', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = startBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    try {
      const result = await startSquad(db, ctx.orgId, ctx.userId, request.params.id, parsed.data.tasks);
      reply.code(201);
      return { data: result };
    } catch (err) {
      reply.code(400);
      return { error: { code: 'squad.start_failed', message: err instanceof Error ? err.message : 'Failed to start squad' } };
    }
  });

  /** Monitor a squad — per-agent task distribution + completion. */
  app.get<{ Params: { id: string } }>('/v1/squads/:id/monitor', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const monitor = await monitorSquad(db, ctx.orgId, request.params.id);
    if (!monitor) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Squad not found' } };
    }
    return { data: monitor };
  });

  /** Update squad status (active | completed | archived). */
  app.patch<{ Params: { id: string } }>('/v1/squads/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({ status: z.enum(['active', 'completed', 'archived']) }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const squad = await updateSquadStatus(db, ctx.orgId, request.params.id, parsed.data.status);
    if (!squad) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Squad not found' } };
    }
    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'squad.status_changed',
      outcome: 'success',
      resultRef: `${squad.name} → ${parsed.data.status}`,
    });
    return { data: squad };
  });
}