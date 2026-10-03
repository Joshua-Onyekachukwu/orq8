import { eq, and, sql } from 'drizzle-orm';
import { creditTransactions } from '@orq8/db';
import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import * as credits from '../services/credits.js';
import * as billing from '../services/billing.js';
import { estimateCredits } from '../services/credit-estimator.js';
import * as creditAlerts from '../services/credit-alerts.js';
import { enforceOrgLimit, sendRateLimited } from '../plugins/rate-limits.js';
import type { AppDeps } from '../types.js';

export function registerCreditRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  /**
   * docs/77 §A1 — self-serve manual consumption is a development affordance.
   * In production it is invisible (404, not 403 — an attacker should not learn
   * that an admin-only endpoint exists) unless the caller is a platform admin.
   * It can only ever debit the caller's own org, so this closes API surface
   * rather than a privilege escalation.
   */
  const devOnlyOrPlatformAdmin = (ctx: { platformRole: string }): boolean =>
    config.NODE_ENV !== 'production' || ctx.platformRole === 'admin';

  /** Spending the company's money (buying credits) needs an owner or admin. */
  const canSpendOrgMoney = (ctx: { role: string }): boolean =>
    ctx.role === 'owner' || ctx.role === 'admin';

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

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(creditTransactions)
      .where(eq(creditTransactions.orgId, ctx.orgId));
    const history = await credits.getTransactionHistory(db, ctx.orgId, limit, offset);
    return { data: history, meta: { limit, offset, total: totalRow?.count ?? 0 } };
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
   * POST /v1/credits/estimate — the credits a piece of work should reserve.
   *
   * docs/80 Phase 1: a pre-run estimate shown to the user before running, so the
   * execute surfaces can display "this will reserve ~N credits" and route to
   * approval when the estimate exceeds the per-task ceiling. The number is a
   * reservation, not a quote — settlement charges the measured actual, capped at
   * this estimate.
   */
  app.post('/v1/credits/estimate', async (request) => {
    const ctx = await requireAuth(request, deps);
    const parsed = z.object({
      operation_class: z.string().min(1).max(64).optional(),
      phase: z.string().min(1).max(64).optional(),
      agent_id: z.string().uuid().optional(),
    }).safeParse(request.body ?? {});
    if (!parsed.success) throw validation(parsed.error.flatten());

    const estimate = await estimateCredits(db, config, {
      orgId: ctx.orgId,
      operationClass: parsed.data.operation_class,
      phase: parsed.data.phase,
      agentId: parsed.data.agent_id,
    });
    return { data: estimate };
  });

  /**
   * POST /v1/credits/consume — manually consume credits (dev/test + platform
   * admin only; see docs/77 §A1). Production consumption happens through task
   * execution, tool calls and EA commands.
   */
  app.post('/v1/credits/consume', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    if (!devOnlyOrPlatformAdmin(ctx)) {
      reply.code(404);
      return { error: { code: 'not_found', message: 'Route not found' } };
    }
    const parsed = z.object({
      operation_type: z.string().min(1),
      description: z.string().min(1).max(500),
      reference_id: z.string().uuid().optional(),
      reference_type: z.string().optional(),
      // Optional replay guard: a second call with the same key is a no-op
      // (`duplicate: true`, `consumed: 0`) instead of a second charge.
      idempotency_key: z.string().min(1).max(200).optional(),
      amount: z.number().int().min(0).max(100_000).optional(),
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
        {
          amount: parsed.data.amount,
          idempotencyKey: parsed.data.idempotency_key,
        },
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
   * GET /v1/credits/packs — the server's credit catalog.
   *
   * The client never sends a price or a credit quantity: it names a pack and the
   * server owns both numbers (docs/77 §16).
   */
  app.get('/v1/credits/packs', async () => {
    return { data: billing.CREDIT_PACKS };
  });

  /**
   * POST /v1/credits/purchase — start a Stripe Checkout for a credit pack.
   *
   * Credits are granted only by the verified, idempotent webhook — never by this
   * response and never from client input. This replaces the removed top-up
   * endpoint (docs/77 §A1).
   */
  app.post('/v1/credits/purchase', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    // docs/80 Phase 0 (H3): a viewer/member must not be able to spend the
    // company's money. Membership roles are owner | admin | member | viewer.
    if (!canSpendOrgMoney(ctx)) {
      reply.code(403);
      return {
        error: {
          code: 'forbidden',
          message: 'Only an organization owner or admin can purchase credits.',
        },
      };
    }
    // Per-org purchase ceiling (docs/80 §3.3): many members of one company
    // cannot open an unbounded number of checkout sessions.
    const orgVerdict = await enforceOrgLimit(deps, ctx.orgId, 'purchase');
    if (!orgVerdict.allowed) return sendRateLimited(reply, orgVerdict, 'purchase');
    const parsed = z.object({ pack: z.string().min(1).max(64) }).safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    const pack = billing.CREDIT_PACKS.find((p) => p.key === parsed.data.pack);
    if (!pack) {
      reply.code(400);
      return { error: { code: 'validation_error', message: 'Unknown credit pack' } };
    }

    try {
      const result = await billing.createCreditPackCheckout(config, db, ctx.orgId, pack);
      logger.info({ orgId: ctx.orgId, pack: pack.key }, 'credit pack checkout created');
      return { data: result };
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId, pack: pack.key }, 'credit pack checkout failed');
      reply.code(503);
      return {
        error: {
          code: 'billing_unavailable',
          message: err instanceof Error ? err.message : 'Billing is not configured',
        },
      };
    }
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
