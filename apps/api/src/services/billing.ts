import { eq, and } from 'drizzle-orm';
import { subscriptions, organizations, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import type { AppConfig } from '@orq8/core';

/**
 * Stripe Billing Service
 *
 * Handles:
 * - Checkout session creation (new subscriptions)
 * - Customer portal (manage existing subscription)
 * - Webhook processing (subscription lifecycle events)
 * - Plan upgrades/downgrades
 * - Subscription status tracking
 *
 * Design: docs/42 Infrastructure, Stripe integration
 *
 * Flow:
 *   1. User clicks "Upgrade" → POST /v1/billing/checkout
 *   2. Backend creates Stripe Checkout Session → returns URL
 *   3. User completes payment on Stripe
 *   4. Stripe sends webhook → POST /v1/billing/webhook
 *   5. Backend updates subscription + credit balance in DB
 *   6. User redirected to dashboard
 */

// ─── Plan Configuration ─────────────────────────────────────────────────────

export interface PlanConfig {
  name: string;
  monthlyPrice: number; // cents
  annualPrice: number; // cents
  credits: number;
  maxAgents: number;
  features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  founder: {
    name: 'Founder',
    monthlyPrice: 3900, // $39/mo
    annualPrice: 3200, // $32/mo (billed annually)
    credits: 1_000,
    maxAgents: 10,
    features: ['3 AI employees', '1,000 Work Credits', 'Executive Agent', 'Company Memory', 'Basic approvals'],
  },
  team: {
    name: 'Team',
    monthlyPrice: 9900, // $99/mo
    annualPrice: 7900, // $79/mo (billed annually)
    credits: 4_000,
    maxAgents: 25,
    features: ['10 AI employees', '4,000 Work Credits', 'Advanced approvals', 'API access', 'Priority support'],
  },
  company: {
    name: 'Company',
    monthlyPrice: 24900, // $249/mo
    annualPrice: 19900, // $199/mo (billed annually)
    credits: 12_000,
    maxAgents: 50,
    features: ['25 AI employees', '12,000 Work Credits', 'Advanced controls', 'Custom AI employees', 'Priority execution'],
  },
};

// ─── Plan Limits ─────────────────────────────────────────────────────────

/** Get the plan limits for an organization based on its subscription. */
export async function getPlanLimits(
  db: Db,
  orgId: string,
): Promise<{ maxAgents: number; credits: number; plan: string }> {
  try {
    const { subscriptions: subs } = await import('@orq8/db');
    const { eq } = await import('drizzle-orm');
    const result = await db
      .select({ plan: subs.plan, maxAgents: subs.maxAgents, includedCredits: subs.includedCredits })
      .from(subs)
      .where(eq(subs.orgId, orgId))
      .limit(1);

    if (result.length === 0) {
      // No subscription — use trial/free plan limits
      return { maxAgents: 3, credits: 100, plan: 'trial' };
    }

    const sub = result[0]!; // Safe: checked result.length above
    const planConfig = PLANS[sub.plan];
    return {
      maxAgents: sub.maxAgents ?? planConfig?.maxAgents ?? 3,
      credits: sub.includedCredits ?? planConfig?.credits ?? 100,
      plan: sub.plan,
    };
  } catch {
    return { maxAgents: 3, credits: 100, plan: 'trial' };
  }
}

// ─── Stripe Client ──────────────────────────────────────────────────────────

let stripeClient: any = null;

function getStripe(config: AppConfig): any {
  if (stripeClient) return stripeClient;
  if (!config.STRIPE_SECRET_KEY) return null;

  try {
    // Dynamic import to avoid hard dependency when Stripe is not configured
    const Stripe = require('stripe').default ?? require('stripe');
    stripeClient = new Stripe(config.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
    });
    return stripeClient;
  } catch {
    return null;
  }
}

// ─── Checkout Session ───────────────────────────────────────────────────────

export interface CheckoutResult {
  sessionId: string;
  url: string;
}

/**
 * Create a Stripe Checkout Session for a new or upgraded subscription.
 */
export async function createCheckoutSession(
  config: AppConfig,
  db: Db,
  orgId: string,
  plan: string,
  billingCycle: 'monthly' | 'annual' = 'monthly',
): Promise<CheckoutResult> {
  const stripe = getStripe(config);
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
  }

  const planConfig = PLANS[plan];
  if (!planConfig) {
    throw new Error(`Unknown plan: ${plan}`);
  }

  // Get or create Stripe customer
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) throw new Error('Organization not found');

  // Get or create Stripe customer ID from subscription
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, 'active')))
    .limit(1);

  let customerId = existingSub?.stripeSubscriptionId?.replace('sub_', 'cus_') ?? null;

  if (!customerId) {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
      name: org.name,
      metadata: { orgId },
    });
    customerId = customer.id;
  }

  // Get the price ID for this plan
  const priceId = billingCycle === 'annual'
    ? config[`STRIPE_PRICE_${plan.toUpperCase()}_ANNUAL` as keyof AppConfig]
    : config[`STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY` as keyof AppConfig];

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `ORQ8 ${planConfig.name} Plan`,
              description: `${planConfig.name} plan — ${planConfig.credits.toLocaleString()} Work Credits/mo`,
            },
            unit_amount: billingCycle === 'annual' ? planConfig.annualPrice : planConfig.monthlyPrice,
            recurring: { interval: billingCycle === 'annual' ? 'year' : 'month' },
          },
          quantity: 1,
        }],
    metadata: { orgId, plan, billingCycle },
    success_url: `${config.APP_URL ?? 'http://localhost:3000'}/app?upgraded=true`,
    cancel_url: `${config.APP_URL ?? 'http://localhost:3000'}/app?cancelled=true`,
    allow_promotion_codes: true,
  });

  return { sessionId: session.id, url: session.url! };
}

// ─── Customer Portal ────────────────────────────────────────────────────────

/**
 * Create a Stripe Customer Portal session for managing subscription.
 */
export async function createPortalSession(
  config: AppConfig,
  db: Db,
  orgId: string,
): Promise<{ url: string }> {
  const stripe = getStripe(config);
  if (!stripe) {
    throw new Error('Stripe is not configured.');
  }

  // Find the Stripe customer ID from existing subscription
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, 'active')))
    .limit(1);

  if (!sub?.stripeSubscriptionId) {
    throw new Error('No active subscription found. Please subscribe first.');
  }

  // Retrieve the subscription to get the customer ID
  const subscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const customerId = subscription.customer;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${config.APP_URL ?? 'http://localhost:3000'}/app`,
  });

  return { url: session.url };
}

// ─── Webhook Processing ─────────────────────────────────────────────────────

export interface WebhookEvent {
  type: string;
  data: {
    object: Record<string, any>;
  };
}

/**
 * Process a Stripe webhook event.
 * Updates subscription status, credits, and organization plan in the database.
 */
export async function handleWebhook(
  config: AppConfig,
  db: Db,
  event: WebhookEvent,
): Promise<void> {
  const stripe = getStripe(config);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { orgId, plan, billingCycle } = session.metadata ?? {};

      if (orgId && plan) {
        await activateSubscription(db, orgId, plan, billingCycle ?? 'monthly', session.subscription);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      await updateSubscriptionStatus(db, subscription.id, subscription.status);
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await cancelSubscription(db, subscription.id);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      await handlePaymentFailure(db, invoice.subscription);
      break;
    }

    default:
      // Unhandled event type — ignore
      break;
  }
}

/**
 * Activate a subscription after successful checkout.
 */
async function activateSubscription(
  db: Db,
  orgId: string,
  plan: string,
  billingCycle: string,
  stripeSubscriptionId: string,
): Promise<void> {
  const planConfig = PLANS[plan];
  if (!planConfig) return;

  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Update organization plan
  await db
    .update(organizations)
    .set({ plan, status: 'active' })
    .where(eq(organizations.id, orgId));

  // Deactivate existing subscriptions
  await db
    .update(subscriptions)
    .set({ status: 'cancelled', updatedAt: now })
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, 'active')));

  // Create new subscription
  await db.insert(subscriptions).values({
    orgId,
    plan,
    billingCycle,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    includedCredits: planConfig.credits,
    maxAgents: planConfig.maxAgents,
    stripeSubscriptionId,
  });

  await appendAudit(db, {
    orgId,
    actorType: 'system',
    action: 'billing.subscription.activated',
    outcome: 'success',
    cost: planConfig.monthlyPrice,
  });
}

/**
 * Update subscription status from webhook.
 */
async function updateSubscriptionStatus(
  db: Db,
  stripeSubscriptionId: string,
  status: string,
): Promise<void> {
  const mappedStatus = status === 'active' ? 'active'
    : status === 'past_due' ? 'past_due'
    : status === 'canceled' ? 'cancelled'
    : status === 'unpaid' ? 'past_due'
    : 'active';

  await db
    .update(subscriptions)
    .set({ status: mappedStatus, updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

/**
 * Cancel subscription from webhook.
 */
async function cancelSubscription(
  db: Db,
  stripeSubscriptionId: string,
): Promise<void> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  if (!sub) return;

  await db
    .update(subscriptions)
    .set({ status: 'cancelled', cancelAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.id, sub.id));

  // Downgrade org to trial
  await db
    .update(organizations)
    .set({ plan: 'trial' })
    .where(eq(organizations.id, sub.orgId));

  await appendAudit(db, {
    orgId: sub.orgId,
    actorType: 'system',
    action: 'billing.subscription.cancelled',
    outcome: 'success',
  });
}

/**
 * Handle payment failure.
 */
async function handlePaymentFailure(
  db: Db,
  stripeSubscriptionId: string | null,
): Promise<void> {
  if (!stripeSubscriptionId) return;

  await db
    .update(subscriptions)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Verify Stripe webhook signature.
 */
export function verifyWebhookSignature(
  config: AppConfig,
  payload: string | Buffer,
  signature: string,
): WebhookEvent | null {
  const stripe = getStripe(config);
  if (!stripe || !config.STRIPE_WEBHOOK_SECRET) return null;

  try {
    return stripe.webhooks.constructEvent(payload, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
}

/**
 * Get subscription info for an org.
 */
export async function getSubscription(
  db: Db,
  orgId: string,
) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, 'active')))
    .limit(1);

  if (!sub) return null;

  const planConfig = PLANS[sub.plan];
  return {
    id: sub.id,
    plan: sub.plan,
    planName: planConfig?.name ?? sub.plan,
    billingCycle: sub.billingCycle,
    status: sub.status,
    credits: planConfig?.credits ?? 0,
    maxAgents: planConfig?.maxAgents ?? 0,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    features: planConfig?.features ?? [],
  };
}
