/**
 * Business Import — optional LLM enrichment (Phase 10, §12).
 *
 * The core import pipeline extracts structured, provenance-backed facts
 * deterministically (no LLM, no fabrication). This module optionally refines
 * those facts with the configured LLM — and ONLY when the founder enabled it.
 *
 * Hard rules:
 *  - Enrichment is best-effort and fails CLOSED: any LLM error, timeout, bad
 *    JSON, or missing provider returns the trusted source facts unchanged.
 *  - The model may normalize wording, categorize and combine supported facts,
 *    and derive goals ONLY when the provided evidence text clearly supports it.
 *  - It must NEVER invent company facts, customers, revenue, employees,
 *    products, market claims, history or metrics. Unsupported fields are left
 *    unresolved (omitted), never hallucinated.
 *  - Provenance is preserved: every refined fact keeps its original source /
 *    sourceUrl / snippet, records the pre-enrichment value as originalValue,
 *    and is tagged origin: 'source' | 'llm_refined' | 'llm_suggested' so the
 *    system can always distinguish a SOURCE FACT from an LLM ENRICHMENT.
 */
import type { AppConfig } from '@orq8/core';
import { chatJson } from './llm.js';
import type { BusinessImportFact } from './business-import.js';

/** Supported enrichment output fields (subset of the deterministic extractor). */
const REFINABLE_FIELDS = new Set([
  'industry', 'business_model', 'target_audience', 'marketing_channel',
  'geography', 'stage',
]);

export type FactOrigin = 'source' | 'llm_refined' | 'llm_suggested';

export interface EnrichedFact extends BusinessImportFact {
  origin: FactOrigin;
  originalValue?: string | null; // pre-enrichment value when refined (provenance)
  enrichment?: {
    method: 'llm';
    model: string;
    timestamp: string;
  } | null;
}

export interface SuggestedGoal {
  title: string;
  evidence: string;
  confidence: number;
}

export interface EnrichmentOutput {
  facts: EnrichedFact[];
  suggestedGoals: SuggestedGoal[];
  model: string | null;
  ran: boolean; // true when the LLM stage actually ran
}

interface LlmRefinement {
  field: string;
  value: string;
  confidence: number;
  evidence: string;
}

interface LlmOutput {
  refinements?: LlmRefinement[];
  suggestedGoals?: Array<{ title: string; evidence: string; confidence?: number }>;
}

const SYSTEM_PROMPT = [
  'You refine structured facts about a company for an intelligence system. You NEVER invent information.',
  'You are given: (1) evidence text extracted from the founder description and the company website, and (2) a list of source facts already extracted deterministically.',
  'Rules:',
  '- Only refine a field when the provided evidence text clearly supports the refined value. Otherwise omit it.',
  '- Never invent customers, revenue, employees, products, market claims, company history, or metrics.',
  '- A suggested goal is allowed ONLY when the evidence text directly supports it (e.g. an explicit goal, target or commitment). Otherwise omit it.',
  '- Values must be concise (max 60 chars). Confidence 0..1 reflects how directly the evidence supports the value.',
  '- Respond with JSON only: {"refinements":[{"field","value","confidence","evidence"}],"suggestedGoals":[{"title","evidence","confidence"}]}.',
  '- "evidence" must be a short verbatim quote from the evidence text. If you cannot quote it, do not include the item.',
].join('\n');

function userPrompt(
  description: string,
  websiteText: string,
  sourceFacts: BusinessImportFact[],
): string {
  const facts = sourceFacts.map((f) => `- ${f.field}: ${f.value} (confidence ${f.confidence})`).join('\n') || '- (none extracted)';
  return [
    'FOUNDER DESCRIPTION:',
    description || '(none)',
    '',
    'WEBSITE EVIDENCE:',
    websiteText || '(none)',
    '',
    'SOURCE FACTS (already extracted deterministically):',
    facts,
  ].join('\n');
}

/** Validate the LLM's refinement list against the supported fields and bounds. */
export function validateRefinements(
  raw: unknown,
  allowedFields: Set<string>,
): LlmRefinement[] {
  if (!Array.isArray(raw)) return [];
  const out: LlmRefinement[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const field = typeof r.field === 'string' ? r.field.trim() : '';
    const value = typeof r.value === 'string' ? r.value.trim() : '';
    const evidence = typeof r.evidence === 'string' ? r.evidence.trim().slice(0, 300) : '';
    const confidence = typeof r.confidence === 'number' ? r.confidence : 0;
    if (!field || !value || !evidence) continue;
    if (!allowedFields.has(field)) continue; // never add fields the extractor doesn't own
    if (value.length > 120) continue;
    out.push({ field, value, evidence, confidence: Math.max(0, Math.min(1, confidence)) });
  }
  return out;
}

/** Validate suggested goals — title + evidence quote required. */
export function validateSuggestedGoals(raw: unknown): SuggestedGoal[] {
  if (!Array.isArray(raw)) return [];
  const out: SuggestedGoal[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    const title = typeof g.title === 'string' ? g.title.trim() : '';
    const evidence = typeof g.evidence === 'string' ? g.evidence.trim().slice(0, 300) : '';
    if (!title || !evidence) continue;
    if (title.length > 160) continue;
    const confidence = typeof g.confidence === 'number' ? g.confidence : 0.5;
    out.push({ title, evidence, confidence: Math.max(0, Math.min(1, confidence)) });
  }
  return out;
}

/** True when the founder enabled enrichment and an LLM provider is configured. */
export function enrichmentEnabled(config: AppConfig): boolean {
  if (config.BUSINESS_IMPORT_ENRICHMENT !== 'true') return false;
  return Boolean(
    config.NVIDIA_API_KEY || config.NVIDIA_API_KEYS ||
    config.OPENROUTER_API_KEY || config.OPENROUTER_API_KEYS,
  );
}

/**
 * Run the enrichment stage. Pure merge logic is separated (mergeRefinements)
 * for unit testing; the LLM call is injectable. Fails CLOSED: any exception or
 * null response returns the source facts untouched with origin 'source'.
 */
export async function enrichBusinessFacts(
  config: AppConfig,
  input: { description: string | null; websiteText: string | null; facts: BusinessImportFact[] },
  opts: {
    llm?: (system: string, user: string) => Promise<LlmOutput | null>;
    now?: () => Date;
  } = {},
): Promise<EnrichmentOutput> {
  const base: EnrichmentOutput = {
    facts: input.facts.map((f) => ({ ...f, origin: 'source' as FactOrigin, enrichment: null })),
    suggestedGoals: [],
    model: null,
    ran: false,
  };
  if (!enrichmentEnabled(config)) return base;

  const system = SYSTEM_PROMPT;
  const user = userPrompt(input.description ?? '', input.websiteText ?? '', input.facts);
  const model = config.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini';

  let raw: LlmOutput | null = null;
  try {
    if (opts.llm) {
      raw = await opts.llm(system, user);
    } else {
      raw = await chatJson<LlmOutput>(config, system, user, { model, temperature: 0.2, max_tokens: 900 });
    }
  } catch {
    return base; // enrichment is optional — never break core import
  }
  if (!raw || typeof raw !== 'object') return base;

  const refinements = validateRefinements(raw.refinements, REFINABLE_FIELDS);
  const suggestedGoals = validateSuggestedGoals(raw.suggestedGoals);

  const merged = mergeRefinements(input.facts, refinements, model, opts.now?.() ?? new Date());
  return { facts: merged, suggestedGoals, model, ran: true };
}

/**
 * Pure merge: apply validated refinements over source facts, preserving every
 * provenance field and recording the original value on each refined fact.
 * Facts whose field was not refined keep origin 'source'.
 */
export function mergeRefinements(
  sourceFacts: BusinessImportFact[],
  refinements: LlmRefinement[],
  model: string,
  now: Date,
): EnrichedFact[] {
  const byField = new Map<string, LlmRefinement>();
  for (const r of refinements) {
    // First valid refinement per field wins; later duplicates are ignored.
    if (!byField.has(r.field)) byField.set(r.field, r);
  }

  const out: EnrichedFact[] = sourceFacts.map((f) => {
    const refinement = byField.get(f.field);
    if (!refinement) return { ...f, origin: 'source', enrichment: null };
    return {
      ...f,
      value: refinement.value,
      confidence: refinement.confidence,
      origin: 'llm_refined',
      originalValue: f.value,
      enrichment: { method: 'llm', model, timestamp: now.toISOString() },
    };
  });

  // A refinement for a field the extractor missed becomes a suggested fact
  // (e.g. a marketing channel only visible in the website text) — still bound
  // to its evidence quote and clearly tagged as LLM-suggested.
  const refinedFieldNames = new Set(byField.keys());
  for (const r of refinements) {
    if (!refinedFieldNames.has(r.field)) continue;
    if (!out.some((f) => f.field === r.field)) {
      out.push({
        field: r.field,
        label: r.field.replace(/_/g, ' '),
        value: r.value,
        source: 'inferred',
        sourceType: 'website',
        confidence: r.confidence,
        snippet: r.evidence,
        origin: 'llm_suggested',
        enrichment: { method: 'llm', model, timestamp: now.toISOString() },
      });
    }
  }

  return out;
}