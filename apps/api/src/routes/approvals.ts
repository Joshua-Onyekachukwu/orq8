import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as approvals from '../services/approvals.js';
import type { AppDeps } from '../types.js';

const decideBody = z.object({
  status: z.enum(['approved', 'rejected', 'modified']),
  note: z.string().trim().max(500).optional(),
});

const createApprovalBody = z.object({
  action: z.string().trim().min(1).max(500),
  description: z.string().trim().max(2000).optional(),
  cost: z.number().int().min(0).default(0),
  risk_level: z.enum(['low', 'medium', 'high']).default('low'),
  agent_id: z.string().uuid().optional(),
});

export function registerApprovalRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db } = deps;

  /** Create a new approval request (from command bar or agents). */
  app.post('/v1/approvals', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = createApprovalBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const approval = await approvals.createApproval(db, {
      orgId: ctx.orgId,
      agentId: parsed.data.agent_id ?? null,
      action: parsed.data.action,
      description: parsed.data.description ?? null,
      cost: parsed.data.cost,
      riskLevel: parsed.data.risk_level,
      status: 'pending',
    });

    await appendAudit(db, {
      orgId: ctx.orgId,
      actorType: 'agent',
      actorId: parsed.data.agent_id ?? ctx.userId,
      action: 'approval.created',
      outcome: 'success',
    });

    reply.code(201);
    return { data: approval };
  });

  /** List approvals for the current org, optionally filtered by status. */
  app.get('/v1/approvals', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    const list = await approvals.findByOrg(db, ctx.orgId, status);
    return { data: list };
  });

  /** Get a single approval. */
  app.get<{ Params: { id: string } }>('/v1/approvals/:id', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const approval = await approvals.findById(db, ctx.orgId, request.params.id);
    if (!approval) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Approval not found' } };
    }
    return { data: approval };
  });

  /** Decide on an approval (approve/reject/modify). */
  app.patch<{ Params: { id: string }; Body: { status: string; note?: string } }>(
    '/v1/approvals/:id',
    async (request, reply) => {
      const ctx = await requireAuth(request, deps);
      const parsed = decideBody.safeParse(request.body);
      if (!parsed.success) throw validation(parsed.error.flatten());

      const decided = await approvals.decide(
        db,
        ctx.orgId,
        request.params.id,
        parsed.data.status,
        parsed.data.note,
      );

      if (!decided) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'Approval not found or already decided' } };
      }

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: `approval.${parsed.data.status}`,
        outcome: 'success',
      });

      return { data: decided };
    },
  );
}
