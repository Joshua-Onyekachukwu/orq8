/**
 * Unit economics — the arithmetic behind "are we making money on AI work?"
 * (docs/77 P1 §5, P2 §11).
 *
 * Credits and dollars are two different units and the codebase used to conflate
 * them: `/v1/admin/ai-usage` summed credits and returned them as `costCents`.
 * Revenue arrives as dollars (Stripe), spend leaves as dollars (providers), and
 * credits are the *metered unit we sell*. This module holds the one conversion
 * the reports need, so a margin number can never be assembled from mismatched
 * units at a call site.
 */

import { PLANS } from './billing.js';

/**
 * Reference revenue per Work Credit, in USD.
 *
 * Derived from the plan list prices rather than hardcoded, so a price change moves
 * the reporting with it: Founder $39 → 1,000 credits (3.90¢), Team $99 → 4,000
 * (2.48¢), Company $249 → 12,000 (2.08¢). The packs top out at 3.80¢ and go down
 * from there.
 *
 * Credits are therefore not sold at one price, and every report that uses this
 * number must say which rate it used. The Founder rate is the **highest** rate
 * anyone pays for a credit, so a margin computed with it is the most favourable
 * reading available: if a workflow is negative at 3.90¢, it is negative under
 * every plan and every pack.
 */
// Read the top plan out of the catalog rather than hardcoding the rate, so a
// price change moves this with it. `noUncheckedIndexedAccess` means the lookup is
// `PlanConfig | undefined`; if the plan key is ever renamed, the published rate is
// the documented fallback and `CREDIT_RATE_BASIS` says which one is in force.
const ratePlan = PLANS.founder ?? Object.values(PLANS)[0];

export const USD_PER_CREDIT_REFERENCE = ratePlan ? ratePlan.monthlyPrice / 100 / ratePlan.credits : 0.039;

export const CREDIT_RATE_BASIS = ratePlan
  ? `${ratePlan.name} plan list price ($${(ratePlan.monthlyPrice / 100).toFixed(0)} / ${ratePlan.credits.toLocaleString('en-US')} credits)`
  : 'Founder plan list price ($39 / 1,000 credits)';

export interface MarginReading {
  creditsUsed: number;
  usdPerCredit: number;
  /** Credits billed, converted to USD at the reference rate. */
  revenueUsd: number;
  /** Real provider spend for the same work. */
  providerCostUsd: number;
  /** revenue − cost. Negative means the work lost money. */
  marginUsd: number;
  /** Margin as a fraction of revenue; null when there is no revenue to divide by. */
  marginPct: number | null;
}

/**
 * Margin for a period. Unknown provider cost (a model the registry cannot price)
 * is *not* assumed to be zero here — it is 0 in the sum and the caller reports the
 * `unknownPricingCalls` count beside it, because a margin that silently treats
 * unknown cost as free is the failure mode this whole change exists to end.
 */
export function computeMargin(creditsUsed: number, providerCostUsd: number): MarginReading {
  const credits = Math.max(0, creditsUsed);
  const cost = Math.max(0, providerCostUsd);
  const revenueUsd = round2(credits * USD_PER_CREDIT_REFERENCE);
  const marginUsd = round2(revenueUsd - cost);
  return {
    creditsUsed: credits,
    usdPerCredit: USD_PER_CREDIT_REFERENCE,
    revenueUsd,
    providerCostUsd: round2(cost),
    marginUsd,
    marginPct: revenueUsd > 0 ? Math.round((marginUsd / revenueUsd) * 1000) / 1000 : null,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
