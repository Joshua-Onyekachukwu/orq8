import { and, eq, sql } from 'drizzle-orm';
import { approvals as approvalsTable } from '@orq8/db';
import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import { broadcastToOrg } from '../services/realtime.js';
import * as approvals from '../services/approvals.js';
import { createNotification } from '../routes/notifications.js';
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

    // Create in-app notification for the new approval request
    try {
      const { shouldNotify, getNotificationPrefs } = await import('../services/notification-preferences.js');
      const prefs = await getNotificationPrefs(db, ctx.orgId);
      if (shouldNotify(prefs, 'inApp', 'approval')) {
        createNotification(
          ctx.orgId,
          'approval',
          'Approval Required',
          `An AI employee requests your decision: ${parsed.data.action.slice(0, 120)}`,
        );
      }
    } catch { /* notification failure is non-fatal */ }

    reply.code(201);
    return { data: approval };
  });

  /** List approvals for the current org, optionally filtered by status. */
  app.get('/v1/approvals', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const status = url.searchParams.get('status') ?? undefined;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);
    const conditions = [eq(approvalsTable.orgId, ctx.orgId)];
    if (status) conditions.push(eq(approvalsTable.status, status));
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalsTable)
      .where(and(...conditions));
    const list = await approvals.findByOrg(db, ctx.orgId, { status, limit, offset });
    return { data: list, meta: { limit, offset, total: totalRow?.count ?? 0 } };
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

      // Broadcast approval decision
      broadcastToOrg(ctx.orgId, { type: 'approval.decided', approvalId: request.params.id, status: parsed.data.status });

      // Create in-app notification for the decision
      try {
        const { shouldNotify, getNotificationPrefs } = await import('../services/notification-preferences.js');
        const prefs = await getNotificationPrefs(db, ctx.orgId);
        if (shouldNotify(prefs, 'inApp', 'approval')) {
          const statusLabel = parsed.data.status === 'approved' ? 'Approved' : parsed.data.status === 'rejected' ? 'Rejected' : 'Modified';
          createNotification(
            ctx.orgId,
            'approval',
            `Approval ${statusLabel}`,
            `Your decision on the approval request has been recorded.${parsed.data.note ? ` Note: ${parsed.data.note.slice(0, 100)}` : ''}`,
          );
        }
      } catch { /* notification failure is non-fatal */ }

      return { data: decided };
    },
  );
}
