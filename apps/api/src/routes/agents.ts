import { eq, and, sql } from 'drizzle-orm';
import { agents as agentsTable } from '@orq8/db';
import { z } from 'zod';
import { validation, forbidden } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as agents from '../services/agents.js';
import { getPlanLimits } from '../services/billing.js';
import type { AppDeps } from '../types.js';

const hireBody = z.object({
  name: z.string().trim().min(1).max(100),
  role: z.string().trim().min(1).max(100),
  department: z.string().trim().max(100).optional(),
});

export function registerAgentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, logger } = deps;

  /** List all agents for the current org. */
  app.get('/v1/agents', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentsTable)
      .where(eq(agentsTable.orgId, ctx.orgId));
    const list = await agents.findByOrg(db, ctx.orgId, { limit, offset });
    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
  });

  /** Get a single agent. */
  app.get<{ Params: { id: string } }>('/v1/agents/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const agent = await agents.findById(db, ctx.orgId, request.params.id);
    if (!agent) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Agent not found' } };
    }
    return { data: agent };
  });

  /** Hire a new agent. */
  app.post('/v1/agents', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = hireBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    // Plan enforcement: check agent limit
    const currentAgents = await agents.findByOrg(db, ctx.orgId, { limit: 1000 });
    const planLimits = await getPlanLimits(db, ctx.orgId);
    if (planLimits.maxAgents > 0 && currentAgents.length >= planLimits.maxAgents) {
      throw forbidden(`Your plan allows ${planLimits.maxAgents} agents. Upgrade to hire more.`);
    }

    const agent = await agents.createAgent(db, {
      orgId: ctx.orgId,
      name: parsed.data.name,
      role: parsed.data.role,
      department: parsed.data.department ?? null,
      status: 'active',
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'user',
      actorId: ctx.userId,
      action: 'agent.hired',
      outcome: 'success',
    });

    reply.code(201);
    return { data: agent };
  });

  /** Pause or resume an agent. */
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/v1/agents/:id',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      const { status } = request.body;
      if (!['active', 'paused', 'archived'].includes(status)) {
        throw validation({ status: ['Invalid status'] });
      }

      const updated = await agents.updateStatus(db, ctx.orgId, request.params.id, status);
      if (!updated) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Agent not found' } };
      }

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: `agent.${status === 'paused' ? 'paused' : 'resumed'}`,
        outcome: 'success',
      });

      return { data: updated };
    },
  );
}
