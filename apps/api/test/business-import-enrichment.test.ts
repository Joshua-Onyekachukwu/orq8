import { describe, it, expect } from 'vitest';
import type { AppConfig } from '@orq8/core';
import type { BusinessImportFact } from '../src/services/business-import.js';
import {
  enrichmentEnabled,
  validateRefinements,
  validateSuggestedGoals,
  mergeRefinements,
  enrichBusinessFacts,
} from '../src/services/business-import-enrichment.js';

const baseConfig = { OPENROUTER_MODEL: 'openai/gpt-4o-mini' } as unknown as AppConfig;

const sourceFacts: BusinessImportFact[] = [
  { field: 'industry', label: 'Industry', value: 'Software / SaaS', source: 'website', sourceType: 'website', confidence: 0.8, snippet: 'a saas platform for teams' },
  { field: 'business_model', label: 'Business model', value: 'B2B', source: 'founder', sourceType: 'founder', confidence: 0.6, snippet: 'b2b software' },
  { field: 'target_audience', label: 'Target audience', value: 'Enterprise', source: 'website', sourceType: 'website', confidence: 0.7, snippet: 'for enterprises' },
];

const withKeys: AppConfig = { ...baseConfig, BUSINESS_IMPORT_ENRICHMENT: 'true', NVIDIA_API_KEY: 'nvapi-test' } as unknown as AppConfig;

describe('enrichmentEnabled', () => {
  it('is off by default and without a provider key', () => {
    expect(enrichmentEnabled(baseConfig)).toBe(false);
    expect(enrichmentEnabled({ ...baseConfig, BUSINESS_IMPORT_ENRICHMENT: 'true' } as unknown as AppConfig)).toBe(false);
  });
  it('is on only when the flag AND a provider key are present', () => {
    expect(enrichmentEnabled(withKeys)).toBe(true);
    expect(enrichmentEnabled({ ...withKeys, BUSINESS_IMPORT_ENRICHMENT: 'false' } as unknown as AppConfig)).toBe(false);
  });
});

describe('validateRefinements', () => {
  it('drops unknown fields, missing evidence and empty values — never invents', () => {
    const out = validateRefinements([
      { field: 'industry', value: 'Fintech', confidence: 0.9, evidence: 'we build payment rails' },
      { field: 'revenue', value: '$10M ARR', confidence: 0.9, evidence: 'ten million' }, // not a supported field
      { field: 'geography', value: 'Nigeria', confidence: 0.8, evidence: '' }, // no evidence quote
      { field: 'business_model', value: '', confidence: 0.5, evidence: 'quote' }, // empty value
      'garbage',
    ], new Set(['industry', 'business_model', 'target_audience', 'marketing_channel', 'geography', 'stage']));
    expect(out).toHaveLength(1);
    expect(out[0]?.field).toBe('industry');
  });

  it('bounds confidence to 0..1', () => {
    const out = validateRefinements([
      { field: 'stage', value: 'Early', confidence: 5, evidence: 'we are launching' },
    ], new Set(['stage']));
    expect(out[0]?.confidence).toBe(1);
  });
});

describe('validateSuggestedGoals', () => {
  it('requires a title and an evidence quote', () => {
    const out = validateSuggestedGoals([
      { title: 'Reach 100 customers', evidence: 'our goal is 100 customers by Q1', confidence: 0.7 },
      { title: 'Grow revenue', evidence: '' }, // no evidence — must be dropped
      { title: '', evidence: 'quote' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Reach 100 customers');
  });
});

describe('mergeRefinements — provenance preservation', () => {
  it('keeps source provenance and records the original value on refined facts', () => {
    const now = new Date('2026-09-06T00:00:00Z');
    const merged = mergeRefinements(sourceFacts, [
      { field: 'industry', value: 'Fintech / Financial services', confidence: 0.9, evidence: 'payment rails' },
    ], 'openai/gpt-4o-mini', now);

    const industry = merged.find((f) => f.field === 'industry');
    expect(industry?.origin).toBe('llm_refined');
    expect(industry?.originalValue).toBe('Software / SaaS');
    expect(industry?.value).toBe('Fintech / Financial services');
    expect(industry?.source).toBe('website'); // provenance preserved
    expect(industry?.sourceType).toBe('website');
    expect(industry?.snippet).toBe('a saas platform for teams'); // original evidence preserved
    expect(industry?.enrichment?.method).toBe('llm');

    // Unrefined facts keep origin source.
    const model = merged.find((f) => f.field === 'business_model');
    expect(model?.origin).toBe('source');
    expect(model?.enrichment).toBeNull();
  });
});

describe('enrichBusinessFacts — fails closed, never invents', () => {
  it('returns source facts untouched when the LLM returns null', async () => {
    const out = await enrichBusinessFacts(withKeys, { description: 'd', websiteText: 'w', facts: sourceFacts }, {
      llm: async () => null,
    });
    expect(out.ran).toBe(false);
    expect(out.facts.every((f) => f.origin === 'source')).toBe(true);
    expect(out.suggestedGoals).toEqual([]);
  });

  it('returns source facts untouched when the LLM throws', async () => {
    const out = await enrichBusinessFacts(withKeys, { description: 'd', websiteText: 'w', facts: sourceFacts }, {
      llm: async () => { throw new Error('provider down'); },
    });
    expect(out.facts.every((f) => f.origin === 'source')).toBe(true);
    expect(out.suggestedGoals).toEqual([]);
  });

  it('applies validated refinements and drops hallucinated fields', async () => {
    const out = await enrichBusinessFacts(withKeys, { description: 'd', websiteText: 'w', facts: sourceFacts }, {
      llm: async () => ({
        refinements: [
          { field: 'industry', value: 'E-commerce', confidence: 0.85, evidence: 'we sell online' },
          { field: 'invented_metric', value: '2M users', confidence: 0.99, evidence: 'trust me' },
        ],
        suggestedGoals: [
          { title: 'Launch Q2', evidence: 'we plan to launch in Q2', confidence: 0.8 },
        ],
      }),
    });
    expect(out.ran).toBe(true);
    const industry = out.facts.find((f) => f.field === 'industry');
    expect(industry?.origin).toBe('llm_refined');
    expect(industry?.value).toBe('E-commerce');
    expect(out.facts.some((f) => f.field === 'invented_metric')).toBe(false);
    expect(out.suggestedGoals).toHaveLength(1);
  });

  it('does not run at all when enrichment is disabled — no LLM call', async () => {
    let called = false;
    const out = await enrichBusinessFacts(baseConfig, { description: 'd', websiteText: 'w', facts: sourceFacts }, {
      llm: async () => { called = true; return { refinements: [] }; },
    });
    expect(called).toBe(false);
    expect(out.ran).toBe(false);
    expect(out.facts.every((f) => f.origin === 'source')).toBe(true);
  });
});