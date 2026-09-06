import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { planEngineeringRequest, recentPlans } from '../services/engineering-manager.js';
import type { AppDeps } from '../types.js';

const planBody = z.object({
  objective: z.string().trim().min(8).max(1000),
  description: z.string().max(4000).optional(),
  constraints: z.string().max(1000).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  requestId: z.string().max(200).optional(),
});

export function registerEngineeringManagerRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Plan an engineering request: capability search → team assembly → tasks. */
  app.post('/v1/engineering-manager/plan', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = planBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const plan = await planEngineeringRequest(db, ctx.orgId, ctx.userId, parsed.data);
    reply.code(plan.alreadyPlanned ? 200 : 201);
    return { data: plan };
  });

  /** Recent engineering plans — founder visibility into manager activity. */
  app.get('/v1/engineering-manager/plans', async (request) => {
    const ctx = await requireAuth(request, deps);
    const q = request.query as { limit?: string };
    const plans = await recentPlans(db, ctx.orgId, Math.min(Number(q.limit) || 10, 50));
    return { data: plans };
  });
}