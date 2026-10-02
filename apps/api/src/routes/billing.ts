import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { validation } from '@orq8/core';
import { agents } from '@orq8/db';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as billing from '../services/billing.js';
import * as credits from '../services/credits.js';
import type { AppDeps } from '../types.js';

const checkoutBody = z.object({
  plan: z.enum(['founder', 'team', 'company']),
  billing_cycle: z.enum(['monthly', 'annual']).default('monthly'),
});

export function registerBillingRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { db, config, logger } = deps;

  /** Get current subscription info. */
  app.get('/v1/billing/subscription', async (request) => {
    const ctx = await requireAuth(request, deps);
    const subscription = await billing.getSubscription(db, ctx.orgId);
    return { data: subscription };
  });

  /** List available plans. */
  app.get('/v1/billing/plans', async () => {
    return { data: billing.PLANS };
  });

  /** Create a Stripe Checkout Session for a new subscription. */
  app.post('/v1/billing/checkout', async (request, reply) => {
    const ctx = await requireAuth(request, deps);
    const parsed = checkoutBody.safeParse(request.body);
    if (!parsed.success) throw validation(parsed.error.flatten());

    try {
      const result = await billing.createCheckoutSession(
        config,
        db,
        ctx.orgId,
        parsed.data.plan,
        parsed.data.billing_cycle,
      );

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'billing.checkout.created',
        outcome: 'success',
      });

      return { data: result };
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId }, 'Failed to create checkout session');
      throw new Error(
        err instanceof Error ? err.message : 'Failed to create checkout session',
      );
    }
  });

  /** Create a Stripe Customer Portal session for managing subscription. */
  app.post('/v1/billing/portal', async (request) => {
    const ctx = await requireAuth(request, deps);

    try {
      const result = await billing.createPortalSession(config, db, ctx.orgId);

      await appendAudit(db, {
        orgId: ctx.orgId,
        actorType: 'user',
        actorId: ctx.userId,
        action: 'billing.portal.created',
        outcome: 'success',
      });

      return { data: result };
    } catch (err) {
      logger.error({ err, orgId: ctx.orgId }, 'Failed to create portal session');
      throw new Error(
        err instanceof Error ? err.message : 'Failed to create portal session',
      );
    }
  });

  /**
   * Stripe Webhook endpoint.
   *
   * This endpoint does NOT use requireAuth — Stripe sends its own signature.
   * We verify the webhook signature instead.
   *
   * IMPORTANT: This route must be registered BEFORE the global 404 handler.
   */
  app.post('/v1/billing/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string | undefined;

    if (!signature) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'Missing stripe-signature header' } };
    }

    // docs/77 §A2 — Stripe signs the EXACT bytes it sent. The raw body is
    // captured by the app's JSON parser (`request.rawBody`); re-serializing the
    // parsed object changes whitespace/key order and makes every signature fail,
    // which is how payments previously never activated.
    const rawBody =
      (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);
    const event = billing.verifyWebhookSignature(config, rawBody, signature);
    if (!event) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'Invalid webhook signature' } };
    }
    if (!event.id) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'Webhook event id is required' } };
    }

    try {
      // processWebhookEvent is replay-safe: the same Stripe event id is applied
      // once, so credits and plans cannot be granted twice.
      const result = await billing.processWebhookEvent(config, db, event);

      logger.info(
        { eventId: event.id, eventType: event.type, ...result },
        'Stripe webhook processed',
      );
      reply.code(200);
      return { received: true, duplicate: result.duplicate, handled: result.handled };
    } catch (err) {
      logger.error({ err, eventId: event.id, eventType: event.type }, 'Failed to process webhook');
      reply.code(500);
      return { error: { code: 'internal', message: 'Webhook processing failed' } };
    }
  });

  /**
   * GET /v1/billing/limits — Get current plan limits and usage.
   * Shows what the org is allowed vs what they're using.
   */
  app.get('/v1/billing/limits', async (request) => {
    const ctx = await requireAuth(request, deps);
    const subscription = await billing.getSubscription(db, ctx.orgId);
    const balance = await credits.getOrCreateBalance(db, ctx.orgId);

    // Count current agents
    const { agents: agentsTable } = await import('@orq8/db');
    const { eq: eqOp } = await import('drizzle-orm');
    const agentCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentsTable)
      .where(eqOp(agentsTable.orgId, ctx.orgId));

    const planConfig = subscription ? billing.PLANS[subscription.plan] : null;
    const maxAgents = planConfig?.maxAgents ?? 3;
    const currentAgents = agentCount[0]?.count ?? 0;

    return {
      data: {
        plan: subscription?.plan ?? 'trial',
        planName: subscription?.planName ?? 'Trial',
        maxAgents,
        currentAgents,
        agentLimitReached: currentAgents >= maxAgents,
        credits: {
          included: balance.included,
          purchased: balance.purchased,
          used: balance.used,
          remaining: balance.remaining,
          total: balance.total,
          utilizationPercent: balance.utilizationPercent,
          isLow: balance.isLow,
          isCritical: balance.isCritical,
        },
        period: {
          start: balance.periodStart,
          end: balance.periodEnd,
          daysRemaining: balance.daysRemaining,
        },
        upgradeAvailable: subscription?.plan !== 'company',
        nextPlan: getNextPlan(subscription?.plan ?? 'trial'),
      },
    };
  });
}

/** Get the next plan in the upgrade path. */
function getNextPlan(currentPlan: string): { name: string; key: string } | null {
  const upgradePath: Record<string, { name: string; key: string }> = {
    trial: { name: 'Founder', key: 'founder' },
    founder: { name: 'Team', key: 'team' },
    team: { name: 'Company', key: 'company' },
  };
  return upgradePath[currentPlan] ?? null;
}
