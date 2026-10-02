/**
 * Provider cost unit tests (docs/77 P1 §5).
 *
 * The point of this module is that ORQ8 can state what a model call cost it. The
 * tests that matter are therefore about *honesty*, not arithmetic:
 *
 *   - a known model is priced from the registry's published rates;
 *   - a provider-reported cost wins, including an explicit $0 (a free model);
 *   - a model the registry cannot price returns 0 **and** says 'unknown', so a
 *     report can exclude it instead of counting it as free;
 *   - a garbage provider figure never silently becomes a cost.
 */

import { describe, expect, it } from 'vitest';
import {
  computeProviderCost,
  findModelPrice,
  normalizeModelId,
} from '../src/services/llm-pricing.js';

// A registry model with unusually round prices, so the expected math is visible:
// nvidia/nemotron-3-super-120b-a12b = $0.00035 / 1K in, $0.0014 / 1K out.
const KNOWN_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

describe('model id normalization', () => {
  it('strips routing suffixes and case', () => {
    expect(normalizeModelId('OpenAI/GPT-4o-mini:Nitro')).toBe('openai/gpt-4o-mini');
    expect(normalizeModelId('  meta-llama/llama-3.1-70b-instruct:free ')).toBe(
      'meta-llama/llama-3.1-70b-instruct',
    );
  });

  it('leaves a plain id alone', () => {
    expect(normalizeModelId(KNOWN_MODEL)).toBe(KNOWN_MODEL);
  });
});

describe('findModelPrice', () => {
  it('matches a registry id exactly', () => {
    expect(findModelPrice(KNOWN_MODEL)?.id).toBe(KNOWN_MODEL);
  });

  it('matches a provider-reported id that drops the vendor prefix', () => {
    // Providers are inconsistent about the prefix; the registry always has one.
    expect(findModelPrice('nemotron-3-super-120b-a12b')?.id).toBe(KNOWN_MODEL);
  });

  it('matches through a routing suffix', () => {
    expect(findModelPrice(`${KNOWN_MODEL}:free`)?.id).toBe(KNOWN_MODEL);
  });

  it('returns undefined for a model it cannot price', () => {
    expect(findModelPrice('some-vendor/some-model-that-does-not-exist')).toBeUndefined();
    expect(findModelPrice('')).toBeUndefined();
  });
});

describe('computeProviderCost', () => {
  it('prices a known model from the registry rates', () => {
    const cost = computeProviderCost({
      model: KNOWN_MODEL,
      promptTokens: 1_000,
      completionTokens: 2_000,
    });
    // 1_000 in @ $0.00035/1K + 2_000 out @ $0.0014/1K
    expect(cost.providerCostUsd).toBeCloseTo(0.00315, 8);
    expect(cost.pricingSource).toBe('registry');
    expect(cost.inputPer1kUsd).toBeCloseTo(0.00035, 8);
    expect(cost.outputPer1kUsd).toBeCloseTo(0.0014, 8);
  });

  it('derives completion tokens from the total when only that is known', () => {
    const withSplit = computeProviderCost({
      model: KNOWN_MODEL,
      promptTokens: 1_000,
      completionTokens: 2_000,
    });
    const withTotal = computeProviderCost({
      model: KNOWN_MODEL,
      promptTokens: 1_000,
      totalTokens: 3_000,
    });
    expect(withTotal.providerCostUsd).toBeCloseTo(withSplit.providerCostUsd, 8);
  });

  it('trusts a provider-reported cost over the registry — including an explicit zero', () => {
    const reported = computeProviderCost({
      model: KNOWN_MODEL,
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      reportedCostUsd: 0.00042,
    });
    expect(reported.providerCostUsd).toBeCloseTo(0.00042, 8);
    expect(reported.pricingSource).toBe('provider_reported');

    // A free/promotional model really did cost nothing; that is not missing data.
    const free = computeProviderCost({
      model: KNOWN_MODEL,
      promptTokens: 5_000,
      completionTokens: 5_000,
      reportedCostUsd: 0,
    });
    expect(free.providerCostUsd).toBe(0);
    expect(free.pricingSource).toBe('provider_reported');
  });

  it('reports 0 with source unknown rather than guessing when the model cannot be priced', () => {
    const cost = computeProviderCost({
      model: 'unlisted/model-v9',
      promptTokens: 10_000,
      completionTokens: 10_000,
    });
    expect(cost.providerCostUsd).toBe(0);
    expect(cost.pricingSource).toBe('unknown');
    expect(cost.inputPer1kUsd).toBeNull();
  });

  it('ignores an unusable provider figure and falls back to the registry', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const cost = computeProviderCost({
        model: KNOWN_MODEL,
        promptTokens: 1_000,
        completionTokens: 0,
        reportedCostUsd: bad,
      });
      expect(cost.pricingSource).toBe('registry');
      expect(cost.providerCostUsd).toBeCloseTo(0.00035, 8);
    }
  });

  it('never returns a negative cost for nonsense token counts', () => {
    const cost = computeProviderCost({
      model: KNOWN_MODEL,
      promptTokens: -500,
      completionTokens: -500,
    });
    expect(cost.providerCostUsd).toBeGreaterThanOrEqual(0);
  });
});
