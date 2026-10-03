/**
 * Margin invariants (docs/80 Part 7 / §27 — the economic principle).
 *
 * The published model is one credit per 1K tokens. So for a call at a reference
 * token mix:
 *
 *   credits charged (USD)   = 1 credit × revenuePerCredit(plan)
 *   provider cost (USD)     = inputShare × inputPer1K + outputShare × outputPer1K
 *
 * The invariant is that credits charged STRICTLY EXCEED what the provider costs
 * for every model a plan is allowed to route. "Allowed" follows the plan
 * model-tier caps (docs/80 decision 5: trial ≤ tier0, founder ≤ tier1,
 * team ≤ tier2, company ≤ tier3), which is the control that keeps a premium
 * model off a low-margin plan; until Phase 4 codifies the caps in the router,
 * this test is where that policy is asserted.
 *
 * Two things it guards:
 *   1. Every supported (plan, model, mix) is margin-positive. A model added to
 *      the registry that is too expensive for its tier trips this immediately.
 *   2. Any workflow whose provider cost meets or exceeds revenue is *flagged* —
 *      `negativeMarginWorkflows()` must stay empty, and a sentinel proves the
 *      check is not vacuous (a hypothetical frontier model is detected).
 *
 * Pure unit test: no database, no provider. It prices the real registry.
 */

import { describe, expect, it } from 'vitest';
// The server's authoritative plan catalog: prices in cents, credits per month.
import { PLANS } from '../src/services/billing.js';
import { MODEL_REGISTRY, type ModelDefinition } from '../src/services/model-router.js';
import { tierOf, type ModelTier } from '../src/services/model-intelligence.js';

// ─── Reference mixes (input share, output share) ────────────────────────────
// Real work skews output-heavy, so the strictest realistic mix is included.
const MIXES: Array<{ label: string; inputShare: number; outputShare: number }> = [
  { label: '50/50', inputShare: 0.5, outputShare: 0.5 },
  { label: '20/80', inputShare: 0.2, outputShare: 0.8 },
  { label: '0/100', inputShare: 0, outputShare: 1 },
];

/** Plan model-tier caps (docs/80 decision 5). Trial has no tier cap question —
 *  it is cost-bearing, not revenue-bearing, and is handled separately. */
const PLAN_TIER_CAP: Record<string, ModelTier> = {
  founder: 1,
  team: 2,
  company: 3,
};

/** Revenue per credit in USD for a plan/monthly or plan/annual price. */
function revenuePerCreditUsd(priceCents: number, credits: number): number {
  return priceCents / 100 / credits;
}

/** Provider cost per 1K tokens (one credit's worth) in USD at a mix. */
function providerCostPerCreditUsd(model: ModelDefinition, mix: { inputShare: number; outputShare: number }): number {
  return mix.inputShare * model.costPer1kInput + mix.outputShare * model.costPer1kOutput;
}

interface Combo {
  plan: string;
  billing: 'monthly' | 'annual';
  model: string;
  tier: ModelTier;
  mix: string;
  revenuePerCreditUsd: number;
  providerCostPerCreditUsd: number;
  marginUsd: number;
}

/** Every revenue-bearing plan × allowed tier × registry model × reference mix. */
function supportedCombos(): Combo[] {
  const combos: Combo[] = [];
  for (const [planId, plan] of Object.entries(PLANS)) {
    const cap = PLAN_TIER_CAP[planId];
    if (cap === undefined) continue;
    const prices: Array<{ billing: 'monthly' | 'annual'; cents: number }> = [
      { billing: 'monthly', cents: plan.monthlyPrice },
      // `annualPrice` is already the per-month equivalent billed annually, so it
      // pairs directly with the monthly included-credit allotment.
      { billing: 'annual', cents: plan.annualPrice },
    ];
    for (const price of prices) {
      const revenue = revenuePerCreditUsd(price.cents, plan.credits);
      for (const model of MODEL_REGISTRY) {
        const tier = tierOf(model);
        if (tier > cap) continue;
        for (const mix of MIXES) {
          const cost = providerCostPerCreditUsd(model, mix);
          combos.push({
            plan: planId,
            billing: price.billing,
            model: model.id,
            tier,
            mix: mix.label,
            revenuePerCreditUsd: revenue,
            providerCostPerCreditUsd: cost,
            marginUsd: revenue - cost,
          });
        }
      }
    }
  }
  return combos;
}

/** Combos where provider cost meets or exceeds revenue — must be empty. */
function negativeMarginWorkflows(combos = supportedCombos()): Combo[] {
  return combos.filter((c) => c.marginUsd <= 0);
}

describe('Margin invariants — credits charged exceed provider cost', () => {
  it('prices at least the plans and registry models we expect', () => {
    expect(Object.keys(PLANS)).toEqual(expect.arrayContaining(['founder', 'team', 'company']));
    expect(MODEL_REGISTRY.length).toBeGreaterThan(0);
    expect(supportedCombos().length).toBeGreaterThan(0);
  });

  it('charges more than the provider costs for every supported plan × model × mix', () => {
    const violations = negativeMarginWorkflows();
    expect(
      violations.map(
        (c) =>
          `${c.plan}/${c.billing} ${c.model} (tier ${c.tier}) @ ${c.mix}: ` +
          `revenue $${c.revenuePerCreditUsd.toFixed(6)}/credit vs cost $${c.providerCostPerCreditUsd.toFixed(6)}`,
      ),
    ).toEqual([]);
  });

  it('keeps every supported combination at a healthy margin, not a hair above zero', () => {
    // A combination that only just clears costs is a latent violation: a small
    // price move or a longer output flip would sink it. On the realistic mixes
    // (50/50 and 20/80) every supported combo should clear provider cost by at
    // least 20%; the synthetic all-output mix is left to the strict >0 test
    // above, since that is the mix docs/80 Part 7 warns can go negative.
    const thin = supportedCombos().filter(
      (c) => c.mix !== '0/100' && c.marginUsd / c.revenuePerCreditUsd < 0.2,
    );
    expect(
      thin.map((c) => `${c.plan}/${c.billing} ${c.model} @ ${c.mix} margin ${(c.marginUsd / c.revenuePerCreditUsd * 100).toFixed(1)}%`),
    ).toEqual([]);
  });

  it('flags a frontier model as negative margin (the check is not vacuous)', () => {
    const frontier: ModelDefinition = {
      ...MODEL_REGISTRY[0]!,
      id: 'sentinel/frontier-15-75',
      provider: 'openrouter',
      capabilities: ['reasoning', 'coding'],
      costPer1kInput: 0.015,
      costPer1kOutput: 0.075,
      speedRating: 'slow',
    };
    // On the Company-annual floor, an all-output mix of a $15/$75 model costs
    // far more than a credit earns — exactly the risk docs/80 Part 7 names.
    const companyAnnual = revenuePerCreditUsd(PLANS.company!.annualPrice, PLANS.company!.credits);
    const cost = providerCostPerCreditUsd(frontier, { inputShare: 0, outputShare: 1 });
    expect(cost).toBeGreaterThan(companyAnnual);

    // And the detector reports it once it is inside the model set.
    const combos: Combo[] = [
      {
        plan: 'company',
        billing: 'annual',
        model: frontier.id,
        tier: 3,
        mix: '0/100',
        revenuePerCreditUsd: companyAnnual,
        providerCostPerCreditUsd: cost,
        marginUsd: companyAnnual - cost,
      },
    ];
    expect(negativeMarginWorkflows(combos)).toHaveLength(1);
  });

  it('treats trial as cost-bearing, not revenue-bearing (so it is excluded from the invariant)', () => {
    // Trial has no price: 100 credits for $0. Charging zero revenue means every
    // call is negative margin by construction, which is why the per-day trial
    // ceiling (docs/80 §3.3) bounds it instead of the price. Assert the
    // exclusion is intentional and visible.
    expect(Object.keys(PLAN_TIER_CAP)).not.toContain('trial');
    for (const combo of supportedCombos()) {
      expect(combo.plan).not.toBe('trial');
    }
  });
});
