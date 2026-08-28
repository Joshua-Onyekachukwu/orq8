import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as credits from '../services/credits.js';
import * as creditAlerts from '../services/credit-alerts.js';
import type { AppDeps } from '../types.js';

export function registerCreditRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, logger } = deps;

  /**
   * GET /v1/credits/balance — Get current credit balance for the org.
   */
  app.get('/v1/credits/balance', async (request) => {
    const ctx = await requireAuth(request, deps);
    const balance = await credits.getOrCreateBalance(db, ctx.orgId);
    return { data: balance };
  });

  /**
   * GET /v1/credits/history — Get credit transaction history.
   */
  app.get('/v1/credits/history', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    const history = await credits.getTransactionHistory(db, ctx.orgId, limit, offset);
    return { data: history, meta: { limit, offset } };
  });

  /**
   * GET /v1/credits/usage — Get usage summary for the current period.
   */
  app.get('/v1/credits/usage', async (request) => {
    const ctx = await requireAuth(request, deps);
    const summary = await credits.getUsageSummary(db, ctx.orgId);
    return { data: summary };
  });

  /**
   * POST /v1/credits/check — Check if enough credits for an operation.
   */
  app.post('/v1/credits/check', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      operation_type: z.string().default('default'),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const result = await credits.hasEnoughCredits(
      db,
      ctx.orgId,
      parsed.data.operation_type,
    );
    return { data: result };
  });

  /**
   * POST /v1/credits/consume — Manually consume credits (for testing/admin).
   * In production, credit consumption happens automatically through task execution.
   */
  app.post('/v1/credits/consume', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      operation_type: z.string().min(1),
      description: z.string().min(1).max(500),
      reference_id: z.string().uuid().optional(),
      reference_type: z.string().optional(),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    try {
      const result = await credits.consumeCredits(
        db,
        ctx.orgId,
        parsed.data.operation_type,
        parsed.data.description,
        parsed.data.reference_id,
        parsed.data.reference_type,
      );
      return { data: result };
    } catch (error) {
      if (error instanceof credits.CreditExhaustedError) {
        return {
          data: {
            allowed: false,
            balance: error.remaining,
            required: error.required,
            message: error.message,
          },
        };
      }
      throw error;
    }
  });

  /**
   * POST /v1/credits/top-up — Add purchased credits.
   */
  app.post('/v1/credits/top-up', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      amount: z.number().int().positive().max(100_000),
      description: z.string().max(500).optional(),
    }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const balance = await credits.addPurchasedCredits(
      db,
      ctx.orgId,
      parsed.data.amount,
      parsed.data.description ?? `Top-up: ${parsed.data.amount} credits`,
    );

    logger.info({ orgId: ctx.orgId, amount: parsed.data.amount }, 'Credits top-up');

    return { data: balance };
  });

  // ── CREDIT ALERTS ──

  /**
   * GET /v1/credits/alerts — Get credit usage alerts for the org.
   */
  app.get('/v1/credits/alerts', async (request) => {
    const ctx = await requireAuth(request, deps);
    const url = new URL(request.url, 'http://localhost');
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    const alerts = await creditAlerts.getAlerts(db, ctx.orgId, limit, unreadOnly);
    return { data: alerts };
  });

  /**
   * GET /v1/credits/alerts/unread — Get unread alert count.
   */
  app.get('/v1/credits/alerts/unread', async (request) => {
    const ctx = await requireAuth(request, deps);
    const count = await creditAlerts.getUnreadCount(db, ctx.orgId);
    return { data: { count } };
  });

  /**
   * PATCH /v1/credits/alerts/:id/read — Mark an alert as read.
   */
  app.patch<{ Params: { id: string } }>('/v1/credits/alerts/:id/read', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const updated = await creditAlerts.markAsRead(db, request.params.id, ctx.orgId);
    if (!updated) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Alert not found' } };
    }
    return { data: { success: true } };
  });

  /**
   * POST /v1/credits/alerts/read-all — Mark all alerts as read.
   */
  app.post('/v1/credits/alerts/read-all', async (request) => {
    const ctx = await requireAuth(request, deps);
    const count = await creditAlerts.markAllAsRead(db, ctx.orgId);
    return { data: { marked: count } };
  });
}
