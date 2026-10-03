import { eq, and, sql } from 'drizzle-orm';
import { subscriptions, organizations, webhookEvents, type Db } from '@orq8/db';
import { appendAudit } from './audit.js';
import { addPurchasedCredits } from './credits.js';
import type { AppConfig } from '@orq8/core';

// ─── Credit Packs (docs/77 §18) ─────────────────────────────────────────────
//
// Priced backwards from the plan economics: the Founder plan sells $39 for
// 1,000 credits (~3.9¢/credit) and the Company plan $249 for 12,000 (~2.1¢).
// Packs sit at 3.8¢ / 3.45¢ / 2.99¢ per credit, so a top-up never undercuts a
// subscription and volume buyers get the discount. The server owns both
// numbers: the client names a pack key and nothing else.
export interface CreditPack {
  key: string;
  name: string;
  credits: number;
  priceCents: number;
  /** Optional env key holding a Stripe Price id (preferred when configured). */
  priceEnvKey: 'STRIPE_PRICE_CREDITS_STARTER' | 'STRIPE_PRICE_CREDITS_GROWTH' | 'STRIPE_PRICE_CREDITS_SCALE';
  description: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    key: 'starter',
    name: 'Starter',
    credits: 500,
    priceCents: 1_900,
    priceEnvKey: 'STRIPE_PRICE_CREDITS_STARTER',
    description: '500 Work Credits — 3.80¢ per credit',
  },
  {
    key: 'growth',
    name: 'Growth',
    credits: 2_000,
    priceCents: 6_900,
    priceEnvKey: 'STRIPE_PRICE_CREDITS_GROWTH',
    description: '2,000 Work Credits — 3.45¢ per credit',
  },
  {
    key: 'scale',
    name: 'Scale',
    credits: 10_000,
    priceCents: 29_900,
    priceEnvKey: 'STRIPE_PRICE_CREDITS_SCALE',
    description: '10,000 Work Credits — 2.99¢ per credit',
  },
];

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
  // Structured resource caps (the single entitlement source — docs + routes +
  // the entitlements service all read from here). 0 = unlimited.
  departments: number;
  teams: number;
  connectors: number;
  mcpServers: number;
  // Highest autonomy level a plan may grant an agent
  // (observe | recommend | draft | execute_with_approval | autonomous).
  autonomy: string;
  features: string[];
}

export const PLANS: Record<string, PlanConfig> = {
  founder: {
    name: 'Founder',
    monthlyPrice: 3900, // $39/mo
    annualPrice: 3200, // $32/mo (billed annually)
    credits: 1_000,
    maxAgents: 10,
    departments: 4,
    teams: 10,
    connectors: 3,
    mcpServers: 1,
    autonomy: 'execute_with_approval',
    features: ['10 AI employees', '1,000 Work Credits', 'Executive Agent', 'Company Memory', 'Basic approvals'],
  },
  team: {
    name: 'Team',
    monthlyPrice: 9900, // $99/mo
    annualPrice: 7900, // $79/mo (billed annually)
    credits: 4_000,
    maxAgents: 25,
    departments: 10,
    teams: 24,
    connectors: 6,
    mcpServers: 6,
    autonomy: 'autonomous',
    features: ['25 AI employees', '4,000 Work Credits', 'Advanced approvals', 'API access', 'Priority support'],
  },
  company: {
    name: 'Company',
    monthlyPrice: 24900, // $249/mo
    annualPrice: 19900, // $199/mo (billed annually)
    credits: 12_000,
    maxAgents: 50,
    departments: 20,
    teams: 48,
    connectors: 10,
    mcpServers: 12,
    autonomy: 'autonomous',
    features: ['50 AI employees', '12,000 Work Credits', 'Advanced controls', 'Custom AI employees', 'Priority execution'],
  },
};

/** Default caps when an org has no subscription row (trial). */
export const TRIAL_CAPS = {
  maxAgents: 3,
  departments: 2,
  teams: 4,
  connectors: 1,
  mcpServers: 0,
  autonomy: 'execute_with_approval',
} as const;

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
  /** Stripe's event id — the idempotency key for replay safety (docs/77 §A2). */
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
  };
}

// ─── Credit Pack Checkout ───────────────────────────────────────────────────

/**
 * Start a Stripe Checkout for a credit pack (docs/77 §16). The server owns the
 * price and the credit quantity — the client only names the pack.
 */
export async function createCreditPackCheckout(
  config: AppConfig,
  db: Db,
  orgId: string,
  pack: CreditPack,
): Promise<CheckoutResult> {
  const stripe = getStripe(config);
  if (!stripe) {
    throw new Error('Billing is not configured. Set STRIPE_SECRET_KEY.');
  }

  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org) throw new Error('Organization not found');

  const customerId = await getOrCreateStripeCustomer(stripe, db, orgId, org.name);
  const priceId = config[pack.priceEnvKey] as string | undefined;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: priceId
      ? [{ price: priceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `ORQ8 ${pack.name} Credits`,
              description: pack.description,
            },
            unit_amount: pack.priceCents,
          },
          quantity: 1,
        }],
    // The webhook reads orgId + credits from metadata; nothing in the session is
    // trusted from the client.
    metadata: {
      orgId,
      kind: 'credits',
      pack: pack.key,
      credits: String(pack.credits),
    },
    success_url: `${config.APP_URL ?? 'http://localhost:3000'}/app?credits=purchased`,
    cancel_url: `${config.APP_URL ?? 'http://localhost:3000'}/app?credits=cancelled`,
  });

  return { sessionId: session.id, url: session.url! };
}

/**
 * Resolve (or create) the Stripe customer for an org. Extracted so subscription
 * checkout and credit-pack checkout cannot drift apart.
 */
async function getOrCreateStripeCustomer(
  stripe: any,
  db: Db,
  orgId: string,
  orgName: string,
): Promise<string> {
  const [existingSub] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, orgId), eq(subscriptions.status, 'active')))
    .limit(1);

  // Legacy mapping: subscription ids were used to smuggle the customer id.
  const known = existingSub?.stripeSubscriptionId ?? null;
  if (known) {
    try {
      const sub = await stripe.subscriptions.retrieve(known);
      if (typeof sub?.customer === 'string') return sub.customer;
    } catch {
      // Fall through to the metadata lookup below.
    }
  }

  const search = await stripe.customers
    .search({ query: `metadata['orgId']:'${orgId}'`, limit: 1 })
    .catch(() => null);
  if (search?.data?.[0]?.id) return search.data[0].id;

  const customer = await stripe.customers.create({ name: orgName, metadata: { orgId } });
  return customer.id;
}

// ─── Webhook Processing ─────────────────────────────────────────────────────

/**
 * Process a Stripe webhook event exactly once (docs/77 §A2, hardened in
 * docs/80 Phase 0 / H1).
 *
 * Idempotency is enforced by the `webhook_events` unique index on
 * (org, provider, external_event_id). The row is the **claim**, not the
 * receipt:
 *
 *   1. the first delivery inserts the row as `pending`;
 *   2. `applyWebhook` runs the side effects;
 *   3. only after it succeeds does the row become `processed`.
 *
 * A delivery that fails mid-apply leaves the row `failed` (or `pending` if the
 * process died), and the next Stripe retry of the same event re-applies it
 * instead of being answered "duplicate" — the old order marked the row
 * processed before applying, so one transient failure meant the credits were
 * never granted and no retry could fix it. Re-applying is safe because every
 * side effect is idempotent: credit grants carry the event/session idempotency
 * key, and `activateSubscription` refuses to create a second subscription for
 * the same Stripe id.
 */
export async function processWebhookEvent(
  config: AppConfig,
  db: Db,
  event: WebhookEvent,
): Promise<{ handled: boolean; duplicate: boolean; reason?: string }> {
  const orgId = await resolveWebhookOrg(db, event);
  if (!orgId) return { handled: false, duplicate: false, reason: 'unknown_org' };

  const inserted = await db
    .insert(webhookEvents)
    .values({
      orgId,
      provider: 'stripe',
      eventType: event.type,
      externalEventId: event.id,
      title: `Stripe ${event.type}`,
      payload: { id: event.id, type: event.type },
      status: 'pending',
    })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  let eventRowId = inserted[0]?.id;
  if (!eventRowId) {
    const [existing] = await db
      .select({ id: webhookEvents.id, status: webhookEvents.status })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.orgId, orgId),
          eq(webhookEvents.provider, 'stripe'),
          eq(webhookEvents.externalEventId, event.id),
        ),
      )
      .limit(1);

    if (!existing) {
      // The row vanished between the insert conflict and this read — a
      // concurrent delivery owns the event right now. Refusing is the safe
      // answer; Stripe's retry will find the settled row.
      return { handled: false, duplicate: true, reason: 'concurrent_delivery' };
    }
    if (existing.status === 'processed') return { handled: false, duplicate: true };

    // A previous delivery failed (or died) before confirming the apply. Claim it
    // again so the retry actually runs.
    eventRowId = existing.id;
    await db
      .update(webhookEvents)
      .set({
        status: 'pending',
        lastError: null,
        retryCount: sql`${webhookEvents.retryCount} + 1`,
      })
      .where(eq(webhookEvents.id, existing.id));
  }

  try {
    await applyWebhook(config, db, event);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown webhook error';
    await db
      .update(webhookEvents)
      .set({ status: 'failed', lastError: message.slice(0, 500) })
      .where(eq(webhookEvents.id, eventRowId))
      .catch(() => undefined);
    // Re-throw so the route answers 500 and Stripe redelivers.
    throw err;
  }

  await db
    .update(webhookEvents)
    .set({ status: 'processed', processedAt: new Date(), lastError: null })
    .where(eq(webhookEvents.id, eventRowId));

  return { handled: true, duplicate: false };
}

/** Find the org a Stripe event belongs to, without ever guessing. */
async function resolveWebhookOrg(db: Db, event: WebhookEvent): Promise<string | null> {
  const object = event.data?.object ?? {};
  const metadataOrg = object.metadata?.orgId;
  if (typeof metadataOrg === 'string' && metadataOrg) return metadataOrg;

  const stripeSubscriptionId =
    typeof object.subscription === 'string'
      ? object.subscription
      : typeof object.id === 'string' && event.type.startsWith('customer.subscription.')
        ? object.id
        : null;
  if (!stripeSubscriptionId) return null;

  const [sub] = await db
    .select({ orgId: subscriptions.orgId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return sub?.orgId ?? null;
}

/**
 * Apply a Stripe webhook event. Exported for the already-idempotency-checked
 * path; callers that need replay safety use `processWebhookEvent`.
 */
export async function handleWebhook(
  config: AppConfig,
  db: Db,
  event: WebhookEvent,
): Promise<void> {
  return applyWebhook(config, db, event);
}

async function applyWebhook(
  config: AppConfig,
  db: Db,
  event: WebhookEvent,
): Promise<void> {
  const stripe = getStripe(config);

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const { orgId, plan, billingCycle, kind, pack, credits: creditedRaw } = session.metadata ?? {};

      if (orgId && kind === 'credits') {
        // Credit pack: grant exactly what the SERVER catalog says this pack is
        // worth (never the client's or the session's number), keyed by the
        // event id so a replay adds nothing.
        const packKey = typeof pack === 'string' ? pack : '';
        const known = CREDIT_PACKS.find((p) => p.key === packKey);
        const credits = known?.credits ?? Number.parseInt(String(creditedRaw ?? '0'), 10);
        if (credits > 0) {
          const result = await addPurchasedCredits(
            db,
            orgId,
            credits,
            `Credit pack purchase: ${known?.name ?? packKey}`,
            {
              idempotencyKey: `stripe:${event.id}`,
              type: 'purchase',
              metadata: { stripeEventId: event.id, pack: packKey, sessionId: session.id },
            },
          );
          await appendAudit(db, {
            orgId,
            actorType: 'system',
            action: 'billing.credits.purchased',
            outcome: result.applied ? 'success' : 'failure',
            cost: credits,
            resultRef: `stripe:${event.id} pack:${packKey}`,
          });
        }
      } else if (orgId && plan) {
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

  // Idempotent replay (docs/80 Phase 0 / H1): a re-delivered checkout event
  // must not cancel the live subscription and create a second row for the same
  // Stripe subscription id. If this Stripe subscription is already active for
  // this org and plan, the event has already been applied.
  if (stripeSubscriptionId) {
    const [already] = await db
      .select({ id: subscriptions.id, plan: subscriptions.plan })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId),
          eq(subscriptions.status, 'active'),
        ),
      )
      .limit(1);
    if (already && already.plan === plan) return;
  }

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
