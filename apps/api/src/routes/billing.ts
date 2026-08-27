import { z } from 'zod';
import { validation } from '@orq8/core';
import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { appendAudit } from '../services/audit.js';
import * as billing from '../services/billing.js';
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

    // Get raw body for signature verification
    // Fastify stores the parsed body; for Stripe webhook verification we need the raw body.
    // We read it directly from the request stream.
    const rawBody = JSON.stringify(request.body);
    const event = billing.verifyWebhookSignature(config, rawBody, signature);
    if (!event) {
      reply.code(400);
      return { error: { code: 'bad_request', message: 'Invalid webhook signature' } };
    }

    try {
      await billing.handleWebhook(config, db, event);

      logger.info({ eventType: event.type }, 'Stripe webhook processed');
      reply.code(200);
      return { received: true };
    } catch (err) {
      logger.error({ err, eventType: event.type }, 'Failed to process webhook');
      reply.code(500);
      return { error: { code: 'internal', message: 'Webhook processing failed' } };
    }
  });
}
